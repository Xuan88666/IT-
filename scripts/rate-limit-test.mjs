import { createRateLimitStore } from '../server/rate-limit.mjs';

const store = createRateLimitStore();
const start = 1_000_000;

if (!store.allowEmail('user@example.com', start)) throw new Error('首次邮箱验证码请求应允许。');
if (store.allowEmail('user@example.com', start + 59_999)) throw new Error('同邮箱一分钟内的第二次请求应被拦截。');
if (!store.allowEmail('user@example.com', start + 60_000)) throw new Error('同邮箱一分钟后应允许再次请求。');

for (let index = 0; index < 5; index += 1) {
  if (!store.allowIpCode('203.0.113.10', start + index)) throw new Error('同 IP 前五次验证码请求应允许。');
}
if (store.allowIpCode('203.0.113.10', start + 10)) throw new Error('同 IP 一小时内第六次验证码请求应被拦截。');
if (!store.allowIpCode('203.0.113.10', start + 60 * 60 * 1000)) throw new Error('同 IP 一小时后应允许再次请求。');

for (let index = 0; index < 4; index += 1) {
  if (store.recordLoginFailure('203.0.113.20', start + index)) throw new Error('前四次密码错误不应锁定。');
}
if (!store.recordLoginFailure('203.0.113.20', start + 5)) throw new Error('第五次密码错误应触发锁定。');
if (store.allowLogin('203.0.113.20', start + 6)) throw new Error('锁定期内登录应被拦截。');
if (!store.allowLogin('203.0.113.20', start + 10 * 60 * 1000 + 5)) throw new Error('锁定期结束后应允许登录。');

store.recordLoginFailure('203.0.113.30', start);
store.clearLoginFailures('203.0.113.30');
if (!store.allowLogin('203.0.113.30', start + 1)) throw new Error('成功登录应清除失败记录。');

for (let index = 0; index < 10_001; index += 1) store.allowEmail(`user-${index}@example.com`, start + index);
if (store.allowEmail('new-user@example.com', start + 10_002)) throw new Error('限流记录达到容量上限时应拒绝新的键。');
store.prune(start + 60_000 + 10_002);
if (!store.allowEmail('new-user@example.com', start + 60_000 + 10_003)) throw new Error('过期限流记录应被清理。');

console.log('Rate limit test passed.');
