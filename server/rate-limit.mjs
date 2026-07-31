const EMAIL_WINDOW_MS = 60 * 1000;
const IP_CODE_WINDOW_MS = 60 * 60 * 1000;
const IP_CODE_MAX_REQUESTS = 5;
const LOGIN_FAILURE_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_FAILURE_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_WINDOW_MS = 10 * 60 * 1000;
const MAX_TRACKED_ENTRIES = 10_000;
const PRUNE_INTERVAL_MS = 30 * 1000;

export function createRateLimitStore() {
  const emailRequests = new Map();
  const ipCodeRequests = new Map();
  const loginFailures = new Map();
  let lastPrunedAt = 0;

  function prune(now = Date.now(), force = false) {
    if (!force && now - lastPrunedAt < PRUNE_INTERVAL_MS) return;
    lastPrunedAt = now;
    for (const [email, requestedAt] of emailRequests) {
      if (requestedAt <= now - EMAIL_WINDOW_MS) emailRequests.delete(email);
    }
    for (const [ip, requests] of ipCodeRequests) {
      const recent = recentRequests(requests, IP_CODE_WINDOW_MS, now);
      if (recent.length) ipCodeRequests.set(ip, recent);
      else ipCodeRequests.delete(ip);
    }
    for (const [ip, entry] of loginFailures) {
      if (entry.lockedUntil <= now && !recentRequests(entry.attempts, LOGIN_FAILURE_WINDOW_MS, now).length) loginFailures.delete(ip);
    }
  }

  function canTrack(map, key) {
    return map.has(key) || map.size < MAX_TRACKED_ENTRIES;
  }

  function recentRequests(requests, windowMs, now) {
    return requests.filter((time) => time > now - windowMs);
  }

  function allowEmail(email, now = Date.now()) {
    prune(now);
    const previous = emailRequests.get(email);
    if (previous && now - previous < EMAIL_WINDOW_MS) return false;
    if (!canTrack(emailRequests, email)) return false;
    emailRequests.set(email, now);
    return true;
  }

  function allowIpCode(ip, now = Date.now()) {
    prune(now);
    const requests = recentRequests(ipCodeRequests.get(ip) || [], IP_CODE_WINDOW_MS, now);
    if (requests.length >= IP_CODE_MAX_REQUESTS) return false;
    if (!canTrack(ipCodeRequests, ip)) return false;
    requests.push(now);
    ipCodeRequests.set(ip, requests);
    return true;
  }

  function allowCode(email, ip, now = Date.now()) {
    prune(now);
    const previous = emailRequests.get(email);
    const requests = recentRequests(ipCodeRequests.get(ip) || [], IP_CODE_WINDOW_MS, now);
    if ((previous && now - previous < EMAIL_WINDOW_MS) || requests.length >= IP_CODE_MAX_REQUESTS) return false;
    if (!canTrack(emailRequests, email) || !canTrack(ipCodeRequests, ip)) return false;
    emailRequests.set(email, now);
    requests.push(now);
    ipCodeRequests.set(ip, requests);
    return true;
  }

  function allowLogin(ip, now = Date.now()) {
    prune(now);
    const entry = loginFailures.get(ip);
    if (!entry) return true;
    if (entry.lockedUntil > now) return false;
    if (entry.lockedUntil) { loginFailures.delete(ip); return true; }
    entry.attempts = recentRequests(entry.attempts, LOGIN_FAILURE_WINDOW_MS, now);
    if (!entry.attempts.length) loginFailures.delete(ip);
    return true;
  }

  function recordLoginFailure(ip, now = Date.now()) {
    prune(now);
    const entry = loginFailures.get(ip) || { attempts: [], lockedUntil: 0 };
    if (!canTrack(loginFailures, ip)) return true;
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

  return { allowEmail, allowIpCode, allowCode, allowLogin, recordLoginFailure, clearLoginFailures, prune: (now) => prune(now, true) };
}
