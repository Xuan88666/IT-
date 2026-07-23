import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = 19000 + Math.floor(Math.random() * 2000);
const baseUrl = `http://127.0.0.1:${port}`;
const dataDir = await mkdtemp(join(tmpdir(), 'opshub-smoke-'));
const server = spawn(process.execPath, ['server.mjs'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), OPSHUB_DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let serverLog = '';
server.stdout.on('data', (chunk) => { serverLog += chunk.toString(); });
server.stderr.on('data', (chunk) => { serverLog += chunk.toString(); });

function cookieFrom(response) {
  const raw = response.headers.get('set-cookie') || '';
  const match = raw.match(/opshub_session=[^;]*/);
  return match?.[0] || '';
}
async function request(path, options = {}, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(30000), ...options });
  if (response.status !== expectedStatus) {
    const text = await response.text().catch(() => '');
    throw new Error(`${path}: expected HTTP ${expectedStatus}, got ${response.status}\n${text}\nserver:\n${serverLog}`);
  }
  return response;
}
async function json(path, options = {}, expectedStatus = 200) { return (await request(path, options, expectedStatus)).json(); }
async function waitForServer() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try { await request('/', {}, 200); return; } catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  throw new Error(`server did not start\n${serverLog}`);
}

const checks = [];
async function check(name, task) { await task(); checks.push(name); console.log(`OK  ${name}`); }

try {
  await waitForServer();
  await check('首页可访问', async () => { const text = await (await request('/')).text(); if (!text.includes('id="app"')) throw new Error('首页缺少应用挂载点'); });
  await check('首次需要初始化管理员', async () => { const data = await json('/api/auth/me'); if (!data.bootstrapRequired || data.authenticated) throw new Error('未进入首次初始化状态'); });
  await check('未登录数据接口被拦截', async () => { await request('/api/assets', {}, 401); await request('/api/tools/ping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: '127.0.0.1' }) }, 401); });

  let adminCookie = '';
  await check('初始化管理员并登录', async () => {
    const response = await request('/api/auth/bootstrap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', displayName: '系统管理员', password: 'AdminPass123!' }) }, 201);
    adminCookie = cookieFrom(response);
    const data = await response.json(); if (!adminCookie || data.user?.role !== 'admin') throw new Error('管理员会话无效');
  });
  const adminHeaders = () => ({ Cookie: adminCookie, 'Content-Type': 'application/json' });

  await check('管理员基础接口正常', async () => {
    const health = await json('/api/health', { headers: adminHeaders() }); if (!health.ok || health.service?.status !== '正常') throw new Error('系统自检未通过');
    for (const path of ['/api/assets', '/api/tickets', '/api/incidents', '/api/worklogs', '/api/evidence', '/api/knowledge', '/api/ai/providers', '/api/auth/users']) {
      const data = await json(path, { headers: adminHeaders() }); if (!Array.isArray(data)) throw new Error(`${path} 未返回数组`);
    }
  });
  await check('AI 排障返回现场执行摘要', async () => {
    const data = await json('/api/ai/analyze', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ issue: '门店监控摄像头离线，需要排查', evidence: '', provider: '本地运维规则助手' }) });
    if (!data.opsBrief?.rootCause || !data.opsBrief?.risk || !data.opsBrief?.verification || !data.opsBrief?.rollback) throw new Error('AI 排障摘要字段不完整');
  });

  let viewerCookie = '';
  await check('管理员创建只读账号', async () => {
    await request('/api/auth/users', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ username: 'viewer', displayName: '只读', role: 'viewer', password: 'ViewerPass123!' }) }, 201);
    const response = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'viewer', password: 'ViewerPass123!' }) });
    viewerCookie = cookieFrom(response); if (!viewerCookie) throw new Error('只读账号登录失败');
  });
  const viewerHeaders = () => ({ Cookie: viewerCookie, 'Content-Type': 'application/json' });
  await check('只读账号只能查看和只读排查', async () => {
    const assets = await json('/api/assets', { headers: viewerHeaders() }); if (!Array.isArray(assets)) throw new Error('只读查看失败');
    await request('/api/tickets', { method: 'POST', headers: viewerHeaders(), body: JSON.stringify({ title: 'should fail' }) }, 403);
    await request('/api/tools/repair-network', { method: 'POST', headers: viewerHeaders(), body: JSON.stringify({}) }, 403);
    await request('/api/tools/external/launch', { method: 'POST', headers: viewerHeaders(), body: JSON.stringify({ id: 'wireshark' }) }, 403);
    await request('/api/backup/export', { headers: viewerHeaders() }, 403);
    await request('/api/auth/users', { headers: viewerHeaders() }, 403);
    const ping = await json('/api/tools/ping', { method: 'POST', headers: viewerHeaders(), body: JSON.stringify({ host: '127.0.0.1' }) }); if (!Object.hasOwn(ping, 'ok')) throw new Error('只读排查工具失败');
  });

  let engineerCookie = '';
  await check('管理员创建工程师账号', async () => {
    await request('/api/auth/users', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ username: 'engineer', displayName: '工程师', role: 'engineer', password: 'EngineerPass123!' }) }, 201);
    const response = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'engineer', password: 'EngineerPass123!' }) });
    engineerCookie = cookieFrom(response); if (!engineerCookie) throw new Error('工程师账号登录失败');
  });
  const engineerHeaders = () => ({ Cookie: engineerCookie, 'Content-Type': 'application/json' });
  await check('工程师可写工单和通过受控修复权限门', async () => {
    const ticket = await json('/api/tickets', { method: 'POST', headers: engineerHeaders(), body: JSON.stringify({ title: '测试工单', site: '测试门店', priority: '普通' }) }, 201); if (!ticket.id) throw new Error('工程师创建工单失败');
    await request('/api/tools/print-test', { method: 'POST', headers: engineerHeaders(), body: JSON.stringify({}) }, 400);
    await request('/api/auth/users', { headers: engineerHeaders() }, 403);
    await request('/api/backup/export', { headers: engineerHeaders() }, 403);
  });

  await check('管理员可导出便携备份 v2', async () => { const data = await json('/api/backup/export', { headers: adminHeaders() }); if (data.format !== 'OpsHubBackup/2' || !Array.isArray(data.evidenceFiles)) throw new Error('便携备份格式错误'); });
  await check('门店 Agent 下载', async () => { const text = await (await request('/agent/%E9%97%A8%E5%BA%97%E7%8E%B0%E5%9C%BA%E9%87%87%E9%9B%86%E4%BB%A3%E7%90%86.ps1')).text(); if (!text.includes('OpsHubAgentReport/1')) throw new Error('Agent 脚本内容错误'); });
  await check('OCR 非法输入拦截', async () => { await request('/api/ocr/image', { method: 'POST', headers: engineerHeaders(), body: JSON.stringify({ mime: 'application/octet-stream', data: 'AA==' }) }, 400); });
  await check('Agent 非法输入拦截', async () => { await request('/api/agent-reports/import', { method: 'POST', headers: engineerHeaders(), body: JSON.stringify({ site: 'test', report: { format: 'invalid' } }) }, 400); });

  console.log(`\nSmoke test passed: ${checks.length} checks.`);
} finally {
  server.kill();
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
