const EMAIL_WINDOW_MS = 60 * 1000;
const IP_CODE_WINDOW_MS = 60 * 60 * 1000;
const IP_CODE_MAX_REQUESTS = 5;
const LOGIN_FAILURE_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_FAILURE_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_WINDOW_MS = 10 * 60 * 1000;

export function createRateLimitStore() {
  const emailRequests = new Map();
  const ipCodeRequests = new Map();
  const loginFailures = new Map();

  function recentRequests(requests, windowMs, now) {
    return requests.filter((time) => time > now - windowMs);
  }

  function allowEmail(email, now = Date.now()) {
    const previous = emailRequests.get(email);
    if (previous && now - previous < EMAIL_WINDOW_MS) return false;
    emailRequests.set(email, now);
    return true;
  }

  function allowIpCode(ip, now = Date.now()) {
    const requests = recentRequests(ipCodeRequests.get(ip) || [], IP_CODE_WINDOW_MS, now);
    if (requests.length >= IP_CODE_MAX_REQUESTS) return false;
    requests.push(now);
    ipCodeRequests.set(ip, requests);
    return true;
  }

  function allowCode(email, ip, now = Date.now()) {
    const previous = emailRequests.get(email);
    const requests = recentRequests(ipCodeRequests.get(ip) || [], IP_CODE_WINDOW_MS, now);
    if ((previous && now - previous < EMAIL_WINDOW_MS) || requests.length >= IP_CODE_MAX_REQUESTS) return false;
    emailRequests.set(email, now);
    requests.push(now);
    ipCodeRequests.set(ip, requests);
    return true;
  }

  function allowLogin(ip, now = Date.now()) {
    const entry = loginFailures.get(ip);
    if (!entry) return true;
    if (entry.lockedUntil > now) return false;
    if (entry.lockedUntil) { loginFailures.delete(ip); return true; }
    entry.attempts = recentRequests(entry.attempts, LOGIN_FAILURE_WINDOW_MS, now);
    if (!entry.attempts.length) loginFailures.delete(ip);
    return true;
  }

  function recordLoginFailure(ip, now = Date.now()) {
    const entry = loginFailures.get(ip) || { attempts: [], lockedUntil: 0 };
    entry.attempts = recentRequests(entry.attempts, LOGIN_FAILURE_WINDOW_MS, now);
    entry.attempts.push(now);
    if (entry.attempts.length >= LOGIN_FAILURE_MAX_ATTEMPTS) {
      entry.attempts = [];
      entry.lockedUntil = now + LOGIN_LOCK_WINDOW_MS;
      loginFailures.set(ip, entry);
      return true;
    }
    loginFailures.set(ip, entry);
    return false;
  }

  function clearLoginFailures(ip) {
    loginFailures.delete(ip);
  }

  return { allowEmail, allowIpCode, allowCode, allowLogin, recordLoginFailure, clearLoginFailures };
}
