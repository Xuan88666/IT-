import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { createRequire } from 'node:module';
import { hostname, networkInterfaces } from 'node:os';
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, extname, join, normalize } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import net from 'node:net';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { PDFParse } from 'pdf-parse';

const require = createRequire(import.meta.url);
const { createWorker } = require('tesseract.js');
const chiSimLanguage = require('@tesseract.js-data/chi_sim');

const root = process.cwd();
const port = Number(process.env.PORT || 8787);
const dataDir = process.env.OPSHUB_DATA_DIR ? normalize(process.env.OPSHUB_DATA_DIR) : join(root, 'data');
const evidenceDir = join(dataDir, 'evidence');
const ocrCacheDir = join(dataDir, 'ocr-cache');
const storePath = join(dataDir, 'opshub.json');
const storeBackupPath = join(dataDir, 'opshub.json.bak');
let ocrWorkerPromise = null;
let ocrQueue = Promise.resolve();
let storeWriteQueue = Promise.resolve();
let storeWriteCounter = 0;
const externalToolRegistry = [
  { id: 'wireshark', name: 'Wireshark', category: '抓包分析', executables: ['Wireshark.exe'], paths: ['C:/Program Files/Wireshark/Wireshark.exe'] },
  { id: 'nmap', name: 'Nmap / Zenmap', category: '网络发现', executables: ['nmap.exe', 'zenmap.exe'], paths: ['C:/Program Files (x86)/Nmap/nmap.exe', 'C:/Program Files/Nmap/nmap.exe'] },
  { id: 'hwinfo', name: 'HWiNFO', category: '硬件检测', executables: ['HWiNFO64.exe', 'HWiNFO.exe'], paths: ['C:/Program Files/HWiNFO64/HWiNFO64.exe'] },
  { id: 'crystaldisk', name: 'CrystalDiskInfo', category: '硬盘健康', executables: ['DiskInfo64.exe', 'DiskInfo.exe'], paths: ['C:/Program Files/CrystalDiskInfo/DiskInfo64.exe'] },
  { id: 'sadp', name: 'Hikvision SADP', category: '海康设备发现', executables: ['SADPTool.exe'], paths: ['C:/Program Files (x86)/SADPTool/SADPTool.exe'] },
  { id: 'rustdesk', name: 'RustDesk', category: '远程支持', executables: ['RustDesk.exe', 'rustdesk.exe'], paths: ['C:/Program Files/RustDesk/RustDesk.exe'] },
  { id: 'anydesk', name: 'AnyDesk', category: '远程支持', executables: ['AnyDesk.exe'], paths: ['C:/Program Files (x86)/AnyDesk/AnyDesk.exe', 'C:/Program Files/AnyDesk/AnyDesk.exe'] },
];
async function loadLocalEnv() {
  try {
    const envText = await readFile(join(root, '.env'), 'utf8');
    for (const line of envText.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)=(.*)\s*$/);
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
    }
  } catch { /* optional local configuration */ }
}
await loadLocalEnv();
var opsAiPrompt = `你是企业现场 IT 运维指挥台，面向门店、机房、网络、桌面、打印机、监控/NVR 和 IT 技术支持。只基于用户给出的故障现象、检测证据、资产信息、知识库和 SOP 回答；证据不足要明确写“未确认”。故障排查必须按以下固定小标题输出：
判断结论：一句话说明故障范围和优先方向。
证据：引用已有检测结果，不得虚构设备状态。
根因候选：按可能性列 1 至 3 项，并标明仍未确认的部分。
下一步工具：直接点名运维百宝箱里的按钮，例如一键网络快照、默认网关检查、网卡/网线链路、目标打印机巡检、目标监控巡检、电脑健康检查、系统错误日志、应用崩溃日志、设备/驱动异常、共享盘/网络驱动器、防火墙/监听端口。
受控修复：只给低风险或需确认动作，不得直接执行破坏性操作。
风险：明确可能影响业务、配置或数据的动作。
验证：说明恢复后必须如何复测。
回滚：说明变更前要记录什么，以及失败时如何恢复。
现场 SOP：按先远程后现场、先证据后修复的顺序列步骤。
升级条件：什么时候交给网络、系统、厂商或硬件更换。
不要把重装系统、清空数据、重启核心设备作为默认第一步。`;
const agentSystemPrompt = `你是 IT 运维百宝箱的智能排障 Agent，运行在门店一线运维工程师的笔记本电脑上。

## 你的能力
你可以主动调用本机诊断工具收集信息——不需要等工程师手动操作。你可以：
- Ping 设备、检查端口、扫描网段、查看 ARP 表、测试 Web 管理页
- 获取本机网络配置、网卡状态、网关和外网连通性
- 检查 Windows 系统信息、磁盘、打印服务、系统错误日志
- 查询本地资产数据库中的已登记设备
- 请求工程师确认物理状态（电源灯、网线、卡纸等）

## 排查原则
1. **先缩小范围** — 单设备还是多设备？同一网段还是全店？先搞清楚故障边界
2. **先远程后物理** — 先跑工具检查连通性、端口、服务，工具跑完再让工程师检查物理
3. **并行优先** — 互相独立的检查可以同时跑（比如同时 Ping 和查 ARP）
4. **见好就收** — 拿到明确证据立即给出判断，不要无意义地跑更多工具
5. **证据说话** — 每个结论都要有工具结果支撑，证据不足时明确说"未确认"

## 安全红线
- 只能执行只读诊断，绝不能修改任何配置、重启任何服务
- 涉及 flush-dns、renew-dhcp、restart-service 等修改操作必须标注"需人工确认执行"
- 不要询问或记录密码、SNMP 团体字串、API Key

## 输出格式
当你收集完证据得出结论时，按以下结构输出：
**判断结论**：一句话
**证据链**：列出每项工具结果和对应的判断
**根因候选**：按可能性排序，标注置信度
**建议处理**：具体步骤
**风险提示**：执行前注意什么
**验证方法**：修完后怎么确认
**升级条件**：什么情况下该交给网络组/厂商`;
const AGENT_TOOLS = [
  { type: 'function', function: { name: 'ping', description: 'Ping 目标 IP 或域名，测试连通性和延迟', parameters: { type: 'object', properties: { host: { type: 'string', description: '目标 IP 地址或域名' } }, required: ['host'] } } },
  { type: 'function', function: { name: 'dns_lookup', description: 'DNS 解析目标域名或反向查询 IP', parameters: { type: 'object', properties: { host: { type: 'string', description: '要解析的域名或 IP 地址' } }, required: ['host'] } } },
  { type: 'function', function: { name: 'check_port', description: '测试目标主机的指定 TCP 端口是否开放，如 9100(打印)、80(Web)、554(RTSP)', parameters: { type: 'object', properties: { host: { type: 'string', description: '目标 IP 地址' }, port: { type: 'integer', description: '端口号，1-65535' } }, required: ['host', 'port'] } } },
  { type: 'function', function: { name: 'check_ports', description: '批量测试目标主机的一组常用端口。适用于快速定位设备服务状态：打印(9100/515/631)、监控(80/443/554/8000/37777)', parameters: { type: 'object', properties: { host: { type: 'string', description: '目标 IP 地址' }, ports: { type: 'array', items: { type: 'integer' }, description: '端口号数组，如 [9100, 515, 631]' } }, required: ['host', 'ports'] } } },
  { type: 'function', function: { name: 'check_arp', description: '查询目标 IP 的 ARP/MAC 地址对应关系，用于检测 IP 冲突或 MAC 异常', parameters: { type: 'object', properties: { host: { type: 'string', description: '目标 IP 地址' } }, required: ['host'] } } },
  { type: 'function', function: { name: 'scan_subnet', description: '扫描 /24 网段，发现在线设备。返回所有能 Ping 通的 IP 列表', parameters: { type: 'object', properties: { subnet: { type: 'string', description: '网段 CIDR，例如 192.168.1.0/24' } }, required: ['subnet'] } } },
  { type: 'function', function: { name: 'web_probe', description: '探测设备 Web 管理页面是否可访问，返回 HTTP 状态码和页面标题', parameters: { type: 'object', properties: { host: { type: 'string', description: '目标 IP 或域名' }, port: { type: 'integer', description: '端口号，默认 80' }, secure: { type: 'boolean', description: '是否使用 HTTPS，默认 false' } }, required: ['host'] } } },
  { type: 'function', function: { name: 'trace_route', description: '路由追踪，查看到达目标的网络路径', parameters: { type: 'object', properties: { host: { type: 'string', description: '目标 IP 或域名' } }, required: ['host'] } } },
  { type: 'function', function: { name: 'get_network_info', description: '获取本机网络配置：IP 地址、子网掩码、默认网关、DNS 服务器（ipconfig /all）', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'get_network_snapshot', description: '一键网络快照：同时采集本机 IP 配置、IPv4 路由表、Wi-Fi 状态和 ARP 表', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'check_adapter_health', description: '检查本机所有网卡状态：是否启用、链路是否 Up、速率、MAC 地址', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'check_gateway', description: '测试本机到默认网关的连通性和延迟', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'check_internet', description: '测试外网连通性：公共 DNS 解析、公网 IP Ping、HTTPS 出口', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'get_system_info', description: '获取 Windows 系统信息：计算机名、系统版本、最近启动时间、可用内存、磁盘剩余空间', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'get_system_errors', description: '读取最近 3 天的 Windows 系统错误/警告日志（Event Log）', parameters: { type: 'object', properties: { hours: { type: 'integer', description: '回溯多少小时，默认 72' } }, required: [] } } },
  { type: 'function', function: { name: 'check_spooler', description: '检查本机 Print Spooler 打印服务状态、打印机列表和队列状态', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'check_drivers', description: '检查即插即用设备驱动状态，列出所有状态非 OK 的设备', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'query_assets', description: '在本地资产数据库中搜索已登记的设备。可按门店名、IP、设备类型或资产名称搜索', parameters: { type: 'object', properties: { site: { type: 'string', description: '门店名称，如 万达店' }, ip: { type: 'string', description: 'IP 地址' }, type: { type: 'string', description: '设备类型：打印机/摄像头/交换机/电脑/NVR' }, name: { type: 'string', description: '资产名称关键词' } }, required: [] } } },
  { type: 'function', function: { name: 'ask_user_check', description: '请求工程师到设备旁检查物理状态。用于确认电源、网线、指示灯、卡纸等工具无法检测的物理问题', parameters: { type: 'object', properties: { question: { type: 'string', description: '需要工程师确认的问题，例如：请检查打印机电源灯是否亮起' }, options: { type: 'array', items: { type: 'string' }, description: '供工程师选择的答案选项，如 [是, 否, 不确定]' } }, required: ['question'] } } },
];
const agentToolAllowlist = new Set(['ping', 'dns_lookup', 'check_port', 'check_ports', 'check_arp', 'scan_subnet', 'web_probe', 'trace_route', 'get_network_info', 'get_network_snapshot', 'check_adapter_health', 'check_gateway', 'check_internet', 'get_system_info', 'get_system_errors', 'check_spooler', 'check_drivers', 'query_assets', 'ask_user_check']);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const evidenceMimeTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.log': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body));
};
const roleProfiles = {
  admin: { label: '管理员', permissions: ['data_read', 'data_write', 'tool_run', 'repair_run', 'launcher_run', 'ai_use', 'audit_read', 'backup_manage', 'user_manage'] },
  engineer: { label: '运维工程师', permissions: ['data_read', 'data_write', 'tool_run', 'repair_run', 'launcher_run', 'ai_use', 'audit_read'] },
  viewer: { label: '只读人员', permissions: ['data_read', 'tool_run', 'ai_use'] },
};
const sessionStore = new Map();
const rolePermissions = (role) => roleProfiles[role]?.permissions || roleProfiles.viewer.permissions;
const safeUser = (user) => user ? ({ id: user.id, username: user.username, displayName: user.displayName || user.username, role: user.role, roleLabel: roleProfiles[user.role]?.label || user.role, disabled: Boolean(user.disabled), createdAt: user.createdAt, updatedAt: user.updatedAt }) : null;
const authPayload = (user, bootstrapRequired = false) => ({ ok: true, authenticated: Boolean(user), bootstrapRequired, user: safeUser(user), roles: roleProfiles, permissions: user ? rolePermissions(user.role) : [] });
function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map((item) => item.trim()).filter(Boolean).map((item) => {
    const index = item.indexOf('='); return index >= 0 ? [decodeURIComponent(item.slice(0, index)), decodeURIComponent(item.slice(index + 1))] : [item, ''];
  }));
}
function setSessionCookie(res, token, maxAge = 60 * 60 * 10) {
  res.setHeader('Set-Cookie', `opshub_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`);
}
function clearSessionCookie(res) { setSessionCookie(res, '', 0); }
function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const key = scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${key}`;
}
function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const actual = Buffer.from(hashPassword(password, parts[1]).split('$')[2], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function validatePassword(password) {
  const value = String(password || '');
  if (value.length < 8) throw new Error('密码至少 8 位。');
  if (value.length > 200) throw new Error('密码过长。');
  return value;
}
function validateUsername(username) {
  const value = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9_.-]{3,32}$/.test(value)) throw new Error('账号只能使用 3-32 位字母、数字、点、下划线和短横线。');
  return value;
}
function validateRole(role) {
  const value = String(role || 'viewer').trim();
  if (!Object.hasOwn(roleProfiles, value)) throw new Error('无效角色。');
  return value;
}
function createSession(res, user) {
  const token = randomBytes(32).toString('hex');
  sessionStore.set(token, { userId: user.id, createdAt: Date.now(), expiresAt: Date.now() + 10 * 60 * 60 * 1000 });
  setSessionCookie(res, token);
  return token;
}
async function authContext(req) {
  const token = parseCookies(req).opshub_session;
  const session = token ? sessionStore.get(token) : null;
  if (!session || session.expiresAt < Date.now()) { if (token) sessionStore.delete(token); return { token: null, user: null, store: await readStore() }; }
  const store = await readStore();
  const user = store.users.find((item) => item.id === session.userId && !item.disabled);
  if (!user) { sessionStore.delete(token); return { token: null, user: null, store }; }
  session.expiresAt = Date.now() + 10 * 60 * 60 * 1000;
  return { token, user, store };
}
function hasPermission(user, permission) { return Boolean(user && rolePermissions(user.role).includes(permission)); }
function deny(res, message = '当前账号没有权限执行该操作。') { return send(res, 403, { ok: false, output: message }); }
const repairToolIds = new Set(['flush-dns', 'renew-dhcp', 'repair-network', 'repair-printer', 'repair-printer-queue', 'spooler-start', 'print-test']);
const launchToolIds = new Set(['rdp', 'open-web']);
function requiredPermission(pathname, method) {
  if (pathname === '/api/auth/me' || pathname === '/api/auth/login' || pathname === '/api/auth/logout' || pathname === '/api/auth/bootstrap') return null;
  if (pathname.startsWith('/api/auth/users')) return 'user_manage';
  if (pathname === '/api/ai/providers' || pathname === '/api/ai/analyze' || pathname === '/api/ai/test') return 'ai_use';
  if (pathname === '/api/audits') return 'audit_read';
  if (pathname.startsWith('/api/backup/')) return 'backup_manage';
  if (pathname === '/api/tools/external/launch') return 'launcher_run';
  if (pathname.startsWith('/api/tools/')) {
    const toolId = pathname.slice('/api/tools/'.length).split('/')[0];
    if (repairToolIds.has(toolId)) return 'repair_run';
    if (launchToolIds.has(toolId)) return 'launcher_run';
    return 'tool_run';
  }
  if (pathname === '/api/ocr/image' || pathname === '/api/evidence' && method === 'POST' || pathname === '/api/agent-reports/import') return 'data_write';
  if (method !== 'GET') return 'data_write';
  return 'data_read';
}
const validHost = (value) => typeof value === 'string' && value.length <= 253 && /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?)$/.test(value);
const assetText = (value, max) => String(value || '').trim().slice(0, max) || null;
function assetRecordFields(body) {
  return { model: assetText(body.model, 120), serialNumber: assetText(body.serialNumber, 120), macAddress: assetText(body.macAddress, 64), physicalLocation: assetText(body.physicalLocation, 120), notes: assetText(body.notes, 1000) };
}
function evidenceLooksValid(buffer, extension) {
  if (extension === '.png') return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (extension === '.jpg' || extension === '.jpeg') return buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (extension === '.webp') return buffer.subarray(0, 4).equals(Buffer.from('RIFF')) && buffer.subarray(8, 12).equals(Buffer.from('WEBP'));
  if (extension === '.pdf') return buffer.subarray(0, 5).equals(Buffer.from('%PDF-'));
  return true;
}
function normalizeAgentReport(value) {
  if (!value || value.format !== 'OpsHubAgentReport/1' || typeof value.computer !== 'object') throw new Error('不是有效的 OpsHub 门店采集包。');
  const name = String(value.computer.Name || '').trim().slice(0, 80); if (!name) throw new Error('采集包缺少计算机名称。');
  const networks = Array.isArray(value.network) ? value.network : value.network ? [value.network] : []; const primary = networks.find((item) => Array.isArray(item?.IPv4) && item.IPv4.length) || networks[0] || {};
  const ip = String(Array.isArray(primary.IPv4) ? primary.IPv4[0] : primary.IPv4 || '-').trim().slice(0, 253) || '-'; const macAddress = assetText(primary.MacAddress, 64);
  const manufacturer = String(value.computer.Manufacturer || '').trim(); const deviceModel = String(value.computer.Model || '').trim(); const model = assetText([manufacturer, deviceModel].filter(Boolean).join(' '), 120);
  const collectedAt = Number.isFinite(Date.parse(value.collectedAt)) ? new Date(value.collectedAt).toISOString() : new Date().toISOString();
  const disks = Array.isArray(value.disks) ? value.disks.slice(0, 20).map((item) => ({ drive: String(item.DriveLetter || ''), size: Number(item.Size || 0), free: Number(item.SizeRemaining || 0), health: String(item.HealthStatus || '') })) : [];
  return { name, ip, macAddress, model, collectedAt, operatingSystem: assetText(value.computer.OperatingSystem, 160), osVersion: assetText(value.computer.Version, 80), printerStatus: assetText(value.printerService?.Status, 40), disks };
}
async function getOcrWorker() {
  if (!ocrWorkerPromise) {
    await mkdir(ocrCacheDir, { recursive: true });
    ocrWorkerPromise = createWorker('chi_sim', 1, { langPath: chiSimLanguage.langPath, cachePath: ocrCacheDir, gzip: chiSimLanguage.gzip, logger: () => {} }).catch((error) => { ocrWorkerPromise = null; throw error; });
  }
  return ocrWorkerPromise;
}
function recognizeImage(buffer) {
  const task = ocrQueue.then(async () => { const worker = await getOcrWorker(); const result = await worker.recognize(buffer); return { text: String(result.data?.text || '').replace(/\r/g, '').trim().slice(0, 12000), confidence: Number(result.data?.confidence || 0) }; });
  ocrQueue = task.catch(() => {}); return task;
}
const emptyStore = () => ({ tickets: [], assets: [], worklogs: [], audits: [], incidents: [], knowledge: [], evidence: [], users: [] });
function normalizeStore(store) { const fallback = emptyStore(); return Object.fromEntries(Object.keys(fallback).map((key) => [key, Array.isArray(store?.[key]) ? store[key] : []])); }
async function readStore() {
  for (const candidate of [storePath, storeBackupPath]) { try { return normalizeStore(JSON.parse(await readFile(candidate, 'utf8'))); } catch { /* try the fallback copy */ } }
  return emptyStore();
}
async function writeStore(store) {
  const serialized = JSON.stringify(normalizeStore(store), null, 2); const tempPath = join(dataDir, `.opshub-${process.pid}-${++storeWriteCounter}.tmp`);
  const task = storeWriteQueue.then(async () => { await mkdir(dataDir, { recursive: true }); await writeFile(tempPath, serialized, 'utf8'); if (existsSync(storePath)) await copyFile(storePath, storeBackupPath); await rename(tempPath, storePath); });
  storeWriteQueue = task.catch(() => {}); return task;
}
async function buildPortableBackup(store) {
  const evidenceFiles = []; let totalBytes = 0;
  for (const item of store.evidence) {
    if (!/^[A-Za-z0-9._-]+$/.test(item.storedName || '')) continue;
    try { const data = await readFile(join(evidenceDir, item.storedName)); totalBytes += data.length; if (totalBytes > 50 * 1024 * 1024) throw new Error('证据附件总量超过 50MB，请先归档旧附件再导出。'); evidenceFiles.push({ id: item.id, data: data.toString('base64') }); } catch (error) { if (/超过 50MB/.test(error.message)) throw error; }
  }
  return { exportedAt: new Date().toISOString(), format: 'OpsHubBackup/2', data: store, evidenceFiles };
}
async function restoreBackupEvidence(store, backup) {
  if (backup.format !== 'OpsHubBackup/2') return 0;
  const files = Array.isArray(backup.evidenceFiles) ? backup.evidenceFiles.slice(0, 500) : []; let totalBytes = 0; let restored = 0; await mkdir(evidenceDir, { recursive: true });
  for (const file of files) {
    const meta = store.evidence.find((item) => item.id === String(file.id || '')); if (!meta || !/^[A-Za-z0-9._-]+$/.test(meta.storedName || '')) continue;
    if (existsSync(join(evidenceDir, meta.storedName))) continue;
    const extension = extname(meta.storedName).toLowerCase(); if (!Object.hasOwn(evidenceMimeTypes, extension)) continue;
    const data = Buffer.from(String(file.data || ''), 'base64'); totalBytes += data.length; if (!data.length || data.length > 5 * 1024 * 1024 || totalBytes > 50 * 1024 * 1024 || !evidenceLooksValid(data, extension)) throw new Error('备份中的证据附件无效或超过容量限制。');
    await writeFile(join(evidenceDir, meta.storedName), data); restored += 1;
  }
  return restored;
}
async function recordAudit(entry) {
  const store = await readStore();
  const createdAt = new Date().toISOString();
  store.audits.unshift({ id: `AUD-${Date.now()}`, createdAt, ...entry });
  store.audits = store.audits.slice(0, 500);
  if (entry.incidentId) {
    const incident = store.incidents.find((item) => item.id === entry.incidentId);
    if (incident) { incident.lastAction = entry.action; incident.updatedAt = createdAt; if (incident.status === '调查中') incident.status = '处理中'; }
  }
  await writeStore(store);
}
async function runAuditedAction(type, action, task) {
  const result = await task();
  await recordAudit({ type, action, ok: result.ok, issue: '用户在本地控制台确认执行。', output: String(result.output || '').slice(0, 5000) });
  return result;
}
function mergeBackupItems(current, incoming, limit = Infinity) {
  const existing = Array.isArray(current) ? current : []; const imported = Array.isArray(incoming) ? incoming.filter((item) => item && typeof item === 'object' && item.id) : [];
  const ids = new Set(existing.map((item) => item.id)); return [...imported.filter((item) => !ids.has(item.id)), ...existing].slice(0, limit);
}
const builtInKnowledge = [
  { id: 'KB-PRINTER', title: '门店打印机与小票机排查', category: '打印', keywords: ['打印', '小票', 'spooler', '9100', '队列'], content: '先确认电源、纸张、卡纸与网线；网络设备依次检查 Ping、9100/515/631 端口、ARP/MAC；本机检查 Print Spooler、默认打印机、队列和驱动。清空队列会丢失待打印任务，必须人工确认。' },
  { id: 'KB-CCTV', title: '摄像头与 NVR 无画面排查', category: '监控', keywords: ['摄像', '监控', 'nvr', 'rtsp', 'poe', '554'], content: '先划分单路、NVR 或整店故障范围；检查 NVR 和摄像头 Ping、80/443/554/8000/37777 端口、ARP/MAC；现场检查 PoE 供电、交换机端口、网线、NVR 通道、硬盘与录像状态。' },
  { id: 'KB-NETWORK', title: '门店网络中断排查', category: '网络', keywords: ['网络', '网关', 'dns', 'dhcp', 'wifi', '外网'], content: '按故障范围、本机 IP/DNS/网关、网关连通性、网卡链路、外网 DNS/公网连通性、交换机/出口链路的顺序排查。任何 DNS、DHCP 或 VLAN 变更前记录原配置并保留回滚方式。' },
  { id: 'KB-PC', title: '桌面电脑卡顿、蓝屏与软件异常', category: '桌面', keywords: ['电脑', '卡顿', '蓝屏', '软件', '磁盘', '驱动'], content: '先保全错误截图、时间和业务数据；检查磁盘空间与健康、资源占用、系统和应用日志、驱动及最近更新。不要直接重装系统掩盖根因；涉及驱动和补丁前应建立回滚点。' },
];
const officialKnowledgeSources = [
  { name: '华为企业业务支持', category: '网络/交换机/无线', url: 'https://support.huawei.com/enterprise/' },
  { name: '新华三 H3C 文档中心', category: '网络/交换机/无线', url: 'https://www.h3c.com/cn/Service/Document_Software/Document_Center/' },
  { name: 'TP-Link 下载与支持', category: '网络/无线/路由', url: 'https://www.tp-link.com/cn/support/download/' },
  { name: '锐捷网络服务与支持', category: '网络/交换机/无线', url: 'https://www.ruijie.com.cn/fw/wd/' },
  { name: 'Cisco 技术支持', category: '网络/交换机/安全', url: 'https://www.cisco.com/c/zh_cn/support/index.html' },
  { name: 'Ubiquiti Help Center', category: '网络/无线/网关', url: 'https://help.ui.com/' },
  { name: 'Juniper Support', category: '网络/防火墙/路由', url: 'https://support.juniper.net/support/' },
  { name: 'Fortinet Docs', category: '防火墙/VPN/安全', url: 'https://docs.fortinet.com/' },
  { name: '海康威视技术支持', category: '监控/NVR/摄像头', url: 'https://www.hikvision.com/cn/support/' },
  { name: '大华技术支持', category: '监控/NVR/摄像头', url: 'https://www.dahuatech.com/support' },
  { name: '宇视科技支持', category: '监控/NVR/摄像头', url: 'https://www.uniview.com/support/' },
  { name: 'Axis 支持中心', category: '监控/摄像头/门禁', url: 'https://help.axis.com/' },
  { name: '爱普生支持中心', category: '打印/扫描', url: 'https://support.epson.net/' },
  { name: '惠普支持', category: '打印/电脑', url: 'https://support.hp.com/cn-zh' },
  { name: 'Brother 支持', category: '打印/标签机', url: 'https://support.brother.com/' },
  { name: 'Canon 中国支持', category: '打印/扫描', url: 'https://www.canon.com.cn/support/' },
  { name: 'Zebra 支持与下载', category: '标签机/扫描枪/POS', url: 'https://www.zebra.com/us/en/support-downloads.html' },
  { name: '戴尔支持', category: '服务器/电脑/存储', url: 'https://www.dell.com/support/home/zh-cn' },
  { name: '联想支持', category: '电脑/终端', url: 'https://support.lenovo.com/cn/zh/' },
  { name: 'Synology 支持与下载', category: 'NAS/存储/备份', url: 'https://www.synology.com/zh-cn/support/download' },
  { name: 'Microsoft Learn', category: 'Windows/AD/桌面', url: 'https://learn.microsoft.com/zh-cn/' },
];
const officialDomainSuffixes = ['huawei.com', 'h3c.com', 'tp-link.com', 'ruijie.com.cn', 'cisco.com', 'ui.com', 'juniper.net', 'fortinet.com', 'hikvision.com', 'dahuatech.com', 'uniview.com', 'axis.com', 'epson.net', 'hp.com', 'brother.com', 'canon.com.cn', 'zebra.com', 'dell.com', 'lenovo.com', 'synology.com', 'microsoft.com'];
function isOfficialKnowledgeUrl(value) {
  try { const url = new URL(String(value)); return url.protocol === 'https:' && officialDomainSuffixes.some((suffix) => url.hostname === suffix || url.hostname.endsWith(`.${suffix}`)); }
  catch { return false; }
}
function htmlToKnowledgeText(html) {
  return String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim();
}
async function importOfficialKnowledge(body) {
  const sourceUrl = String(body.url || '').trim();
  if (!isOfficialKnowledgeUrl(sourceUrl)) throw new Error('仅允许导入已列品牌的 HTTPS 官方文档页面。');
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'OpsHub-KnowledgeImporter/0.1' }, redirect: 'follow' });
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) throw new Error(`官方页面返回 HTTP ${response.status}`);
  if (!/text\/html|text\/plain|application\/json/i.test(contentType)) throw new Error('当前仅支持网页、纯文本或 JSON 文档；PDF 手册将在下一步通过文档解析器导入。');
  const raw = await response.text(); const content = (contentType.includes('html') ? htmlToKnowledgeText(raw) : raw.trim()).slice(0, 12000);
  if (content.length < 120) throw new Error('未从页面提取到足够的正文内容。');
  const url = new URL(sourceUrl); return { title: String(body.title || url.hostname).trim().slice(0, 120), category: String(body.category || '官方手册').trim().slice(0, 40), content, keywords: Array.isArray(body.keywords) ? body.keywords.map((item) => String(item).trim()).filter(Boolean).slice(0, 12) : [], sourceUrl, source: '官方网页', createdAt: new Date().toISOString() };
}
async function importPdfKnowledge(body) {
  const encoded = String(body.data || '').trim();
  if (!encoded || encoded.length > 14 * 1024 * 1024) throw new Error('PDF 文件为空或超过 10 MB 限制。');
  const data = Buffer.from(encoded, 'base64');
  if (data.length < 8 || data.length > 10 * 1024 * 1024 || !data.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('文件不是有效的 PDF。');
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText(); const content = String(result.text || '').replace(/\s+/g, ' ').trim().slice(0, 12000);
    if (content.length < 120) throw new Error('PDF 未提取到足够文本；扫描版手册需要后续 OCR 导入。');
    return { title: String(body.title || body.filename || 'PDF 手册').trim().slice(0, 120), category: String(body.category || 'PDF 手册').trim().slice(0, 40), content, keywords: Array.isArray(body.keywords) ? body.keywords.map((item) => String(item).trim()).filter(Boolean).slice(0, 12) : [], source: String(body.source || '本地 PDF 手册').slice(0, 40), sourceUrl: String(body.sourceUrl || '').slice(0, 500), reviewStatus: String(body.reviewStatus || '待验证').slice(0, 40), createdAt: new Date().toISOString() };
  } finally { await parser.destroy(); }
}
async function relevantKnowledge(issue) {
  const text = String(issue || '').toLowerCase(); const store = await readStore(); const documents = [...store.knowledge, ...builtInKnowledge];
  return documents.map((item) => ({ item, score: (item.keywords || []).reduce((score, keyword) => score + (text.includes(String(keyword).toLowerCase()) ? 1 : 0), 0) })).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, 2).map(({ item }) => `【${item.title}｜${item.source || '内置 SOP'}｜${item.reviewStatus || '已验证'}】\n${item.content}`).join('\n\n');
}
async function assetsForIssue(issue) {
  const text = String(issue || '').toLowerCase(); const store = await readStore(); const assets = store.assets;
  const siteAssets = assets.filter((asset) => asset.site && text.includes(String(asset.site).toLowerCase()));
  const directAssets = assets.filter((asset) => (asset.name && text.includes(String(asset.name).toLowerCase())) || (asset.ip && text.includes(String(asset.ip).toLowerCase())));
  if (!siteAssets.length) return directAssets.slice(0, 10);
  const scoped = siteAssets.filter((asset) => directAssets.includes(asset) || (/(打印|小票|printer)/.test(text) && /(打印|printer)/i.test(asset.type || '')) || (/(摄像|监控|nvr|camera)/.test(text) && /(摄像|监控|nvr|camera)/i.test(`${asset.name} ${asset.type}`)) || (/电脑|蓝屏|卡顿/.test(text) && /(电脑|终端|pos|收银)/i.test(`${asset.name} ${asset.type}`)));
  return (scoped.length ? scoped : siteAssets).slice(0, 10);
}
function assetContext(assets) {
  return assets.map((asset) => `${asset.site} | ${asset.name} | ${asset.type} | ${asset.model || '-'} | ${asset.ip || '-'} | ${asset.physicalLocation || '-'} | ${asset.status || '已登记'}${asset.agentSummary?.operatingSystem ? ` | ${asset.agentSummary.operatingSystem}` : ''}`).join('\n');
}
function aiProviders() {
  try { const providers = JSON.parse(process.env.OPSHUB_AI_PROVIDERS_JSON || '[]'); if (Array.isArray(providers) && providers.length) return providers.filter((item) => item?.name === 'DeepSeek' && item?.endpoint && item?.apiKey && item?.model); } catch { /* fallback below */ }
  return process.env.OPSHUB_AI_ENDPOINT && process.env.OPSHUB_AI_API_KEY && process.env.OPSHUB_AI_MODEL ? [{ name: process.env.OPSHUB_AI_NAME || 'DeepSeek', endpoint: process.env.OPSHUB_AI_ENDPOINT, apiKey: process.env.OPSHUB_AI_API_KEY, model: process.env.OPSHUB_AI_MODEL }] : [];
}
function localOpsAdvice(issue, evidence) {
  const text = `${issue}\n${evidence}`.toLowerCase();
  if (/print|打印|spooler|9100/.test(text)) return '已确认事实：请以 Ping、9100/515/631 端口和 Print Spooler 输出为准。\n最可能根因：1. 打印服务停止或队列阻塞；2. 打印机 IP/网络不可达；3. 纸张、卡纸、驱动或端口变化。\n处理：先启动或重启 Print Spooler，再执行网络打印机诊断；网络通但仍失败时检查默认打印机和队列。\n验证：打印 Windows 测试页或 POS 测试小票。\n回滚：不要直接清空队列，除非已确认可丢弃待打印任务。';
  if (/camera|cctv|nvr|监控|摄像/.test(text)) return '已确认事实：请以 NVR/摄像头 Ping、常用端口和 ARP/MAC 查询结果为准。\n最可能根因：1. PoE/供电或网线链路；2. 摄像头 IP 冲突；3. NVR 通道、编码或硬盘异常。\n处理：先确认 NVR 与单摄像头的故障范围；再检查 PoE 端口链路、MAC 与 IP；最后检查 NVR 通道。\n验证：恢复实时画面并抽查录像。\n回滚：远程重启 NVR 或 PoE 前先记录当前通道与端口状态。';
  if (/disk|磁盘|cpu|蓝屏|电脑/.test(text)) return '已确认事实：请以系统、磁盘健康和 Windows 事件日志输出为准。\n最可能根因：1. 磁盘空间或硬盘健康异常；2. 驱动/更新冲突；3. 内存或应用进程异常。\n处理：先备份业务数据，再清理可确认的临时文件，检查事件日志和驱动版本。\n验证：重启后复测业务软件与磁盘剩余空间。\n回滚：变更驱动、补丁或系统文件前建立还原点/备份。';
  return '已确认事实：请先收集一键网络快照、Ping、DNS、端口和最近变更。\n最可能根因：网络配置、DNS/DHCP、设备服务或物理链路异常。\n处理：按“故障范围 → 连通性 → 端口/服务 → 物理连接 → 配置变更”顺序排查。\n验证：用业务实际访问或测试页确认恢复。\n回滚：网络配置变更前记录原始 IP、DNS、网关和 VLAN。';
}
function opsField(output, labels, fallback = '') {
  const heading = labels.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const allHeadings = '判断结论|初步结论|证据|已确认事实|根因候选|最可能根因|下一步工具|受控修复|处理|风险|验证|回滚|现场\\s*SOP|升级条件';
  const expression = new RegExp(`(?:^|\\n)\\s*(?:\\d+[.、]\\s*)?(?:${heading})\\s*[：:]\\s*([\\s\\S]*?)(?=\\n\\s*(?:\\d+[.、]\\s*)?(?:${allHeadings})\\s*[：:]|$)`, 'i');
  const value = String(output || '').match(expression)?.[1]?.trim().replace(/\n{3,}/g, '\n\n');
  return (value || fallback).slice(0, 1000);
}
function buildOpsBrief(issue, output, action = null) {
  const actionFact = action ? `已执行只读检查：${action.name}（${action.ok ? '已完成' : '执行异常'}）。` : '';
  return {
    conclusion: opsField(output, ['判断结论', '初步结论'], '当前结论需要结合现场证据复核。'),
    evidence: opsField(output, ['证据', '已确认事实'], actionFact || '尚未执行自动诊断，需先收集现场证据。'),
    rootCause: opsField(output, ['根因候选', '最可能根因'], '根因尚未确认，按现场 SOP 逐项排除。'),
    risk: opsField(output, ['风险'], '未确认前只执行只读检查；配置、重启和清队列等动作须人工确认。'),
    verification: opsField(output, ['验证'], '以实际业务访问、测试页或现场画面恢复为准。'),
    rollback: opsField(output, ['回滚'], '变更前记录原始配置；失败时恢复记录的原始配置。'),
  };
}
function redactAiEvidence(value) {
  return String(value || '')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[已隐藏 API Key]')
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,;]+/gi, '$1[已隐藏 Token]')
    .replace(/(\b(?:password|passwd|pwd|secret|token|api[_-]?key)\b\s*[:=]\s*)[^\s,;]+/gi, '$1[已隐藏]');
}
function isNormalConversation(issue, evidence) {
  const text = String(issue || '').trim();
  return text.length <= 180 && /^(?:你好|您好|在吗|在不在|你是谁|你能做什么|你会什么|测试|test|hello|hi|嗨|介绍一下|正常回复|随便聊)/i.test(text);
}
function aiPrompt(body) {
  const issue = redactAiEvidence(body.issue).trim().slice(0, 4000) || '未填写';
  const evidence = redactAiEvidence(body.evidence).trim().slice(0, 12000) || '未提供';
  const normalConversation = isNormalConversation(issue, evidence);
  const systemPrompt = normalConversation ? '你是 IT 运维百宝箱的 DeepSeek 对话助手。对问候、测试、能力介绍等非故障问题，用自然、简洁的中文直接回复；不要输出故障排查模板，不要虚构检测结果。' : opsAiPrompt;
  const userPrompt = normalConversation ? issue : `故障现象：${issue}\n检测证据：${evidence}\n请按运维模板输出。`;
  return { issue, evidence, normalConversation, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }] };
}
function hostFromIssue(issue) {
  const candidate = String(issue || '').match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/)?.[0];
  return validHost(candidate) ? candidate : null;
}
async function runAgentDiagnostic(issue) {
  const text = String(issue || '').toLowerCase(); let host = hostFromIssue(issue); const matchedAssets = !host ? await assetsForIssue(issue) : [];
  if (!host) { const matched = matchedAssets.find((asset) => validHost(String(asset.ip || '').trim()) && asset.ip !== '-'); host = matched?.ip || null; }
  const fullCheck = /一键排查|全面检查|完整检查|帮我检查|帮忙检查/.test(text);
  if (fullCheck && /打印|小票/.test(text)) {
    const checks = [{ name: '本机打印服务与队列', task: () => runPowerShell("Get-Service Spooler | Format-Table -AutoSize; ''; Get-Printer | Select-Object Name,PrinterStatus,WorkOffline | Format-Table -AutoSize") }];
    if (host) checks.unshift({ name: `Ping ${host}`, task: () => run('ping', ['-n', '2', '-w', '1200', host], 5000) }, { name: '打印端口 9100/515/631', task: () => multiPortCheck(host, [9100, 515, 631]) }, { name: 'ARP/MAC', task: () => run('arp', ['-a', host], 6000) });
    return { name: host ? `AI 多步骤打印机排查 ${host}` : 'AI 多步骤本机打印排查', ...(await bundleChecks(checks)) };
  }
  if (fullCheck && /摄像|监控|\bnvr\b/.test(text) && host) return { name: `AI 多步骤监控排查 ${host}`, ...(await bundleChecks([{ name: `Ping ${host}`, task: () => run('ping', ['-n', '2', '-w', '1200', host], 5000) }, { name: '监控端口 80/443/554/8000/37777', task: () => multiPortCheck(host, [80, 443, 554, 8000, 37777]) }, { name: '设备 Web 管理页', task: () => webProbe(host, 80, false) }, { name: 'ARP/MAC', task: () => run('arp', ['-a', host], 6000) }])) };
  if (fullCheck && (/电脑|蓝屏|卡顿|软件异常/.test(text))) return { name: 'AI 多步骤电脑健康排查', ...(await bundleChecks([{ name: '系统与内存', task: () => runPowerShell("Get-CimInstance Win32_OperatingSystem | Select-Object CSName,Caption,LastBootUpTime,FreePhysicalMemory | Format-List") }, { name: '磁盘健康', task: () => runPowerShell("Get-Volume | Where-Object DriveLetter | Select-Object DriveLetter,SizeRemaining,Size,HealthStatus | Format-Table -AutoSize; ''; Get-PhysicalDisk | Select-Object FriendlyName,HealthStatus,OperationalStatus,Size | Format-Table -AutoSize") }, { name: '资源占用进程', task: () => runPowerShell("Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 8 ProcessName,Id,@{Name='MemoryMB';Expression={[math]::Round($_.WorkingSet64 / 1MB,1)}} | Format-Table -AutoSize") }, { name: '最近系统错误', task: () => runPowerShell("Get-WinEvent -FilterHashtable @{LogName='System'; Level=1,2; StartTime=(Get-Date).AddDays(-3)} -MaxEvents 8 | Select-Object TimeCreated,ProviderName,Id,Message | Format-List") }])) };
  if (fullCheck && /网络/.test(text)) return { name: 'AI 多步骤网络排查', ...(await bundleChecks([{ name: 'IP、DNS、网关', task: () => run('ipconfig', ['/all'], 10000) }, { name: '默认网关', task: () => runPowerShell("$route = Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Where-Object { $_.NextHop -and $_.NextHop -ne '0.0.0.0' } | Sort-Object RouteMetric | Select-Object -First 1; if ($route) { Test-Connection -ComputerName $route.NextHop -Count 2 | Select-Object Address,Status,ResponseTime | Format-Table -AutoSize } else { '未找到默认网关。' }") }, { name: '网卡链路', task: () => runPowerShell("Get-NetAdapter | Select-Object Name,Status,MediaConnectionState,LinkSpeed | Format-Table -AutoSize") }, { name: '外网 DNS', task: () => run('nslookup', ['www.cloudflare.com'], 8000) }, { name: '公网连通性', task: () => run('ping', ['-n', '2', '-w', '1500', '1.1.1.1'], 6000) }])) };
  if ((/\bping\b|连通|能通吗/.test(text)) && host) return { name: `Ping ${host}`, ...(await run('ping', ['-n', '4', '-w', '1500', host], 8000)) };
  if ((/\bdns\b|解析/.test(text)) && host) return { name: `DNS 查询 ${host}`, ...(await run('nslookup', [host], 8000)) };
  if (/网关/.test(text)) return { name: '默认网关连通性', ...(await runPowerShell("$route = Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Where-Object { $_.NextHop -and $_.NextHop -ne '0.0.0.0' } | Sort-Object RouteMetric | Select-Object -First 1; if (-not $route) { throw '未找到 IPv4 默认网关。' }; $reachable = Test-Connection -ComputerName $route.NextHop -Count 2 -Quiet -ErrorAction SilentlyContinue; [pscustomobject]@{ Interface = $route.InterfaceAlias; Gateway = $route.NextHop; Reachable = if ($reachable) { '正常' } else { '不可达' } } | Format-List")) };
  if (/网卡|网线|链路/.test(text)) return { name: '网卡/网线链路状态', ...(await runPowerShell("Get-NetAdapter -IncludeHidden | Select-Object Name,Status,MediaConnectionState,LinkSpeed,MacAddress | Sort-Object Status,Name | Format-Table -AutoSize")) };
  if (/网络快照|检查网络|网络检查/.test(text)) return { name: '一键网络快照', ...(await bundleChecks([{ name: 'IP、DNS、网关', task: () => run('ipconfig', ['/all'], 10000) }, { name: 'IPv4 路由表', task: () => run('route', ['print', '-4'], 8000) }, { name: 'Wi-Fi 状态', task: () => run('netsh', ['wlan', 'show', 'interfaces'], 8000) }])) };
  if (/打印|小票/.test(text)) return host ? { name: `打印机巡检 ${host}`, ...(await bundleChecks([{ name: 'Ping 连通性', task: () => run('ping', ['-n', '2', '-w', '1200', host], 5000) }, { name: '打印端口', task: () => multiPortCheck(host, [9100, 515, 631]) }])) } : { name: '本机打印服务与队列', ...(await runPowerShell("Get-Service Spooler | Format-Table -AutoSize; ''; Get-Printer | Select-Object Name,PrinterStatus,WorkOffline | Format-Table -AutoSize")) };
  if (/摄像|监控|\bnvr\b/.test(text) && host) return { name: `监控巡检 ${host}`, ...(await bundleChecks([{ name: 'Ping 连通性', task: () => run('ping', ['-n', '2', '-w', '1200', host], 5000) }, { name: 'NVR/监控端口', task: () => multiPortCheck(host, [80, 443, 554, 8000, 37777]) }])) };
  if (/电脑.*(卡|慢|蓝屏)|系统.*(慢|异常)|资源占用/.test(text)) return { name: '电脑健康检查', ...(await bundleChecks([{ name: '系统与内存', task: () => runPowerShell("Get-CimInstance Win32_OperatingSystem | Select-Object CSName,Caption,LastBootUpTime,FreePhysicalMemory | Format-List") }, { name: '磁盘可用空间', task: () => runPowerShell("Get-Volume | Where-Object DriveLetter | Select-Object DriveLetter,SizeRemaining,Size,HealthStatus | Format-Table -AutoSize") }, { name: '打印服务', task: () => runPowerShell("Get-Service Spooler | Format-Table -AutoSize") }])) };
  return null;
}
function suggestedToolsForIssue(issue) {
  const text = String(issue || '').toLowerCase();
  const host = hostFromIssue(issue);
  let tools;
  if (/打印|小票|spooler|print/.test(text)) {
    tools = host ? ['printer-health', 'printer', 'printer-service'] : ['printer-service', 'workstation-health'];
  } else if (/摄像|监控|nvr|录像机|rtsp/.test(text)) {
    tools = host ? ['cctv-health', 'cctv', 'arp', 'web-probe'] : ['network-snapshot', 'adapter-health'];
  } else if (/电脑|蓝屏|卡顿|死机|软件|驱动|磁盘|内存|cpu/.test(text)) {
    tools = ['workstation-health', 'resource-hotspots', 'system-errors', 'driver-problems'];
  } else if (/网络|断网|网关|dns|上网|网线|wifi|wi-fi|延迟|丢包/.test(text)) {
    tools = ['network-snapshot', 'gateway-health', 'adapter-health', 'internet-health'];
  } else if (host) {
    tools = ['ping', 'port', 'web-probe', 'arp'];
  } else {
    tools = ['onsite-baseline', 'network-snapshot', 'workstation-health'];
  }
  return tools.slice(0, 4).map((tool) => ({ tool, host: host || '' }));
}
async function executeAgentTool(name, args) {
  if (!agentToolAllowlist.has(name)) return { ok: false, output: `Agent 工具 ${name} 不在只读白名单中。需人工确认后才能执行。` };
  const host = String(args.host || '').trim();
  const port = Number(args.port);
  const ports = Array.isArray(args.ports) ? args.ports.map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 65536) : [];
  const subnet = String(args.subnet || '').trim();
  const hours = Number(args.hours) || 72;
  try {
    switch (name) {
      case 'ping': if (!validHost(host)) return { ok: false, output: '无效的目标地址。' }; return await run('ping', ['-n', '4', '-w', '1500', host], 8000);
      case 'dns_lookup': if (!validHost(host)) return { ok: false, output: '无效的目标地址。' }; return await run('nslookup', [host], 8000);
      case 'check_port': if (!validHost(host)) return { ok: false, output: '无效的目标地址。' }; if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, output: '端口号必须在 1-65535 之间。' }; return await portCheck(host, port);
      case 'check_ports': if (!validHost(host)) return { ok: false, output: '无效的目标地址。' }; if (!ports.length) return { ok: false, output: '至少需要一个有效端口。' }; return await multiPortCheck(host, ports);
      case 'check_arp': if (!validHost(host)) return { ok: false, output: '无效的目标地址。' }; return await run('arp', ['-a', host], 6000);
      case 'scan_subnet': { const prefix = validSubnet(subnet); if (!prefix) return { ok: false, output: '仅支持 /24 私网或单播网段，例如 192.168.1.0/24。' }; return await scanSubnet(prefix); }
      case 'web_probe': if (!validHost(host)) return { ok: false, output: '无效的目标地址。' }; return await webProbe(host, port || 80, Boolean(args.secure));
      case 'trace_route': if (!validHost(host)) return { ok: false, output: '无效的目标地址。' }; return await run('tracert', ['-d', '-h', '8', '-w', '800', host], 12000);
      case 'get_network_info': return await run('ipconfig', ['/all'], 10000);
      case 'get_network_snapshot': return await bundleChecks([{ name: 'IP、DNS、网关', task: () => run('ipconfig', ['/all'], 10000) }, { name: 'IPv4 路由表', task: () => run('route', ['print', '-4'], 8000) }, { name: 'Wi-Fi 状态', task: () => run('netsh', ['wlan', 'show', 'interfaces'], 8000) }, { name: 'ARP / MAC 表', task: () => run('arp', ['-a'], 8000) }]);
      case 'check_adapter_health': return await runPowerShell("Get-NetAdapter -IncludeHidden | Select-Object Name,InterfaceDescription,Status,MediaConnectionState,LinkSpeed,MacAddress | Sort-Object Status,Name | Format-Table -AutoSize");
      case 'check_gateway': return await runPowerShell("$route = Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Where-Object { $_.NextHop -and $_.NextHop -ne '0.0.0.0' } | Sort-Object RouteMetric | Select-Object -First 1; if (-not $route) { throw '未找到 IPv4 默认网关。' }; $reachable = Test-Connection -ComputerName $route.NextHop -Count 2 -Quiet -ErrorAction SilentlyContinue; [pscustomobject]@{ Interface = $route.InterfaceAlias; Gateway = $route.NextHop; Reachable = if ($reachable) { '正常' } else { '不可达' } } | Format-List");
      case 'check_internet': return await bundleChecks([{ name: '公共 DNS 解析', task: () => run('nslookup', ['www.cloudflare.com'], 8000) }, { name: '公网 Ping', task: () => run('ping', ['-n', '4', '-w', '1500', '1.1.1.1'], 9000) }, { name: 'HTTPS 出口', task: () => webProbe('www.cloudflare.com', 443, true) }]);
      case 'get_system_info': return await runPowerShell("Get-CimInstance Win32_OperatingSystem | Select-Object CSName,Caption,Version,LastBootUpTime,TotalVisibleMemorySize,FreePhysicalMemory | Format-List; ''; Get-Volume | Where-Object DriveLetter | Select-Object DriveLetter,SizeRemaining,Size,HealthStatus | Format-Table -AutoSize");
      case 'get_system_errors': return await runPowerShell(`Get-WinEvent -FilterHashtable @{LogName='System'; Level=1,2,3; StartTime=(Get-Date).AddHours(-${Math.min(hours, 168)})} -MaxEvents 15 | Select-Object TimeCreated,ProviderName,Id,LevelDisplayName,Message | Format-List`);
      case 'check_spooler': return await runPowerShell("Get-Service Spooler | Format-Table -AutoSize; ''; Get-Printer | Select-Object Name,DriverName,PortName,PrinterStatus,WorkOffline | Format-Table -AutoSize");
      case 'check_drivers': return await runPowerShell("$items = Get-PnpDevice -PresentOnly | Where-Object { $_.Status -ne 'OK' } | Select-Object Class,FriendlyName,Status,Problem; if ($items) { $items | Format-Table -AutoSize } else { '未发现状态异常的即插即用设备。' }");
      case 'query_assets': { const store = await readStore(); const site = String(args.site || '').trim().toLowerCase(); const ip = String(args.ip || '').trim(); const type = String(args.type || '').trim().toLowerCase(); const name = String(args.name || '').trim().toLowerCase(); const results = store.assets.filter((asset) => { if (site && String(asset.site || '').toLowerCase() !== site) return false; if (ip && asset.ip !== ip) return false; if (type && !String(asset.type || '').toLowerCase().includes(type)) return false; if (name && !String(asset.name || '').toLowerCase().includes(name)) return false; return true; }).slice(0, 20); if (!results.length) return { ok: true, output: '未找到匹配的已登记资产。建议先登记设备或尝试其他搜索条件。' }; return { ok: true, output: results.map((asset) => `${asset.site} | ${asset.name} | ${asset.type} | ${asset.ip || '-'} | ${asset.model || '-'} | MAC:${asset.macAddress || '-'} | ${asset.status || '已登记'} | 安装位置:${asset.physicalLocation || '-'}${asset.switchPort ? ' | 端口:' + asset.switchPort : ''}${asset.vlan ? ' | VLAN:' + asset.vlan : ''}`).join('\n') }; }
      case 'ask_user_check': return { ok: true, output: '需人工确认', askUser: true, question: String(args.question || ''), options: Array.isArray(args.options) ? args.options : [] };
      default: return { ok: false, output: `未知工具：${name}` };
    }
  } catch (error) { return { ok: false, output: `工具执行异常：${error.message}` }; }
}
async function callAiProvider(provider, messages, tools = null) {
  const body = { model: provider.model, temperature: 0.2, messages };
  if (tools) body.tools = tools;
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 55000);
  try {
    const response = await fetch(provider.endpoint.replace(/\/$/, '') + '/chat/completions', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`);
    return data;
  } finally { clearTimeout(timeout); }
}
async function runAgentLoop(provider, issue, evidence, maxTurns = 8) {
  const startTime = Date.now();
  const systemPrompt = agentSystemPrompt;
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `故障现象：${issue}\n初始证据：${evidence || '未提供'}\n请开始排查。先分析故障现象，然后调用合适的诊断工具收集证据。` }
  ];
  const toolTrace = [];
  let turns = 0;
  let finalOutput = '';
  while (turns < maxTurns && (Date.now() - startTime) < 120000) {
    turns++;
    const tools = turns === maxTurns ? undefined : AGENT_TOOLS;
    let data;
    try {
      data = await callAiProvider(provider, messages, tools);
    } catch (error) {
      toolTrace.push({ type: 'error', message: `第 ${turns} 轮 LLM 调用失败：${error.message}` });
      break;
    }
    const choice = data.choices?.[0];
    const assistantMsg = choice?.message;
    if (!assistantMsg) {
      toolTrace.push({ type: 'error', message: 'AI 提供程序返回了空响应。' });
      break;
    }
    if (!assistantMsg.tool_calls || !assistantMsg.tool_calls.length) {
      finalOutput = assistantMsg.content || '';
      messages.push({ role: 'assistant', content: finalOutput });
      break;
    }
    const thinkText = assistantMsg.content || '';
    if (thinkText) toolTrace.push({ type: 'think', content: thinkText });
    messages.push({ role: 'assistant', content: thinkText || null, tool_calls: assistantMsg.tool_calls });
    const toolResults = [];
    for (const tc of assistantMsg.tool_calls) {
      const fnName = tc.function.name;
      let fnArgs = {};
      try { fnArgs = JSON.parse(tc.function.arguments || '{}'); } catch { /* proceed with empty args */ }
      toolTrace.push({ type: 'tool-start', tool: fnName, args: fnArgs, displayName: agentToolDisplayName(fnName, fnArgs) });
      let result;
      if (fnName === 'ask_user_check') {
        result = { ok: true, output: '已提交问题给现场人员，等待回复。', askUser: true, question: fnArgs.question || '', options: fnArgs.options || [] };
        toolTrace.push({ type: 'ask-user', question: result.question, options: result.options });
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
        toolResults.push({ tc, result });
        continue;
      }
      try {
        result = await executeAgentTool(fnName, fnArgs);
      } catch (error) {
        result = { ok: false, output: `工具执行异常：${error.message}` };
      }
      toolTrace.push({ type: 'tool-end', tool: fnName, ok: result.ok, output: String(result.output || '').slice(0, 4000) });
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ ok: result.ok, output: String(result.output || '').slice(0, 4000) }) });
      toolResults.push({ tc, result });
    }
    const hasAskUser = toolResults.some(({ result }) => result.askUser);
    if (hasAskUser) {
      return { ok: true, mode: 'agent', provider: provider.name, toolTrace, askUser: toolResults.find(({ result }) => result.askUser)?.result, turns, status: 'awaiting_user' };
    }
  }
  if (!finalOutput && turns >= maxTurns) {
    messages.push({ role: 'user', content: '请基于以上所有检测结果，给出最终的故障排查结论（判断结论、证据、根因候选、风险、验证、回滚、升级条件）。' });
    try {
      const data = await callAiProvider(provider, messages);
      finalOutput = data.choices?.[0]?.message?.content || '';
    } catch { finalOutput = 'Agent 已达到最大轮数但未能生成最终结论。请检查以上工具执行结果并手动判断。'; }
  }
  if (!finalOutput) finalOutput = 'Agent 未能完成诊断。请查看工具执行结果并手动分析。';
  return { ok: true, mode: 'agent', provider: provider.name, toolTrace, finalOutput, turns, status: 'complete' };
}
function agentToolDisplayName(tool, args) {
  const host = String(args.host || '').trim();
  const port = args.port ? String(args.port) : '';
  const ports = Array.isArray(args.ports) ? args.ports.join(',') : '';
  const maps = {
    ping: host ? `Ping ${host}` : 'Ping 测试',
    dns_lookup: host ? `DNS 解析 ${host}` : 'DNS 查询',
    check_port: `端口测试 ${host}:${port}`,
    check_ports: `批量端口测试 ${host} [${ports}]`,
    check_arp: host ? `ARP/MAC 查询 ${host}` : 'ARP 表查询',
    scan_subnet: `网段扫描 ${String(args.subnet || '')}`,
    web_probe: `Web 探测 ${host}:${port || '80'}`,
    trace_route: host ? `路由追踪 ${host}` : '路由追踪',
    get_network_info: '本机网络信息',
    get_network_snapshot: '一键网络快照',
    check_adapter_health: '网卡状态检查',
    check_gateway: '默认网关连通性',
    check_internet: '外网连通检查',
    get_system_info: '系统与磁盘信息',
    get_system_errors: '系统错误日志',
    check_spooler: '打印服务状态',
    check_drivers: '驱动异常检查',
    query_assets: '查询已登记资产',
    ask_user_check: '请求现场确认',
  };
  return maps[tool] || tool;
}
async function aiAnalyze(body) {
  const prompt = aiPrompt(body);
  const suggestedTools = suggestedToolsForIssue(prompt.issue);
  if (body.provider === '本地运维规则助手') {
    const action = await runAgentDiagnostic(prompt.issue);
    const actionEvidence = action ? `\n\n已执行只读诊断：${action.name}\n${action.output.slice(0, 8000)}` : '';
    const output = `${localOpsAdvice(prompt.issue, prompt.evidence)}${actionEvidence}`;
    return { ok: true, mode: 'local', provider: '本地运维规则助手', action, suggestedTools, opsBrief: prompt.normalConversation ? null : buildOpsBrief(prompt.issue, output, action), output };
  }
  const knowledge = await relevantKnowledge(prompt.issue);
  const assets = await assetsForIssue(prompt.issue); const assetEvidence = assets.length ? `关联资产：\n${assetContext(assets)}` : '';
  if (knowledge || assetEvidence) {
    prompt.evidence = `${knowledge ? `关联知识库：\n${knowledge}\n\n` : ''}${assetEvidence ? `${assetEvidence}\n\n` : ''}用户补充证据：${prompt.evidence}`.slice(0, 18000);
    prompt.messages[1].content = `故障现象：${prompt.issue}\n检测证据：${prompt.evidence}\n请基于知识库和现场证据给出处理建议。`;
  }
  const action = await runAgentDiagnostic(prompt.issue);
  if (action) {
    const actionEvidence = `AI 已自动执行只读诊断：${action.name}\n结果：${action.output.slice(0, 16000)}`;
    prompt.evidence = `${actionEvidence}\n\n用户补充证据：${prompt.evidence}`.slice(0, 18000);
    prompt.messages[1].content = `故障现象：${prompt.issue}\n检测证据：${prompt.evidence}\n请基于已执行的检测结果给出处理建议。`;
    const incidentId = prompt.issue.match(/\[事件\s+(EVT-\d+)\]/)?.[1] || null;
    await recordAudit({ type: 'AI 只读诊断', action: action.name, ok: action.ok, issue: prompt.issue.slice(0, 500), output: action.output.slice(0, 5000), incidentId });
  }
  const providers = aiProviders(); const selected = providers.find((item) => item.name === body.provider) || providers[0];
  if (!selected) { const output = localOpsAdvice(prompt.issue, prompt.evidence); return { ok: true, mode: 'local', provider: '本地运维规则助手', suggestedTools, opsBrief: prompt.normalConversation ? null : buildOpsBrief(prompt.issue, output, action), output }; }
  const fallback = providers.find((item) => item.name === 'DeepSeek' && item.name !== selected.name);
  const candidates = [selected, fallback].filter(Boolean);
  const failures = [];
  for (const provider of candidates) {
    try {
      const output = await callAiProvider(provider, prompt.messages);
      return { ok: true, mode: 'provider', provider: provider.name, fallbackFrom: provider.name === selected.name ? null : selected.name, action, suggestedTools, opsBrief: prompt.normalConversation ? null : buildOpsBrief(prompt.issue, output, action), output };
    } catch (error) { failures.push(`${provider.name}: ${error.message}`); }
  }
  const output = `云端 AI 暂不可用（${failures.join('；')}）。\n\n本地建议：\n${localOpsAdvice(prompt.issue, prompt.evidence)}`;
  return { ok: true, mode: 'local', provider: '本地运维规则助手', fallbackFrom: selected.name, action, suggestedTools, opsBrief: prompt.normalConversation ? null : buildOpsBrief(prompt.issue, output, action), output };
}
function run(command, args, timeout = 6000) {
  return new Promise((resolve) => execFile(command, args, { windowsHide: true, timeout, maxBuffer: 1024 * 1024, encoding: 'buffer' }, (error, stdout, stderr) => {
    const data = stdout?.length ? stdout : stderr;
    const output = data?.length ? new TextDecoder('gbk').decode(data).trim() : (error?.message || 'No output');
    resolve({ ok: !error, output });
  }));
}
async function findExternalTool(tool) {
  const portablePath = tool.executables.map((executable) => join(root, 'external-tools', executable)).find((candidate) => existsSync(candidate));
  if (portablePath) return portablePath;
  const directPath = tool.paths.find((candidate) => existsSync(candidate));
  if (directPath) return directPath;
  for (const executable of tool.executables) {
    const result = await run('where.exe', [executable], 3000);
    if (result.ok && result.output) return result.output.split(/\r?\n/)[0].trim();
  }
  return null;
}
async function externalToolStatus() {
  return Promise.all(externalToolRegistry.map(async (tool) => ({ id: tool.id, name: tool.name, category: tool.category, path: await findExternalTool(tool) })));
}
function localAssetProfile() {
  const adapters = Object.values(networkInterfaces()).flat().filter((item) => item && item.family === 'IPv4' && !item.internal);
  const adapter = adapters[0];
  return { name: hostname(), type: 'Windows 终端', ip: adapter?.address || '-', mac: adapter?.mac || '-', platform: process.platform };
}
function portCheck(host, portNumber) { return new Promise((resolve) => { const socket = net.createConnection({ host, port: portNumber, timeout: 3500 }); const done = (ok, output) => { socket.destroy(); resolve({ ok, output }); }; socket.once('connect', () => done(true, `${host}:${portNumber} is reachable`)); socket.once('timeout', () => done(false, `${host}:${portNumber} timed out`)); socket.once('error', (error) => done(false, `${host}:${portNumber} failed: ${error.code || error.message}`)); }); }
function webProbe(host, portNumber, secure) {
  return new Promise((resolve) => {
    const client = secure ? https : http;
    const request = client.request({ host, port: portNumber, path: '/', method: 'GET', timeout: 4500, rejectUnauthorized: false, headers: { 'User-Agent': 'OpsHub-FieldTool/0.1' } }, (response) => {
      let body = ''; response.setEncoding('utf8'); response.on('data', (chunk) => { if (body.length < 32768) body += chunk; }); response.on('end', () => {
        const title = body.match(/<title[^>]*>([^<]{0,180})<\/title>/i)?.[1]?.trim() || '-';
        const server = response.headers.server || '-';
        resolve({ ok: true, output: `${secure ? 'HTTPS' : 'HTTP'} ${host}:${portNumber}\n状态码：${response.statusCode}\nServer：${server}\n页面标题：${title}` });
      });
    });
    request.once('timeout', () => request.destroy(new Error('timeout')));
    request.once('error', (error) => resolve({ ok: false, output: `${secure ? 'HTTPS' : 'HTTP'} ${host}:${portNumber} 探测失败：${error.code || error.message}` }));
    request.end();
  });
}
function certificateProbe(host) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: 6000 }, () => {
      const certificate = socket.getPeerCertificate(); const validTo = new Date(certificate.valid_to); const days = Number.isNaN(validTo.getTime()) ? null : Math.floor((validTo.getTime() - Date.now()) / 86400000);
      socket.end(); resolve({ ok: days === null || days >= 0, output: `主机：${host}:443\n主题：${certificate.subject?.CN || '-'}\n颁发者：${certificate.issuer?.O || certificate.issuer?.CN || '-'}\n生效：${certificate.valid_from || '-'}\n到期：${certificate.valid_to || '-'}\n剩余天数：${days === null ? '未知' : days}` });
    });
    socket.once('timeout', () => { socket.destroy(); resolve({ ok: false, output: `${host}:443 TLS 连接超时` }); });
    socket.once('error', (error) => resolve({ ok: false, output: `${host}:443 证书检查失败：${error.code || error.message}` }));
  });
}
async function multiPortCheck(host, ports) {
  const results = await Promise.all(ports.map((portNumber) => portCheck(host, portNumber)));
  return { ok: results.some((item) => item.ok), output: results.map((item) => item.output).join('\n') };
}
async function bundleChecks(checks) {
  const results = await Promise.all(checks.map(async ({ name, task }) => ({ name, ...(await task()) })));
  return { ok: results.every((item) => item.ok), output: results.map((item) => `===== ${item.name}：${item.ok ? '正常' : '发现异常'} =====\n${item.output}`).join('\n\n') };
}
function runPowerShell(script, timeout = 10000) {
  return new Promise((resolve) => execFile('powershell.exe', ['-NoProfile', '-Command', `$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); ${script}`], { windowsHide: true, timeout, maxBuffer: 1024 * 1024, encoding: 'buffer' }, (error, stdout, stderr) => {
    const data = stdout?.length ? stdout : stderr;
    const output = data?.length ? new TextDecoder('utf-8').decode(data).trim() : (error?.message || 'No output');
    resolve({ ok: !error, output });
  }));
}
function validSubnet(value) {
  const match = typeof value === 'string' && value.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.0\/24$/);
  if (!match || match.slice(1).some((part) => Number(part) > 255) || [0, 127].includes(Number(match[1])) || Number(match[1]) >= 224) return null;
  return `${match[1]}.${match[2]}.${match[3]}`;
}
function pingOnce(host) {
  return new Promise((resolve) => execFile('ping', ['-n', '1', '-w', '280', host], { windowsHide: true, timeout: 1200 }, (error) => resolve(!error)));
}
async function scanSubnet(prefix) {
  const candidates = Array.from({ length: 254 }, (_, index) => `${prefix}.${index + 1}`);
  const online = [];
  const workers = Array.from({ length: 24 }, async () => {
    while (candidates.length) { const host = candidates.shift(); if (await pingOnce(host)) online.push(host); }
  });
  await Promise.all(workers);
  online.sort((a, b) => a.split('.').at(-1) - b.split('.').at(-1));
  return { ok: true, output: online.length ? `发现 ${online.length} 个在线地址：\n${online.join('\n')}` : '扫描完成，未发现可 Ping 的地址。部分设备可能禁用 ICMP。' };
}
async function handleApi(req, res, pathname) {
  let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 75 * 1024 * 1024) return send(res, 413, { ok: false, output: '请求体超过 75MB 限制。' }); }
  let body = {}; try { body = JSON.parse(raw || '{}'); } catch { body = {}; }
  const auth = await authContext(req);
  if (pathname === '/api/auth/me' && req.method === 'GET') return send(res, 200, authPayload(auth.user, auth.store.users.length === 0));
  if (pathname === '/api/auth/bootstrap' && req.method === 'POST') {
    const store = await readStore();
    if (store.users.length) return send(res, 409, { ok: false, output: '管理员已初始化，请直接登录。' });
    try {
      const username = validateUsername(body.username || 'admin'); const password = validatePassword(body.password); const displayName = String(body.displayName || '系统管理员').trim().slice(0, 40) || '系统管理员';
      const user = { id: `USR-${Date.now()}`, username, displayName, role: 'admin', passwordHash: hashPassword(password), disabled: false, createdAt: new Date().toISOString() };
      store.users.unshift(user); store.audits.unshift({ id: `AUD-${Date.now()}`, createdAt: new Date().toISOString(), type: '权限初始化', action: `创建管理员 ${username}`, ok: true, issue: '首次启动初始化管理员账号。', output: '已启用本地 RBAC 权限分离。' }); store.audits = store.audits.slice(0, 500);
      await writeStore(store); createSession(res, user); return send(res, 201, authPayload(user, false));
    } catch (error) { return send(res, 400, { ok: false, output: error.message }); }
  }
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const store = await readStore();
    if (!store.users.length) return send(res, 409, { ok: false, output: '尚未初始化管理员账号。' });
    const username = String(body.username || '').trim().toLowerCase(); const user = store.users.find((item) => item.username === username && !item.disabled);
    if (!user || !verifyPassword(body.password, user.passwordHash)) return send(res, 401, { ok: false, output: '账号或密码错误。' });
    user.lastLoginAt = new Date().toISOString(); await writeStore(store); createSession(res, user); return send(res, 200, authPayload(user, false));
  }
  if (pathname === '/api/auth/logout' && req.method === 'POST') { if (auth.token) sessionStore.delete(auth.token); clearSessionCookie(res); return send(res, 200, { ok: true, output: '已退出登录。' }); }

  const permission = requiredPermission(pathname, req.method);
  if (permission && auth.store.users.length === 0) return send(res, 401, { ok: false, bootstrapRequired: true, output: '请先初始化管理员账号。' });
  if (permission && !auth.user) return send(res, 401, { ok: false, output: '请先登录。' });
  if (permission && !hasPermission(auth.user, permission)) return deny(res);

  if (pathname === '/api/auth/users' && req.method === 'GET') { const store = await readStore(); return send(res, 200, store.users.map(safeUser)); }
  if (pathname === '/api/auth/users' && req.method === 'POST') {
    const store = await readStore();
    try {
      const username = validateUsername(body.username); if (store.users.some((item) => item.username === username)) return send(res, 409, { ok: false, output: '账号已存在。' });
      const password = validatePassword(body.password); const role = validateRole(body.role); const displayName = String(body.displayName || username).trim().slice(0, 40) || username;
      const user = { id: `USR-${Date.now()}`, username, displayName, role, passwordHash: hashPassword(password), disabled: false, createdAt: new Date().toISOString() };
      store.users.unshift(user); await writeStore(store); await recordAudit({ type: '权限管理', action: `创建账号 ${username}（${roleProfiles[role].label}）`, ok: true, issue: `操作人：${auth.user.username}`, output: '账号已创建，密码未写入审计。' });
      return send(res, 201, safeUser(user));
    } catch (error) { return send(res, 400, { ok: false, output: error.message }); }
  }
  if (pathname.startsWith('/api/auth/users/') && req.method === 'PATCH') {
    const userId = decodeURIComponent(pathname.slice('/api/auth/users/'.length)); const store = await readStore(); const user = store.users.find((item) => item.id === userId);
    if (!user) return send(res, 404, { ok: false, output: '未找到账号。' });
    try {
      if (Object.hasOwn(body, 'displayName')) user.displayName = String(body.displayName || user.username).trim().slice(0, 40) || user.username;
      if (Object.hasOwn(body, 'role')) user.role = validateRole(body.role);
      if (Object.hasOwn(body, 'password') && String(body.password || '').trim()) user.passwordHash = hashPassword(validatePassword(body.password));
      if (Object.hasOwn(body, 'disabled')) {
        const disabled = Boolean(body.disabled);
        if (disabled && user.id === auth.user.id) return send(res, 400, { ok: false, output: '不能停用当前登录账号。' });
        user.disabled = disabled;
      }
      const activeAdmins = store.users.filter((item) => item.role === 'admin' && !item.disabled).length;
      if (activeAdmins < 1) return send(res, 400, { ok: false, output: '至少保留一个启用状态的管理员。' });
      user.updatedAt = new Date().toISOString(); await writeStore(store); await recordAudit({ type: '权限管理', action: `更新账号 ${user.username}`, ok: true, issue: `操作人：${auth.user.username}`, output: `角色：${user.role}；状态：${user.disabled ? '停用' : '启用'}` });
      return send(res, 200, safeUser(user));
    } catch (error) { return send(res, 400, { ok: false, output: error.message }); }
  }
  if (pathname === '/api/health' && req.method === 'GET') {
    const store = await readStore(); const tools = await externalToolStatus(); const snmpPath = await findExternalTool({ executables: ['snmpwalk.exe', 'snmpwalk'], paths: ['C:/usr/bin/snmpwalk.exe', 'C:/Program Files/Net-SNMP/bin/snmpwalk.exe'] }); const providers = aiProviders().map((item) => item.name);
    return send(res, 200, { ok: true, checkedAt: new Date().toISOString(), service: { status: '正常', address: `http://127.0.0.1:${port}` }, data: { status: existsSync(dataDir) ? '正常' : '首次运行待创建', assets: store.assets.length, tickets: store.tickets.length, incidents: store.incidents.length, worklogs: store.worklogs.length, knowledge: store.knowledge.length + builtInKnowledge.length, evidence: store.evidence.length }, ai: { status: providers.length ? '已配置' : '仅本地规则', providers }, ocr: { status: existsSync(join(chiSimLanguage.langPath, 'chi_sim.traineddata.gz')) ? '离线中文可用' : '语言包缺失' }, agent: { status: existsSync(join(root, 'agent', '门店现场采集代理.ps1')) ? '可下载' : '脚本缺失' }, snmp: { status: snmpPath ? '可用' : '未安装 Net-SNMP' }, externalTools: tools.map((item) => ({ name: item.name, available: Boolean(item.path) })) });
  }
  if (pathname === '/api/ai/providers' && req.method === 'GET') return send(res, 200, [{ name: '本地运维规则助手', mode: 'local' }, ...aiProviders().map((item) => ({ name: item.name, mode: 'provider' }))]);
  if (pathname === '/api/ai/test' && req.method === 'POST') {
    const provider = aiProviders().find((item) => item.name === String(body.provider || '')) || aiProviders()[0];
    if (!provider) return send(res, 503, { ok: false, output: '未配置云端 AI Provider；可继续使用本地规则助手。' });
    try { const output = await callAiProvider(provider, [{ role: 'system', content: '你是中文 IT 运维助手，只需简短确认连接成功。' }, { role: 'user', content: '请用一句中文确认你已就绪，可以协助门店、网络、监控和桌面运维。' }]); await recordAudit({ type: 'AI 连通性测试', action: `测试 ${provider.name} 回包`, ok: true, issue: '用户在系统自检中发起最小化 AI 连通性测试。', output: output.slice(0, 1000) }); return send(res, 200, { ok: true, provider: provider.name, output }); }
    catch (error) { await recordAudit({ type: 'AI 连通性测试', action: `测试 ${provider.name} 回包`, ok: false, issue: '用户在系统自检中发起最小化 AI 连通性测试。', output: String(error.message).slice(0, 1000) }); return send(res, 502, { ok: false, output: `${provider.name} 暂不可用：${error.message}` }); }
  }
  if (pathname === '/api/ai/analyze' && req.method === 'POST') return send(res, 200, await aiAnalyze(body));
  if (pathname === '/api/ai/agent' && req.method === 'POST') {
    const prompt = aiPrompt(body);
    if (body.provider === '本地运维规则助手') {
      const action = await runAgentDiagnostic(prompt.issue);
      const output = `${localOpsAdvice(prompt.issue, prompt.evidence)}\n\n已自动执行：${action?.name || '无'}\n${action?.output?.slice(0, 8000) || ''}`;
      return send(res, 200, { ok: true, mode: 'local', provider: '本地运维规则助手', toolTrace: [{ type: 'think', content: '本地规则引擎执行排查...' }], finalOutput: output, turns: 1, status: 'complete' });
    }
    const knowledge = await relevantKnowledge(prompt.issue);
    const assets = await assetsForIssue(prompt.issue); const assetEvidence = assets.length ? `关联资产：\n${assetContext(assets)}` : '';
    const enrichedEvidence = [knowledge ? `关联知识库：\n${knowledge}` : '', assetEvidence, body.evidence || ''].filter(Boolean).join('\n\n').slice(0, 16000);
    const providers = aiProviders(); const selected = providers.find((item) => item.name === body.provider) || providers[0];
    if (!selected) {
      const action = await runAgentDiagnostic(prompt.issue);
      const output = `${localOpsAdvice(prompt.issue, prompt.evidence)}\n\n已自动执行：${action?.name || '无'}\n${action?.output?.slice(0, 8000) || ''}`;
      return send(res, 200, { ok: true, mode: 'local', provider: '本地运维规则助手', toolTrace: [{ type: 'think', content: '无可用云端 AI，使用本地规则引擎。' }], finalOutput: output, turns: 1, status: 'complete' });
    }
    const fallback = providers.find((item) => item.name === 'DeepSeek' && item.name !== selected.name);
    const candidates = [selected, fallback].filter(Boolean);
    let lastError = '';
    for (const candidate of candidates) {
      try {
        const result = await runAgentLoop(candidate, prompt.issue, enrichedEvidence);
        await recordAudit({ type: 'AI Agent 诊断', action: `Agent 模式 ${result.turns} 轮`, ok: true, issue: prompt.issue.slice(0, 500), output: String(result.finalOutput || result.toolTrace?.map((t) => t.displayName).filter(Boolean).join(' → ') || '').slice(0, 5000), incidentId: prompt.issue.match(/\[事件\s+(EVT-\d+)\]/)?.[1] || null });
        return send(res, 200, { ...result, fallbackFrom: candidate.name === selected.name ? null : selected.name });
      } catch (error) { lastError = error.message; }
    }
    const action = await runAgentDiagnostic(prompt.issue);
    const output = `云端 AI Agent 暂不可用（${lastError}）。\n\n本地建议：\n${localOpsAdvice(prompt.issue, prompt.evidence)}\n\n已自动执行：${action?.name || '无'}\n${action?.output?.slice(0, 8000) || ''}`;
    return send(res, 200, { ok: true, mode: 'local', provider: '本地运维规则助手', toolTrace: [{ type: 'think', content: '云端 AI 不可用，已切换本地规则引擎。' }], finalOutput: output, turns: 1, status: 'complete' });
  }
  if (pathname === '/api/audits' && req.method === 'GET') { const store = await readStore(); return send(res, 200, store.audits); }
  if (pathname === '/api/ocr/image' && req.method === 'POST') {
    const mime = String(body.mime || '').toLowerCase(); const extension = mime === 'image/png' ? '.png' : mime === 'image/jpeg' ? '.jpg' : mime === 'image/webp' ? '.webp' : '';
    if (!extension) return send(res, 400, { ok: false, output: 'OCR 仅支持 PNG、JPG 和 WEBP 图片。' });
    const encoded = String(body.data || '').replace(/^data:[^;]+;base64,/, '').trim(); if (!encoded || encoded.length > 11 * 1024 * 1024) return send(res, 400, { ok: false, output: 'OCR 图片为空或超过 8MB 限制。' });
    const image = Buffer.from(encoded, 'base64'); if (!image.length || image.length > 8 * 1024 * 1024 || !evidenceLooksValid(image, extension)) return send(res, 400, { ok: false, output: 'OCR 图片内容无效或文件类型不匹配。' });
    try { const result = await recognizeImage(image); await recordAudit({ type: '本地图片 OCR', action: `识别图片 ${String(body.filename || '未命名图片').slice(0, 120)}`, ok: Boolean(result.text), issue: '用户在知识库中发起本地离线 OCR；原图未保存。', output: `识别字符数：${result.text.length}\n平均置信度：${result.confidence.toFixed(1)}` }); return send(res, 200, { ok: Boolean(result.text), ...result, output: result.text || '未从图片中识别到有效文字。' }); }
    catch (error) { return send(res, 500, { ok: false, output: `本地 OCR 失败：${error.message}` }); }
  }
  if (pathname === '/api/evidence' && req.method === 'GET') { const store = await readStore(); return send(res, 200, store.evidence.slice(0, 100)); }
  if (pathname === '/api/evidence' && req.method === 'POST') {
    const originalName = basename(String(body.filename || '附件')).replace(/[^\w.\-()\u4e00-\u9fff]/g, '_').slice(0, 120); const extension = extname(originalName).toLowerCase();
    if (!Object.hasOwn(evidenceMimeTypes, extension)) return send(res, 400, { ok: false, output: '附件仅支持 PNG、JPG、WEBP、PDF、TXT、LOG、CSV、JSON。' });
    const encoded = String(body.data || '').replace(/^data:[^;]+;base64,/, '').trim();
    if (!encoded || encoded.length > 7 * 1024 * 1024) return send(res, 400, { ok: false, output: '附件为空或超过 5 MB 限制。' });
    const data = Buffer.from(encoded, 'base64'); if (!data.length || data.length > 5 * 1024 * 1024 || !evidenceLooksValid(data, extension)) return send(res, 400, { ok: false, output: '附件内容无效，或与文件类型不匹配。' });
    const store = await readStore(); const id = `EVD-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; const storedName = `${id}${extension}`;
    await mkdir(evidenceDir, { recursive: true }); await writeFile(join(evidenceDir, storedName), data);
    const evidence = { id, filename: originalName, storedName, mime: evidenceMimeTypes[extension], size: data.length, createdAt: new Date().toISOString() }; store.evidence.unshift(evidence); store.evidence = store.evidence.slice(0, 500); await writeStore(store);
    await recordAudit({ type: '现场证据上传', action: `上传附件 ${originalName}`, ok: true, issue: '用户在现场处置单中上传本地证据文件。', output: `文件类型：${extension}\n大小：${data.length} bytes\n证据编号：${id}` });
    return send(res, 201, evidence);
  }
  if (pathname.startsWith('/api/evidence/') && req.method === 'GET') {
    const evidenceId = decodeURIComponent(pathname.slice('/api/evidence/'.length)); const store = await readStore(); const evidence = store.evidence.find((item) => item.id === evidenceId);
    if (!evidence || !/^[A-Za-z0-9._-]+$/.test(evidence.storedName || '')) return send(res, 404, { ok: false, output: '未找到证据附件。' });
    try { return send(res, 200, await readFile(join(evidenceDir, evidence.storedName)), evidence.mime || 'application/octet-stream'); } catch { return send(res, 404, { ok: false, output: '证据文件已不存在。' }); }
  }
  if (pathname === '/api/agent-reports/import' && req.method === 'POST') {
    try {
      const report = normalizeAgentReport(body.report); const site = String(body.site || '').trim().slice(0, 80); if (!site) return send(res, 400, { ok: false, output: '导入采集包时必须指定门店或位置。' });
      const store = await readStore(); let asset = store.assets.find((item) => item.site === site && (String(item.name).toLowerCase() === report.name.toLowerCase() || (report.ip !== '-' && item.ip === report.ip))); const created = !asset;
      if (!asset) { asset = { id: `AST-${Date.now()}`, name: report.name, type: 'Windows 终端', site, ip: report.ip, status: '在线', model: report.model, serialNumber: null, macAddress: report.macAddress, physicalLocation: null, notes: null, upstreamAssetId: null, switchPort: null, vlan: null, createdAt: new Date().toISOString() }; store.assets.unshift(asset); }
      else { if ((!asset.ip || asset.ip === '-') && report.ip !== '-') asset.ip = report.ip; if (!asset.model && report.model) asset.model = report.model; if (!asset.macAddress && report.macAddress) asset.macAddress = report.macAddress; if (!['维修中', '已报废'].includes(asset.status)) asset.status = '在线'; }
      asset.lastCollectedAt = report.collectedAt; asset.agentSummary = { operatingSystem: report.operatingSystem, osVersion: report.osVersion, printerStatus: report.printerStatus, disks: report.disks }; asset.updatedAt = new Date().toISOString();
      const output = `${created ? '新建' : '更新'}资产：${asset.name}\n门店：${site}\nIP：${asset.ip}\nMAC：${asset.macAddress || '-'}\n系统：${report.operatingSystem || '-'}\n采集时间：${report.collectedAt}`;
      store.audits.unshift({ id: `AUD-${Date.now()}`, createdAt: new Date().toISOString(), type: '门店 Agent 采集', action: `${created ? '登记' : '更新'} ${asset.name}`, ok: true, issue: '用户确认导入一次性只读门店采集包。', output }); store.audits = store.audits.slice(0, 500); await writeStore(store);
      return send(res, 200, { ok: true, created, asset, output: `采集包导入完成：已${created ? '登记' : '更新'}资产 ${asset.name}。` });
    } catch (error) { return send(res, 400, { ok: false, output: error.message }); }
  }
  if (pathname === '/api/knowledge' && req.method === 'GET') { const store = await readStore(); return send(res, 200, [...store.knowledge, ...builtInKnowledge]); }
  if (pathname === '/api/knowledge/sources' && req.method === 'GET') return send(res, 200, officialKnowledgeSources);
  if (pathname === '/api/knowledge' && req.method === 'POST') {
    const title = String(body.title || '').trim(); const category = String(body.category || '').trim(); const content = String(body.content || '').trim(); const keywords = Array.isArray(body.keywords) ? body.keywords.map((item) => String(item).trim()).filter(Boolean).slice(0, 12) : [];
    if (!title || !category || !content) return send(res, 400, { ok: false, output: '知识标题、分类和内容不能为空。' });
    const store = await readStore(); const document = { id: `KB-${Date.now()}`, title: title.slice(0, 120), category: category.slice(0, 40), content: content.slice(0, 12000), keywords, source: String(body.source || '内部经验').slice(0, 40), sourceUrl: String(body.sourceUrl || '').slice(0, 500), reviewStatus: String(body.reviewStatus || '已验证').slice(0, 40), createdAt: new Date().toISOString() }; store.knowledge.unshift(document); await writeStore(store); return send(res, 201, document);
  }
  if (pathname.startsWith('/api/knowledge/') && pathname.endsWith('/review') && req.method === 'PATCH') {
    const documentId = decodeURIComponent(pathname.slice('/api/knowledge/'.length, -'/review'.length)); const reviewStatus = String(body.reviewStatus || '').trim();
    if (!['待验证', '已验证', '已淘汰'].includes(reviewStatus)) return send(res, 400, { ok: false, output: '无效的知识审核状态。' });
    const store = await readStore(); const document = store.knowledge.find((item) => item.id === documentId);
    if (!document) return send(res, 404, { ok: false, output: '只能审核已录入的知识，内置 SOP 不可修改。' });
    document.reviewStatus = reviewStatus; document.reviewedAt = new Date().toISOString(); await writeStore(store); return send(res, 200, document);
  }
  if (pathname === '/api/knowledge/import-official' && req.method === 'POST') {
    try { const document = await importOfficialKnowledge(body); const store = await readStore(); document.id = `KB-${Date.now()}`; store.knowledge.unshift(document); await writeStore(store); return send(res, 201, document); }
    catch (error) { return send(res, 400, { ok: false, output: error.message }); }
  }
  if (pathname === '/api/knowledge/import-pdf' && req.method === 'POST') {
    try { const document = await importPdfKnowledge(body); const store = await readStore(); document.id = `KB-${Date.now()}`; store.knowledge.unshift(document); await writeStore(store); return send(res, 201, document); }
    catch (error) { return send(res, 400, { ok: false, output: error.message }); }
  }
  if (pathname === '/api/search' && req.method === 'GET') {
    const query = new URL(req.url, 'http://127.0.0.1').searchParams.get('q')?.trim().toLowerCase() || '';
    if (query.length < 2) return send(res, 400, { ok: false, output: '搜索词至少需要 2 个字符。' });
    const store = await readStore(); const candidates = [
      ...store.assets.map((item) => ({ type: '资产', page: 'assets', title: item.name, meta: `${item.site} · ${item.type} · ${item.model || item.ip}`, search: `${item.name} ${item.site} ${item.type} ${item.ip} ${item.model || ''} ${item.serialNumber || ''} ${item.macAddress || ''} ${item.physicalLocation || ''}` })),
      ...store.tickets.map((item) => ({ type: '工单', page: 'tickets', title: item.title, meta: `${item.id} · ${item.site} · ${item.assetName || item.status}`, search: `${item.title} ${item.id} ${item.site} ${item.status} ${item.assetName || ''}` })),
      ...store.incidents.map((item) => ({ type: '事件', page: 'dashboard', title: item.title, meta: `${item.id} · ${item.site} · ${item.status}`, search: `${item.title} ${item.id} ${item.site} ${item.status}` })),
      ...store.worklogs.map((item) => ({ type: '处置单', page: 'worklog', title: item.title, meta: `${item.id} · ${item.site}`, search: `${item.title} ${item.id} ${item.site} ${item.result} ${item.notes}` })),
      ...[...store.knowledge, ...builtInKnowledge].map((item) => ({ type: '知识', page: 'knowledge', title: item.title, meta: `${item.category} · ${item.source || '内置 SOP'}`, search: `${item.title} ${item.category} ${item.content} ${(item.keywords || []).join(' ')}` })),
    ];
    return send(res, 200, candidates.filter((item) => item.search.toLowerCase().includes(query)).slice(0, 30).map(({ search, ...item }) => item));
  }
  if (pathname === '/api/backup/export' && req.method === 'GET') {
    try { const store = await readStore(); return send(res, 200, await buildPortableBackup(store)); } catch (error) { return send(res, 413, { ok: false, output: error.message }); }
  }
  if (pathname === '/api/backup/import' && req.method === 'POST') {
    if (!['OpsHubBackup/1', 'OpsHubBackup/2'].includes(body?.format) || !body?.data || typeof body.data !== 'object') return send(res, 400, { ok: false, output: '备份格式无效。' });
    const store = await readStore(); const data = body.data;
    store.assets = mergeBackupItems(store.assets, data.assets); store.tickets = mergeBackupItems(store.tickets, data.tickets); store.worklogs = mergeBackupItems(store.worklogs, data.worklogs); store.incidents = mergeBackupItems(store.incidents, data.incidents); store.knowledge = mergeBackupItems(store.knowledge, data.knowledge); store.audits = mergeBackupItems(store.audits, data.audits, 500); store.evidence = mergeBackupItems(store.evidence, data.evidence, 500);
    try { const restoredEvidence = await restoreBackupEvidence(store, body); await writeStore(store); return send(res, 200, { ok: true, output: `备份已合并到本机数据，原有记录未覆盖；恢复证据附件 ${restoredEvidence} 个。`, counts: { assets: store.assets.length, tickets: store.tickets.length, worklogs: store.worklogs.length, incidents: store.incidents.length, knowledge: store.knowledge.length, audits: store.audits.length, evidence: store.evidence.length } }); }
    catch (error) { return send(res, 400, { ok: false, output: `备份证据恢复失败：${error.message}` }); }
  }
  if (pathname === '/api/monitoring/check' && req.method === 'POST') {
    const store = await readStore(); const assets = store.assets.filter((asset) => validHost(String(asset.ip || '').trim()) && asset.ip !== '-').slice(0, 30);
    if (!assets.length) return send(res, 400, { ok: false, output: '暂无带有效 IP 地址的已登记资产可巡检。' });
    const results = await Promise.all(assets.map(async (asset) => {
      const online = await pingOnce(asset.ip); const type = String(asset.type || '').toLowerCase(); let service = null;
      if (online && /打印|printer/.test(type)) service = await multiPortCheck(asset.ip, [9100, 515, 631]);
      if (online && /摄像|监控|nvr|camera/.test(type)) service = await multiPortCheck(asset.ip, [80, 443, 554, 8000, 37777]);
      return { id: asset.id, name: asset.name, type: asset.type, site: asset.site, ip: asset.ip, online, serviceOk: service?.ok ?? null, serviceOutput: service?.output || '' };
    }));
    const online = results.filter((item) => item.online).length; const serviceIssues = results.filter((item) => item.online && item.serviceOk === false).length; const healthy = results.filter((item) => item.online && item.serviceOk !== false).length;
    const output = results.map((item) => `${!item.online ? '离线' : item.serviceOk === false ? '服务异常' : '正常'} | ${item.site} | ${item.name} | ${item.type} | ${item.ip}${item.serviceOutput ? `\n${item.serviceOutput}` : ''}`).join('\n\n');
    await recordAudit({ type: '手动资产巡检', action: `巡检 ${results.length} 台资产`, ok: healthy === results.length, issue: '用户在监控告警页发起手动巡检。', output });
    return send(res, 200, { ok: healthy === results.length, checkedAt: new Date().toISOString(), online, offline: results.length - online, serviceIssues, healthy, results, output });
  }
  if (pathname === '/api/monitoring/sync-status' && req.method === 'POST') {
    const onlineIds = new Set(Array.isArray(body.onlineIds) ? body.onlineIds.map((item) => String(item)).slice(0, 30) : []);
    const offlineIds = new Set(Array.isArray(body.offlineIds) ? body.offlineIds.map((item) => String(item)).slice(0, 30) : []);
    [...onlineIds].forEach((id) => offlineIds.delete(id));
    if (!onlineIds.size && !offlineIds.size) return send(res, 400, { ok: false, output: '没有可同步的巡检结果。' });
    const store = await readStore(); const now = new Date().toISOString(); const changed = []; const skipped = [];
    store.assets.forEach((asset) => {
      const nextStatus = onlineIds.has(asset.id) ? '在线' : offlineIds.has(asset.id) ? '离线' : null;
      if (!nextStatus) return;
      if (['维修中', '已报废'].includes(asset.status)) { skipped.push(asset.name); return; }
      if (asset.status !== nextStatus) { changed.push(`${asset.name}: ${asset.status || '已登记'} -> ${nextStatus}`); asset.status = nextStatus; asset.updatedAt = now; }
    });
    store.audits.unshift({ id: `AUD-${Date.now()}`, createdAt: now, type: '巡检状态同步', action: `同步 ${onlineIds.size + offlineIds.size} 台巡检资产`, ok: true, issue: '用户确认将本次手动巡检结果写入资产台账。', output: `已更新 ${changed.length} 台\n${changed.join('\n') || '资产状态无需变更。'}${skipped.length ? `\n已跳过（维修中/已报废）：${skipped.join('、')}` : ''}` });
    store.audits = store.audits.slice(0, 500); await writeStore(store);
    return send(res, 200, { ok: true, changed, skipped, output: `资产状态同步完成：更新 ${changed.length} 台，跳过 ${skipped.length} 台。` });
  }
  if (pathname === '/api/network/snmp/status' && req.method === 'GET') {
    const path = await findExternalTool({ executables: ['snmpwalk.exe', 'snmpwalk'], paths: ['C:/usr/bin/snmpwalk.exe', 'C:/Program Files/Net-SNMP/bin/snmpwalk.exe'] });
    return send(res, 200, { ok: Boolean(path), available: Boolean(path), output: path ? '已检测到 Net-SNMP snmpwalk。' : '未检测到 Net-SNMP snmpwalk；安装后可做只读 LLDP/CDP 邻居发现。' });
  }
  if (pathname === '/api/network/snmp/neighbors' && req.method === 'POST') {
    const host = String(body.host || '').trim(); const community = String(body.community || 'public');
    if (!validHost(host)) return send(res, 400, { ok: false, output: '目标 IP 或主机名无效。' });
    if (!community || community.length > 128 || /[\r\n\0]/.test(community)) return send(res, 400, { ok: false, output: 'SNMP 团体字串无效。' });
    const path = await findExternalTool({ executables: ['snmpwalk.exe', 'snmpwalk'], paths: ['C:/usr/bin/snmpwalk.exe', 'C:/Program Files/Net-SNMP/bin/snmpwalk.exe'] });
    if (!path) return send(res, 503, { ok: false, output: '未检测到 Net-SNMP snmpwalk。请安装 Net-SNMP 后重试；本功能只读取 LLDP/CDP 邻居信息，不写设备配置。' });
    const queries = [
      ['LLDP 邻居名称', '1.0.8802.1.1.2.1.4.1.1.9'], ['LLDP 邻居端口', '1.0.8802.1.1.2.1.4.1.1.7'],
      ['CDP 邻居名称', '1.3.6.1.4.1.9.9.23.1.2.1.1.6'], ['CDP 邻居端口', '1.3.6.1.4.1.9.9.23.1.2.1.1.7'],
    ];
    const results = await Promise.all(queries.map(async ([label, oid]) => ({ label, ...(await run(path, ['-v2c', '-c', community, '-On', '-Oq', '-t', '2', '-r', '1', host, oid], 10000)) })));
    const successful = results.filter((item) => item.ok && !/No Such Object|No Such Instance|Timeout/i.test(item.output)).length;
    const output = results.map((item) => `===== ${item.label} ${item.ok ? '' : '（未读取到）'} =====\n${item.output}`).join('\n\n');
    await recordAudit({ type: 'SNMP 邻居发现', action: `只读读取 ${host} 的 LLDP/CDP 邻居`, ok: successful > 0, issue: '用户在网络拓扑页手动发起只读 SNMP 发现；团体字串不会保存。', output: `目标：${host}\n读取到 ${successful}/${results.length} 组邻居信息。` });
    return send(res, 200, { ok: successful > 0, host, successful, output });
  }
  if (pathname === '/api/monitoring/incidents' && req.method === 'POST') {
    const assetIds = Array.isArray(body.assetIds) ? [...new Set(body.assetIds.map((item) => String(item)))].slice(0, 30) : [];
    if (!assetIds.length) return send(res, 400, { ok: false, output: '未提供异常资产。' });
    const store = await readStore(); const created = []; const existing = [];
    for (const assetId of assetIds) {
      const asset = store.assets.find((item) => item.id === assetId); if (!asset) continue;
      const active = store.incidents.find((item) => item.assetId === asset.id && !['已解决', '已关闭'].includes(item.status));
      if (active) { existing.push(active); continue; }
      const now = new Date().toISOString(); const incident = { id: `EVT-${Date.now()}-${created.length + 1}`, title: `资产巡检异常：${asset.name}`, site: asset.site, priority: '警告', status: '调查中', assetId: asset.id, createdAt: now, updatedAt: now };
      store.incidents.unshift(incident); created.push(incident);
    }
    if (created.length) await writeStore(store);
    return send(res, 201, { ok: true, created, existing });
  }
  if (pathname === '/api/incidents' && req.method === 'GET') { const store = await readStore(); return send(res, 200, store.incidents); }
  if (pathname === '/api/incidents' && req.method === 'POST') {
    const title = String(body.title || '').trim(); const site = String(body.site || '').trim(); const priority = String(body.priority || '普通').trim();
    if (!title || !site) return send(res, 400, { ok: false, output: '事件标题和门店/位置不能为空。' });
    if (!['普通', '警告', '紧急'].includes(priority)) return send(res, 400, { ok: false, output: '无效的事件优先级。' });
    const store = await readStore(); const now = new Date().toISOString(); const incident = { id: `EVT-${Date.now()}`, title: title.slice(0, 160), site: site.slice(0, 80), priority, status: '调查中', createdAt: now, updatedAt: now };
    store.incidents.unshift(incident); await writeStore(store); return send(res, 201, incident);
  }
  if (pathname.match(/^\/api\/incidents\/[^/]+\/report$/) && req.method === 'POST') {
    const incidentId = decodeURIComponent(pathname.slice('/api/incidents/'.length, -'/report'.length)); const store = await readStore(); const incident = store.incidents.find((item) => item.id === incidentId);
    if (!incident) return send(res, 404, { ok: false, output: '未找到事件。' });
    incident.reportExportedAt = new Date().toISOString(); incident.updatedAt = incident.reportExportedAt; await writeStore(store); return send(res, 200, incident);
  }
  if (pathname.match(/^\/api\/incidents\/[^/]+\/ticket$/) && req.method === 'POST') {
    const incidentId = decodeURIComponent(pathname.slice('/api/incidents/'.length, -'/ticket'.length)); const store = await readStore(); const incident = store.incidents.find((item) => item.id === incidentId);
    if (!incident) return send(res, 404, { ok: false, output: '未找到事件。' });
    const existing = incident.ticketId && store.tickets.find((item) => item.id === incident.ticketId);
    if (existing) return send(res, 200, { ...existing, existing: true });
    const ticket = { id: `INC-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${String(store.tickets.length + 1).padStart(3, '0')}`, title: incident.title, site: incident.site, priority: incident.priority, status: '处理中', incidentId, createdAt: new Date().toISOString() };
    store.tickets.unshift(ticket); incident.ticketId = ticket.id; incident.updatedAt = ticket.createdAt; if (incident.status === '调查中') incident.status = '处理中'; await writeStore(store); return send(res, 201, ticket);
  }
  if (pathname.match(/^\/api\/incidents\/[^/]+\/timeline$/) && req.method === 'GET') {
    const incidentId = decodeURIComponent(pathname.slice('/api/incidents/'.length, -'/timeline'.length)); const store = await readStore(); const incident = store.incidents.find((item) => item.id === incidentId);
    if (!incident) return send(res, 404, { ok: false, output: '未找到事件。' });
    const entries = [{ time: incident.createdAt, type: '事件创建', title: incident.title, detail: `${incident.site} · ${incident.priority}` }];
    store.audits.filter((item) => item.incidentId === incident.id).forEach((item) => entries.push({ time: item.createdAt, type: item.type, title: item.action, detail: item.ok ? '执行完成' : '执行异常' }));
    if (incident.ticketId) { const ticket = store.tickets.find((item) => item.id === incident.ticketId); if (ticket) entries.push({ time: ticket.createdAt, type: '关联工单', title: ticket.id, detail: `${ticket.status} · ${ticket.title}` }); }
    if (incident.worklogId) { const worklog = store.worklogs.find((item) => item.id === incident.worklogId); if (worklog) entries.push({ time: worklog.createdAt, type: '现场处置单', title: worklog.id, detail: worklog.result.slice(0, 300) }); }
    if (incident.reportExportedAt) entries.push({ time: incident.reportExportedAt, type: '现场报告', title: 'HTML 报告已导出', detail: '报告已回写到事件' });
    entries.push({ time: incident.updatedAt, type: '当前状态', title: incident.status, detail: incident.lastAction || '-' });
    return send(res, 200, { incident, entries: entries.filter((item) => item.time).sort((a, b) => new Date(a.time) - new Date(b.time)) });
  }
  if (pathname.startsWith('/api/incidents/') && req.method === 'PATCH') {
    const status = String(body.status || '').trim(); const allowedStatuses = ['调查中', '处理中', '待验证', '已解决', '已关闭'];
    if (!allowedStatuses.includes(status)) return send(res, 400, { ok: false, output: '无效的事件状态。' });
    const incidentId = decodeURIComponent(pathname.slice('/api/incidents/'.length)); const store = await readStore(); const incident = store.incidents.find((item) => item.id === incidentId);
    if (!incident) return send(res, 404, { ok: false, output: '未找到事件。' });
    incident.status = status; incident.updatedAt = new Date().toISOString(); await writeStore(store); return send(res, 200, incident);
  }
  if (pathname === '/api/tools/external' && req.method === 'GET') return send(res, 200, await externalToolStatus());
  if (pathname === '/api/tools/external/launch' && req.method === 'POST') {
    const tool = externalToolRegistry.find((item) => item.id === body.id); if (!tool) return send(res, 404, { ok: false, output: '工具不存在。' });
    const path = await findExternalTool(tool); if (!path) return send(res, 404, { ok: false, output: `${tool.name} 未安装或未加入 PATH。` });
    const child = spawn(path, [], { detached: true, stdio: 'ignore', windowsHide: false }); child.unref(); return send(res, 200, { ok: true, output: `已启动 ${tool.name}` });
  }
  if (pathname === '/api/worklogs' && req.method === 'GET') { const store = await readStore(); return send(res, 200, store.worklogs); }
  if (pathname === '/api/worklogs' && req.method === 'POST') {
    if (!body.site?.trim() || !body.title?.trim() || !body.result?.trim()) return send(res, 400, { ok: false, output: '门店/位置、故障标题和处理结果不能为空。' });
    const store = await readStore(); const assetId = String(body.assetId || '').trim(); const ticketId = String(body.ticketId || '').trim(); const requestedIncidentId = String(body.incidentId || '').trim();
    const asset = assetId ? store.assets.find((item) => item.id === assetId) : null; const ticket = ticketId ? store.tickets.find((item) => item.id === ticketId) : null;
    if (assetId && !asset) return send(res, 400, { ok: false, output: '关联资产不存在。' });
    if (ticketId && !ticket) return send(res, 400, { ok: false, output: '关联工单不存在。' });
    const legacyIncidentId = String(body.notes || '').match(/\[关联事件\s+(EVT-\d+)\]/)?.[1] || '';
    const incidentId = requestedIncidentId || legacyIncidentId; const incident = incidentId ? store.incidents.find((item) => item.id === incidentId) : null;
    if (incidentId && !incident) return send(res, 400, { ok: false, output: '关联事件不存在。' });
    const evidenceIds = Array.isArray(body.evidenceIds) ? [...new Set(body.evidenceIds.map((item) => String(item)).filter(Boolean))].slice(0, 10) : [];
    if (evidenceIds.some((id) => !store.evidence.some((item) => item.id === id))) return send(res, 400, { ok: false, output: '关联证据附件不存在。' });
    const worklog = { id: `LOG-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${String(store.worklogs.length + 1).padStart(3, '0')}`, site: body.site.trim().slice(0, 80), contact: body.contact?.trim().slice(0, 80) || '-', title: body.title.trim().slice(0, 160), result: body.result.trim().slice(0, 2000), notes: body.notes?.trim().slice(0, 4000) || '', toolCount: Number(body.toolCount || 0), assetId: assetId || null, assetName: asset?.name || null, ticketId: ticketId || null, incidentId: incidentId || null, evidenceIds, createdAt: new Date().toISOString() };
    store.worklogs.unshift(worklog);
    if (incident) { incident.worklogId = worklog.id; incident.updatedAt = worklog.createdAt; if (!['已解决', '已关闭'].includes(incident.status)) incident.status = '待验证'; }
    if (ticket) { ticket.worklogId = worklog.id; ticket.updatedAt = worklog.createdAt; if (!['已解决', '已关闭'].includes(ticket.status)) ticket.status = '待验证'; }
    await writeStore(store); return send(res, 201, worklog);
  }
  if (pathname === '/api/assets' && req.method === 'GET') { const store = await readStore(); return send(res, 200, store.assets); }
  if (pathname === '/api/assets/local-profile' && req.method === 'GET') return send(res, 200, localAssetProfile());
  if (pathname === '/api/assets' && req.method === 'POST') {
    if (!body.name?.trim() || !body.type?.trim() || !body.site?.trim()) return send(res, 400, { ok: false, output: '资产名称、类型和位置不能为空。' });
    const statuses = ['已登记', '在线', '离线', '维修中', '已报废']; const status = statuses.includes(body.status) ? body.status : '已登记';
    const store = await readStore();
    const upstreamAssetId = String(body.upstreamAssetId || '').trim();
    const upstream = upstreamAssetId ? store.assets.find((item) => item.id === upstreamAssetId) : null;
    if (upstreamAssetId && (!upstream || upstream.site !== body.site.trim())) return send(res, 400, { ok: false, output: '上联资产必须是同一门店内已登记的设备。' });
    const evidenceIds = Array.isArray(body.evidenceIds) ? [...new Set(body.evidenceIds.map((item) => String(item)).filter(Boolean))].slice(0, 10) : [];
    if (evidenceIds.some((id) => !store.evidence.some((item) => item.id === id))) return send(res, 400, { ok: false, output: '关联证据附件不存在。' });
    const asset = { id: `AST-${Date.now()}`, name: body.name.trim().slice(0, 80), type: body.type.trim().slice(0, 60), site: body.site.trim().slice(0, 80), ip: body.ip?.trim().slice(0, 253) || '-', status, upstreamAssetId: upstreamAssetId || null, switchPort: String(body.switchPort || '').trim().slice(0, 60) || null, vlan: String(body.vlan || '').trim().slice(0, 32) || null, evidenceIds, ...assetRecordFields(body), createdAt: new Date().toISOString() }; store.assets.unshift(asset); await writeStore(store); return send(res, 201, asset);
  }
  if (pathname.startsWith('/api/assets/') && req.method === 'PATCH') {
    const assetId = decodeURIComponent(pathname.slice('/api/assets/'.length)); const store = await readStore(); const asset = store.assets.find((item) => item.id === assetId);
    if (!asset) return send(res, 404, { ok: false, output: '未找到资产。' });
    if (Object.hasOwn(body, 'status')) {
      const status = String(body.status || '').trim(); const allowedStatuses = ['已登记', '在线', '离线', '维修中', '已报废'];
      if (!allowedStatuses.includes(status)) return send(res, 400, { ok: false, output: '无效的资产状态。' });
      asset.status = status;
    }
    if (Object.hasOwn(body, 'upstreamAssetId') || Object.hasOwn(body, 'switchPort') || Object.hasOwn(body, 'vlan')) {
      const upstreamAssetId = String(body.upstreamAssetId || '').trim();
      const upstream = upstreamAssetId ? store.assets.find((item) => item.id === upstreamAssetId) : null;
      if (upstreamAssetId && (!upstream || upstream.id === asset.id || upstream.site !== asset.site)) return send(res, 400, { ok: false, output: '上联资产必须是同一门店内的其他已登记设备。' });
      let cursorId = upstreamAssetId;
      while (cursorId) { if (cursorId === asset.id) return send(res, 400, { ok: false, output: '该上联关系会形成拓扑环路，请重新选择。' }); cursorId = store.assets.find((item) => item.id === cursorId)?.upstreamAssetId || ''; }
      asset.upstreamAssetId = upstreamAssetId || null;
      asset.switchPort = String(body.switchPort || '').trim().slice(0, 60) || null;
      asset.vlan = String(body.vlan || '').trim().slice(0, 32) || null;
    }
    const profileKeys = ['model', 'serialNumber', 'macAddress', 'physicalLocation', 'notes'];
    if (profileKeys.some((key) => Object.hasOwn(body, key))) { const fields = assetRecordFields(body); profileKeys.forEach((key) => { if (Object.hasOwn(body, key)) asset[key] = fields[key]; }); }
    if (Object.hasOwn(body, 'evidenceIds')) { const evidenceIds = Array.isArray(body.evidenceIds) ? [...new Set(body.evidenceIds.map((item) => String(item)).filter(Boolean))].slice(0, 10) : []; if (evidenceIds.some((id) => !store.evidence.some((item) => item.id === id))) return send(res, 400, { ok: false, output: '关联证据附件不存在。' }); asset.evidenceIds = evidenceIds; }
    if (!Object.hasOwn(body, 'status') && !Object.hasOwn(body, 'upstreamAssetId') && !Object.hasOwn(body, 'switchPort') && !Object.hasOwn(body, 'vlan') && !Object.hasOwn(body, 'evidenceIds') && !profileKeys.some((key) => Object.hasOwn(body, key))) return send(res, 400, { ok: false, output: '没有可更新的资产字段。' });
    asset.updatedAt = new Date().toISOString(); await writeStore(store); return send(res, 200, asset);
  }
  if (pathname.startsWith('/api/tickets/') && req.method === 'PATCH') {
    const ticketId = decodeURIComponent(pathname.slice('/api/tickets/'.length));
    const store = await readStore(); const ticket = store.tickets.find((item) => item.id === ticketId);
    if (!ticket) return send(res, 404, { ok: false, output: '未找到工单。' });
    if (Object.hasOwn(body, 'status')) { const status = String(body.status || '').trim(); const allowedStatuses = ['待处理', '处理中', '待验证', '已解决', '已关闭']; if (!allowedStatuses.includes(status)) return send(res, 400, { ok: false, output: '无效的工单状态。' }); ticket.status = status; }
    if (Object.hasOwn(body, 'assetId')) { const assetId = String(body.assetId || '').trim(); const asset = assetId ? store.assets.find((item) => item.id === assetId) : null; if (assetId && !asset) return send(res, 400, { ok: false, output: '关联资产不存在。' }); ticket.assetId = assetId || null; ticket.assetName = asset?.name || null; }
    if (!Object.hasOwn(body, 'status') && !Object.hasOwn(body, 'assetId')) return send(res, 400, { ok: false, output: '没有可更新的工单字段。' });
    ticket.updatedAt = new Date().toISOString(); await writeStore(store);
    return send(res, 200, ticket);
  }
  if (pathname === '/api/tickets' && req.method === 'GET') { const store = await readStore(); return send(res, 200, store.tickets); }
  if (pathname === '/api/tickets' && req.method === 'POST') {
    if (!body.title?.trim()) return send(res, 400, { ok: false, output: '工单标题不能为空。' });
    const store = await readStore(); const assetId = String(body.assetId || '').trim(); const asset = assetId ? store.assets.find((item) => item.id === assetId) : null;
    if (assetId && !asset) return send(res, 400, { ok: false, output: '关联资产不存在。' });
    const ticket = { id: `INC-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${String(store.tickets.length + 1).padStart(3, '0')}`, title: body.title.trim().slice(0, 160), site: body.site?.trim().slice(0, 80) || asset?.site || '待分派', priority: body.priority || '普通', status: '待处理', assetId: assetId || null, assetName: asset?.name || null, createdAt: new Date().toISOString() }; store.tickets.unshift(ticket); await writeStore(store); return send(res, 201, ticket);
  }
  if (pathname === '/api/tools/network-info') return send(res, 200, await run('ipconfig', ['/all'], 10000));
  if (pathname === '/api/tools/adapter-health') return send(res, 200, await runPowerShell("Get-NetAdapter -IncludeHidden | Select-Object Name,InterfaceDescription,Status,MediaConnectionState,LinkSpeed,MacAddress | Sort-Object Status,Name | Format-Table -AutoSize"));
  if (pathname === '/api/tools/gateway-health') return send(res, 200, await runPowerShell("$routes = Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Where-Object { $_.NextHop -and $_.NextHop -ne '0.0.0.0' } | Sort-Object RouteMetric; if (-not $routes) { throw '未找到 IPv4 默认网关。' }; $results = foreach ($route in $routes) { $reply = Test-Connection -ComputerName $route.NextHop -Count 2 -Quiet -ErrorAction SilentlyContinue; [pscustomobject]@{ Interface = $route.InterfaceAlias; Gateway = $route.NextHop; RouteMetric = $route.RouteMetric; Reachable = if ($reply) { '正常' } else { '不可达' } } }; $results | Format-Table -AutoSize"));
  if (pathname === '/api/tools/internet-health') return send(res, 200, await bundleChecks([
    { name: '公共 DNS 解析', task: () => run('nslookup', ['www.cloudflare.com'], 8000) },
    { name: '公共 IP 连通性', task: () => run('ping', ['-n', '4', '-w', '1500', '1.1.1.1'], 9000) },
    { name: 'HTTPS 出口', task: () => webProbe('www.cloudflare.com', 443, true) },
  ]));
  if (pathname === '/api/tools/wifi-info') return send(res, 200, await run('netsh', ['wlan', 'show', 'interfaces'], 8000));
  if (pathname === '/api/tools/route-info') return send(res, 200, await run('route', ['print', '-4'], 8000));
  if (pathname === '/api/tools/network-snapshot') return send(res, 200, await bundleChecks([
    { name: 'IP、DNS、网关', task: () => run('ipconfig', ['/all'], 10000) },
    { name: 'IPv4 路由表', task: () => run('route', ['print', '-4'], 8000) },
    { name: 'Wi-Fi 状态', task: () => run('netsh', ['wlan', 'show', 'interfaces'], 8000) },
    { name: 'ARP / MAC 表', task: () => run('arp', ['-a'], 8000) },
  ]));
  if (pathname === '/api/tools/flush-dns') return send(res, 200, await runAuditedAction('受控网络修复', '刷新 DNS 缓存', () => run('ipconfig', ['/flushdns'], 8000)));
  if (pathname === '/api/tools/renew-dhcp') return send(res, 200, await runAuditedAction('受控网络修复', 'DHCP 续租', () => run('ipconfig', ['/renew'], 30000)));
  if (pathname === '/api/tools/repair-network') return send(res, 200, await runAuditedAction('受控网络修复', '刷新 DNS 并续租 DHCP', () => bundleChecks([{ name: '刷新 DNS 缓存', task: () => run('ipconfig', ['/flushdns'], 8000) }, { name: 'DHCP 续租', task: () => run('ipconfig', ['/renew'], 30000) }])));
  if (pathname === '/api/tools/repair-printer') return send(res, 200, await runAuditedAction('受控打印修复', '重启 Print Spooler', () => runPowerShell("Restart-Service -Name Spooler -Force; Get-Service -Name Spooler | Format-Table -AutoSize")));
  if (pathname === '/api/tools/repair-printer-queue') return send(res, 200, await runAuditedAction('受控打印修复', '清理打印队列并重启 Spooler', () => runPowerShell("Stop-Service -Name Spooler -Force; $queuePath = Join-Path $env:WINDIR 'System32\\spool\\PRINTERS'; $files = Get-ChildItem -LiteralPath $queuePath -Force -ErrorAction SilentlyContinue; $count = @($files).Count; if ($count -gt 0) { Remove-Item -LiteralPath $files.FullName -Force -ErrorAction Stop }; Start-Service -Name Spooler; \"已清理 $count 个打印队列文件。\"; Get-Service -Name Spooler | Format-Table -AutoSize")));
  if (pathname === '/api/tools/system-info') return send(res, 200, await runPowerShell("Get-CimInstance Win32_OperatingSystem | Select-Object CSName,Caption,Version,LastBootUpTime,TotalVisibleMemorySize,FreePhysicalMemory | Format-List"));
  if (pathname === '/api/tools/resource-hotspots') return send(res, 200, await runPowerShell("'CPU 累计时间靠前的进程'; Get-Process | Sort-Object CPU -Descending | Select-Object -First 12 ProcessName,Id,@{Name='CPUSeconds';Expression={[math]::Round($_.CPU,1)}},@{Name='MemoryMB';Expression={[math]::Round($_.WorkingSet64 / 1MB,1)}} | Format-Table -AutoSize; ''; '内存占用靠前的进程'; Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 12 ProcessName,Id,@{Name='MemoryMB';Expression={[math]::Round($_.WorkingSet64 / 1MB,1)}},@{Name='CPUSeconds';Expression={[math]::Round($_.CPU,1)}} | Format-Table -AutoSize"));
  if (pathname === '/api/tools/identity-info') return send(res, 200, await bundleChecks([
    { name: '计算机与域状态', task: () => runPowerShell("Get-CimInstance Win32_ComputerSystem | Select-Object Name,Domain,PartOfDomain,UserName | Format-List") },
    { name: '当前登录身份与组', task: () => run('whoami', ['/all'], 10000) },
  ]));
  if (pathname === '/api/tools/network-drives') return send(res, 200, await bundleChecks([
    { name: '文件系统驱动器', task: () => runPowerShell("Get-PSDrive -PSProvider FileSystem | Select-Object Name,Root,Used,Free,Description | Format-Table -AutoSize") },
    { name: '网络映射连接', task: () => run('net', ['use'], 8000) },
  ]));
  if (pathname === '/api/tools/firewall-status') return send(res, 200, await bundleChecks([
    { name: 'Windows 防火墙配置', task: () => runPowerShell("Get-NetFirewallProfile | Select-Object Name,Enabled,DefaultInboundAction,DefaultOutboundAction | Format-Table -AutoSize") },
    { name: '本机监听端口', task: () => runPowerShell("Get-NetTCPConnection -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess | Sort-Object LocalPort | Format-Table -AutoSize") },
  ]));
  if (pathname === '/api/tools/disk-health') return send(res, 200, await runPowerShell("Get-Volume | Select-Object DriveLetter,FileSystemLabel,FileSystem,SizeRemaining,Size,HealthStatus | Format-Table -AutoSize; ''; Get-PhysicalDisk | Select-Object FriendlyName,MediaType,HealthStatus,OperationalStatus,Size | Format-Table -AutoSize"));
  if (pathname === '/api/tools/printer-service') return send(res, 200, await runPowerShell("Get-Service Spooler | Format-Table -AutoSize; ''; Get-Printer | Select-Object Name,DriverName,PortName,PrinterStatus,WorkOffline | Format-Table -AutoSize"));
  if (pathname === '/api/tools/service-status') {
    const serviceName = String(body.serviceName || '').trim();
    if (!/^[A-Za-z0-9_.-]{1,128}$/.test(serviceName)) return send(res, 400, { ok: false, output: '服务名只能包含字母、数字、点、下划线和短横线。' });
    return send(res, 200, await runPowerShell(`Get-Service -Name '${serviceName}' -ErrorAction Stop | Select-Object Name,DisplayName,Status,StartType | Format-List`));
  }
  if (pathname === '/api/tools/print-test') {
    const printerName = String(body.printerName || '').trim();
    if (!printerName || printerName.length > 200) return send(res, 400, { ok: false, output: '请填写有效的打印机名称。' });
    const escapedName = printerName.replace(/'/g, "''");
    return send(res, 200, await runPowerShell(`$printer = Get-CimInstance Win32_Printer -Filter \"Name='${escapedName}'\"; if (-not $printer) { throw '未找到指定打印机。' }; Invoke-CimMethod -InputObject $printer -MethodName PrintTestPage | Out-Null; \"已向 ${escapedName} 发送 Windows 测试页。\"`));
  }
  if (pathname === '/api/tools/system-errors') return send(res, 200, await runPowerShell("Get-WinEvent -FilterHashtable @{LogName='System'; Level=1,2,3; StartTime=(Get-Date).AddDays(-3)} -MaxEvents 15 | Select-Object TimeCreated,ProviderName,Id,LevelDisplayName,Message | Format-List"));
  if (pathname === '/api/tools/application-errors') return send(res, 200, await runPowerShell("Get-WinEvent -FilterHashtable @{LogName='Application'; Level=1,2; StartTime=(Get-Date).AddDays(-3)} -MaxEvents 15 | Select-Object TimeCreated,ProviderName,Id,LevelDisplayName,Message | Format-List"));
  if (pathname === '/api/tools/driver-problems') return send(res, 200, await runPowerShell("$items = Get-PnpDevice -PresentOnly | Where-Object { $_.Status -ne 'OK' } | Select-Object Class,FriendlyName,Status,Problem; if ($items) { $items | Format-Table -AutoSize } else { '未发现状态异常的即插即用设备。' }"));
  if (pathname === '/api/tools/software-inventory') return send(res, 200, await runPowerShell("$paths = 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'; Get-ItemProperty $paths -ErrorAction SilentlyContinue | Where-Object DisplayName | Select-Object DisplayName,DisplayVersion,Publisher,InstallDate | Sort-Object DisplayName | Format-Table -AutoSize", 20000));
  if (pathname === '/api/tools/spooler-start') return send(res, 200, await runAuditedAction('受控打印修复', '启动 Print Spooler', () => runPowerShell("Start-Service -Name Spooler; Get-Service -Name Spooler | Format-Table -AutoSize")));
  if (pathname === '/api/tools/onsite-baseline') return send(res, 200, await bundleChecks([
    { name: '网络配置', task: () => run('ipconfig', ['/all'], 10000) },
    { name: '外网 DNS', task: () => run('nslookup', ['www.cloudflare.com'], 8000) },
    { name: '公网连通性', task: () => run('ping', ['-n', '2', '-w', '1500', '1.1.1.1'], 6000) },
    { name: '系统与磁盘', task: () => runPowerShell("Get-CimInstance Win32_OperatingSystem | Select-Object CSName,Caption,LastBootUpTime,FreePhysicalMemory | Format-List; ''; Get-Volume | Where-Object DriveLetter | Select-Object DriveLetter,SizeRemaining,Size,HealthStatus | Format-Table -AutoSize") },
    { name: '打印服务', task: async () => { const result = await runPowerShell("Get-Service Spooler | Select-Object Name,Status,StartType | Format-Table -AutoSize"); return { ...result, ok: result.ok && /Running/i.test(result.output) }; } },
  ]));
  if (pathname === '/api/tools/workstation-health') return send(res, 200, await bundleChecks([
    { name: '系统与内存', task: () => runPowerShell("Get-CimInstance Win32_OperatingSystem | Select-Object CSName,Caption,LastBootUpTime,FreePhysicalMemory | Format-List") },
    { name: '磁盘可用空间', task: () => runPowerShell("Get-Volume | Where-Object DriveLetter | Select-Object DriveLetter,SizeRemaining,Size,HealthStatus | Format-Table -AutoSize") },
    { name: '打印服务', task: async () => { const result = await runPowerShell("Get-Service Spooler | Format-Table -AutoSize"); return { ...result, ok: result.ok && /Running/i.test(result.output) }; } },
  ]));
  if (pathname === '/api/tools/scan') { const prefix = validSubnet(body.subnet); return prefix ? send(res, 200, await scanSubnet(prefix)) : send(res, 400, { ok: false, output: '网段格式必须是有效的私网或单播网段，例如 192.168.1.0/24；不允许回环、保留或组播网段。' }); }
  if (pathname === '/api/tools/device-scan' && req.method === 'POST') {
    const prefix = validSubnet(body.subnet);
    if (!prefix) return send(res, 400, { ok: false, output: '仅支持 /24 私网或单播网段扫描，例如 192.168.1.0/24。' });
    try {
      const scanStart = Date.now();
      const online = [];
      const candidates = Array.from({ length: 254 }, (_, index) => `${prefix}.${index + 1}`);
      const workers = Array.from({ length: 24 }, async () => { while (candidates.length) { const host = candidates.shift(); if (await pingOnce(host)) online.push(host); } });
      await Promise.all(workers);
      online.sort((a, b) => a.split('.').at(-1) - b.split('.').at(-1));
      const store = await readStore();
      const devices = await Promise.all(online.slice(0, 40).map(async (ip) => {
        const [printerPorts, cctvPorts, webPorts] = await Promise.all([multiPortCheck(ip, [9100, 515, 631]), multiPortCheck(ip, [554, 8000, 37777]), multiPortCheck(ip, [80, 443])]);
        let type = '未知设备'; if (printerPorts.ok) type = '打印机/小票机'; else if (cctvPorts.ok) type = '摄像头/NVR'; else if (webPorts.ok) type = '网络设备（Web）';
        const known = store.assets.find((asset) => asset.ip === ip);
        return { ip, type, known: known ? { id: known.id, name: known.name, site: known.site, type: known.type } : null, ports: { printer: printerPorts.ok, cctv: cctvPorts.ok, web: webPorts.ok } };
      }));
      return send(res, 200, { ok: true, scanDurationMs: Date.now() - scanStart, total: online.length, devices });
    } catch (error) { return send(res, 500, { ok: false, output: `设备扫描失败：${error.message}` }); }
  }
  if (pathname === '/api/tools/offline-pack' && req.method === 'GET') {
    const tools = [{ name: 'Ping 连通性', fn: 'ping' }, { name: 'DNS 查询', fn: 'dns_lookup' }, { name: 'ARP/MAC 查询', fn: 'check_arp' }, { name: '本机网络信息', fn: 'get_network_info' }, { name: '一键网络快照', fn: 'get_network_snapshot' }, { name: '默认网关检查', fn: 'check_gateway' }, { name: '外网连通检查', fn: 'check_internet' }, { name: '网卡链路状态', fn: 'check_adapter_health' }, { name: '系统与磁盘信息', fn: 'get_system_info' }, { name: '打印服务状态', fn: 'check_spooler' }, { name: '系统错误日志', fn: 'get_system_errors' }, { name: '驱动异常检查', fn: 'check_drivers' }];
    const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OpsHub 离线应急诊断</title><style>body{max-width:860px;margin:30px auto;padding:0 20px;color:#1e293b;font:14px/1.7 "Microsoft YaHei",sans-serif;background:#f8fafc}h1{color:#0d766c;font-size:22px}.card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:18px;margin:14px 0}.card h2{font-size:16px;margin:0 0 10px}input{width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:7px;font:inherit;margin-bottom:12px}.tools{display:flex;flex-wrap:wrap;gap:8px}.tools button{padding:8px 14px;border:1px solid #bddad4;border-radius:7px;background:#f0faf7;color:#0d766c;cursor:pointer;font:13px "Microsoft YaHei",sans-serif}.tools button:hover{background:#d9f2eb}pre{white-space:pre-wrap;background:#12202d;color:#dbe9f6;padding:14px;border-radius:8px;font:12px/1.6 Consolas,monospace;max-height:500px;overflow:auto}.note{color:#718096;font-size:12px;margin:16px 0 8px}</style><body><h1>⚡ OpsHub 离线应急诊断</h1><p class="note">不依赖后台服务。填入目标 IP 后点击工具按钮，PowerShell 在本地执行。</p><div class="card"><h2>目标</h2><input id="host" placeholder="目标 IP（留空则检查本机）" value=""/><div class="tools">${tools.map(t => `<button onclick="runTool('${t.name}')">${t.name}</button>`).join('')}</div></div><div class="card"><h2>结果</h2><pre id="output">点击上方工具开始诊断。\n\n本页面为自包含 HTML，无需后台服务。\n所有命令通过 PowerShell 在本机执行，不会上传数据。</pre></div><script>const apiMap={ping:'ping -n 4 -w 1500',dns_lookup:'nslookup',check_arp:'arp -a',get_network_info:'ipconfig /all',get_network_snapshot:'ipconfig /all & route print -4 & arp -a',check_gateway:'powershell -Command "$r=Get-NetRoute -DestinationPrefix 0.0.0.0/0|?{$_.NextHop}|Sort RouteMetric|Select -First 1;if($r){Test-Connection $r.NextHop -Count 2|ft Address,Status,ResponseTime}"',check_internet:'powershell -Command "nslookup www.cloudflare.com; ping -n 2 1.1.1.1"',check_adapter_health:'powershell -Command "Get-NetAdapter|select Name,Status,LinkSpeed,MacAddress|ft"',get_system_info:'powershell -Command "Get-CimInstance Win32_OperatingSystem|fl CSName,Caption,LastBootUpTime;Get-Volume|? DriveLetter|ft DriveLetter,SizeRemaining,Size,HealthStatus"',check_spooler:'powershell -Command "Get-Service Spooler|ft;Get-Printer|select Name,PrinterStatus,WorkOffline|ft"',get_system_errors:'powershell -Command "Get-WinEvent -FilterHashtable @{LogName=System;Level=1,2;StartTime=(Get-Date).AddDays(-3)} -MaxEvents 10|fl TimeCreated,Id,Message"',check_drivers:'powershell -Command "Get-PnpDevice -PresentOnly|?{$_.Status -ne \\'OK\\'}|ft Class,FriendlyName,Status"'};async function runTool(name){const host=document.getElementById('host').value.trim()||'127.0.0.1';const cmd=(apiMap[name]||name).replace(/\\$host/g,host);const out=document.getElementById('output');out.textContent='执行中: '+name+'...';try{const result=await execPowerShell(cmd);out.textContent=name+'\\n'+'='.repeat(40)+'\\n'+result}catch(e){out.textContent='错误: '+e.message}};async function execPowerShell(cmd){return new Promise((resolve,reject)=>{try{const shell=new ActiveXObject('WScript.Shell');const proc=shell.Exec('powershell.exe -NoProfile -Command "'+cmd.replace(/"/g,'\\"')+'"');let out='';while(proc.Status===0){new Promise(r=>setTimeout(r,50))};out=proc.StdOut.ReadAll();if(!out)out=proc.StdErr.ReadAll();resolve(out)}catch(e){reject(e)}})};</script></body></html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': 'attachment; filename="OpsHub离线应急诊断.html"', 'Cache-Control': 'no-store' });
    res.end(html); return;
  }
  const host = body.host?.trim();
  if (!validHost(host)) return send(res, 400, { ok: false, output: 'Target must be a valid IP address or hostname.' });
  if (pathname === '/api/tools/ping') return send(res, 200, await run('ping', ['-n', '4', '-w', '1500', host], 8000));
  if (pathname === '/api/tools/dns') return send(res, 200, await run('nslookup', [host], 8000));
  if (pathname === '/api/tools/trace') return send(res, 200, await run('tracert', ['-d', '-h', '8', '-w', '800', host], 12000));
  if (pathname === '/api/tools/port') { const n = Number(body.port); return Number.isInteger(n) && n > 0 && n < 65536 ? send(res, 200, await portCheck(host, n)) : send(res, 400, { ok: false, output: 'Port must be between 1 and 65535.' }); }
  if (pathname === '/api/tools/printer') return send(res, 200, await multiPortCheck(host, [9100, 515, 631]));
  if (pathname === '/api/tools/cctv') return send(res, 200, await multiPortCheck(host, [80, 443, 554, 8000, 37777]));
  if (pathname === '/api/tools/arp') return send(res, 200, await run('arp', ['-a', host], 6000));
  if (pathname === '/api/tools/certificate') return send(res, 200, await certificateProbe(host));
  if (pathname === '/api/tools/rdp' && req.method === 'POST') { const child = spawn('mstsc.exe', [`/v:${host}`], { detached: true, stdio: 'ignore', windowsHide: false }); child.unref(); return send(res, 200, { ok: true, output: `已打开 ${host} 的远程桌面连接。` }); }
  if (pathname === '/api/tools/open-web' && req.method === 'POST') { const child = spawn('cmd.exe', ['/d', '/c', 'start', '', `http://${host}`], { detached: true, stdio: 'ignore', windowsHide: true }); child.unref(); return send(res, 200, { ok: true, output: `已在默认浏览器中打开 http://${host}` }); }
  if (pathname === '/api/tools/web-probe') return send(res, 200, await bundleChecks([{ name: 'HTTP 管理页', task: () => webProbe(host, 80, false) }, { name: 'HTTPS 管理页', task: () => webProbe(host, 443, true) }]));
  if (pathname === '/api/tools/printer-health') return send(res, 200, await bundleChecks([{ name: 'Ping 连通性', task: () => run('ping', ['-n', '2', '-w', '1200', host], 5000) }, { name: '打印端口', task: () => multiPortCheck(host, [9100, 515, 631]) }]));
  if (pathname === '/api/tools/cctv-health') return send(res, 200, await bundleChecks([{ name: 'Ping 连通性', task: () => run('ping', ['-n', '2', '-w', '1200', host], 5000) }, { name: 'NVR/监控端口', task: () => multiPortCheck(host, [80, 443, 554, 8000, 37777]) }]));
  return send(res, 404, { ok: false, output: 'Not found.' });
}
http.createServer(async (req, res) => { const url = new URL(req.url, `http://${req.headers.host}`); if (url.pathname.startsWith('/api/')) return handleApi(req, res, url.pathname); let requestPath; try { requestPath = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname); } catch { return send(res, 400, 'Invalid path', 'text/plain'); } const file = normalize(join(root, requestPath)); if (!file.startsWith(root)) return send(res, 403, 'Forbidden', 'text/plain'); try { send(res, 200, await readFile(file), types[extname(file)] || 'application/octet-stream'); } catch { send(res, 404, 'Not found', 'text/plain'); } }).listen(port, '127.0.0.1', () => console.log(`OpsHub running at http://127.0.0.1:${port}`));

