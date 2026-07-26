import { spawn } from 'node:child_process';

const port = 3199;
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, PORT: String(port), JWT_SECRET: 'test-only-jwt-secret', OPSHUB_DATA_DIR: `data-contract-${Date.now()}` },
  stdio: 'ignore',
});

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.ok) return;
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('测试服务未能启动。');
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  return { status: response.status, body: await response.json() };
}

try {
  await waitForServer();

  const invalidEmail = await request('/api/email/sendCode', { method: 'POST', body: JSON.stringify({ email: 'not-an-email' }) });
  if (invalidEmail.status !== 400 || invalidEmail.body.code !== -1 || !invalidEmail.body.msg) throw new Error('验证码接口未返回统一参数错误响应。');

  const nonQqEmail = await request('/api/email/sendCode', { method: 'POST', body: JSON.stringify({ email: 'user@example.com' }) });
  if (nonQqEmail.status !== 400 || nonQqEmail.body.code !== -1) throw new Error('验证码接口未限制为 QQ 邮箱。');

  const invalidJson = await request('/api/email/sendCode', { method: 'POST', body: '{' });
  if (invalidJson.status !== 400 || invalidJson.body.code !== -1) throw new Error('验证码接口未返回统一 JSON 错误响应。');

  const retiredSliderCaptcha = await request('/api/captcha/slider');
  if (retiredSliderCaptcha.status < 400 || retiredSliderCaptcha.body.data?.id) throw new Error('滑动验证码接口仍在提供挑战数据。');

  const publish = await request('/api/announcement/publish', { method: 'POST', body: JSON.stringify({ title: '公告', content: '内容' }) });
  if (publish.status !== 401 || publish.body.code !== -1) throw new Error('公告发布接口未拒绝匿名请求。');

  const ai = await request('/api/ai/analyze', { method: 'POST', body: JSON.stringify({ issue: '匿名请求' }) });
  if (ai.status !== 401) throw new Error('AI 接口未拒绝匿名请求。');

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const wrongPassword = await request('/api/user/login', { method: 'POST', body: JSON.stringify({ email: '8@ops-box.local', password: 'wrong-password' }) });
    if (wrongPassword.status !== 401 || wrongPassword.body.code !== -1) throw new Error('密码错误应返回统一登录失败响应。');
  }
  const lockLogin = await request('/api/user/login', { method: 'POST', body: JSON.stringify({ email: '8@ops-box.local', password: 'wrong-password' }) });
  if (lockLogin.status !== 429 || lockLogin.body.msg !== '请求过于频繁，请稍后再试') throw new Error('第五次密码错误未触发登录锁定。');
  const lockedCorrectLogin = await request('/api/user/login', { method: 'POST', body: JSON.stringify({ email: '8@ops-box.local', password: 'qqq12345' }) });
  if (lockedCorrectLogin.status !== 429) throw new Error('锁定期内仍允许登录。');

  const latestVersion = await request('/api/version/latest');
  if (latestVersion.status === 401 || latestVersion.body.code !== -1) throw new Error('版本检查接口不应要求登录，且异常时必须返回统一错误格式。');

  const publishVersion = await request('/api/version/publish', { method: 'POST', body: JSON.stringify({ version: '1.0.2', download_url: 'https://example.com/OpsBox.exe', update_log: '版本更新' }) });
  if (publishVersion.status !== 401 || publishVersion.body.code !== -1) throw new Error('版本发布接口未拒绝匿名请求。');

  const page = await (await fetch(`${baseUrl}/`)).text();
  if (!page.includes('/version-update.js') || !page.includes('data-app-version')) throw new Error('前端未加载静默版本检测模块。');

  console.log('Auth API contract test passed.');
} finally {
  server.kill();
}
