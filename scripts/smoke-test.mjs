import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { generateKeyPairSync } from 'node:crypto';
import ssh2 from 'ssh2';

const { Server: SshServer } = ssh2;

const port = 19000 + Math.floor(Math.random() * 2000);
const baseUrl = `http://127.0.0.1:${port}`;
const dataDir = await mkdtemp(join(tmpdir(), 'opshub-smoke-'));
const server = spawn(process.execPath, ['server.mjs'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), OPSHUB_DATA_DIR: dataDir, EMAIL_USER: '', EMAIL_PASS: '' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
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

function ethernetFrame(etherType, payload) {
  const header = Buffer.from('00112233445566778899aabb0000', 'hex');
  header.writeUInt16BE(etherType, 12);
  return Buffer.concat([header, payload]);
}

function ipv4Packet(protocol, payload, source = [192, 168, 1, 10], destination = [8, 8, 8, 8]) {
  const header = Buffer.alloc(20);
  header[0] = 0x45;
  header.writeUInt16BE(20 + payload.length, 2);
  header[8] = 64;
  header[9] = protocol;
  Buffer.from(source).copy(header, 12);
  Buffer.from(destination).copy(header, 16);
  return Buffer.concat([header, payload]);
}

function udpPacket(sourcePort, destinationPort, payload) {
  const header = Buffer.alloc(8);
  header.writeUInt16BE(sourcePort, 0);
  header.writeUInt16BE(destinationPort, 2);
  header.writeUInt16BE(8 + payload.length, 4);
  return Buffer.concat([header, payload]);
}

function tcpPacket(sourcePort, destinationPort, payload) {
  const header = Buffer.alloc(20);
  header.writeUInt16BE(sourcePort, 0);
  header.writeUInt16BE(destinationPort, 2);
  header[12] = 0x50;
  header[13] = 0x18;
  return Buffer.concat([header, payload]);
}

function dnsQuery() {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(0x1234, 0);
  header.writeUInt16BE(0x0100, 2);
  header.writeUInt16BE(1, 4);
  const name = Buffer.concat([Buffer.from([7]), Buffer.from('example'), Buffer.from([3]), Buffer.from('com'), Buffer.from([0])]);
  return Buffer.concat([header, name, Buffer.from([0, 1, 0, 1])]);
}

function lldpTlv(type, payload) {
  const header = Buffer.alloc(2);
  header.writeUInt16BE((type << 9) | payload.length, 0);
  return Buffer.concat([header, payload]);
}

function captureFrames() {
  const dns = ethernetFrame(0x0800, ipv4Packet(17, udpPacket(53000, 53, dnsQuery())));
  const http = ethernetFrame(0x0800, ipv4Packet(6, tcpPacket(51000, 80, Buffer.from('GET /health HTTP/1.1\r\nHost: example.com\r\n\r\n')), [192, 168, 1, 10], [192, 168, 1, 20]));
  const lldpPayload = Buffer.concat([
    lldpTlv(2, Buffer.concat([Buffer.from([5]), Buffer.from('Gi1/0/7')])),
    lldpTlv(5, Buffer.from('Switch-01')),
    lldpTlv(6, Buffer.from('Access Switch')),
    lldpTlv(127, Buffer.from([0x00, 0x80, 0xc2, 0x01, 0x00, 0x14])),
    Buffer.from([0, 0]),
  ]);
  return [dns, http, ethernetFrame(0x88cc, lldpPayload)];
}

function captureFixture(frames = captureFrames()) {
  const globalHeader = Buffer.alloc(24);
  globalHeader.writeUInt32LE(0xa1b2c3d4, 0);
  globalHeader.writeUInt16LE(2, 4);
  globalHeader.writeUInt16LE(4, 6);
  globalHeader.writeUInt32LE(65535, 16);
  globalHeader.writeUInt32LE(1, 20);
  const records = frames.map((frame, index) => {
    const packetHeader = Buffer.alloc(16);
    packetHeader.writeUInt32LE(1700000000 + index, 0);
    packetHeader.writeUInt32LE(frame.length, 8);
    packetHeader.writeUInt32LE(frame.length, 12);
    return Buffer.concat([packetHeader, frame]);
  });
  return Buffer.concat([globalHeader, ...records]);
}

function pcapngBlock(type, body) {
  const padding = Buffer.alloc((4 - (body.length % 4)) % 4);
  const length = 12 + body.length + padding.length;
  const header = Buffer.alloc(8);
  header.writeUInt32LE(type, 0);
  header.writeUInt32LE(length, 4);
  const trailer = Buffer.alloc(4);
  trailer.writeUInt32LE(length, 0);
  return Buffer.concat([header, body, padding, trailer]);
}

function pcapngFixture() {
  const section = Buffer.alloc(16, 0xff);
  section.writeUInt32LE(0x1a2b3c4d, 0);
  section.writeUInt16LE(1, 4);
  section.writeUInt16LE(0, 6);
  const interfaceDescription = Buffer.alloc(8);
  interfaceDescription.writeUInt16LE(1, 0);
  interfaceDescription.writeUInt32LE(65535, 4);
  const packets = captureFrames().map((frame, index) => {
    const body = Buffer.alloc(20 + frame.length);
    body.writeUInt32LE(0, 0);
    body.writeUInt32LE(index, 8);
    body.writeUInt32LE(frame.length, 12);
    body.writeUInt32LE(frame.length, 16);
    frame.copy(body, 20);
    return pcapngBlock(6, body);
  });
  return Buffer.concat([pcapngBlock(0x0a0d0d0a, section), pcapngBlock(1, interfaceDescription), ...packets]);
}

const pcapFixture = captureFixture();
const pcapngTestFixture = pcapngFixture();
const pktmonWifiFixture = (() => {
  const wifiHeader = Buffer.from('080100804a555e47980d28d04352bcf644df655f93ec0000', 'hex');
  const llcSnap = Buffer.from('aaaa030000000800', 'hex');
  const frame = Buffer.concat([wifiHeader, llcSnap, ipv4Packet(17, udpPacket(53000, 53, dnsQuery()))]);
  return captureFixture([frame]);
})();

try {
  await waitForServer();
  await check('首页可访问', async () => { const text = await (await request('/')).text(); if (!text.includes('id="bento-app"')) throw new Error('首页缺少应用挂载点'); });
  await check('当前大屏前端资源可访问', async () => {
    const text = await (await request('/')).text();
    if (!text.includes('/bento.css') || !text.includes('/app.js')) throw new Error('首页未加载大屏前端资源');
    await request('/bento.css');
    await request('/app.js');
  });
  await check('敏感文件不可通过静态路径下载', async () => {
    for (const path of ['/.env', '/data/it-ops-toolbox.json', '/server.mjs', '/server/rate-limit.mjs', '/init.sql', '/scripts/smoke-test.mjs', '/.git/config', '/package.json']) {
      await request(path, {}, 404);
    }
    await request('/data/oui-compact.json');
    await request('/vendor/lucide.min.js');
  });
  await check('注册页邮箱验证码入口完整且无滑动验证', async () => {
    const script = await (await request('/app.js')).text();
    for (const marker of ['data-action="send-code"', 'sendVerificationCode', '账号或邮箱']) {
      if (!script.includes(marker)) throw new Error(`注册验证码缺少入口：${marker}`);
    }
    if (script.includes('data-captcha-slider') || script.includes('refresh-slider-captcha')) throw new Error('前端仍保留滑动验证入口');
    const code = await json('/api/auth/verify-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: '654321@qq.com', purpose: 'register' }) });
    if (!code.ok || !/^\d{6}$/.test(String(code.code || ''))) throw new Error('本地验证码接口未返回 6 位验证码');
  });
  await check('首页工作台和输出历史入口完整', async () => {
    const script = await (await request('/app.js')).text();
    for (const selector of ['data-dashboard="health"', 'data-dashboard="quick-actions"', 'data-dashboard="tool-finder"', 'data-dashboard="recent-runs"', 'exportActiveToolRun', 'exportWorkbenchReport']) {
      if (!script.includes(selector)) throw new Error(`首页缺少工作台能力：${selector}`);
    }
  });
  await check('运维计算工具箱入口和真实算法完整', async () => {
    const script = await (await request('/app.js')).text();
    for (const marker of ['bandwidth-time', 'cctv-storage', 'poe-budget', 'ups-runtime', 'optical-power', 'raid-capacity', 'vlsm-calc', 'VLSM IPv4 子网规划']) {
      if (!script.includes(marker)) throw new Error(`运维计算工具缺少实现：${marker}`);
    }
  });
  await check('首次需要初始化管理员', async () => { const data = await json('/api/auth/me'); if (!data.bootstrapRequired || data.authenticated) throw new Error('未进入首次初始化状态'); });
  await check('未登录时数据接口被拦截且本地诊断可用', async () => { await request('/api/assets', {}, 401); const ping = await json('/api/tools/ping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: '127.0.0.1' }) }); if (!Object.hasOwn(ping, 'ok')) throw new Error('未登录本地 Ping 不可用'); });

  let adminCookie = '';
  await check('初始化管理员并登录', async () => {
    const response = await request('/api/auth/bootstrap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', displayName: '系统管理员', password: 'AdminPass123!' }) }, 201);
    adminCookie = cookieFrom(response);
    const data = await response.json(); if (!adminCookie || data.user?.role !== 'admin') throw new Error('管理员会话无效');
  });
  const adminHeaders = () => ({ Cookie: adminCookie, 'Content-Type': 'application/json' });

  await check('邮箱验证码注册与找回密码流程正常', async () => {
    const email = '123456@qq.com';
    const registrationCode = await json('/api/auth/verify-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: email, purpose: 'register' }) });
    const registered = await request('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, nickname: '新用户', password: 'UserPass123!', code: registrationCode.code }) }, 201);
    const registeredData = await registered.json();
    if (registeredData.user?.displayName !== '新用户') throw new Error('邮箱注册未创建用户');
    const resetCode = await json('/api/auth/verify-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: email, purpose: 'forgot' }) });
    await request('/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'ResetPass123!', code: resetCode.code }) });
    const login = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'ResetPass123!' }) });
    if (!cookieFrom(login)) throw new Error('邮箱账户无法使用新密码登录');
  });

  await check('管理员基础接口正常', async () => {
    const health = await json('/api/health', { headers: adminHeaders() }); if (!health.ok || health.service?.status !== '正常') throw new Error('系统自检未通过');
    for (const path of ['/api/assets', '/api/tickets', '/api/incidents', '/api/worklogs', '/api/evidence', '/api/knowledge', '/api/ai/providers', '/api/auth/users']) {
      const data = await json(path, { headers: adminHeaders() }); if (!Array.isArray(data)) throw new Error(`${path} 未返回数组`);
    }
  });
  await check('现场处置单可持久保存', async () => {
    const created = await json('/api/worklogs', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ site: '测试地点', contact: '测试工程师', title: '办公终端巡检', result: '网络、Office 与打印状态已验证正常。', notes: '由自动化回归创建。', toolCount: 3 }) }, 201);
    if (!created.id || created.site !== '测试地点') throw new Error('处置单未成功创建');
    const worklogs = await json('/api/worklogs', { headers: adminHeaders() });
    if (!worklogs.some((item) => item.id === created.id)) throw new Error('处置单未写入持久化列表');
  });
  await check('知识库品牌资料与检索正常', async () => {
    const brands = await json('/api/knowledge/brands', { headers: adminHeaders() });
    if (!brands.some((brand) => brand.id === 'Microsoft') || !brands.some((brand) => brand.id === 'H3C') || !brands.some((brand) => brand.id === 'Datalogic')) throw new Error('知识库品牌资料不完整');
    const result = await json('/api/knowledge/search?q=office', { headers: adminHeaders() });
    if (!result.items?.some((item) => item.id === 'KB-OFFICE-START')) throw new Error('办公软件知识检索失败');
    const printer = await json('/api/knowledge/search?q=扫描仪', { headers: adminHeaders() });
    if (!printer.items?.some((item) => item.id === 'KB-PRINT-SCAN')) throw new Error('外设知识检索失败');
  });
  await check('桌面采集和办公软件检查可用', async () => {
    for (const tool of ['desktop-inventory', 'office-health', 'incident-evidence', 'software-inventory']) {
      const data = await json(`/api/tools/${tool}`, { method: 'POST', headers: adminHeaders(), body: '{}' });
      if (!Object.hasOwn(data, 'ok')) throw new Error(`${tool} 未返回诊断结果`);
    }
  });
  await check('优化和办公修复必须先确认', async () => {
    for (const tool of ['desktop-optimizer', 'office-repair']) {
      await request(`/api/tools/${tool}`, { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ actions: ['temp-files'] }) }, 400);
    }
    await request('/api/tools/windows-repair', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ actions: ['dism-checkhealth'] }) }, 400);
    await request('/api/tools/data-migration', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ actions: ['migration-preflight'] }) }, 400);
    await request('/api/tools/software-uninstall', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ actions: ['msi-uninstall'] }) }, 400);
    await request('/api/tools/software-uninstall', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ actions: ['msi-uninstall'], confirmed: true, productCode: 'not-a-product' }) }, 400);
  });
  await check('受控优化和 Office 只读动作可执行', async () => {
    const optimizer = await json('/api/tools/desktop-optimizer', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ actions: ['startup-report'], confirmed: true }) });
    if (!Object.hasOwn(optimizer, 'ok')) throw new Error('电脑优化只读动作未返回结果');
    const office = await json('/api/tools/office-repair', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ actions: ['office-association-report'], confirmed: true }) });
    if (!Object.hasOwn(office, 'ok')) throw new Error('Office 只读动作未返回结果');
    const windows = await json('/api/tools/windows-repair', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ actions: ['file-association-report'], confirmed: true }) });
    if (!Object.hasOwn(windows, 'ok')) throw new Error('Windows 只读动作未返回结果');
    const updateStatus = await json('/api/tools/windows-repair', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ actions: ['windows-update-status'], confirmed: true }) });
    if (!Object.hasOwn(updateStatus, 'ok')) throw new Error('Windows Update 状态检查未返回结果');
    const migration = await json('/api/tools/data-migration', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ actions: ['migration-preflight'], confirmed: true }) });
    if (!Object.hasOwn(migration, 'ok')) throw new Error('资料迁移预检未返回结果');
  });
  await check('现场王牌入口和桌面巡检可用', async () => {
    for (const [tool, body] of [
      ['desktop-diagnosis', { symptom: 'no-network' }],
      ['delivery-acceptance', {}],
      ['user-permissions', {}],
      ['peripheral-health', {}],
      ['browser-health', {}],
      ['collaboration-health', {}],
      ['business-runtime-health', {}],
    ]) {
      const data = await json(`/api/tools/${tool}`, { method: 'POST', headers: adminHeaders(), body: JSON.stringify(body) });
      if (!Object.hasOwn(data, 'ok')) throw new Error(`${tool} 未返回巡检结果`);
      if (tool === 'batch-check' && !String(data.csv || '').startsWith('目标,Ping,端口')) throw new Error('批量巡检未返回可导出的 CSV');
    }
  });
  await check('网络安全与基础设施巡检可用', async () => {
    for (const [tool, body] of [
      ['desktop-health', {}],
      ['vpn-proxy-health', {}],
      ['share-nas-health', { host: '127.0.0.1' }],
      ['security-baseline', {}],
      ['server-health', {}],
      ['ad-health', {}],
      ['certificate-domain', { host: '127.0.0.1' }],
      ['batch-check', { targets: ['127.0.0.1'], port: 80 }],
    ]) {
      const data = await json(`/api/tools/${tool}`, { method: 'POST', headers: adminHeaders(), body: JSON.stringify(body) });
      if (!Object.hasOwn(data, 'ok')) throw new Error(`${tool} 未返回巡检结果`);
    }
  });
  await check('防火墙与路由管理只读盘点可用且写操作必须确认', async () => {
    const firewall = await json('/api/tools/firewall-manager', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ action: 'list' }) });
    if (!Object.hasOwn(firewall, 'ok') || !String(firewall.output || '').includes('防火墙配置文件')) throw new Error('防火墙规则盘点失败');
    const routes = await json('/api/tools/route-manager', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ action: 'list' }) });
    if (!Object.hasOwn(routes, 'ok') || !String(routes.output || '').match(/DestinationPrefix|目标前缀/)) throw new Error('路由盘点失败');
    await request('/api/tools/firewall-manager', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ action: 'add', name: 'test-rule', direction: 'Inbound', protocol: 'TCP', localPort: '443', remoteAddress: 'LocalSubnet', ruleAction: 'Allow', profile: 'Private' }) }, 400);
    await request('/api/tools/route-manager', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ action: 'add', destinationPrefix: '10.10.0.0/16', nextHop: '192.168.1.1', interfaceIndex: 1, routeMetric: 25 }) }, 400);
    const script = await (await request('/app.js')).text();
    if (!script.includes('firewall-manager') || !script.includes('route-manager') || !script.includes('回滚命令')) throw new Error('前端缺少防火墙或路由管理入口');
  });
  await check('DNS 对比和 IP 冲突证据检查可用', async () => {
    const dns = await json('/api/tools/dns-benchmark', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ domain: 'localhost.localdomain', servers: '127.0.0.1', attempts: 1 }) });
    if (!Object.hasOwn(dns, 'ok') || !String(dns.output || '').includes('DNS 多服务器基准测试')) throw new Error('DNS 对比未返回结构化诊断结果');
    const conflict = await json('/api/tools/ip-conflict-check', { method: 'POST', headers: adminHeaders(), body: '{}' });
    if (!Object.hasOwn(conflict, 'ok') || !String(conflict.output || '').includes('IP 冲突证据检查')) throw new Error('IP 冲突检查未返回现场证据');
  });
  await check('持续和批量 Ping 工作流可用', async () => {
    const continuous = await json('/api/tools/network-quality', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ host: '127.0.0.1', count: 2 }) });
    if (!String(continuous.output || '').includes('网络质量检测') || !continuous.structured) throw new Error('持续 Ping 未返回质量统计');
    const batch = await json('/api/tools/batch-check', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ targets: '127.0.0.1\nlocalhost' }) });
    if (!String(batch.csv || '').startsWith('目标,Ping,端口') || batch.total !== 2) throw new Error('批量 Ping 未返回 CSV');
  });
  await check('真实流量、链路监控、Wi-Fi 信道和系统启动器接口可用', async () => {
    const traffic = await json('/api/tools/flow-monitor-sample', { method: 'POST', headers: adminHeaders(), body: '{}' });
    if (!Array.isArray(traffic.adapters) || !Number.isFinite(traffic.sampledAt)) throw new Error('流量监控未返回真实网卡计数');
    const links = await json('/api/tools/link-monitor-sample', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ targets: '127.0.0.1\n192.0.2.1' }) });
    if (!Array.isArray(links.results) || links.results.length !== 2 || !links.results.some(item => item.target === '127.0.0.1' && item.up)) throw new Error('链路监控未返回真实 Ping 采样');
    await request('/api/tools/monitor-webhook', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ url: 'https://example.com/hook', text: 'test' }) }, 400);
    const wifi = await json('/api/tools/wifi-channel-analysis', { method: 'POST', headers: adminHeaders(), body: '{}' });
    if (!String(wifi.output || '').includes('Wi-Fi 信道占用分析') || !wifi.channels) throw new Error('Wi-Fi 信道分析未返回结果');
    const launchers = await json('/api/tools/system-launcher', { headers: adminHeaders() });
    if (!Array.isArray(launchers) || !launchers.some(item => item.id === 'device-manager') || !launchers.some(item => item.id === 'windows-settings')) throw new Error('系统工具启动白名单不完整');
    const script = await (await request('/app.js')).text();
    if (!script.includes('/api/tools/flow-monitor-sample') || !script.includes('formatByteRate')) throw new Error('前端仍未接入真实流量采样');
    if (!script.includes('/api/tools/link-monitor-sample') || !script.includes('/api/tools/monitor-webhook') || !script.includes('startUnifiedLinkMonitor')) throw new Error('前端仍未接入链路状态监控');
  });
  await check('Wi-Fi 配置默认脱敏且明文导出必须管理员二次确认', async () => {
    const masked = await json('/api/tools/wifi-profile-export', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ reveal: false }) });
    if (!String(masked.output || '').includes('Wi-Fi 配置导出（脱敏模式）') || masked.revealed !== false || !String(masked.csv || '').startsWith('SSID,认证,加密,连接模式,密钥')) throw new Error('Wi-Fi 脱敏配置导出格式错误');
    await request('/api/tools/wifi-profile-export', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ reveal: true }) }, 400);
    const script = await (await request('/app.js')).text();
    if (!script.includes('wifi-profile-export') || !script.includes('管理员明文密钥')) throw new Error('前端缺少 Wi-Fi 配置导出入口');
  });
  await check('PCAP 离线分析提取协议、DNS、HTTP 和 LLDP 证据', async () => {
    const result = await json('/api/packet-capture/analyze', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ filename: 'fixture.pcap', data: pcapFixture.toString('base64') }) });
    if (result.packetCount !== 3 || !result.protocols.some(item => item.name === 'UDP') || !result.protocols.some(item => item.name === 'TCP') || !result.protocols.some(item => item.name === 'LLDP')) throw new Error('PCAP 协议统计错误');
    if (!result.dnsQueries.includes('example.com (A)')) throw new Error('DNS 查询提取失败');
    if (!result.httpRequests.some(item => item.includes('GET /health HTTP/1.1'))) throw new Error('HTTP 请求行提取失败');
    if (!result.lldpNeighbors.some(item => item.device === 'Switch-01' && item.port === 'Gi1/0/7' && item.vlan === 20)) throw new Error('LLDP 邻居提取失败');
    if (!String(result.csv || '').startsWith('类型,名称,数量')) throw new Error('PCAP 分析 CSV 缺失');
    const pcapng = await json('/api/packet-capture/analyze', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ filename: 'fixture.pcapng', data: pcapngTestFixture.toString('base64') }) });
    if (pcapng.format !== 'PCAPNG' || pcapng.packetCount !== 3 || !pcapng.dnsQueries.includes('example.com (A)')) throw new Error('PCAPNG 解析失败');
    const pktmonWifi = await json('/api/packet-capture/analyze', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ filename: 'pktmon-wifi.pcap', data: pktmonWifiFixture.toString('base64') }) });
    if (!pktmonWifi.protocols.some(item => item.name === 'UDP') || !pktmonWifi.dnsQueries.includes('example.com (A)')) throw new Error('pktmon Wi-Fi 802.11/LLC 封装解析失败');
    await request('/api/packet-capture/start', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ durationSeconds: 5 }) }, 400);
    const script = await (await request('/app.js')).text();
    for (const marker of ['packet-capture', 'pcap-analyzer', 'loadNdFileParam', 'downloadNdBinary']) if (!script.includes(marker)) throw new Error(`抓包工作台缺少前端能力：${marker}`);
  });
  await check('串口终端扫描、输入校验和权限边界可用', async () => {
    const ports = await json('/api/serial/ports', { headers: adminHeaders() });
    if (!Array.isArray(ports.ports)) throw new Error('串口扫描未返回列表');
    await request('/api/serial/sessions', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ port: 'COM0', baud: 9600 }) }, 400);
    const sessions = await json('/api/serial/sessions', { headers: adminHeaders() });
    if (!Array.isArray(sessions)) throw new Error('串口会话列表未返回数组');
    const script = await (await request('/app.js')).text();
    for (const marker of ['/api/serial/ports', 'openSerialTerminal', 'sendSerialTerminalInput', 'closeSerialTerminal']) if (!script.includes(marker)) throw new Error(`前端缺少串口终端能力：${marker}`);
  });
  await check('远程管理支持真实 Telnet 会话、输入输出和脱敏历史', async () => {
    let stage = 0;
    const mockTelnet = createServer((socket) => {
      socket.write(Buffer.from([255, 251, 1]));
      socket.write('Username: ');
      socket.on('data', (chunk) => {
        const text = chunk.toString('utf8');
        if (stage === 0 && text.includes('operator')) { stage = 1; socket.write('Password: '); }
        else if (stage === 1 && text.includes('secret')) { stage = 2; socket.write('\r\nMockOS ready\r\nMock> '); }
        else if (stage >= 2 && text.includes('show version')) socket.write('MockOS 1.0\r\nMock> ');
      });
    });
    await new Promise((resolve, reject) => { mockTelnet.once('error', reject); mockTelnet.listen(0, '127.0.0.1', resolve); });
    try {
      const telnetPort = mockTelnet.address().port;
      const session = await json('/api/remote/sessions', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ protocol: 'telnet', host: '127.0.0.1', port: telnetPort, username: 'operator', password: 'secret', deviceType: '测试终端' }) }, 201);
      if (session.status !== 'connected' || session.protocol !== 'telnet') throw new Error('Telnet 会话未建立');
      await new Promise(resolve => setTimeout(resolve, 200));
      const initial = await json(`/api/remote/sessions/${session.id}/output?after=0`, { headers: adminHeaders() });
      if (!initial.chunks.map(item => item.data).join('').includes('MockOS ready')) throw new Error('Telnet 自动登录或输出轮询失败');
      await json(`/api/remote/sessions/${session.id}/input`, { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ data: 'show version\n' }) });
      await new Promise(resolve => setTimeout(resolve, 100));
      const commandOutput = await json(`/api/remote/sessions/${session.id}/output?after=${initial.nextSeq}`, { headers: adminHeaders() });
      if (!commandOutput.chunks.map(item => item.data).join('').includes('MockOS 1.0')) throw new Error('Telnet 命令输入输出失败');
      const history = await json('/api/remote/history', { headers: adminHeaders() });
      const entry = history.find(item => item.protocol === 'telnet' && item.host === '127.0.0.1' && item.port === telnetPort);
      if (!entry || Object.hasOwn(entry, 'password') || JSON.stringify(entry).includes('secret')) throw new Error('远程历史缺失或泄露密码');
      await json(`/api/remote/sessions/${session.id}`, { method: 'DELETE', headers: adminHeaders(), body: '{}' });
      await json(`/api/remote/history/${entry.id}`, { method: 'DELETE', headers: adminHeaders(), body: '{}' });
      const script = await (await request('/app.js')).text();
      for (const marker of ['远程管理工作台', 'connectRemoteSession', 'launchRemoteRdp', 'data-remote-terminal-output']) if (!script.includes(marker)) throw new Error(`远程工作台缺少前端能力：${marker}`);
    } finally {
      await new Promise(resolve => mockTelnet.close(resolve));
    }
  });
  await check('远程管理支持真实 SSH 认证、Shell 和命令回显', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const hostKey = privateKey.export({ type: 'pkcs1', format: 'pem' });
    const mockSsh = new SshServer({ hostKeys: [hostKey] }, (client) => {
      client.on('authentication', (context) => {
        if (context.method === 'password' && context.username === 'operator' && context.password === 'secret') context.accept();
        else context.reject();
      });
      client.on('ready', () => client.on('session', (accept) => {
        const session = accept();
        session.on('pty', (acceptPty) => acceptPty());
        session.on('shell', (acceptShell) => {
          const stream = acceptShell();
          stream.write('SSH MockOS ready\n$ ');
          stream.on('data', (chunk) => {
            if (chunk.toString('utf8').includes('uname -a')) stream.write('MockOS ssh-test 1.0\n$ ');
          });
        });
      }));
    });
    await new Promise((resolve, reject) => { mockSsh.once('error', reject); mockSsh.listen(0, '127.0.0.1', resolve); });
    try {
      const sshPort = mockSsh.address().port;
      const session = await json('/api/remote/sessions', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ protocol: 'ssh', host: '127.0.0.1', port: sshPort, username: 'operator', password: 'secret', deviceType: '测试 Linux' }) }, 201);
      if (session.status !== 'connected' || session.protocol !== 'ssh') throw new Error('SSH 会话未建立');
      await new Promise(resolve => setTimeout(resolve, 100));
      const initial = await json(`/api/remote/sessions/${session.id}/output?after=0`, { headers: adminHeaders() });
      if (!initial.chunks.map(item => item.data).join('').includes('SSH MockOS ready')) throw new Error('SSH Shell 输出轮询失败');
      await json(`/api/remote/sessions/${session.id}/input`, { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ data: 'uname -a\n' }) });
      await new Promise(resolve => setTimeout(resolve, 100));
      const commandOutput = await json(`/api/remote/sessions/${session.id}/output?after=${initial.nextSeq}`, { headers: adminHeaders() });
      if (!commandOutput.chunks.map(item => item.data).join('').includes('MockOS ssh-test 1.0')) throw new Error('SSH 命令输入输出失败');
      const history = await json('/api/remote/history', { headers: adminHeaders() });
      const entry = history.find(item => item.protocol === 'ssh' && item.port === sshPort);
      if (!entry || !String(entry.hostFingerprint || '').startsWith('SHA256:') || JSON.stringify(entry).includes('secret')) throw new Error('SSH 历史缺少主机指纹或泄露密码');
      await json(`/api/remote/sessions/${session.id}`, { method: 'DELETE', headers: adminHeaders(), body: '{}' });
      await json(`/api/remote/history/${entry.id}`, { method: 'DELETE', headers: adminHeaders(), body: '{}' });
    } finally {
      await new Promise(resolve => mockSsh.close(resolve));
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
    await request('/api/remote/sessions', { method: 'POST', headers: viewerHeaders(), body: JSON.stringify({ protocol: 'telnet', host: '127.0.0.1', port: 23 }) }, 403);
    await request('/api/serial/sessions', { method: 'POST', headers: viewerHeaders(), body: JSON.stringify({ port: 'COM0', baud: 9600 }) }, 403);
    await request('/api/tools/wifi-profile-export', { method: 'POST', headers: viewerHeaders(), body: JSON.stringify({ reveal: true, confirmed: true }) }, 403);
    await request('/api/packet-capture/start', { method: 'POST', headers: viewerHeaders(), body: JSON.stringify({ confirmed: true, durationSeconds: 5 }) }, 403);
    await request('/api/tools/firewall-manager', { method: 'POST', headers: viewerHeaders(), body: JSON.stringify({ action: 'list' }) }, 403);
    await request('/api/tools/route-manager', { method: 'POST', headers: viewerHeaders(), body: JSON.stringify({ action: 'list' }) }, 403);
    const analysis = await json('/api/packet-capture/analyze', { method: 'POST', headers: viewerHeaders(), body: JSON.stringify({ filename: 'fixture.pcap', data: pcapFixture.toString('base64') }) });
    if (analysis.packetCount !== 3) throw new Error('只读账号无法使用离线 PCAP 分析');
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

  await check('管理员可导出便携备份 v2', async () => { const data = await json('/api/backup/export', { headers: adminHeaders() }); if (data.format !== 'ITOpsToolboxBackup/2' || !Array.isArray(data.evidenceFiles)) throw new Error('便携备份格式错误'); });
  await check('门店 Agent 下载', async () => { const text = await (await request('/agent/%E9%97%A8%E5%BA%97%E7%8E%B0%E5%9C%BA%E9%87%87%E9%9B%86%E4%BB%A3%E7%90%86.ps1')).text(); if (!text.includes('ITOpsToolboxAgentReport/1')) throw new Error('Agent 脚本内容错误'); });
  await check('OCR 非法输入拦截', async () => { await request('/api/ocr/image', { method: 'POST', headers: engineerHeaders(), body: JSON.stringify({ mime: 'application/octet-stream', data: 'AA==' }) }, 400); });
  await check('Agent 非法输入拦截', async () => { await request('/api/agent-reports/import', { method: 'POST', headers: engineerHeaders(), body: JSON.stringify({ site: 'test', report: { format: 'invalid' } }) }, 400); });

  await check('服务器监控 API 可用', async () => {
    const adminHeaders = () => ({ Cookie: adminCookie, 'Content-Type': 'application/json' });
    // 1. 上报监控数据（无需登录）
    const report = await json('/api/server/monitor/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hostname: 'test-server', cpu: { usage_percent: 45 }, memory: { usage_percent: 60, total_mb: 8192, used_mb: 4915 }, disk: { usage_percent: 55, total_gb: 100, used_gb: 55 }, network: [{ iface: 'eth0', rx_bytes: 1000000, tx_bytes: 500000 }] }) });
    if (!report.ok || !Array.isArray(report.alerts)) throw new Error('监控上报失败');
    // 2. 查询服务器列表（需登录）
    const servers = await json('/api/server/monitor/servers', { headers: adminHeaders() });
    if (!Array.isArray(servers.servers)) throw new Error('监控服务器列表未返回数组');
    const found = servers.servers.find(s => s.hostname === 'test-server');
    if (!found) throw new Error('上报后服务器列表未包含 test-server');
    // 3. 查询单台服务器详情
    const status = await json('/api/server/monitor/status/test-server', { headers: adminHeaders() });
    if (!status.ok || !status.latest || status.latest.cpu?.usage_percent !== 45) throw new Error('监控状态查询异常：' + JSON.stringify({found,status}));
    // 4. 下载 Agent 脚本（无需登录）
    const agentScript = await request('/api/server/monitor/agent-script', { headers: adminHeaders() });
    const scriptText = await agentScript.text();
    if (!scriptText.includes('#!/bin/bash') || !scriptText.includes('cpu')) throw new Error('Linux Agent 脚本内容异常');
  });

  console.log(`\nSmoke test passed: ${checks.length} checks.`);
} finally {
  server.kill();
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
