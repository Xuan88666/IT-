import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { createRequire } from 'node:module';
import { hostname, networkInterfaces } from 'node:os';
import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { basename, extname, join, normalize, sep } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import net from 'node:net';
import dgram from 'node:dgram';
import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { PDFParse } from 'pdf-parse';
import { ModelDispatcher } from './server/ai/model-dispatcher.mjs';
import { SessionManager } from './server/ai/session-manager.mjs';
import { loadProvidersFromEnv, maskApiKey } from './server/ai/providers-config.mjs';
import { createRateLimitStore } from './server/rate-limit.mjs';
import { RemoteSessionManager, validRemoteHost, normalizeRemotePort } from './server/remote-sessions.mjs';
import { PacketCaptureManager, analyzeCaptureBuffer, MAX_UPLOAD_BYTES } from './server/packet-capture.mjs';
import { SerialSessionManager } from './server/serial-sessions.mjs';
import { extendedTools, extendedAgentTools, extendedAgentAllowlist, executeExtendedAgentTool, extendedAgentDisplayNames, sendWakeOnLan, lookupMacVendor, connTracker, domainWhois, httpApiTest, snmpProbe, websocketTest, ptrLookup, tlsScan, tracerouteAnalyze, mitmHints, netflowListen, subnetCalc, routeTable, firewallStatus, portOccupancy, ipInfo, dhcpDetect, hostDiscovery, loopDetection, speedTest, networkHealth, arpTable, portServiceProbe, tempHttpServer, stopTempHttpServer, getActiveTempServers, startFtpServer, stopFtpServer, getActiveFtpServers, startTftpServer, stopTftpServer, getActiveTftpServers, startSyslogServer, stopSyslogServer, getSyslogMessages, getActiveSyslogServers, cameraScan, serviceDiscovery, startDhcpServer, stopDhcpServer, getActiveDhcpServers, lanSpeedTest, pingQoS, routePolicy, connectionTest, dnsBenchmark, ipConflictCheck, networkTrafficSample, wifiChannelAnalysis, wifiProfileExport, linkMonitorSample, sendMonitorWebhook } from './server/tools-extended.mjs';

const require = createRequire(import.meta.url);
const { createWorker } = require('tesseract.js');
const chiSimLanguage = require('@tesseract.js-data/chi_sim');

const root = process.cwd();
dotenv.config({ path: join(root, '.env') });
const port = Number(process.env.PORT || 3000);
const dataDir = process.env.IT_OPS_TOOLBOX_DATA_DIR || process.env.OPSHUB_DATA_DIR ? normalize(process.env.IT_OPS_TOOLBOX_DATA_DIR || process.env.OPSHUB_DATA_DIR) : join(root, 'data');
const remoteSessions = new RemoteSessionManager({ historyPath: join(dataDir, 'remote-history.json') });
const packetCapture = new PacketCaptureManager({ dataDir });
const serialSessions = new SerialSessionManager({ historyPath: join(dataDir, 'serial-history.json') });
const evidenceDir = join(dataDir, 'evidence');
const ocrCacheDir = join(dataDir, 'ocr-cache');
const aiSessionsDir = join(dataDir, 'ai-sessions');
const knowledgeSeedPath = join(root, 'data', 'knowledge-seed.json');
const storePath = join(dataDir, 'it-ops-toolbox.json');
const storeBackupPath = join(dataDir, 'it-ops-toolbox.json.bak');
const legacyStorePath = join(dataDir, 'opshub.json');
const legacyStoreBackupPath = join(dataDir, 'opshub.json.bak');
let ocrWorkerPromise = null;
let ocrQueue = Promise.resolve();
let storeWriteQueue = Promise.resolve();
let storeWriteCounter = 0;

const mysqlPool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || '',
  password: process.env.MYSQL_PASS || '',
  database: process.env.MYSQL_DB || 'ops_box',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  // 远程 MySQL / NAT 会掐断空闲 TCP：保活探测 + 主动回收空闲连接，避免拿到已死连接报 PROTOCOL_CONNECTION_LOST
  connectTimeout: 10000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  maxIdle: 5,
  idleTimeout: 60000,
});

const mailTransporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.qq.com',
  port: Number(process.env.EMAIL_PORT || 465),
  secure: true,
  auth: { user: process.env.EMAIL_USER || '', pass: process.env.EMAIL_PASS || '' },
});
const rateLimitStore = createRateLimitStore();

// 初始化 AI 模块
const sessionManager = new SessionManager(aiSessionsDir);
const providers = loadProvidersFromEnv();
const modelDispatcher = new ModelDispatcher(providers);

// ── 服务器监控系统 ──
// 通过 SSH 远程执行 agent/linux-monitor.sh 采集，或直接 HTTP 上报
const monitorStore = {
  servers: new Map(),     // hostname -> { latest, history[], thresholds, config }
  storePath: join(dataDir, 'server-monitor.json'),
  loaded: false,
  historyMax: 1440,       // 保留 24h（每 1 分钟一个采样点）
  async load() {
    try {
      const raw = await readFile(this.storePath, 'utf-8');
      const data = JSON.parse(raw);
      for (const [hostname, info] of Object.entries(data.servers || {})) {
        this.servers.set(hostname, info);
      }
      this.loaded = true;
    } catch { this.loaded = true; }
  },
  async save() {
    const obj = {};
    for (const [hostname, info] of this.servers) {
      obj[hostname] = {
        config: info.config,
        thresholds: info.thresholds,
        latest: info.latest,
        history: (info.history || []).slice(-this.historyMax),
        lastReportAt: info.lastReportAt,
      };
    }
    await writeFile(this.storePath, JSON.stringify({ servers: obj }, null, 2), 'utf-8').catch(() => {});
  },
  report(hostname, data) {
    let entry = this.servers.get(hostname);
    if (!entry) {
      entry = { config: { alias: hostname, tags: [] }, thresholds: {}, latest: null, history: [], lastReportAt: null };
      this.servers.set(hostname, entry);
    }
    const snapshot = {
      timestamp: data.timestamp || new Date().toISOString(),
      cpu: data.cpu || {},
      memory: data.memory || {},
      disk: data.disk || {},
      network: data.network || [],
      os: data.os || '',
      kernel: data.kernel || '',
      uptime_days: data.uptime_days || 0,
    };
    entry.latest = snapshot;
    entry.lastReportAt = snapshot.timestamp;
    if (!entry.history) entry.history = [];
    entry.history.push(snapshot);
    if (entry.history.length > this.historyMax) entry.history.splice(0, entry.history.length - this.historyMax);
    // 阈值检测
    const alerts = this._checkThresholds(hostname, snapshot);
    this.save();
    return { ok: true, alerts };
  },
  _checkThresholds(hostname, snapshot) {
    const t = this.servers.get(hostname)?.thresholds || {};
    const alerts = [];
    if (t.cpu_max && (snapshot.cpu?.usage_percent || 0) > t.cpu_max) alerts.push({ level: 'warning', metric: 'CPU', value: snapshot.cpu.usage_percent, threshold: t.cpu_max });
    if (t.memory_max && (snapshot.memory?.usage_percent || 0) > t.memory_max) alerts.push({ level: 'warning', metric: '内存', value: snapshot.memory.usage_percent, threshold: t.memory_max });
    if (t.disk_max && (snapshot.disk?.usage_percent || 0) > t.disk_max) alerts.push({ level: 'warning', metric: '磁盘', value: snapshot.disk.usage_percent, threshold: t.disk_max });
    return alerts;
  },
  setThreshold(hostname, thresholds) {
    let entry = this.servers.get(hostname);
    if (!entry) { entry = { config: { alias: hostname, tags: [] }, thresholds: {}, latest: null, history: [], lastReportAt: null }; this.servers.set(hostname, entry); }
    entry.thresholds = { ...entry.thresholds, ...thresholds };
    this.save();
  },
  listServers() {
    return Array.from(this.servers.entries()).map(([hostname, entry]) => ({
      hostname,
      alias: entry.config?.alias || hostname,
      tags: entry.config?.tags || [],
      online: entry.lastReportAt ? (Date.now() - new Date(entry.lastReportAt).getTime() < 180000) : false,
      latest: entry.latest,
      lastReportAt: entry.lastReportAt,
      thresholds: entry.thresholds || {},
    }));
  },
  getServer(hostname) {
    const entry = this.servers.get(hostname);
    if (!entry) return null;
    return {
      hostname,
      alias: entry.config?.alias || hostname,
      latest: entry.latest,
      history: (entry.history || []).slice(-120), // 最近 2 小时
      thresholds: entry.thresholds || {},
    };
  },
};
monitorStore.load();

// Agent 工具调用速率限制与统计
const agentToolStats = {
  totalCalls: 0,
  sessionCalls: new Map(),
  lastMinuteCalls: [],
  maxPerMinute: 60,
  maxPerSession: 50,
  maxParallelPerTurn: 6
};

function checkToolRateLimit(sessionId) {
  const now = Date.now();
  agentToolStats.lastMinuteCalls = agentToolStats.lastMinuteCalls.filter(t => now - t < 60000);
  if (agentToolStats.lastMinuteCalls.length >= agentToolStats.maxPerMinute) {
    return { allowed: false, reason: `全局速率限制：每分钟最多 ${agentToolStats.maxPerMinute} 次工具调用` };
  }
  const sessionCount = agentToolStats.sessionCalls.get(sessionId) || 0;
  if (sessionCount >= agentToolStats.maxPerSession) {
    return { allowed: false, reason: `单会话限制：最多 ${agentToolStats.maxPerSession} 次工具调用` };
  }
  return { allowed: true };
}

function recordToolCall(sessionId) {
  agentToolStats.totalCalls++;
  agentToolStats.lastMinuteCalls.push(Date.now());
  const current = agentToolStats.sessionCalls.get(sessionId) || 0;
  agentToolStats.sessionCalls.set(sessionId, current + 1);
}

console.log(`[AI] 已加载 ${providers.length} 个 Provider: ${providers.map(p => p.name).join(', ')}`);
if (providers.length > 0) {
  console.log(`[AI] 会话存储目录: ${aiSessionsDir}`);
}
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
- 使用专项诊断：打印机、监控/NVR 一键体检
- 检查 HTTPS 证书有效期
- 请求工程师确认物理状态（电源灯、网线、卡纸等）

## 工具返回格式说明
工具返回结果包含两个部分：
- **output**: 原始文本输出（详细，用于完整信息）
- **structured**: 结构化数据（如果有），包含机器可读的关键字段，例如：
  - ping: { reachable, packetLossPercent, avgLatencyMs }
  - check_port/check_ports: { open, openPorts }
  - dns_lookup: { resolved, resolvedIps }
  - check_arp: { found, macAddress }
  - diagnose_printer/diagnose_cctv: 专项诊断结果
请优先使用 structured 字段做判断，output 作为补充。

## 排查原则
1. **先缩小范围** — 单设备还是多设备？同一网段还是全店？先搞清楚故障边界
2. **先远程后物理** — 先跑工具检查连通性、端口、服务，工具跑完再让工程师检查物理
3. **并行优先** — 互相独立的检查可以同时调用（比如同时 Ping 和查 ARP 和端口扫描）
4. **专项优先** — 打印机或监控故障直接用 diagnose_printer / diagnose_cctv 一键诊断
5. **见好就收** — 拿到明确证据立即给出判断，不要无意义地跑更多工具
6. **证据说话** — 每个结论都要有工具结果支撑，证据不足时明确说"未确认"

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
  { type: 'function', function: { name: 'check_certificate', description: '检查 HTTPS 网站 SSL/TLS 证书的有效期和颁发信息，用于排查 HTTPS 连接问题和证书过期预警', parameters: { type: 'object', properties: { host: { type: 'string', description: '目标域名或 IP 地址' }, port: { type: 'integer', description: '端口号，默认 443' } }, required: ['host'] } } },
  { type: 'function', function: { name: 'diagnose_printer', description: '打印机专项一键诊断：依次检查 Ping、打印端口(9100/515/631)、ARP/MAC、Web 管理页，快速定位打印机离线或无法打印问题', parameters: { type: 'object', properties: { host: { type: 'string', description: '打印机 IP 地址' } }, required: ['host'] } } },
  { type: 'function', function: { name: 'diagnose_cctv', description: '监控/NVR 专项一键诊断：依次检查 Ping、监控端口(80/443/554/8000/37777)、Web 管理页，快速定位摄像头或 NVR 离线问题', parameters: { type: 'object', properties: { host: { type: 'string', description: '摄像头或 NVR 的 IP 地址' } }, required: ['host'] } } },
  { type: 'function', function: { name: 'tcp_ping', description: 'TCP 端口延迟测试（TCP Ping），通过建立 TCP 连接测量延迟，比 ICMP Ping 更可靠，适用于禁 ping 的设备', parameters: { type: 'object', properties: { host: { type: 'string', description: '目标 IP 或域名' }, port: { type: 'integer', description: '端口号，默认 80' }, count: { type: 'integer', description: '探测次数，默认 5 次' } }, required: ['host'] } } },
  { type: 'function', function: { name: 'mtu_probe', description: 'MTU 路径探测，自动测试到目标主机的最大传输单元，排查大包丢包、分片、VPN/专线 MTU 不匹配问题', parameters: { type: 'object', properties: { host: { type: 'string', description: '目标 IP 或域名' } }, required: ['host'] } } },
  { type: 'function', function: { name: 'network_quality', description: '网络质量连续测试，统计丢包率、延迟、抖动，评估链路稳定性。适用于卡顿、断流、时断时续等问题', parameters: { type: 'object', properties: { host: { type: 'string', description: '目标 IP 或域名' }, count: { type: 'integer', description: '测试次数，默认 20 次' } }, required: ['host'] } } },
  { type: 'function', function: { name: 'wifi_scan', description: '扫描周围 Wi-Fi 信号，列出可见 SSID、信号强度、信道、加密方式。用于排查 Wi-Fi 干扰、信号弱、漫游问题' } },
  { type: 'function', function: { name: 'check_dhcp', description: '检查本机网卡 DHCP 配置状态，包括是否启用 DHCP、DHCP 服务器地址、当前 IP。用于排查 IP 冲突、获取不到 IP 问题' } },
  { type: 'function', function: { name: 'process_list', description: '查看当前运行进程列表（按 CPU 排序前 25 个），排查 CPU 占用高、内存不足、异常进程、可疑进程' } },
  { type: 'function', function: { name: 'service_list', description: '查看本机所有 Windows 服务状态，排查服务未启动、服务异常停止、依赖服务问题' } },
  { type: 'function', function: { name: 'login_history', description: '查看最近 7 天登录日志（成功登录记录），包括用户名、登录类型、来源 IP。用于排查异常登录、账户安全问题' } },
  { type: 'function', function: { name: 'shared_folders', description: '查看本机共享文件夹列表，排查共享权限、文件共享、勒索病毒横向移动等问题' } },
  { type: 'function', function: { name: 'scheduled_tasks', description: '查看已启用的计划任务列表，排查计划任务异常、恶意程序持久化、定时脚本问题' } },
  { type: 'function', function: { name: 'time_sync', description: '检查系统时间同步状态，包括当前时间、NTP 时间源、同步状态。时间不同步会导致 Kerberos 认证失败、证书错误、日志时间错乱' } },
  { type: 'function', function: { name: 'check_audio', description: '检查音频设备状态（播放设备和录制设备），排查广播系统、收银台语音、麦克风等音频问题' } },
  { type: 'function', function: { name: 'check_pos_peripherals', description: 'POS 收银外设检查，列出串口设备和 HID 扫码设备，排查扫码枪、电子秤、客显、钱箱等外设连接问题' } },
  { type: 'function', function: { name: 'ask_user_check', description: '请求工程师到设备旁检查物理状态。用于确认电源、网线、指示灯、卡纸等工具无法检测的物理问题', parameters: { type: 'object', properties: { question: { type: 'string', description: '需要工程师确认的问题，例如：请检查打印机电源灯是否亮起' }, options: { type: 'array', items: { type: 'string' }, description: '供工程师选择的答案选项，如 [是, 否, 不确定]' } }, required: ['question'] } } },
  { type: 'function', function: { name: 'conn_tracker', description: '查看本机所有 TCP/UDP 网络连接状态统计，排查异常连接、端口占用、僵尸连接', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'domain_whois', description: '查询域名 WHOIS 注册信息，包括注册时间、到期时间、NS 服务器等，用于排查域名解析问题或到期预警', parameters: { type: 'object', properties: { domain: { type: 'string', description: '要查询的域名，如 example.com' } }, required: ['domain'] } } },
  { type: 'function', function: { name: 'http_api_test', description: '测试 HTTP/HTTPS API 接口连通性和响应，用于排查 Web 服务、REST API 或管理接口问题', parameters: { type: 'object', properties: { url: { type: 'string', description: '目标 URL，如 http://192.168.1.1/api/status' }, method: { type: 'string', description: '请求方法，默认 GET' } }, required: ['url'] } } },
  { type: 'function', function: { name: 'snmp_probe', description: 'SNMP v2c 探测网络设备（交换机、路由器、打印机等），获取系统名称、描述和运行时间', parameters: { type: 'object', properties: { host: { type: 'string', description: '目标 IP 地址' }, community: { type: 'string', description: 'SNMP 团体字串，默认 public' } }, required: ['host'] } } },
  { type: 'function', function: { name: 'websocket_test', description: '测试 WebSocket 连接连通性，用于排查实时通信、推送服务或物联网设备连接问题', parameters: { type: 'object', properties: { url: { type: 'string', description: 'WebSocket URL，如 ws://192.168.1.1:8080/ws' } }, required: ['url'] } } },
  { type: 'function', function: { name: 'ptr_lookup', description: '反向 DNS 查询（PTR），通过 IP 地址查询对应的主机名，用于确认设备身份或排查异常 IP', parameters: { type: 'object', properties: { ip: { type: 'string', description: '要查询的 IPv4 地址' } }, required: ['ip'] } } },
  { type: 'function', function: { name: 'tls_scan', description: 'TLS/SSL 协议版本和密码套件扫描，检查支持的 TLS 版本和证书信息，用于安全评估和连接问题排查', parameters: { type: 'object', properties: { host: { type: 'string', description: '目标主机名或 IP' }, port: { type: 'integer', description: '端口号，默认 443' } }, required: ['host'] } } },
  { type: 'function', function: { name: 'traceroute_analyze', description: '路由追踪并自动分析环路和黑洞，排查网络路径异常和路由环路问题', parameters: { type: 'object', properties: { host: { type: 'string', description: '目标 IP 或域名' } }, required: ['host'] } } },
  { type: 'function', function: { name: 'mitm_hints', description: '检测 ARP 表异常，发现同一 MAC 对应多个 IP 等可能的 ARP 欺骗或中间人攻击迹象', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'netflow_listen', description: '监听 NetFlow/sFlow UDP 数据包，用于排查网络设备流量导出配置', parameters: { type: 'object', properties: { port: { type: 'integer', description: '监听端口，默认 2055' }, duration: { type: 'integer', description: '监听秒数，默认 10' } }, required: [] } } },
  { type: 'function', function: { name: 'subnet_calc', description: 'IPv4 子网计算器，输入 CIDR 如 192.168.1.0/24，返回网络地址、广播地址、可用主机数和 IP 范围', parameters: { type: 'object', properties: { cidr: { type: 'string', description: 'CIDR 格式，如 192.168.1.0/24' } }, required: ['cidr'] } } },
  { type: 'function', function: { name: 'route_table', description: '查看本机 IPv4/IPv6 路由表，排查路由异常、默认网关缺失、VPN 路由冲突', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'firewall_status', description: '查看 Windows 防火墙状态、默认规则和常用放行规则，排查端口被防火墙拦截', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'port_occupancy', description: '查看本机端口占用情况，可指定端口或列出所有监听端口及对应进程', parameters: { type: 'object', properties: { port: { type: 'integer', description: '指定端口号，不填则列出所有监听端口' } }, required: [] } } },
  { type: 'function', function: { name: 'ip_info', description: '获取本机网络配置（IP、网关、网卡）和公网 IP，快速确认网络出口', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'dhcp_detect', description: '检测 DHCP 配置状态，识别多 DHCP 服务器和私接路由风险', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'host_discovery', description: '对指定 /24 网段执行 Ping Sweep，发现在线主机', parameters: { type: 'object', properties: { subnet: { type: 'string', description: '网段 CIDR，例如 192.168.1.0/24' } }, required: ['subnet'] } } },
  { type: 'function', function: { name: 'loop_detection', description: '通过 Traceroute 检测网络环路，识别重复 IP 和多跳超时', parameters: { type: 'object', properties: { target: { type: 'string', description: '目标 IP 或域名' } }, required: ['target'] } } },
  { type: 'function', function: { name: 'speed_test', description: '执行外网下载测速，估算当前出口带宽', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'network_health', description: '一键网络健康检查，综合检测网卡、IP、网关、DNS、外网、DHCP 状态', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'arp_table', description: '查看本机 ARP 缓存表，用于核对 IP-MAC 绑定和排查 IP 冲突', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'port_service_probe', description: '连接目标端口并抓取 Banner，识别服务类型（HTTP/FTP/SSH/SMTP 等）', parameters: { type: 'object', properties: { host: { type: 'string', description: '目标 IP 或域名' }, port: { type: 'integer', description: '端口号' } }, required: ['host', 'port'] } } },
  ...extendedAgentTools,
];
const agentToolAllowlist = new Set(['ping', 'dns_lookup', 'check_port', 'check_ports', 'check_arp', 'scan_subnet', 'web_probe', 'trace_route', 'get_network_info', 'get_network_snapshot', 'check_adapter_health', 'check_gateway', 'check_internet', 'get_system_info', 'get_system_errors', 'check_spooler', 'check_drivers', 'query_assets', 'check_certificate', 'diagnose_printer', 'diagnose_cctv', 'tcp_ping', 'mtu_probe', 'network_quality', 'wifi_scan', 'check_dhcp', 'process_list', 'service_list', 'login_history', 'shared_folders', 'scheduled_tasks', 'time_sync', 'check_audio', 'check_pos_peripherals', 'ask_user_check', 'conn_tracker', 'domain_whois', 'http_api_test', 'snmp_probe', 'websocket_test', 'ptr_lookup', 'tls_scan', 'traceroute_analyze', 'mitm_hints', 'netflow_listen', 'subnet_calc', 'route_table', 'firewall_status', 'port_occupancy', 'ip_info', 'dhcp_detect', 'host_discovery', 'loop_detection', 'speed_test', 'network_health', 'arp_table', 'port_service_probe', ...extendedAgentAllowlist]);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.map': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};
const evidenceMimeTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.log': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body));
};

// 静态资源访问控制：默认拒绝敏感目录/后端源码/隐藏文件，只放行前端真正需要的资源类型
const staticExtraAllow = new Set(['/data/oui-compact.json', '/agent/门店现场采集代理.ps1', '/agent/运行门店现场采集.cmd']);
const staticDeniedRoots = new Set(['data', 'server', 'scripts', 'node_modules', 'work', 'release', 'deploy', 'docs', 'external-tools', 'dist', 'screenshots', 'agent', 'ui']);
const staticAllowedExt = new Set(['.html', '.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.map']);
function isStaticPathAllowed(requestPath) {
  const clean = String(requestPath).replace(/\\/g, '/').toLowerCase();
  if (staticExtraAllow.has(clean)) return true;
  const segments = clean.split('/').filter(Boolean);
  if (segments.some((part) => part.startsWith('.'))) return false;
  if (segments.length && staticDeniedRoots.has(segments[0])) return false;
  const ext = extname(clean);
  if (!ext) return true; // 无扩展名路径回退到 index.html（前端路由）
  return staticAllowedExt.has(ext);
}

// 静态资源缓存：内存缓存 + gzip 预压缩 + ETag 协商缓存（304），避免每次请求都读盘并全量传输
const staticCache = new Map();
const STATIC_CACHE_MAX_FILE = 8 * 1024 * 1024;
const STATIC_CACHE_MAX_ENTRIES = 128;
const compressibleTypes = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.map', '.txt']);
async function serveStaticFile(req, res, file) {
  const info = await stat(file);
  if (!info.isFile()) throw new Error('not a file');
  const ext = extname(file).toLowerCase();
  const etag = `W/"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"`;
  const baseHeaders = {
    'Content-Type': types[ext] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
    'ETag': etag,
    'X-Content-Type-Options': 'nosniff',
  };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, baseHeaders);
    return res.end();
  }
  let entry = staticCache.get(file);
  if (!entry || entry.etag !== etag) {
    const raw = await readFile(file);
    entry = { etag, raw, gzip: null };
    if (compressibleTypes.has(ext) && raw.length > 1024) entry.gzip = gzipSync(raw, { level: 6 });
    if (raw.length <= STATIC_CACHE_MAX_FILE) {
      if (staticCache.size >= STATIC_CACHE_MAX_ENTRIES) staticCache.delete(staticCache.keys().next().value);
      staticCache.set(file, entry);
    }
  }
  const acceptsGzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
  if (entry.gzip && acceptsGzip) {
    res.writeHead(200, { ...baseHeaders, 'Content-Encoding': 'gzip', 'Content-Length': entry.gzip.length, 'Vary': 'Accept-Encoding' });
    return res.end(entry.gzip);
  }
  res.writeHead(200, { ...baseHeaders, 'Content-Length': entry.raw.length, 'Vary': 'Accept-Encoding' });
  return res.end(entry.raw);
}
const roleProfiles = {
  super:       { label: '超级管理员', permissions: ['data_read','data_write','tool_run','repair_run','launcher_run','ai_use','audit_read','backup_manage','user_manage','system_config','announce_manage'] },
  manager:     { label: '店长',       permissions: ['data_read','data_write','tool_run','repair_run','launcher_run','ai_use','audit_read','user_manage','announce_manage'] },
  admin:       { label: '管理员',     permissions: ['data_read','data_write','tool_run','repair_run','launcher_run','ai_use','audit_read','backup_manage','user_manage','announce_manage'] },
  distributor: { label: '分销商',     permissions: ['data_read','data_write','tool_run','repair_run','launcher_run','ai_use','audit_read'] },
  user:        { label: '普通用户',   permissions: ['data_read','data_write','tool_run','repair_run','launcher_run','ai_use','audit_read'] },
  engineer:    { label: '运维工程师', permissions: ['data_read','data_write','tool_run','repair_run','launcher_run','ai_use','audit_read'] },
  viewer:      { label: '只读人员',   permissions: ['data_read','tool_run','ai_use'] },
};
const sessionStore = new Map();
const verificationCodeStore = new Map();
const rolePermissions = (role) => roleProfiles[role]?.permissions || roleProfiles.user.permissions;
const safeUser = (user) => user ? ({ id: user.id, username: user.username, email: user.email || '', displayName: user.displayName || user.username, role: user.role, roleLabel: roleProfiles[user.role]?.label || user.role, disabled: Boolean(user.disabled), createdAt: user.createdAt, updatedAt: user.updatedAt }) : null;
const manageableRoles = (role) => {
  if (role === 'super') return ['manager', 'admin', 'distributor', 'engineer', 'user', 'viewer'];
  if (role === 'manager') return ['admin', 'distributor', 'engineer', 'user', 'viewer'];
  if (role === 'admin') return ['distributor', 'engineer', 'user', 'viewer'];
  return [];
};
const authPayload = (user, bootstrapRequired = false, token = null) => ({ ok: true, authenticated: Boolean(user), bootstrapRequired, token, user: safeUser(user), roles: roleProfiles, permissions: user ? rolePermissions(user.role) : [] });
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
function generateVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
function storeVerificationCode(target, purpose) {
  const code = generateVerificationCode();
  const key = `${purpose}:${target.toLowerCase()}`;
  verificationCodeStore.set(key, { code, expiresAt: Date.now() + 10 * 60 * 1000 });
  return code;
}
function verifyCode(target, purpose, code) {
  const key = `${purpose}:${target.toLowerCase()}`;
  const record = verificationCodeStore.get(key);
  if (!record) return false;
  if (record.expiresAt < Date.now()) { verificationCodeStore.delete(key); return false; }
  if (record.code !== String(code || '')) return false;
  verificationCodeStore.delete(key);
  return true;
}
function apiSuccess(res, data = {}, msg = '操作成功', status = 200) {
  return res.status(status).json({ code: 0, msg, data });
}
function apiError(res, msg = '服务异常，请稍后重试', status = 500) {
  return res.status(status).json({ code: -1, msg, data: {} });
}
function requestToken(headers) {
  const headerToken = String(headers.token || '').trim();
  if (headerToken) return headerToken;
  const authorization = String(headers.authorization || '').trim();
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 120;
}
function isQqEmail(email) {
  return /^\d{5,12}@qq\.com$/i.test(email);
}
function clientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || 'unknown').replace(/^::ffff:/, '');
}
function jwtSecret() {
  return String(process.env.JWT_SECRET || '');
}
async function authMiddleware(req, res, next) {
  const token = requestToken(req.headers);
  if (!token || !jwtSecret()) return apiError(res, '未登录或登录已过期', 401);
  try {
    const payload = jwt.verify(token, jwtSecret());
    const userId = Number(payload.userId);
    if (!Number.isInteger(userId) || userId < 1) return apiError(res, '登录凭证无效', 401);
    const [rows] = await mysqlPool.execute('SELECT id, email, nickname, role FROM `user` WHERE id = ? LIMIT 1', [userId]);
    if (!rows.length) return apiError(res, '用户不存在或已失效', 401);
    req.user = { userId: rows[0].id, email: rows[0].email, nickname: rows[0].nickname, role: rows[0].role };
    return next();
  } catch {
    return apiError(res, '未登录或登录已过期', 401);
  }
}
function adminMiddleware(req, res, next) {
  const allowedRoles = ['super', 'manager', 'admin'];
  if (!allowedRoles.includes(req.user?.role)) return apiError(res, '无管理权限', 403);
  return next();
}
function superMiddleware(req, res, next) {
  if (req.user?.role !== 'super') return apiError(res, '需要超级管理员权限', 403);
  return next();
}
async function authContext(req) {
  const headerToken = requestToken(req.headers);
  if (headerToken && jwtSecret()) {
    try {
      const payload = jwt.verify(headerToken, jwtSecret());
      const userId = Number(payload.userId);
      if (Number.isInteger(userId) && userId > 0) {
        const [rows] = await mysqlPool.execute('SELECT id, email, nickname, role, create_at FROM `user` WHERE id = ? LIMIT 1', [userId]);
        if (rows.length) {
          const dbUser = rows[0];
          return {
            token: headerToken,
            user: { id: `MYSQL-${dbUser.id}`, username: dbUser.email, displayName: dbUser.nickname || dbUser.email, role: dbUser.role, disabled: false, createdAt: dbUser.create_at },
            store: await readStore(),
          };
        }
      }
    } catch { /* fall through to the legacy cookie session */ }
  }
  // Accept session token from either the cookie or the Authorization header (for frontend Bearer token auth)
  const token = parseCookies(req).opshub_session || headerToken || null;
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
const repairToolIds = new Set(['flush-dns', 'renew-dhcp', 'repair-network', 'repair-printer', 'repair-printer-queue', 'spooler-start', 'print-test', 'desktop-optimizer', 'office-repair', 'windows-repair', 'data-migration', 'software-uninstall', 'firewall-manager', 'route-manager']);
const launchToolIds = new Set(['rdp', 'open-web', 'system-launcher']);
const systemLauncherRegistry = [
  { id: 'terminal', name: '命令提示符', command: 'cmd.exe', args: [] },
  { id: 'powershell', name: 'PowerShell', command: 'powershell.exe', args: ['-NoExit', '-NoLogo'] },
  { id: 'admin-terminal', name: '管理员命令提示符', elevated: true },
  { id: 'windows-settings', name: 'Windows 设置', command: 'explorer.exe', args: ['ms-settings:'] },
  { id: 'network-adapters', name: '网络连接', command: 'control.exe', args: ['ncpa.cpl'] },
  { id: 'firewall', name: 'Windows 防火墙', command: 'control.exe', args: ['/name', 'Microsoft.WindowsFirewall'] },
  { id: 'device-manager', name: '设备管理器', command: 'mmc.exe', args: ['devmgmt.msc'] },
  { id: 'task-manager', name: '任务管理器', command: 'taskmgr.exe', args: [] },
  { id: 'system-info', name: '系统信息', command: 'msinfo32.exe', args: [] },
  { id: 'registry', name: '注册表编辑器', command: 'regedit.exe', args: [] },
  { id: 'event-viewer', name: '事件查看器', command: 'mmc.exe', args: ['eventvwr.msc'] },
  { id: 'disk-management', name: '磁盘管理', command: 'mmc.exe', args: ['diskmgmt.msc'] },
  { id: 'services', name: '服务管理', command: 'mmc.exe', args: ['services.msc'] },
  { id: 'performance', name: '性能监视器', command: 'perfmon.exe', args: [] },
  { id: 'resource-monitor', name: '资源监视器', command: 'resmon.exe', args: [] },
  { id: 'computer-management', name: '计算机管理', command: 'mmc.exe', args: ['compmgmt.msc'] },
  { id: 'control-panel', name: '控制面板', command: 'control.exe', args: [] },
  { id: 'rdp-client', name: '远程桌面客户端', command: 'mstsc.exe', args: [] },
].map(item => Object.freeze(item));
const controlledRepairPlans = {
  'desktop-optimizer': {
    title: '电脑优化计划',
    actions: [
      { id: 'temp-files', label: '清理当前用户临时文件', risk: '低：仅处理当前用户临时目录中的可删除文件。', rollback: '临时文件无法逐项恢复，不会触及桌面、文档或下载目录。', requiresAdmin: false },
      { id: 'dns-cache', label: '刷新 DNS 缓存', risk: '低：短暂清除本机域名解析缓存。', rollback: '系统会在后续访问时自动重新解析 DNS。', requiresAdmin: true },
      { id: 'startup-report', label: '生成启动项优化建议', risk: '无：只读采集，不修改启动项。', rollback: '无需回滚。', requiresAdmin: false },
    ],
  },
  'office-repair': {
    title: 'Office / WPS 修复计划',
    actions: [
      { id: 'office-cache', label: '清理 Office 文件缓存', risk: '中：会移除本机 Office 文档缓存，未同步文件可能需要重新打开或同步。', rollback: '执行前自动创建本地备份目录；可从备份恢复。', requiresAdmin: false },
      { id: 'office-association-report', label: '生成文件关联修复建议', risk: '无：只读检查 Word、Excel、PPT 的默认关联。', rollback: '无需回滚。', requiresAdmin: false },
      { id: 'office-repair-guide', label: '打开 Microsoft 365 / Office 修复入口', risk: '低：仅打开 Windows 应用修复入口，不自动卸载或重装。', rollback: '无需回滚；由工程师在系统界面确认后继续。', requiresAdmin: false },
    ],
  },
  'windows-repair': {
    title: 'Windows 受控修复计划',
    actions: [
      { id: 'dism-checkhealth', label: '检查 Windows 组件存储健康', risk: '无：只读取组件存储健康状态。', rollback: '无需回滚。', requiresAdmin: false },
      { id: 'system-file-check', label: '运行系统文件检查与修复', risk: '中：SFC 会验证并修复受保护的系统文件，执行时间可能较长。', rollback: 'Windows 自动保留组件修复记录；若问题持续可结合还原点或 DISM 继续处理。', requiresAdmin: true },
      { id: 'file-association-report', label: '检查常用文件关联', risk: '无：只读取 .docx、.xlsx、.pptx、.pdf 的默认关联。', rollback: '无需回滚。', requiresAdmin: false },
      { id: 'windows-update-status', label: '检查 Windows Update 服务与最近更新', risk: '无：只读取更新服务、待重启状态和最近安装记录。', rollback: '无需回滚。', requiresAdmin: false },
      { id: 'windows-update-guide', label: '打开 Windows Update 修复入口', risk: '低：仅打开系统更新页面，不自动安装或卸载补丁。', rollback: '无需回滚；补丁安装由工程师在系统界面确认。', requiresAdmin: false },
      { id: 'open-default-apps', label: '打开默认应用和文件关联入口', risk: '低：仅打开 Windows 默认应用设置页，不直接改写文件关联。', rollback: '无需回滚；由工程师在系统界面选择默认应用。', requiresAdmin: false },
      { id: 'network-stack-reset', label: '重置网络协议栈（需重启）', risk: '高：重置 Winsock 与 TCP/IP 配置，可能导致 VPN、静态 IP 或自定义网络设置失效，完成后必须重启。', rollback: '执行前记录 IP、DNS、代理和 VPN 配置；如使用静态地址或专用 VPN，请在重启后按原记录恢复。', requiresAdmin: true },
    ],
  },
  'data-migration': {
    title: '桌面数据迁移计划',
    actions: [
      { id: 'migration-preflight', label: '检查可迁移的用户资料', risk: '无：只统计桌面、文档、书签与 Outlook 数据文件位置。', rollback: '无需回滚。', requiresAdmin: false },
      { id: 'stage-user-data', label: '生成用户资料迁移包', risk: '中：会复制常用用户资料到本机迁移目录，受 5GB 上限保护。', rollback: '不会删除原文件；不需要迁移包时可删除输出目录。', requiresAdmin: false },
      { id: 'export-printer-config', label: '导出打印机配置', risk: '低：尝试导出打印机、端口和驱动配置到迁移目录。', rollback: '不修改现有打印机；不需要时删除导出文件。', requiresAdmin: true },
      { id: 'restore-latest-staging', label: '恢复最近一次迁移资料到独立恢复区', risk: '低：只将最近迁移包复制到“文档\\ITOps-Restored-时间”目录，不覆盖桌面、文档或原迁移包。', rollback: '恢复区可在核对后手动删除，原文件与迁移包保持不变。', requiresAdmin: false },
    ],
  },
  'software-uninstall': {
    title: '软件卸载受控计划',
    actions: [
      { id: 'msi-uninstall', label: '静默卸载精确选定的 MSI 软件', risk: '高：仅允许从本机登记的 MSI 产品中选择，执行后会移除该软件；不会接受命令行或任意卸载参数。', rollback: '卸载前请确认安装包、许可证和业务数据已备份；需要恢复时使用原厂安装包重新安装。', requiresAdmin: true },
      { id: 'open-app-settings', label: '打开 Windows 已安装应用页面', risk: '低：只打开系统设置，不修改软件。', rollback: '无需回滚。', requiresAdmin: false },
    ],
  },
};
function controlledRepairPlan(toolId) { return controlledRepairPlans[toolId] || null; }
function selectedControlledActions(toolId, actions) {
  const plan = controlledRepairPlan(toolId);
  if (!plan || !Array.isArray(actions) || !actions.length || actions.length > plan.actions.length) return null;
  const allowed = new Map(plan.actions.map((item) => [item.id, item]));
  const ids = [...new Set(actions.map((item) => String(item || '').trim()))];
  if (ids.length !== actions.length || ids.some((id) => !allowed.has(id))) return null;
  return ids.map((id) => allowed.get(id));
}
function isMsiProductCode(value) { return /^\{[0-9A-Fa-f-]{36}\}$/.test(String(value || '').trim()); }
async function listMsiProducts() {
  const result = await runPowerShell("$paths = 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'; @((Get-ItemProperty $paths -ErrorAction SilentlyContinue | Where-Object { $_.WindowsInstaller -eq 1 -and $_.DisplayName -and $_.PSChildName -match '^\\{[0-9A-Fa-f-]{36}\\}$' } | Select-Object @{Name='productCode';Expression={$_.PSChildName}},@{Name='name';Expression={$_.DisplayName}},@{Name='version';Expression={$_.DisplayVersion}},@{Name='publisher';Expression={$_.Publisher}} | Sort-Object name | Select-Object -First 120) | ConvertTo-Json -Compress)", 25000);
  if (!result.ok) return [];
  try {
    const parsed = JSON.parse(String(result.output || '[]'));
    return (Array.isArray(parsed) ? parsed : [parsed]).filter((item) => item && isMsiProductCode(item.productCode)).map((item) => ({ productCode: String(item.productCode), name: String(item.name || '').slice(0, 160), version: String(item.version || '').slice(0, 80), publisher: String(item.publisher || '').slice(0, 120) }));
  } catch { return []; }
}
async function runControlledRepair(toolId, actions, options = {}) {
  const selected = selectedControlledActions(toolId, actions);
  if (!selected) return { ok: false, output: '修复动作不在当前工具的受控清单内。' };
  const productCode = String(options.productCode || '').trim();
  if (selected.some((item) => item.id === 'msi-uninstall') && !isMsiProductCode(productCode)) return { ok: false, output: '请从本机登记的 MSI 软件清单中精确选择需要卸载的产品。' };
  const taskMap = {
    'desktop-optimizer': {
      'temp-files': () => runPowerShell("$path = [IO.Path]::GetTempPath(); $files = Get-ChildItem -LiteralPath $path -Force -Recurse -ErrorAction SilentlyContinue | Where-Object { -not $_.PSIsContainer }; $before = ($files | Measure-Object Length -Sum).Sum; $removed = 0; foreach ($file in $files) { try { Remove-Item -LiteralPath $file.FullName -Force -ErrorAction Stop; $removed++ } catch {} }; \"已清理 $removed 个当前用户临时文件，预计释放 $([math]::Round(($before / 1MB), 2)) MB。\"", 30000),
      'dns-cache': () => run('ipconfig', ['/flushdns'], 8000),
      'startup-report': () => runPowerShell("Get-CimInstance Win32_StartupCommand | Select-Object Name,Command,Location,User | Sort-Object Name | Format-Table -AutoSize", 15000),
    },
    'office-repair': {
      'office-cache': () => runPowerShell("$apps = Get-Process WINWORD,EXCEL,POWERPNT,OUTLOOK -ErrorAction SilentlyContinue; if ($apps) { throw '检测到 Office 程序仍在运行，请先关闭 Word、Excel、PowerPoint 和 Outlook 后再清理缓存。' }; $cache = Join-Path $env:LOCALAPPDATA 'Microsoft\\Office\\16.0\\OfficeFileCache'; if (-not (Test-Path -LiteralPath $cache)) { '未发现 Office 文件缓存，无需清理。'; return }; $backup = Join-Path $env:LOCALAPPDATA ('ITOpsToolbox\\OfficeCacheBackup-' + (Get-Date -Format 'yyyyMMddHHmmss')); New-Item -ItemType Directory -Path $backup -Force | Out-Null; Copy-Item -LiteralPath $cache -Destination $backup -Recurse -Force; $files = Get-ChildItem -LiteralPath $cache -Force -Recurse -ErrorAction SilentlyContinue; $count = @($files).Count; Remove-Item -LiteralPath $cache -Recurse -Force -ErrorAction Stop; \"已清理 $count 个 Office 缓存项。备份位置：$backup\"", 45000),
      'office-association-report': () => runPowerShell("$extensions = '.docx','.xlsx','.pptx','.pdf'; foreach ($ext in $extensions) { $choice = Get-ItemProperty \"HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\$ext\\UserChoice\" -ErrorAction SilentlyContinue; [pscustomobject]@{ Extension = $ext; ProgId = $choice.ProgId } } | Format-Table -AutoSize", 15000),
      'office-repair-guide': () => runPowerShell("Start-Process 'ms-settings:appsfeatures'; '已打开 Windows 应用和功能。选择 Microsoft 365 / Office 后进入高级选项，按需执行快速修复或联机修复。'", 8000),
    },
    'windows-repair': {
      'dism-checkhealth': () => run('DISM.exe', ['/Online', '/Cleanup-Image', '/CheckHealth'], 30000),
      'system-file-check': () => run('sfc.exe', ['/scannow'], 20 * 60 * 1000),
      'file-association-report': () => runPowerShell("$extensions = '.docx','.xlsx','.pptx','.pdf'; $results = foreach ($ext in $extensions) { $choice = Get-ItemProperty \"HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\$ext\\UserChoice\" -ErrorAction SilentlyContinue; [pscustomobject]@{ Extension = $ext; ProgId = $choice.ProgId } }; $results | Format-Table -AutoSize", 15000),
      'windows-update-status': () => runPowerShell("Get-Service wuauserv,bits,cryptsvc,usosvc -ErrorAction SilentlyContinue | Select-Object Name,DisplayName,Status,StartType | Format-Table -AutoSize; ''; $reboot = Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired'; [pscustomobject]@{ RestartRequired=$reboot } | Format-Table -AutoSize; ''; Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 12 HotFixID,Description,InstalledOn | Format-Table -AutoSize", 30000),
      'windows-update-guide': () => runPowerShell("Start-Process 'ms-settings:windowsupdate'; '已打开 Windows Update 页面。建议先记录失败代码，再执行检查更新或疑难解答。'", 8000),
      'open-default-apps': () => runPowerShell("Start-Process 'ms-settings:defaultapps'; '已打开 Windows 默认应用设置。可搜索文件扩展名或应用后手动调整关联。'", 8000),
      'network-stack-reset': () => runPowerShell("netsh winsock reset; netsh int ip reset; '网络协议栈已重置。请先记录输出中的失败项，然后重启 Windows；静态 IP、VPN 或代理配置需要按执行前记录核对。'", 30000),
    },
    'data-migration': {
      'migration-preflight': () => runPowerShell("$sources = @([pscustomobject]@{Name='Desktop';Path=[Environment]::GetFolderPath('Desktop')},[pscustomobject]@{Name='Documents';Path=[Environment]::GetFolderPath('MyDocuments')},[pscustomobject]@{Name='Favorites';Path=(Join-Path $env:USERPROFILE 'Favorites')},[pscustomobject]@{Name='ChromeBookmarks';Path=(Join-Path $env:LOCALAPPDATA 'Google\\Chrome\\User Data\\Default\\Bookmarks')},[pscustomobject]@{Name='EdgeBookmarks';Path=(Join-Path $env:LOCALAPPDATA 'Microsoft\\Edge\\User Data\\Default\\Bookmarks')},[pscustomobject]@{Name='OutlookFiles';Path=(Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Outlook Files')}); $sources | ForEach-Object { $exists = Test-Path -LiteralPath $_.Path; $bytes = if ($exists) { (Get-ChildItem -LiteralPath $_.Path -Force -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum } else { 0 }; [pscustomobject]@{ Name=$_.Name; Exists=$exists; Path=$_.Path; SizeMB=[math]::Round(($bytes / 1MB),2) } } | Format-Table -AutoSize", 30000),
      'stage-user-data': () => runPowerShell("$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'; $destination = Join-Path $env:LOCALAPPDATA ('ITOpsToolbox\\Migrations\\' + $stamp); New-Item -ItemType Directory -Path $destination -Force | Out-Null; $sources = @([pscustomobject]@{Name='Desktop';Path=[Environment]::GetFolderPath('Desktop')},[pscustomobject]@{Name='Documents';Path=[Environment]::GetFolderPath('MyDocuments')},[pscustomobject]@{Name='Favorites';Path=(Join-Path $env:USERPROFILE 'Favorites')},[pscustomobject]@{Name='ChromeBookmarks';Path=(Join-Path $env:LOCALAPPDATA 'Google\\Chrome\\User Data\\Default\\Bookmarks')},[pscustomobject]@{Name='EdgeBookmarks';Path=(Join-Path $env:LOCALAPPDATA 'Microsoft\\Edge\\User Data\\Default\\Bookmarks')},[pscustomobject]@{Name='OutlookFiles';Path=(Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Outlook Files')}); $total = 0; foreach ($source in $sources) { if (Test-Path -LiteralPath $source.Path) { $total += (Get-ChildItem -LiteralPath $source.Path -Force -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum } }; if ($total -gt 5GB) { throw ('可迁移资料约 {0} GB，超过 5GB 安全上限。请先选择需要迁移的资料。' -f [math]::Round($total / 1GB,2)) }; foreach ($source in $sources) { if (-not (Test-Path -LiteralPath $source.Path)) { continue }; $target = Join-Path $destination $source.Name; if ((Get-Item -LiteralPath $source.Path).PSIsContainer) { Copy-Item -LiteralPath $source.Path -Destination $target -Recurse -Force -ErrorAction Stop } else { New-Item -ItemType Directory -Path $target -Force | Out-Null; Copy-Item -LiteralPath $source.Path -Destination (Join-Path $target (Split-Path $source.Path -Leaf)) -Force -ErrorAction Stop } }; [pscustomobject]@{ MigrationFolder=$destination; SizeMB=[math]::Round($total / 1MB,2); Note='已复制资料，原文件未删除。' } | Format-List", 180000),
      'export-printer-config': () => runPowerShell("$destination = Join-Path $env:LOCALAPPDATA 'ITOpsToolbox\\Migrations'; New-Item -ItemType Directory -Path $destination -Force | Out-Null; $file = Join-Path $destination ('printers-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.printerExport'); $printBrm = Join-Path $env:WINDIR 'System32\\spool\\tools\\PrintBrm.exe'; if (Test-Path -LiteralPath $printBrm) { & $printBrm -b -f $file; if ($LASTEXITCODE -ne 0) { throw \"PrintBRM 导出失败，退出代码：$LASTEXITCODE\" }; \"打印配置已导出：$file\" } else { Get-Printer | Select-Object Name,DriverName,PortName,PrinterStatus | Format-Table -AutoSize; '系统未提供 PrintBRM，仅输出当前打印机清单。' }", 60000),
      'restore-latest-staging': () => runPowerShell("$root = Join-Path $env:LOCALAPPDATA 'ITOpsToolbox\\Migrations'; if (-not (Test-Path -LiteralPath $root)) { throw '未找到迁移资料目录，请先执行“生成用户资料迁移包”。' }; $source = Get-ChildItem -LiteralPath $root -Directory | Where-Object Name -match '^\\d{8}-\\d{6}$' | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if (-not $source) { throw '未找到可恢复的迁移包。' }; $target = Join-Path ([Environment]::GetFolderPath('MyDocuments')) ('ITOps-Restored-' + (Get-Date -Format 'yyyyMMdd-HHmmss')); New-Item -ItemType Directory -Path $target -Force | Out-Null; Copy-Item -LiteralPath (Join-Path $source.FullName '*') -Destination $target -Recurse -Force -ErrorAction Stop; [pscustomobject]@{ Source=$source.FullName; RestoreFolder=$target; Note='已恢复到独立目录，未覆盖桌面、文档或原迁移包。请核验后再手工合并。' } | Format-List", 180000),
    },
    'software-uninstall': {
      'msi-uninstall': () => runPowerShell(`$productCode = '${productCode}'; $paths = 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'; $app = Get-ItemProperty $paths -ErrorAction SilentlyContinue | Where-Object { $_.WindowsInstaller -eq 1 -and $_.PSChildName -eq $productCode -and $_.DisplayName } | Select-Object -First 1 DisplayName,DisplayVersion,Publisher,PSChildName; if (-not $app) { throw '未在本机 MSI 卸载登记中找到该产品，已取消执行。' }; $process = Start-Process msiexec.exe -ArgumentList @('/x', $productCode, '/qn', '/norestart') -Wait -PassThru; [pscustomobject]@{ DisplayName=$app.DisplayName; Version=$app.DisplayVersion; ProductCode=$productCode; ExitCode=$process.ExitCode; Result=if ($process.ExitCode -eq 0) { '卸载完成' } elseif ($process.ExitCode -eq 3010) { '卸载完成，需要重启 Windows' } else { '卸载程序返回异常代码' } } | Format-List; if ($process.ExitCode -notin 0,3010) { throw ('msiexec 返回代码：' + $process.ExitCode) }`, 10 * 60 * 1000),
      'open-app-settings': () => runPowerShell("Start-Process 'ms-settings:appsfeatures'; '已打开 Windows 已安装应用页面。'", 8000),
    },
  };
  const tasks = selected.map((action) => ({ name: action.label, task: taskMap[toolId][action.id] }));
  return runAuditedAction('受控桌面修复', `${controlledRepairPlan(toolId).title}：${selected.map((item) => item.label).join('、')}`, () => bundleChecks(tasks));
}
function requiredPermission(pathname, method) {
  if (pathname === '/api/auth/me' || pathname === '/api/auth/login' || pathname === '/api/auth/logout' || pathname === '/api/auth/bootstrap' || pathname === '/api/auth/register' || pathname === '/api/auth/verify-code' || pathname === '/api/auth/reset-password') return null;
  if (pathname.startsWith('/api/auth/users')) return 'user_manage';
  if (pathname.startsWith('/api/ai/')) return 'ai_use';
  if (pathname === '/api/audits') return 'audit_read';
  if (pathname.startsWith('/api/backup/')) return 'backup_manage';
  if (pathname.startsWith('/api/remote/')) return method === 'GET' ? 'data_read' : 'launcher_run';
  if (pathname.startsWith('/api/serial/')) return method === 'GET' ? 'data_read' : 'launcher_run';
  if (pathname === '/api/packet-capture/start' || pathname === '/api/packet-capture/stop') return 'repair_run';
  if (pathname.startsWith('/api/packet-capture/')) return 'data_read';
  if (pathname === '/api/tools/external/launch') return 'launcher_run';
  if (pathname.startsWith('/api/tools/')) {
    const toolId = pathname.slice('/api/tools/'.length).split('/')[0];
    if (repairToolIds.has(toolId) && method !== 'GET') return 'repair_run';
    if (launchToolIds.has(toolId)) return 'launcher_run';
    // Read-only diagnostics run entirely on this machine and must remain usable
    // when the cloud account is unavailable or the network is disconnected.
    return null;
  }
  if (pathname === '/api/ocr/image' || pathname === '/api/evidence' && method === 'POST' || pathname === '/api/agent-reports/import') return 'data_write';
  // 服务器监控上报不需要登录（由远程 Linux 服务器 agent 直接 POST）
  if (pathname === '/api/server/monitor/report') return null;
  if (pathname === '/api/server/monitor/agent-script') return null;
  if (pathname.startsWith('/api/server/monitor/')) return method === 'GET' ? 'data_read' : 'data_write';
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
  if (!value || !['ITOpsToolboxAgentReport/1', 'OpsHubAgentReport/1'].includes(value.format) || typeof value.computer !== 'object') throw new Error('不是有效的 IT 运维百宝箱门店采集包。');
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
  // Serializing reads behind pending writes prevents a transient empty store
  // while the first atomic data file is being created.
  await storeWriteQueue;
  for (const candidate of [storePath, storeBackupPath, legacyStorePath, legacyStoreBackupPath]) { try { return normalizeStore(JSON.parse(await readFile(candidate, 'utf8'))); } catch { /* try the fallback copy */ } }
  return emptyStore();
}
async function writeStore(store) {
  const serialized = JSON.stringify(normalizeStore(store), null, 2); const tempPath = join(dataDir, `.it-ops-toolbox-${process.pid}-${++storeWriteCounter}.tmp`);
  const task = storeWriteQueue.then(async () => { await mkdir(dataDir, { recursive: true }); await writeFile(tempPath, serialized, 'utf8'); if (existsSync(storePath)) await copyFile(storePath, storeBackupPath); await rename(tempPath, storePath); });
  storeWriteQueue = task.catch(() => {}); return task;
}
async function buildPortableBackup(store) {
  const evidenceFiles = []; let totalBytes = 0;
  for (const item of store.evidence) {
    if (!/^[A-Za-z0-9._-]+$/.test(item.storedName || '')) continue;
    try { const data = await readFile(join(evidenceDir, item.storedName)); totalBytes += data.length; if (totalBytes > 50 * 1024 * 1024) throw new Error('证据附件总量超过 50MB，请先归档旧附件再导出。'); evidenceFiles.push({ id: item.id, data: data.toString('base64') }); } catch (error) { if (/超过 50MB/.test(error.message)) throw error; }
  }
  return { exportedAt: new Date().toISOString(), format: 'ITOpsToolboxBackup/2', data: store, evidenceFiles };
}
async function restoreBackupEvidence(store, backup) {
  if (!['ITOpsToolboxBackup/2', 'OpsHubBackup/2'].includes(backup.format)) return 0;
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
  { id: 'KB-PRINTER', title: '门店打印机与小票机排查', category: '打印', keywords: ['打印', '小票', 'spooler', '9100', '队列'], content: '1. 检查物理状态：电源指示灯、纸张是否充足、是否卡纸、网线/USB 是否松动。\n2. 网络连通性：Ping 打印机 IP，测试 9100/515/631 端口是否开放，核对 ARP/MAC 表。\n3. 本机打印服务：检查 Print Spooler 是否运行；查看默认打印机、打印队列和驱动状态。\n4. 常见处理：重启 Print Spooler；清空队列前需人工确认会丢失待打印任务；重新安装或更新驱动。\n5. 官方支持：惠普 https://support.hp.com/cn-zh、爱普生 https://support.epson.net/' },
  { id: 'KB-CCTV', title: '摄像头与 NVR 无画面排查', category: '监控', keywords: ['摄像', '监控', 'nvr', 'rtsp', 'poe', '554'], content: '1. 区分故障范围：单路无画面、多路无画面、整店无画面或 NVR  itself 异常。\n2. 网络检查：Ping NVR 和摄像头 IP，检查 80/443/554/8000/37777 端口，核对 ARP/MAC。\n3. 现场检查：PoE 供电是否正常；交换机端口指示灯；网线水晶头；摄像头电源适配器。\n4. NVR 侧：检查通道配置、IP 段、用户名密码；查看硬盘状态、录像计划、解码能力。\n5. 官方支持：海康威视 https://www.hikvision.com/cn/support/、大华 https://www.dahuatech.com/support、宇视 https://www.uniview.com/support/' },
  { id: 'KB-NETWORK', title: '门店网络中断排查', category: '网络', keywords: ['网络', '网关', 'dns', 'dhcp', 'wifi', '外网'], content: '1. 确认故障范围：单台设备、局部区域还是全店断网。\n2. 本机检查：IP 地址、子网掩码、网关、DNS 是否通过 DHCP 正常获取。\n3. 网关连通：Ping 网关、Ping 公网 IP（如 223.5.5.5）、nslookup 公网域名。\n4. 链路排查：网卡指示灯、网线、交换机端口、光猫/路由器状态灯。\n5. 变更安全：修改 DNS/DHCP/VLAN 前记录原配置并保留回滚方式。\n6. 官方支持：华为 https://support.huawei.com/enterprise/、新华三 https://www.h3c.com/cn/Service/Document_Software/Document_Center/、TP-Link https://www.tp-link.com/cn/support/download/' },
  { id: 'KB-PC', title: '桌面电脑卡顿、蓝屏与软件异常', category: '桌面', keywords: ['电脑', '卡顿', '蓝屏', '软件', '磁盘', '驱动'], content: '1. 保全证据：截图蓝屏代码/错误窗口，记录发生时间和涉及业务数据。\n2. 资源检查：磁盘空间是否不足、磁盘 SMART 健康度、CPU/内存占用 TOP 进程。\n3. 日志分析：事件查看器系统日志、应用程序日志、Windows Update 历史。\n4. 驱动与补丁：检查设备管理器异常设备；更新或回滚问题驱动。\n5. 处理原则：不要直接重装系统掩盖根因；涉及驱动和补丁前应建立还原点。\n6. 官方支持：戴尔 https://www.dell.com/support/home/zh-cn、联想 https://support.lenovo.com/cn/zh/' },
  { id: 'KB-POS', title: 'POS 机与收银机故障排查', category: '业务', keywords: ['pos', '收银', '刷卡', '小票', '钱箱'], content: '1. 基础检查：电源、显示器、键盘/扫码枪/USB 外设连接。\n2. 网络业务：确认 POS 能 Ping 通总部/支付网关，DNS 解析正常。\n3. 支付问题：检查刷卡器连接、驱动、支付控件版本；测试小额交易。\n4. 小票/钱箱：检查小票机纸张、Print Spooler、钱箱线缆连接。\n5. 软件问题：重启收银软件；检查日志；必要时重新安装或回滚版本。' },
  { id: 'KB-WIFI', title: '门店 Wi-Fi 故障排查', category: '无线', keywords: ['wifi', '无线', 'ap', 'ssid', '信号'], content: '1. 确认范围：单设备还是多设备无法连接。\n2. AP 状态：检查 AP 指示灯、PoE 供电、交换机端口。\n3. 信号与信道：查看 AP 是否离线、信道是否冲突、信号覆盖是否到位。\n4. 认证排查：确认 SSID、密码、VLAN、DHCP 地址池、AC 认证策略。\n5. 官方支持：锐捷 https://www.ruijie.com.cn/fw/wd/、Ubiquiti https://help.ui.com/' },
  { id: 'KB-AD', title: 'Windows 域与 AD 登录问题', category: '系统', keywords: ['ad', '域', '登录', '账号', '密码'], content: '1. 客户端检查：确认已加入域、网络可达域控、DNS 指向域控。\n2. 账号排查：账号是否锁定、密码是否过期、OU 是否被移动。\n3. 域控检查：AD 服务、DNS 服务、SYSVOL/NETLOGON 共享是否正常。\n4. 日志定位：客户端事件查看器安全/系统日志、域控 Directory Service 日志。\n5. 官方支持：Microsoft Learn https://learn.microsoft.com/zh-cn/' },
  { id: 'KB-BACKUP', title: '数据备份与恢复操作', category: '备份', keywords: ['备份', '恢复', 'nas', '硬盘'], content: '1. 备份策略：确认备份范围、周期、保留时长和异地存储。\n2. 常见工具：Windows Server Backup、Veeam、Synology Active Backup。\n3. 恢复演练：定期验证备份可恢复性，记录恢复 RTO/RPO。\n4. 官方支持：群晖 https://www.synology.com/zh-cn/support/download' },
  { id: 'KB-POS-PERIPHERALS', title: 'POS 外设（扫码枪/钱箱/电子秤/客显）排查', category: '业务', keywords: ['扫码枪', '钱箱', '电子秤', '客显', 'pos', '外设', 'com', 'usb'], content: '1. 连接与供电：检查 USB/串口线是否松动，钱箱是否通过小票机驱动，电子秤是否独立供电。\n2. 设备识别：在设备管理器或 POS 软件外设设置中查看设备是否被识别。\n3. 扫码枪：确认扫码枪处于正确接口模式（USB HID/串口）；扫描配置码恢复出厂设置。\n4. 钱箱：检查 RJ11/RJ12 线缆连接小票机钱箱口；测试手动弹开是否顺畅。\n5. 电子秤：确认串口参数（波特率/数据位/校验）与 POS 软件一致；归零与校准。\n6. 官方支持：Zebra https://www.zebra.com/us/en/support-downloads.html、Datalogic https://www.datalogic.com/eng/support.html' },
  { id: 'KB-MONITOR', title: '显示器/收银屏/触摸屏故障排查', category: '外设', keywords: ['显示器', '屏幕', '触摸屏', '收银屏', '无画面', '花屏'], content: '1. 电源与信号：确认电源指示灯、视频线（HDMI/DP/VGA/LVDS）连接牢固。\n2. 无画面：切换输入源，排查显卡/主板输出，外接显示器对比测试。\n3. 花屏/闪屏：更换视频线，检查显卡驱动，降低分辨率/刷新率测试。\n4. 触摸屏失灵：清洁屏幕，重新校准，检查 USB 触摸屏控制器是否被识别。\n5. 官方支持：Elo Touch https://www.elotouch.com/support、戴尔 https://www.dell.com/support/home/zh-cn' },
  { id: 'KB-UPS', title: 'UPS 与 PDU 供电排查', category: '基础设施', keywords: ['ups', 'pdu', '电源', '断电', '电池'], content: '1. 状态检查：UPS 市电输入、电池状态、负载容量指示灯/液晶屏。\n2. 断电测试：模拟市电中断，确认 UPS 能切换并维持关键设备运行。\n3. 电池维护：定期充放电，记录电池更换周期，避免长期浮充导致老化。\n4. PDU：检查空开、插座、电流负载，避免超载和发热。\n5. 官方支持：APC/Schneider https://www.se.com/cn/zh/support/、Eaton https://www.eaton.com.cn/support' },
  { id: 'KB-FIREWALL-VPN', title: '防火墙与 VPN 连接排查', category: '安全', keywords: ['防火墙', 'vpn', 'ipsec', 'ssl', '策略'], content: '1. 基础连通：Ping 防火墙管理口，检查 HTTPS/SSH 管理访问。\n2. VPN 排查：确认对端公网 IP/域名、预共享密钥、IKE/IPsec 参数、NAT 穿越。\n3. 策略检查：安全策略是否放行流量，路由是否指向 VPN 隧道接口。\n4. 日志分析：查看防火墙系统日志、VPN 协商日志定位失败阶段。\n5. 官方支持：Fortinet https://docs.fortinet.com/、Hillstone https://www.hillstonenet.com.cn/support、华为 https://support.huawei.com/enterprise/' },
  { id: 'KB-SERVER', title: '服务器硬件与 RAID 排查', category: '系统', keywords: ['服务器', 'raid', '硬盘', '内存', '电源', 'bmc'], content: '1. 指示灯：电源、硬盘、内存、网卡、RAID 卡指示灯状态。\n2. BMC/iLO/iDRAC：通过带外管理查看硬件健康、传感器温度和日志。\n3. RAID：检查磁盘状态（Online/Failed/Rebuild），热备盘是否启用。\n4. 常见处理：更换故障硬盘后观察 Rebuild；内存报错则重新插拔或替换。\n5. 官方支持：戴尔 https://www.dell.com/support/home/zh-cn、惠普 https://support.hpe.com/hpesc/public/home、联想 https://support.lenovo.com/cn/zh/' },
  { id: 'KB-ANTIVIRUS', title: '终端安全与杀毒软件排查', category: '安全', keywords: ['杀毒', '病毒', '安全', '勒索', '防火墙'], content: '1. 异常现象：CPU 占用高、文件被加密、桌面弹窗、无法打开正常程序。\n2. 处置原则：立即断网隔离，保留可疑样本，不要先重启或重装。\n3. 杀毒扫描：使用已安装杀毒软件全盘扫描；必要时使用专杀工具。\n4. 补丁与策略：检查系统补丁、U 盘管控、防火墙策略。\n5. 官方支持：Microsoft Defender https://learn.microsoft.com/zh-cn/microsoft-365/security/defender-endpoint/、360 企业安全 https://enterprise.360.cn/' },
  { id: 'KB-SWITCH', title: '交换机端口与 VLAN 排查', category: '网络', keywords: ['交换机', 'vlan', '端口', 'stp', '环路'], content: '1. 物理层：端口指示灯、网线、光模块、PoE 供电状态。\n2. 端口状态：查看接口 Up/Down、错包、CRC、冲突计数。\n3. VLAN：确认端口 VLAN/PVID、Trunk 允许列表、VLANIF 接口。\n4. 环路排查：启用 STP/RSTP，观察 MAC 地址漂移。\n5. 官方支持：华为 https://support.huawei.com/enterprise/、新华三 https://www.h3c.com/cn/Service/Document_Software/Document_Center/' },
  { id: 'KB-VOIP', title: 'IP 电话与语音网关排查', category: '语音', keywords: ['ip电话', '语音', 'voip', 'sip', '网关'], content: '1. 注册状态：确认 IP 话机是否向 SIP 服务器注册成功。\n2. 网络检查：话机 IP、网关、DNS、VLAN 配置是否正确。\n3. 通话质量：排查延迟、抖动、丢包；检查 QoS 和带宽。\n4. 常见处理：重启话机，检查 SIP 账号密码，确认 NAT/ALG 设置。\n5. 官方支持：Yealink https://www.yealink.com.cn/support、Fanvil https://www.fanvil.com/Support' },
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
let knowledgeSeedPromise;
async function loadKnowledgeSeed() {
  if (!knowledgeSeedPromise) {
    knowledgeSeedPromise = readFile(knowledgeSeedPath, 'utf8')
      .then((content) => JSON.parse(content))
      .catch(() => ({ brands: [], documents: [] }));
  }
  return knowledgeSeedPromise;
}
async function getKnowledgeDocuments() {
  const [store, seed] = await Promise.all([readStore(), loadKnowledgeSeed()]);
  return [...store.knowledge, ...builtInKnowledge, ...(Array.isArray(seed.documents) ? seed.documents : [])];
}
function knowledgeSearchText(item) {
  return [item.title, item.category, item.brand, ...(item.models || []), ...(item.symptoms || []), ...(item.keywords || []), item.content].filter(Boolean).join(' ').toLowerCase();
}
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
  const text = String(issue || '').toLowerCase(); const documents = await getKnowledgeDocuments();
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
  if (!agentToolAllowlist.has(name)) return { ok: false, output: 'Agent 工具不在只读白名单中。需人工确认后才能执行。' };
  const host = String(args.host || '').trim();
  const port = Number(args.port);
  const ports = Array.isArray(args.ports) ? args.ports.map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 65536) : [];
  const subnet = String(args.subnet || '').trim();
  const hours = Number(args.hours) || 72;
  try {
    switch (name) {
      case 'ping': {
        if (!validHost(host)) return { ok: false, output: '无效的目标地址。' };
        const result = await run('ping', ['-n', '4', '-w', '1500', host], 8000);
        const lossMatch = result.output.match(/(\d+)% 丢包|(\d+)% loss|(\d+)% packet loss/i);
        const avgMatch = result.output.match(/平均 = (\d+)ms|Average = (\d+)ms|avg[ =]+(\d+)/i);
        const minMatch = result.output.match(/最短 = (\d+)ms|Minimum = (\d+)ms/i);
        const maxMatch = result.output.match(/最长 = (\d+)ms|Maximum = (\d+)ms/i);
        const packetLoss = lossMatch ? parseInt(lossMatch[1] || lossMatch[2] || lossMatch[3]) : null;
        const avgLatency = avgMatch ? parseInt(avgMatch[1] || avgMatch[2] || avgMatch[3]) : null;
        return {
          ok: result.ok,
          output: result.output,
          structured: {
            tool: 'ping',
            host,
            reachable: result.ok && (packetLoss === null || packetLoss < 100),
            packetLossPercent: packetLoss,
            avgLatencyMs: avgLatency,
            minLatencyMs: minMatch ? parseInt(minMatch[1] || minMatch[2]) : null,
            maxLatencyMs: maxMatch ? parseInt(maxMatch[1] || maxMatch[2]) : null,
            packetsSent: 4
          }
        };
      }
      case 'dns_lookup': {
        if (!validHost(host)) return { ok: false, output: '无效的目标地址。' };
        const result = await run('nslookup', [host], 8000);
        const ipMatches = [...result.output.matchAll(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g)];
        const ips = ipMatches.map(m => m[1]).filter(ip => {
          const parts = ip.split('.').map(Number);
          return parts.every(p => p >= 0 && p <= 255);
        });
        return {
          ok: result.ok,
          output: result.output,
          structured: { tool: 'dns_lookup', host, resolvedIps: ips, resolved: ips.length > 0 }
        };
      }
      case 'check_port': {
        if (!validHost(host)) return { ok: false, output: '无效的目标地址。' };
        if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, output: '端口号必须在 1-65535 之间。' };
        const result = await portCheck(host, port);
        return {
          ok: result.ok,
          output: result.output,
          structured: { tool: 'check_port', host, port, open: result.ok }
        };
      }
      case 'check_ports': {
        if (!validHost(host)) return { ok: false, output: '无效的目标地址。' };
        if (!ports.length) return { ok: false, output: '至少需要一个有效端口。' };
        const result = await multiPortCheck(host, ports);
        const openPorts = [];
        const closedPorts = [];
        const lines = result.output.split('\n');
        for (const p of ports) {
          const line = lines.find(l => l.includes(`${host}:${p}`));
          if (line && (line.includes('reachable') || line.includes('正常'))) {
            openPorts.push(p);
          } else {
            closedPorts.push(p);
          }
        }
        return {
          ok: result.ok,
          output: result.output,
          structured: { tool: 'check_ports', host, ports, openPorts, closedPorts, openCount: openPorts.length, closedCount: closedPorts.length }
        };
      }
      case 'check_arp': {
        if (!validHost(host)) return { ok: false, output: '无效的目标地址。' };
        const result = await run('arp', ['-a', host], 6000);
        const macMatch = result.output.match(/([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}/);
        return {
          ok: result.ok,
          output: result.output,
          structured: { tool: 'check_arp', host, macAddress: macMatch ? macMatch[0].toUpperCase() : null, found: Boolean(macMatch) }
        };
      }
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
      case 'check_certificate': {
        if (!validHost(host)) return { ok: false, output: '无效的目标地址。' };
        const portNum = Number.isInteger(port) && port > 0 && port < 65536 ? port : 443;
        const result = await certificateProbe(host, portNum);
        return result;
      }
      case 'diagnose_printer': {
        if (!validHost(host)) return { ok: false, output: '无效的打印机地址。' };
        const checks = [
          { name: 'Ping 连通性', task: () => run('ping', ['-n', '2', '-w', '1200', host], 5000) },
          { name: '打印端口 9100/515/631', task: () => multiPortCheck(host, [9100, 515, 631]) },
          { name: 'ARP/MAC 地址', task: () => run('arp', ['-a', host], 6000) },
          { name: 'Web 管理页', task: () => webProbe(host, 80, false) }
        ];
        const result = await bundleChecks(checks);
        const summary = [];
        if (result.output.includes('Ping 连通性') && result.output.includes('正常')) summary.push('网络连通正常');
        if (result.output.includes('9100 is reachable')) summary.push('打印端口 9100 开放');
        if (result.output.includes('timed out') || result.output.includes('failed')) summary.push('存在端口不通');
        return {
          ok: result.ok,
          output: `打印机专项诊断 ${host}\n\n${result.output}\n\n诊断小结：${summary.length ? summary.join('；') : '需结合结果判断'}`,
          structured: { host, type: 'printer', checks: 4 }
        };
      }
      case 'diagnose_cctv': {
        if (!validHost(host)) return { ok: false, output: '无效的监控设备地址。' };
        const checks = [
          { name: 'Ping 连通性', task: () => run('ping', ['-n', '2', '-w', '1200', host], 5000) },
          { name: '监控端口 80/443/554/8000/37777', task: () => multiPortCheck(host, [80, 443, 554, 8000, 37777]) },
          { name: 'Web 管理页', task: () => webProbe(host, 80, false) },
          { name: 'ARP/MAC 地址', task: () => run('arp', ['-a', host], 6000) }
        ];
        const result = await bundleChecks(checks);
        const summary = [];
        if (result.output.includes('Ping 连通性') && result.output.includes('正常')) summary.push('网络连通正常');
        const openPorts = (result.output.match(/(\d+) is reachable/g) || []).map(s => s.match(/\d+/)[0]);
        if (openPorts.length) summary.push(`开放端口: ${openPorts.join(',')}`);
        return {
          ok: result.ok,
          output: `监控/NVR 专项诊断 ${host}\n\n${result.output}\n\n诊断小结：${summary.length ? summary.join('；') : '需结合结果判断'}`,
          structured: { host, type: 'cctv', checks: 4, openPorts }
        };
      }
      case 'tcp_ping': {
        if (!validHost(host)) return { ok: false, output: '无效的目标地址。' };
        const portNum = Number.isInteger(port) && port > 0 && port < 65536 ? port : 80;
        const countNum = Number.isInteger(args.count) && args.count > 0 ? args.count : 5;
        return await tcpPing(host, portNum, Math.min(countNum, 20));
      }
      case 'mtu_probe': {
        if (!validHost(host)) return { ok: false, output: '无效的目标地址。' };
        return await mtuProbe(host);
      }
      case 'network_quality': {
        if (!validHost(host)) return { ok: false, output: '无效的目标地址。' };
        const countNum = Number.isInteger(args.count) && args.count > 0 ? args.count : 20;
        return await networkQuality(host, Math.min(countNum, 100));
      }
      case 'wifi_scan': return await runPowerShell("Get-NetAdapter | Where-Object InterfaceType -eq 71 | ForEach-Object { $iface = $_.Name; netsh wlan show networks mode=bssid interface=\"$iface\" }", 15000);
      case 'check_dhcp': return await runPowerShell("$adapters = Get-NetAdapter -Physical | Where-Object Status -eq 'Up'; $results = @(); foreach ($a in $adapters) { $ip = Get-NetIPConfiguration -InterfaceIndex $a.InterfaceIndex -ErrorAction SilentlyContinue; $dhcp = Get-NetIPInterface -InterfaceIndex $a.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Dhcp -ErrorAction SilentlyContinue; $server = ($ip | Select-Object -ExpandProperty DhcpServer -ErrorAction SilentlyContinue) -join ', '; $results += \"$($a.Name): DHCP=$dhcp, Server=$server, IP=$($ip.IPv4Address.IPAddress -join ', ')\" }; $results -join \"`n\"", 10000);
      case 'process_list': return await runPowerShell("Get-Process | Sort-Object CPU -Descending | Select-Object -First 25 ProcessName,Id,CPU,WorkingSet,StartTime,Company | Format-Table -AutoSize", 10000);
      case 'service_list': return await runPowerShell("Get-Service | Sort-Object Status,Name | Select-Object Status,Name,DisplayName,StartType | Format-Table -AutoSize", 10000);
      case 'login_history': return await runPowerShell("Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4624; StartTime=(Get-Date).AddDays(-7)} -MaxEvents 20 -ErrorAction SilentlyContinue | Select-Object TimeCreated,@{N='用户';E={$_.Properties[5].Value}},@{N='登录类型';E={switch($_.Properties[8].Value){2{'交互式'}3{'网络'}4{'批处理'}5{'服务'}7{'解锁'}10{'远程桌面'}default{$_.Properties[8].Value}}}},@{N='来源IP';E={$_.Properties[18].Value}} | Format-Table -AutoSize", 15000);
      case 'shared_folders': return await runPowerShell("Get-WmiObject Win32_Share | Select-Object Name,Path,Description,Type | Format-Table -AutoSize", 10000);
      case 'scheduled_tasks': return await runPowerShell("Get-ScheduledTask | Where-Object State -ne 'Disabled' | Sort-Object TaskPath,TaskName | Select-Object -First 30 TaskPath,TaskName,State,@{N='上次运行';E={(Get-ScheduledTaskInfo -TaskName $_.TaskName -TaskPath $_.TaskPath).LastRunTime}},@{N='上次结果';E={(Get-ScheduledTaskInfo -TaskName $_.TaskName -TaskPath $_.TaskPath).LastTaskResult}} | Format-Table -AutoSize", 15000);
      case 'time_sync': return await bundleChecks([{ name: '当前系统时间', task: () => runPowerShell("Get-Date -Format 'yyyy-MM-dd HH:mm:ss 星期dddd'") }, { name: '时间源配置', task: () => run('w32tm', ['/query', '/source'], 5000) }, { name: '时间同步状态', task: () => run('w32tm', ['/query', '/status'], 5000) }]);
      case 'check_audio': return await runPowerShell("$render = Get-PnpDevice -Class AudioEndpoint -Status OK -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -notlike '*输入*' -and $_.FriendlyName -notlike '*Input*' } | Select-Object FriendlyName,Status; $capture = Get-PnpDevice -Class AudioEndpoint -Status OK -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -like '*输入*' -or $_.FriendlyName -like '*Input*' -or $_.FriendlyName -like '*麦克风*' } | Select-Object FriendlyName,Status; Write-Output '播放设备:'; if ($render) { $render | Format-Table -AutoSize } else { '  无' }; Write-Output '录制/麦克风设备:'; if ($capture) { $capture | Format-Table -AutoSize } else { '  无' }", 10000);
      case 'check_pos_peripherals': return await runPowerShell("$com = Get-PnpDevice -Class Ports -ErrorAction SilentlyContinue | Select-Object FriendlyName,Status; $hid = Get-PnpDevice -Class HIDClass -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -match '扫描|扫码|条码|Scanner|Barcode' } | Select-Object FriendlyName,Status; Write-Output '串口/COM设备（可能接扫码枪/客显/秤）:'; if ($com) { $com | Format-Table -AutoSize } else { '  无' }; Write-Output 'HID 扫码设备:'; if ($hid) { $hid | Format-Table -AutoSize } else { '  未检测到明确标识为扫码枪的 HID 设备（部分扫码枪为键盘模式，可在键盘设备中查看）' }", 10000);
      case 'ask_user_check': return { ok: true, output: '需人工确认', askUser: true, question: String(args.question || ''), options: Array.isArray(args.options) ? args.options : [] };
      case 'network_health': return await networkHealth();
      case 'arp_table': return await arpTable();
      case 'port_service_probe': {
        if (!validHost(host)) return { ok: false, output: '无效的目标地址。' };
        if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, output: '端口号必须在 1-65535 之间。' };
        return await portServiceProbe({ host, port });
      }
      default: { const extendedResult = await executeExtendedAgentTool(name); if (extendedResult) return extendedResult; return { ok: false, output: `未知工具：${name}` }; }
    }
  } catch (error) { return { ok: false, output: `工具执行异常：${error.message}` }; }
}
async function callAiProvider(provider, messages, tools = null, options = {}) {
  return modelDispatcher.callModel(provider, messages, tools, 0.2, options);
}

async function executeToolWithAudit(toolName, args, sessionId, incidentId) {
  const rateCheck = checkToolRateLimit(sessionId);
  if (!rateCheck.allowed) {
    return { ok: false, output: rateCheck.reason, rateLimited: true };
  }
  recordToolCall(sessionId);
  const startTime = Date.now();
  try {
    const result = await executeAgentTool(toolName, args);
    const duration = Date.now() - startTime;
    if (sessionId && !result.askUser) {
      setImmediate(() => {
        recordAudit({
          type: 'AI 工具调用',
          action: agentToolDisplayName(toolName, args),
          ok: result.ok,
          issue: `Agent 自动调用，耗时 ${duration}ms`,
          output: String(result.output || '').slice(0, 2000),
          incidentId
        }).catch(() => {});
      });
    }
    return { ...result, duration };
  } catch (error) {
    return { ok: false, output: `工具执行异常：${error.message}`, duration: Date.now() - startTime };
  }
}

async function runAgentLoop(provider, issue, evidence, maxTurns = 8, sessionId = null, incidentId = null) {
  const startTime = Date.now();
  const systemPrompt = agentSystemPrompt;
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `故障现象：${issue}\n初始证据：${evidence || '未提供'}\n请开始排查。先分析故障现象，然后调用合适的诊断工具收集证据。` }
  ];
  const toolTrace = [];
  let turns = 0;
  let finalOutput = '';
  const sid = sessionId || `agent-${Date.now()}`;

  while (turns < maxTurns && (Date.now() - startTime) < 180000) {
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

    const toolCalls = assistantMsg.tool_calls;
    let toolResults = new Array(toolCalls.length);
    const hasAskUser = toolCalls.some(tc => tc.function.name === 'ask_user_check');

    if (hasAskUser) {
      for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i];
        const fnName = tc.function.name;
        let fnArgs = {};
        try { fnArgs = JSON.parse(tc.function.arguments || '{}'); } catch {}
        toolTrace.push({ type: 'tool-start', tool: fnName, args: fnArgs, displayName: agentToolDisplayName(fnName, fnArgs) });
        if (fnName === 'ask_user_check') {
          const result = { ok: true, output: '已提交问题给现场人员，等待回复。', askUser: true, question: fnArgs.question || '', options: fnArgs.options || [] };
          toolTrace.push({ type: 'ask-user', question: result.question, options: result.options });
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
          toolResults[i] = { tc, result };
        } else {
          const result = { ok: false, output: '等待人工确认期间，其他工具暂不执行。' };
          toolTrace.push({ type: 'tool-end', tool: fnName, ok: false, output: result.output });
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ ok: false, output: result.output }) });
          toolResults[i] = { tc, result };
        }
      }
      const askResult = toolResults.find(({ result }) => result.askUser)?.result;
      return { ok: true, mode: 'agent', provider: provider.name, toolTrace, askUser: askResult, turns, status: 'awaiting_user' };
    }

    const parallelLimit = Math.min(agentToolStats.maxParallelPerTurn, toolCalls.length);
    const results = [];
    let currentIndex = 0;

    const worker = async () => {
      while (currentIndex < toolCalls.length) {
        const index = currentIndex++;
        const tc = toolCalls[index];
        const fnName = tc.function.name;
        let fnArgs = {};
        try { fnArgs = JSON.parse(tc.function.arguments || '{}'); } catch {}
        toolTrace.push({ type: 'tool-start', tool: fnName, args: fnArgs, displayName: agentToolDisplayName(fnName, fnArgs), index });
        const result = await executeToolWithAudit(fnName, fnArgs, sid, incidentId);
        toolTrace.push({ type: 'tool-end', tool: fnName, ok: result.ok, output: String(result.output || '').slice(0, 4000), duration: result.duration, index });
        const toolResponse = { ok: result.ok, output: String(result.output || '').slice(0, 4000) };
        if (result.structured) toolResponse.structured = result.structured;
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(toolResponse) });
        results[index] = { tc, result };
      }
    };

    const workers = [];
    for (let i = 0; i < parallelLimit; i++) {
      workers.push(worker());
    }
    await Promise.all(workers);
    toolResults = results;
  }
  if (!finalOutput && turns >= maxTurns) {
    messages.push({ role: 'user', content: '请基于以上所有检测结果，给出最终的故障排查结论（判断结论、证据、根因候选、风险、验证、回滚、升级条件）。' });
    try {
      const data = await callAiProvider(provider, messages);
      finalOutput = data.choices?.[0]?.message?.content || '';
    } catch { finalOutput = 'Agent 已达到最大轮数但未能生成最终结论。请检查以上工具执行结果并手动判断。'; }
  }
  if (!finalOutput) finalOutput = 'Agent 未能完成诊断。请查看工具执行结果并手动分析。';
  return { ok: true, mode: 'agent', provider: provider.name, toolTrace, finalOutput, turns, status: 'complete', totalDuration: Date.now() - startTime };
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
    check_certificate: host ? `证书检查 ${host}:${port || '443'}` : '证书检查',
    diagnose_printer: host ? `打印机专项诊断 ${host}` : '打印机专项诊断',
    diagnose_cctv: host ? `监控/NVR 专项诊断 ${host}` : '监控/NVR 专项诊断',
    tcp_ping: host ? `TCP Ping ${host}:${port || '80'}` : 'TCP 延迟测试',
    mtu_probe: host ? `MTU 探测 ${host}` : 'MTU 路径探测',
    network_quality: host ? `网络质量检测 ${host}` : '网络质量检测',
    wifi_scan: 'Wi-Fi 信号扫描',
    check_dhcp: 'DHCP 状态检查',
    process_list: '进程列表（TOP）',
    service_list: '系统服务列表',
    login_history: '登录历史记录',
    shared_folders: '共享文件夹列表',
    scheduled_tasks: '计划任务列表',
    time_sync: '时间同步检查',
    check_audio: '音频设备检查',
    check_pos_peripherals: 'POS 外设检查',
    ask_user_check: '请求现场确认',
  };
  if (extendedAgentDisplayNames[tool]) return extendedAgentDisplayNames[tool];
  return maps[tool] || tool;
}
async function aiAnalyze(body) {
  const prompt = aiPrompt(body);
  const suggestedTools = suggestedToolsForIssue(prompt.issue);

  let session = null;
  if (body.sessionId) {
    session = await sessionManager.loadSession(body.sessionId);
  }

  if (!session) {
    session = await sessionManager.createSession(prompt.issue.slice(0, 50), prompt.issue);
  }

  session.messages.push({ role: 'user', content: prompt.issue });

  if (body.provider === '本地运维规则助手') {
    const action = await runAgentDiagnostic(prompt.issue);
    const actionEvidence = action ? `\n\n已执行只读诊断：${action.name}\n${action.output.slice(0, 8000)}` : '';
    const output = `${localOpsAdvice(prompt.issue, prompt.evidence)}${actionEvidence}`;
    session.messages.push({ role: 'assistant', content: output });
    await sessionManager.saveSession(session);
    return { ok: true, mode: 'local', provider: '本地运维规则助手', sessionId: session.id, action, suggestedTools, opsBrief: prompt.normalConversation ? null : buildOpsBrief(prompt.issue, output, action), output };
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

  const selected = modelDispatcher.selectProvider(body.provider);
  if (!selected) {
    const output = localOpsAdvice(prompt.issue, prompt.evidence);
    session.messages.push({ role: 'assistant', content: output });
    await sessionManager.saveSession(session);
    return { ok: true, mode: 'local', provider: '本地运维规则助手', sessionId: session.id, suggestedTools, opsBrief: prompt.normalConversation ? null : buildOpsBrief(prompt.issue, output, action), output };
  }

  const fallback = modelDispatcher.providers.find((item) => item.name === 'DeepSeek' && item.name !== selected.name && item.enabled !== false);
  const candidates = [selected, fallback].filter(Boolean);
  const failures = [];

  for (const provider of candidates) {
    try {
      const aiResponse = await modelDispatcher.callModel(provider, prompt.messages);
      const output = aiResponse.choices?.[0]?.message?.content || '';
      session.messages.push({ role: 'assistant', content: output });
      await sessionManager.saveSession(session);
      return { ok: true, mode: 'provider', provider: provider.name, sessionId: session.id, fallbackFrom: provider.name === selected.name ? null : selected.name, action, suggestedTools, opsBrief: prompt.normalConversation ? null : buildOpsBrief(prompt.issue, output, action), output };
    } catch (error) { failures.push(`${provider.name}: ${error.message}`); }
  }

  const output = `云端 AI 暂不可用（${failures.join('；')}）。\n\n本地建议：\n${localOpsAdvice(prompt.issue, prompt.evidence)}`;
  session.messages.push({ role: 'assistant', content: output });
  await sessionManager.saveSession(session);
  return { ok: true, mode: 'local', provider: '本地运维规则助手', sessionId: session.id, fallbackFrom: selected.name, action, suggestedTools, opsBrief: prompt.normalConversation ? null : buildOpsBrief(prompt.issue, output, action), output };
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
function tcpPing(host, port, count = 5) {
  return new Promise(async (resolve) => {
    const results = [];
    let success = 0; let min = Infinity; let max = 0; let total = 0;
    for (let i = 0; i < count; i++) {
      const start = Date.now();
      const { ok } = await portCheck(host, port);
      const elapsed = Date.now() - start;
      if (ok) { success++; min = Math.min(min, elapsed); max = Math.max(max, elapsed); total += elapsed; results.push(`第 ${i + 1} 次: ${elapsed}ms`); }
      else results.push(`第 ${i + 1} 次: 失败`);
      if (i < count - 1) await new Promise((r) => setTimeout(r, 300));
    }
    const loss = (count - success) / count * 100;
    const avg = success > 0 ? Math.round(total / success) : 0;
    const output = `TCP Ping ${host}:${port} (${count} 次探测)\n\n${results.join('\n')}\n\n统计：成功 ${success}/${count}，丢包 ${loss}%，${success ? `最小时延 ${min}ms，最大时延 ${max}ms，平均时延 ${avg}ms` : '全部失败'}`;
    resolve({ ok: success > 0, output, structured: { tool: 'tcp_ping', host, port, count, success, lossPercent: Math.round(loss), minMs: min === Infinity ? null : min, maxMs: max || null, avgMs: avg || null } });
  });
}
function mtuProbe(host) {
  return new Promise(async (resolve) => {
    const results = [];
    let low = 1000; let high = 9000; let best = 1500;
    const testMtu = async (size) => {
      const r = await run('ping', ['-f', '-l', String(size - 28), '-n', '1', '-w', '1500', host], 4000);
      const ok = r.ok && !r.output.includes('需要拆分') && !r.output.includes('DF');
      results.push(`MTU=${size} (ICMP payload=${size - 28}): ${ok ? '通过' : '不通/需分片'}`);
      return ok;
    };
    const baseOk = await testMtu(1500);
    if (baseOk) { best = 1500; low = 1500; }
    else { high = 1500; low = 500; }
    for (let i = 0; i < 5; i++) {
      const mid = Math.floor((low + high) / 2);
      if (await testMtu(mid)) { best = mid; low = mid + 1; }
      else high = mid - 1;
      if (low > high) break;
    }
    const output = `MTU 探测 ${host}\n\n${results.join('\n')}\n\n估算最大 MTU 约为：${best} 字节`;
    resolve({ ok: best > 0, output, structured: { tool: 'mtu_probe', host, estimatedMtu: best, tests: results.length } });
  });
}
function networkQuality(host, count = 20) {
  return new Promise(async (resolve) => {
    const latencies = [];
    let lost = 0;
    const startTime = Date.now();
    for (let i = 0; i < count; i++) {
      const start = Date.now();
      const r = await run('ping', ['-n', '1', '-w', '2000', host], 3000);
      const elapsed = Date.now() - start;
      const ttlMatch = r.output.match(/TTL=(\d+)/i);
      const timeMatch = r.output.match(/时间[=<](\d+)ms|time[=<](\d+)ms/i);
      if (r.ok && timeMatch) {
        const ms = parseInt(timeMatch[1] || timeMatch[2]) || Math.round(elapsed);
        latencies.push(ms);
      } else { lost++; }
      if (i < count - 1) await new Promise((r) => setTimeout(r, 200));
    }
    const total = latencies.length + lost;
    const loss = total > 0 ? Math.round(lost / total * 100) : 100;
    let min = 0, max = 0, avg = 0, jitter = 0;
    if (latencies.length) {
      min = Math.min(...latencies);
      max = Math.max(...latencies);
      avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
      if (latencies.length > 1) {
        let sum = 0;
        for (let i = 1; i < latencies.length; i++) sum += Math.abs(latencies[i] - latencies[i - 1]);
        jitter = Math.round(sum / (latencies.length - 1));
      }
    }
    const quality = loss > 20 ? '很差' : loss > 5 ? '一般' : jitter > 30 ? '抖动大' : avg > 100 ? '延迟高' : '良好';
    const output = `网络质量检测 ${host} (${count} 次测试，用时 ${(Date.now() - startTime) / 1000}s)\n\n丢包率：${loss}% (${lost}/${total})\n延迟：最小 ${min}ms / 平均 ${avg}ms / 最大 ${max}ms\n抖动：${jitter}ms\n\n质量评估：${quality}`;
    resolve({ ok: latencies.length > 0, output, structured: { tool: 'network_quality', host, count, sent: total, lost, lossPercent: loss, minMs: min, avgMs: avg, maxMs: max, jitterMs: jitter, quality } });
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
const psQuote = (value) => `'${String(value).replaceAll("'", "''")}'`;
function validDisplayName(value) {
  const name = String(value || '').trim();
  return name.length >= 1 && name.length <= 80 && !/[\u0000-\u001f\u007f]/.test(name) ? name : null;
}
function validPortSpec(value) {
  const text = String(value || 'Any').trim();
  if (/^Any$/i.test(text)) return 'Any';
  const entries = text.split(',').map((item) => item.trim()).filter(Boolean);
  if (!entries.length || entries.length > 32) return null;
  for (const entry of entries) {
    const match = entry.match(/^(\d{1,5})(?:-(\d{1,5}))?$/);
    if (!match || Number(match[1]) < 1 || Number(match[1]) > 65535 || (match[2] && (Number(match[2]) < Number(match[1]) || Number(match[2]) > 65535))) return null;
  }
  return entries.join(',');
}
function validIpPrefix(value) {
  const text = String(value || '').trim();
  const [address, prefixText, extra] = text.split('/');
  const version = net.isIP(address);
  const prefix = Number(prefixText);
  if (extra !== undefined || !version || !Number.isInteger(prefix) || prefix < 0 || prefix > (version === 4 ? 32 : 128)) return null;
  return `${address}/${prefix}`;
}
function validRemoteAddress(value) {
  const text = String(value || 'Any').trim();
  if (/^(Any|LocalSubnet)$/i.test(text)) return /^localsubnet$/i.test(text) ? 'LocalSubnet' : 'Any';
  const entries = text.split(',').map((item) => item.trim()).filter(Boolean);
  if (!entries.length || entries.length > 32 || entries.some((entry) => !(net.isIP(entry) || validIpPrefix(entry)))) return null;
  return entries.join(',');
}
async function firewallManager(body, actor) {
  const action = String(body.action || 'list').toLowerCase();
  if (action === 'list') return runPowerShell("'防火墙配置文件'; Get-NetFirewallProfile | Select-Object Name,Enabled,DefaultInboundAction,DefaultOutboundAction | Format-Table -AutoSize; ''; '已启用的本地规则（最多 100 条）'; Get-NetFirewallRule -PolicyStore ActiveStore | Where-Object Enabled -eq 'True' | Select-Object -First 100 DisplayName,Direction,Action,Profile | Sort-Object Direction,DisplayName | Format-Table -AutoSize", 20000);
  if (!['add', 'remove'].includes(action)) throw new Error('防火墙动作仅支持 list、add 或 remove。');
  if (body.confirmed !== true) throw new Error('修改防火墙规则前必须二次确认。');
  const name = validDisplayName(body.name);
  if (!name) throw new Error('规则名称必须为 1-80 个可打印字符。');
  let script;
  let rollback;
  let description;
  if (action === 'add') {
    const direction = ['Inbound', 'Outbound'].includes(body.direction) ? body.direction : null;
    const protocol = ['TCP', 'UDP'].includes(String(body.protocol || '').toUpperCase()) ? String(body.protocol).toUpperCase() : null;
    const ruleAction = ['Allow', 'Block'].includes(body.ruleAction) ? body.ruleAction : null;
    const profile = ['Any', 'Domain', 'Private', 'Public'].includes(body.profile) ? body.profile : null;
    const localPort = validPortSpec(body.localPort);
    const remoteAddress = validRemoteAddress(body.remoteAddress);
    if (!direction || !protocol || !ruleAction || !profile || !localPort || !remoteAddress) throw new Error('防火墙方向、协议、动作、Profile、端口或远端地址无效。');
    script = `$name=${psQuote(name)}; if (Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue) { throw '同名防火墙规则已存在。' }; New-NetFirewallRule -DisplayName $name -Direction ${direction} -Action ${ruleAction} -Protocol ${protocol} -LocalPort ${psQuote(localPort)} -RemoteAddress ${psQuote(remoteAddress)} -Profile ${profile} -Enabled True | Select-Object DisplayName,Direction,Action,Profile | Format-List`;
    rollback = `Remove-NetFirewallRule -DisplayName ${psQuote(name)} -Confirm:$false`;
    description = `新增防火墙规则 ${name}（${direction}/${protocol}/${localPort}/${ruleAction}）`;
  } else {
    script = `$name=${psQuote(name)}; $rules=Get-NetFirewallRule -DisplayName $name -ErrorAction Stop; $rules | Select-Object DisplayName,Direction,Action,Profile | Format-Table -AutoSize; $rules | Remove-NetFirewallRule -Confirm:$false; "已删除规则：$name"`;
    rollback = '请根据输出台记录的方向、动作、Profile、协议和端口使用 New-NetFirewallRule 重建。';
    description = `删除防火墙规则 ${name}`;
  }
  const result = await runPowerShell(script, 20000);
  const output = `${result.output}\n\n回滚命令\n${rollback}`;
  await recordAudit({ type: '受控防火墙变更', action: description, ok: result.ok, issue: `操作人：${actor.username}`, output });
  return { ...result, output, rollback };
}
async function routeManager(body, actor) {
  const action = String(body.action || 'list').toLowerCase();
  if (action === 'list') return runPowerShell("Get-NetRoute | Where-Object { $_.State -eq 'Alive' } | Select-Object AddressFamily,DestinationPrefix,NextHop,InterfaceIndex,RouteMetric,Protocol | Sort-Object AddressFamily,RouteMetric,DestinationPrefix | Format-Table -AutoSize", 20000);
  if (!['add', 'remove'].includes(action)) throw new Error('路由动作仅支持 list、add 或 remove。');
  if (body.confirmed !== true) throw new Error('修改系统路由前必须二次确认。');
  const destinationPrefix = validIpPrefix(body.destinationPrefix);
  const nextHop = String(body.nextHop || '').trim();
  const interfaceIndex = Number(body.interfaceIndex);
  const routeMetric = Number(body.routeMetric || 25);
  if (!destinationPrefix || !net.isIP(nextHop) || !Number.isInteger(interfaceIndex) || interfaceIndex < 1 || interfaceIndex > 65535 || !Number.isInteger(routeMetric) || routeMetric < 1 || routeMetric > 9999) throw new Error('目标前缀、下一跳、接口索引或跃点值无效。');
  if (net.isIP(destinationPrefix.split('/')[0]) !== net.isIP(nextHop)) throw new Error('目标前缀与下一跳必须使用相同地址族。');
  const selector = `-DestinationPrefix ${psQuote(destinationPrefix)} -InterfaceIndex ${interfaceIndex} -NextHop ${psQuote(nextHop)}`;
  let script;
  let rollback;
  let description;
  if (action === 'add') {
    script = `$existing=Get-NetRoute ${selector} -ErrorAction SilentlyContinue; if ($existing) { throw '相同路由已存在。' }; New-NetRoute ${selector} -RouteMetric ${routeMetric} -PolicyStore ActiveStore | Select-Object AddressFamily,DestinationPrefix,NextHop,InterfaceIndex,RouteMetric | Format-List`;
    rollback = `Remove-NetRoute ${selector} -Confirm:$false`;
    description = `新增路由 ${destinationPrefix} -> ${nextHop}`;
  } else {
    script = `$routes=Get-NetRoute ${selector} -ErrorAction Stop; $routes | Select-Object AddressFamily,DestinationPrefix,NextHop,InterfaceIndex,RouteMetric | Format-Table -AutoSize; $routes | Remove-NetRoute -Confirm:$false; '指定路由已删除。'`;
    rollback = `New-NetRoute ${selector} -RouteMetric ${routeMetric} -PolicyStore ActiveStore`;
    description = `删除路由 ${destinationPrefix} -> ${nextHop}`;
  }
  const result = await runPowerShell(script, 20000);
  const output = `${result.output}\n\n回滚命令\n${rollback}`;
  await recordAudit({ type: '受控路由变更', action: description, ok: result.ok, issue: `操作人：${actor.username}`, output });
  return { ...result, output, rollback };
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
      await writeStore(store); const bsToken = createSession(res, user); return send(res, 201, authPayload(user, false, bsToken));
    } catch (error) { return send(res, 400, { ok: false, output: error.message }); }
  }
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const store = await readStore();
    if (!store.users.length) return send(res, 409, { ok: false, output: '尚未初始化管理员账号。' });
    const username = String(body.username || body.email || '').trim().toLowerCase(); const user = store.users.find((item) => (item.username === username || (item.email && item.email.toLowerCase() === username)) && !item.disabled);
    if (!user || !verifyPassword(body.password, user.passwordHash)) return send(res, 401, { ok: false, output: '账号或密码错误。' });
    user.lastLoginAt = new Date().toISOString(); await writeStore(store); const loginToken = createSession(res, user); return send(res, 200, authPayload(user, false, loginToken));
  }
  if (pathname === '/api/auth/logout' && req.method === 'POST') { if (auth.token) sessionStore.delete(auth.token); clearSessionCookie(res); return send(res, 200, { ok: true, output: '已退出登录。' }); }
  if (pathname === '/api/auth/verify-code' && req.method === 'POST') {
    const target = String(body.target || body.email || '').trim().toLowerCase();
    const purpose = String(body.purpose || 'register').trim();
    if (!isQqEmail(target)) return send(res, 400, { ok: false, output: '验证码仅支持 QQ 邮箱，例如 123456@qq.com。' });
    if (!rateLimitStore.allowCode(`${purpose}:${target}`, clientIp(req))) return send(res, 429, { ok: false, output: '验证码请求过于频繁，请稍后再试。' });
    const code = storeVerificationCode(target, purpose);
    const mailConfigured = Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);
    if (mailConfigured) {
      try {
        await mailTransporter.sendMail({
          from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
          to: target,
          subject: `【IT 运维百宝箱】${purpose === 'forgot' ? '找回密码' : '注册'}验证码`,
          html: `<p>您的验证码为：<strong style="font-size:24px;letter-spacing:4px">${code}</strong></p><p>验证码 10 分钟内有效，请勿泄露给他人。</p>`,
        });
        return send(res, 200, { ok: true, delivery: 'email', output: '验证码已发送至邮箱，请查收。' });
      } catch (error) {
        verificationCodeStore.delete(`${purpose}:${target}`);
        return send(res, 500, { ok: false, output: `验证码发送失败：${error.message}` });
      }
    }
    console.log(`[VerifyCode] ${purpose} code for ${target}: ${code}`);
    return send(res, 200, { ok: true, delivery: 'local', output: `邮件服务未配置，本地演示验证码：${code}`, code });
  }
  if (pathname === '/api/auth/register' && req.method === 'POST') {
    const store = await readStore();
    if (!store.users.length) return send(res, 409, { ok: false, output: '尚未初始化管理员账号，请先创建管理员。' });
    try {
      const email = String(body.email || '').trim().toLowerCase().slice(0, 120);
      if (!isQqEmail(email)) return send(res, 400, { ok: false, output: '注册仅支持 QQ 邮箱，例如 123456@qq.com。' });
      const fallbackUsername = `qq_${email.split('@')[0]}`;
      const username = validateUsername(body.username || fallbackUsername);
      if (store.users.some((item) => item.username === username || String(item.email || '').toLowerCase() === email)) return send(res, 409, { ok: false, output: '该账号或邮箱已注册。' });
      const password = validatePassword(body.password);
      const displayName = String(body.displayName || body.nickname || username).trim().slice(0, 40) || username;
      if (!verifyCode(email, 'register', body.code)) return send(res, 400, { ok: false, output: '验证码错误或已过期。' });
      const user = { id: `USR-${Date.now()}`, username, email, displayName, role: 'viewer', passwordHash: hashPassword(password), disabled: false, createdAt: new Date().toISOString() };
      store.users.unshift(user); await writeStore(store); await recordAudit({ type: '权限管理', action: `自助注册账号 ${username}`, ok: true, issue: '用户通过登录页自助注册。', output: '默认角色：只读人员。' });
      const regToken = createSession(res, user); return send(res, 201, authPayload(user, false, regToken));
    } catch (error) { return send(res, 400, { ok: false, output: error.message }); }
  }
  if (pathname === '/api/auth/reset-password' && req.method === 'POST') {
    const store = await readStore();
    try {
      const account = String(body.username || body.email || '').trim().toLowerCase();
      const user = store.users.find((item) => item.username === account || String(item.email || '').toLowerCase() === account);
      if (!user) return send(res, 404, { ok: false, output: '账号不存在。' });
      const target = String(body.email || user.email || user.username).trim().toLowerCase();
      if (!verifyCode(target, 'forgot', body.code)) return send(res, 400, { ok: false, output: '验证码错误或已过期。' });
      const password = validatePassword(body.password);
      user.passwordHash = hashPassword(password); user.updatedAt = new Date().toISOString(); await writeStore(store); await recordAudit({ type: '权限管理', action: `重置账号 ${user.username} 密码`, ok: true, issue: '用户通过登录页找回密码。', output: '密码已更新。' });
      return send(res, 200, { ok: true, output: '密码重置成功，请使用新密码登录。' });
    } catch (error) { return send(res, 400, { ok: false, output: error.message }); }
  }

  const permission = requiredPermission(pathname, req.method);
  if (permission && auth.store.users.length === 0) return send(res, 401, { ok: false, bootstrapRequired: true, output: '请先初始化管理员账号。' });
  if (permission && !auth.user) return send(res, 401, { ok: false, output: '请先登录。' });
  if (permission && !hasPermission(auth.user, permission)) return deny(res);

  if (pathname === '/api/auth/users' && req.method === 'GET') { const store = await readStore(); return send(res, 200, store.users.map(safeUser)); }
  if (pathname === '/api/auth/users' && req.method === 'POST') {
    const store = await readStore();
    try {
      const username = validateUsername(body.username); const email = String(body.email || '').trim().toLowerCase();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res, 400, { ok: false, output: '邮箱格式不正确。' });
      if (store.users.some((item) => item.username === username || (email && String(item.email || '').toLowerCase() === email))) return send(res, 409, { ok: false, output: '账号或邮箱已存在。' });
      const password = validatePassword(body.password); const role = validateRole(body.role);
      if (!manageableRoles(auth.user.role).includes(role)) return deny(res, '当前角色不能创建该权限级别的账号。');
      const displayName = String(body.displayName || username).trim().slice(0, 40) || username;
      const user = { id: `USR-${Date.now()}`, username, email, displayName, role, passwordHash: hashPassword(password), disabled: false, createdAt: new Date().toISOString() };
      store.users.unshift(user); await writeStore(store); await recordAudit({ type: '权限管理', action: `创建账号 ${username}（${roleProfiles[role].label}）`, ok: true, issue: `操作人：${auth.user.username}`, output: '账号已创建，密码未写入审计。' });
      return send(res, 201, safeUser(user));
    } catch (error) { return send(res, 400, { ok: false, output: error.message }); }
  }
  if (pathname.startsWith('/api/auth/users/') && req.method === 'PATCH') {
    const userId = decodeURIComponent(pathname.slice('/api/auth/users/'.length)); const store = await readStore(); const user = store.users.find((item) => item.id === userId);
    if (!user) return send(res, 404, { ok: false, output: '未找到账号。' });
    try {
      if (user.id !== auth.user.id && !manageableRoles(auth.user.role).includes(user.role)) return deny(res, '当前角色不能管理该账号。');
      if (Object.hasOwn(body, 'displayName')) user.displayName = String(body.displayName || user.username).trim().slice(0, 40) || user.username;
      if (Object.hasOwn(body, 'email')) {
        const email = String(body.email || '').trim().toLowerCase();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('邮箱格式不正确。');
        if (store.users.some((item) => item.id !== user.id && email && String(item.email || '').toLowerCase() === email)) throw new Error('邮箱已被使用。');
        user.email = email;
      }
      if (Object.hasOwn(body, 'role')) {
        const role = validateRole(body.role);
        if (!manageableRoles(auth.user.role).includes(role)) return deny(res, '当前角色不能分配该权限级别。');
        user.role = role;
      }
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
    const store = await readStore(); const tools = await externalToolStatus(); const snmpPath = await findExternalTool({ executables: ['snmpwalk.exe', 'snmpwalk'], paths: ['C:/usr/bin/snmpwalk.exe', 'C:/Program Files/Net-SNMP/bin/snmpwalk.exe'] }); const providers = modelDispatcher.getPublicProviders().map((item) => item.name);
    return send(res, 200, { ok: true, checkedAt: new Date().toISOString(), service: { status: '正常', address: `http://127.0.0.1:${port}` }, data: { status: existsSync(dataDir) ? '正常' : '首次运行待创建', assets: store.assets.length, tickets: store.tickets.length, incidents: store.incidents.length, worklogs: store.worklogs.length, knowledge: store.knowledge.length + builtInKnowledge.length, evidence: store.evidence.length }, ai: { status: providers.length ? '已配置' : '仅本地规则', providers }, ocr: { status: existsSync(join(chiSimLanguage.langPath, 'chi_sim.traineddata.gz')) ? '离线中文可用' : '语言包缺失' }, agent: { status: existsSync(join(root, 'agent', '门店现场采集代理.ps1')) ? '可下载' : '脚本缺失' }, snmp: { status: snmpPath ? '可用' : '未安装 Net-SNMP' }, externalTools: tools.map((item) => ({ name: item.name, available: Boolean(item.path) })) });
  }
  if (pathname === '/api/ai/providers' && req.method === 'GET') {
    const publicProviders = modelDispatcher.getPublicProviders();
    return send(res, 200, [{ name: '本地运维规则助手', mode: 'local', enabled: true }, ...publicProviders]);
  }
  if (pathname === '/api/ai/sessions' && req.method === 'GET') {
    const sessions = await sessionManager.listSessions(50);
    return send(res, 200, sessions);
  }
  if (pathname.startsWith('/api/ai/sessions/') && req.method === 'GET') {
    const sessionId = decodeURIComponent(pathname.slice('/api/ai/sessions/'.length));
    const session = await sessionManager.loadSession(sessionId);
    if (!session) return send(res, 404, { ok: false, output: '会话不存在或已删除。' });
    return send(res, 200, session);
  }
  if (pathname.startsWith('/api/ai/sessions/') && req.method === 'DELETE') {
    const sessionId = decodeURIComponent(pathname.slice('/api/ai/sessions/'.length));
    const deleted = await sessionManager.deleteSession(sessionId);
    return send(res, 200, { ok: deleted });
  }
  if (pathname === '/api/ai/test' && req.method === 'POST') {
    const provider = modelDispatcher.selectProvider(body.provider);
    if (!provider) return send(res, 503, { ok: false, output: '未配置云端 AI Provider；可继续使用本地规则助手。' });
    try { const aiResponse = await modelDispatcher.callModel(provider, [{ role: 'system', content: '你是中文 IT 运维助手，只需简短确认连接成功。' }, { role: 'user', content: '请用一句中文确认你已就绪，可以协助门店、网络、监控和桌面运维。' }]); const output = aiResponse.choices?.[0]?.message?.content || ''; await recordAudit({ type: 'AI 连通性测试', action: `测试 ${provider.name} 回包`, ok: true, issue: '用户在系统自检中发起最小化 AI 连通性测试。', output: output.slice(0, 1000) }); return send(res, 200, { ok: true, provider: provider.name, output }); }
    catch (error) { await recordAudit({ type: 'AI 连通性测试', action: `测试 ${provider.name} 回包`, ok: false, issue: '用户在系统自检中发起最小化 AI 连通性测试。', output: String(error.message).slice(0, 1000) }); return send(res, 502, { ok: false, output: `${provider.name} 暂不可用：${error.message}` }); }
  }
  if (pathname === '/api/ai/analyze' && req.method === 'POST') return send(res, 200, await aiAnalyze(body));
  if (pathname === '/api/ai/agent' && req.method === 'POST') {
    const prompt = aiPrompt(body);

    let session = null;
    if (body.sessionId) {
      session = await sessionManager.loadSession(body.sessionId);
    }
    if (!session) {
      session = await sessionManager.createSession(prompt.issue.slice(0, 50), prompt.issue);
    }
    session.messages.push({ role: 'user', content: prompt.issue });

    if (body.provider === '本地运维规则助手') {
      const action = await runAgentDiagnostic(prompt.issue);
      const output = `${localOpsAdvice(prompt.issue, prompt.evidence)}\n\n已自动执行：${action?.name || '无'}\n${action?.output?.slice(0, 8000) || ''}`;
      session.messages.push({ role: 'assistant', content: output });
      await sessionManager.saveSession(session);
      return send(res, 200, { ok: true, mode: 'local', provider: '本地运维规则助手', sessionId: session.id, toolTrace: [{ type: 'think', content: '本地规则引擎执行排查...' }], finalOutput: output, turns: 1, status: 'complete' });
    }
    const knowledge = await relevantKnowledge(prompt.issue);
    const assets = await assetsForIssue(prompt.issue); const assetEvidence = assets.length ? `关联资产：\n${assetContext(assets)}` : '';
    const enrichedEvidence = [knowledge ? `关联知识库：\n${knowledge}` : '', assetEvidence, body.evidence || ''].filter(Boolean).join('\n\n').slice(0, 16000);

    const selected = modelDispatcher.selectProvider(body.provider);
    if (!selected) {
      const action = await runAgentDiagnostic(prompt.issue);
      const output = `${localOpsAdvice(prompt.issue, prompt.evidence)}\n\n已自动执行：${action?.name || '无'}\n${action?.output?.slice(0, 8000) || ''}`;
      session.messages.push({ role: 'assistant', content: output });
      await sessionManager.saveSession(session);
      return send(res, 200, { ok: true, mode: 'local', provider: '本地运维规则助手', sessionId: session.id, toolTrace: [{ type: 'think', content: '无可用云端 AI，使用本地规则引擎。' }], finalOutput: output, turns: 1, status: 'complete' });
    }

    const fallback = modelDispatcher.providers.find((item) => item.name === 'DeepSeek' && item.name !== selected.name && item.enabled !== false);
    const candidates = [selected, fallback].filter(Boolean);
    let lastError = '';
    const incidentId = prompt.issue.match(/\[事件\s+(EVT-\d+)\]/)?.[1] || null;
    for (const candidate of candidates) {
      try {
        const result = await runAgentLoop(candidate, prompt.issue, enrichedEvidence, 8, session.id, incidentId);
        session.messages.push({ role: 'assistant', content: result.finalOutput || '' });
        await sessionManager.saveSession(session);
        await recordAudit({ type: 'AI Agent 诊断', action: `Agent 模式 ${result.turns} 轮`, ok: true, issue: prompt.issue.slice(0, 500), output: String(result.finalOutput || result.toolTrace?.map((t) => t.displayName).filter(Boolean).join(' → ') || '').slice(0, 5000), incidentId });
        return send(res, 200, { ...result, sessionId: session.id, fallbackFrom: candidate.name === selected.name ? null : selected.name });
      } catch (error) { lastError = error.message; }
    }
    const action = await runAgentDiagnostic(prompt.issue);
    const output = `云端 AI Agent 暂不可用（${lastError}）。\n\n本地建议：\n${localOpsAdvice(prompt.issue, prompt.evidence)}\n\n已自动执行：${action?.name || '无'}\n${action?.output?.slice(0, 8000) || ''}`;
    session.messages.push({ role: 'assistant', content: output });
    await sessionManager.saveSession(session);
    return send(res, 200, { ok: true, mode: 'local', provider: '本地运维规则助手', sessionId: session.id, toolTrace: [{ type: 'think', content: '云端 AI 不可用，已切换本地规则引擎。' }], finalOutput: output, turns: 1, status: 'complete' });
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
  if (pathname === '/api/knowledge' && req.method === 'GET') return send(res, 200, await getKnowledgeDocuments());
  if (pathname === '/api/knowledge/sources' && req.method === 'GET') return send(res, 200, officialKnowledgeSources);
  if (pathname === '/api/knowledge/brands' && req.method === 'GET') {
    const seed = await loadKnowledgeSeed();
    return send(res, 200, Array.isArray(seed.brands) ? seed.brands : []);
  }
  if (pathname === '/api/knowledge/search' && req.method === 'GET') {
    const query = new URL(req.url, 'http://127.0.0.1').searchParams.get('q')?.trim().toLowerCase() || '';
    const documents = await getKnowledgeDocuments();
    const seed = await loadKnowledgeSeed();
    const items = query ? documents.filter((item) => knowledgeSearchText(item).includes(query)) : documents;
    return send(res, 200, { items: items.slice(0, 80), brands: Array.isArray(seed.brands) ? seed.brands : [] });
  }
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
    const store = await readStore(); const knowledgeDocuments = await getKnowledgeDocuments(); const candidates = [
      ...store.assets.map((item) => ({ type: '资产', page: 'assets', title: item.name, meta: `${item.site} · ${item.type} · ${item.model || item.ip}`, search: `${item.name} ${item.site} ${item.type} ${item.ip} ${item.model || ''} ${item.serialNumber || ''} ${item.macAddress || ''} ${item.physicalLocation || ''}` })),
      ...store.tickets.map((item) => ({ type: '工单', page: 'tickets', title: item.title, meta: `${item.id} · ${item.site} · ${item.assetName || item.status}`, search: `${item.title} ${item.id} ${item.site} ${item.status} ${item.assetName || ''}` })),
      ...store.incidents.map((item) => ({ type: '事件', page: 'dashboard', title: item.title, meta: `${item.id} · ${item.site} · ${item.status}`, search: `${item.title} ${item.id} ${item.site} ${item.status}` })),
      ...store.worklogs.map((item) => ({ type: '处置单', page: 'worklog', title: item.title, meta: `${item.id} · ${item.site}`, search: `${item.title} ${item.id} ${item.site} ${item.result} ${item.notes}` })),
      ...knowledgeDocuments.map((item) => ({ type: '知识', page: 'knowledge', title: item.title, meta: `${item.category} · ${item.source || '内置 SOP'}`, search: `${item.title} ${item.category} ${item.content} ${(item.keywords || []).join(' ')}` })),
    ];
    return send(res, 200, candidates.filter((item) => item.search.toLowerCase().includes(query)).slice(0, 30).map(({ search, ...item }) => item));
  }
  if (pathname === '/api/backup/export' && req.method === 'GET') {
    try { const store = await readStore(); return send(res, 200, await buildPortableBackup(store)); } catch (error) { return send(res, 413, { ok: false, output: error.message }); }
  }
  if (pathname === '/api/backup/import' && req.method === 'POST') {
    if (!['ITOpsToolboxBackup/2', 'OpsHubBackup/1', 'OpsHubBackup/2'].includes(body?.format) || !body?.data || typeof body.data !== 'object') return send(res, 400, { ok: false, output: '备份格式无效。' });
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
  if (pathname === '/api/serial/ports' && req.method === 'GET') {
    try { return send(res, 200, { ok: true, ports: await serialSessions.listPorts() }); }
    catch (error) { return send(res, 500, { ok: false, output: error.message }); }
  }
  if (pathname === '/api/serial/sessions' && req.method === 'GET') return send(res, 200, serialSessions.list(auth.user.id));
  if (pathname === '/api/serial/sessions' && req.method === 'POST') {
    try {
      const session = await serialSessions.create(auth.user.id, body);
      await recordAudit({ type: '串口终端', action: `打开串口 ${session.port}`, ok: true, issue: `操作人：${auth.user.username}`, output: `${session.baud}/${session.dataBits}${session.parity}/${session.stopBits}；收发内容不写入审计。` });
      return send(res, 201, session);
    } catch (error) {
      await recordAudit({ type: '串口终端', action: `打开串口 ${String(body.port || '').slice(0, 24)}`, ok: false, issue: `操作人：${auth.user.username}`, output: error.message });
      return send(res, 400, { ok: false, output: error.message });
    }
  }
  if (pathname === '/api/serial/history' && req.method === 'GET') return send(res, 200, await serialSessions.listHistory(auth.user.id));
  if (pathname.startsWith('/api/serial/history/') && req.method === 'DELETE') {
    try { await serialSessions.deleteHistory(auth.user.id, decodeURIComponent(pathname.slice('/api/serial/history/'.length))); return send(res, 200, { ok: true, output: '串口历史已删除。' }); }
    catch (error) { return send(res, 404, { ok: false, output: error.message }); }
  }
  const serialOutputMatch = pathname.match(/^\/api\/serial\/sessions\/([^/]+)\/output$/);
  if (serialOutputMatch && req.method === 'GET') {
    const after = new URL(req.url, 'http://127.0.0.1').searchParams.get('after') || 0;
    try { return send(res, 200, serialSessions.output(auth.user.id, decodeURIComponent(serialOutputMatch[1]), after)); }
    catch (error) { return send(res, 404, { ok: false, output: error.message }); }
  }
  const serialInputMatch = pathname.match(/^\/api\/serial\/sessions\/([^/]+)\/input$/);
  if (serialInputMatch && req.method === 'POST') {
    try { return send(res, 200, await serialSessions.send(auth.user.id, decodeURIComponent(serialInputMatch[1]), body)); }
    catch (error) { return send(res, 400, { ok: false, output: error.message }); }
  }
  if (pathname.startsWith('/api/serial/sessions/') && req.method === 'DELETE') {
    try {
      const session = await serialSessions.close(auth.user.id, decodeURIComponent(pathname.slice('/api/serial/sessions/'.length)));
      await recordAudit({ type: '串口终端', action: `关闭串口 ${session.port}`, ok: true, issue: `操作人：${auth.user.username}`, output: `会话 ${session.id} 已关闭；收发内容未写入审计。` });
      return send(res, 200, session);
    } catch (error) { return send(res, 404, { ok: false, output: error.message }); }
  }
  if (pathname === '/api/packet-capture/status' && req.method === 'GET') {
    const result = await packetCapture.status();
    const latest = result.active || result.captures[0] || null;
    return send(res, 200, {
      ...result,
      output: result.active
        ? `内置抓包正在运行：${result.active.id}\n开始时间：${result.active.startedAt}\n自动停止：${result.active.durationSeconds} 秒\n最大文件：${result.active.fileSizeMB} MB`
        : latest
          ? `当前没有运行中的抓包。\n最近任务：${latest.id}\n状态：${latest.status}\n完成时间：${latest.completedAt || '-'}\n文件大小：${latest.bytes || 0} bytes`
          : `当前没有运行中的抓包。\npktmon 状态：${result.available ? '可用' : '不可用'}`,
    });
  }
  if (pathname === '/api/packet-capture/start' && req.method === 'POST') {
    if (body.confirmed !== true) return send(res, 400, { ok: false, output: '启动抓包前必须确认采集范围和敏感数据留存要求。' });
    try {
      const record = await packetCapture.start({ userId: auth.user.id, username: auth.user.username, durationSeconds: body.durationSeconds, packetSize: body.packetSize, fileSizeMB: body.fileSizeMB });
      await recordAudit({ type: '受控网络采集', action: `启动 pktmon 抓包 ${record.id}`, ok: true, issue: `操作人：${auth.user.username}`, output: `时长上限 ${record.durationSeconds} 秒；文件上限 ${record.fileSizeMB} MB；采集网卡组件。` });
      return send(res, 201, { ok: true, ...record, output: `抓包任务已启动：${record.id}\n自动停止：${record.durationSeconds} 秒\n最大文件：${record.fileSizeMB} MB\n捕获长度：${record.packetSize === 0 ? '完整数据包' : `${record.packetSize} bytes`}`, summary: 'pktmon 正在采集本机网卡流量，达到时长后自动转换为 PCAPNG。' });
    } catch (error) {
      await recordAudit({ type: '受控网络采集', action: '启动 pktmon 抓包', ok: false, issue: `操作人：${auth.user.username}`, output: error.message });
      return send(res, 400, { ok: false, output: error.message });
    }
  }
  if (pathname === '/api/packet-capture/stop' && req.method === 'POST') {
    try {
      const record = await packetCapture.stop({ reason: 'manual' });
      await recordAudit({ type: '受控网络采集', action: `停止 pktmon 抓包 ${record.id}`, ok: true, issue: `操作人：${auth.user.username}`, output: `已转换 PCAPNG；文件大小 ${record.bytes || 0} bytes。` });
      return send(res, 200, { ok: true, ...record, output: `抓包任务已停止：${record.id}\n状态：${record.status}\nPCAPNG：${record.bytes || 0} bytes\n完成时间：${record.completedAt}`, summary: '抓包已停止并转换为标准 PCAPNG，可下载或导入协议分析器。' });
    } catch (error) { return send(res, 400, { ok: false, output: error.message }); }
  }
  const captureFileMatch = pathname.match(/^\/api\/packet-capture\/files\/([A-Za-z0-9-]+)$/);
  if (captureFileMatch && req.method === 'GET') {
    try {
      const file = await packetCapture.file(captureFileMatch[1], user?.id);
      res.writeHead(200, { 'Content-Type': 'application/x-pcapng', 'Content-Disposition': `attachment; filename="${file.record.id}.pcapng"`, 'Content-Length': file.data.length, 'Cache-Control': 'no-store' });
      return res.end(file.data);
    } catch (error) { return send(res, 404, { ok: false, output: error.message }); }
  }
  if (pathname === '/api/packet-capture/analyze' && req.method === 'POST') {
    const filename = basename(String(body.filename || 'capture.pcap')).slice(0, 160);
    if (!/\.(pcap|pcapng|cap)$/i.test(filename)) return send(res, 400, { ok: false, output: '仅支持 .pcap、.pcapng 和 .cap 抓包文件。' });
    const encoded = String(body.data || '').replace(/^data:[^;]+;base64,/, '').trim();
    if (!encoded || encoded.length > Math.ceil(MAX_UPLOAD_BYTES * 4 / 3) + 16) return send(res, 400, { ok: false, output: '抓包文件为空或超过 25MB 限制。' });
    try {
      const result = analyzeCaptureBuffer(Buffer.from(encoded, 'base64'), { filename });
      await recordAudit({ type: '离线协议分析', action: `分析抓包 ${filename}`, ok: true, issue: `操作人：${auth.user.username}`, output: `数据包 ${result.packetCount}；协议 ${result.protocols.length}；原始上传文件未保存。` });
      return send(res, 200, result);
    } catch (error) { return send(res, 400, { ok: false, output: error.message }); }
  }
  if (pathname === '/api/remote/sessions' && req.method === 'GET') return send(res, 200, remoteSessions.list(auth.user.id));
  if (pathname === '/api/remote/sessions' && req.method === 'POST') {
    const protocol = String(body.protocol || 'ssh').trim().toLowerCase();
    const host = String(body.host || '').trim();
    if (!['ssh', 'telnet'].includes(protocol) || !validRemoteHost(host)) return send(res, 400, { ok: false, output: '请选择 SSH/Telnet 并填写有效的 IP 或主机名。' });
    try {
      const session = await remoteSessions.create(auth.user.id, body);
      await recordAudit({ type: '远程管理', action: `建立 ${protocol.toUpperCase()} 会话 ${host}:${session.port}`, ok: true, issue: `操作人：${auth.user.username}`, output: `会话 ${session.id}；密码与私钥未记录。` });
      return send(res, 201, session);
    } catch (error) {
      await recordAudit({ type: '远程管理', action: `${protocol.toUpperCase()} 连接 ${host}`, ok: false, issue: `操作人：${auth.user.username}`, output: error.message });
      return send(res, 502, { ok: false, output: `远程连接失败：${error.message}` });
    }
  }
  if (pathname === '/api/remote/history' && req.method === 'GET') return send(res, 200, await remoteSessions.listHistory(auth.user.id));
  if (pathname.startsWith('/api/remote/history/') && req.method === 'DELETE') {
    const historyId = decodeURIComponent(pathname.slice('/api/remote/history/'.length));
    try { await remoteSessions.deleteHistory(auth.user.id, historyId); return send(res, 200, { ok: true, output: '远程连接历史已删除。' }); }
    catch (error) { return send(res, 404, { ok: false, output: error.message }); }
  }
  const remoteOutputMatch = pathname.match(/^\/api\/remote\/sessions\/([^/]+)\/output$/);
  if (remoteOutputMatch && req.method === 'GET') {
    const after = new URL(req.url, 'http://127.0.0.1').searchParams.get('after') || 0;
    try { return send(res, 200, remoteSessions.output(auth.user.id, decodeURIComponent(remoteOutputMatch[1]), after)); }
    catch (error) { return send(res, 404, { ok: false, output: error.message }); }
  }
  const remoteInputMatch = pathname.match(/^\/api\/remote\/sessions\/([^/]+)\/input$/);
  if (remoteInputMatch && req.method === 'POST') {
    try { return send(res, 200, remoteSessions.send(auth.user.id, decodeURIComponent(remoteInputMatch[1]), body.data)); }
    catch (error) { return send(res, 400, { ok: false, output: error.message }); }
  }
  if (pathname.startsWith('/api/remote/sessions/') && req.method === 'DELETE') {
    const sessionId = decodeURIComponent(pathname.slice('/api/remote/sessions/'.length));
    try {
      const session = remoteSessions.close(auth.user.id, sessionId);
      await recordAudit({ type: '远程管理', action: `断开 ${session.protocol.toUpperCase()} 会话 ${session.host}:${session.port}`, ok: true, issue: `操作人：${auth.user.username}`, output: `会话 ${session.id} 已关闭。` });
      return send(res, 200, session);
    } catch (error) { return send(res, 404, { ok: false, output: error.message }); }
  }
  if (pathname === '/api/remote/rdp' && req.method === 'POST') {
    const host = String(body.host || '').trim();
    if (!validRemoteHost(host)) return send(res, 400, { ok: false, output: '请输入有效的 RDP 主机地址。' });
    let port;
    try { port = normalizeRemotePort(body.port, 3389); } catch (error) { return send(res, 400, { ok: false, output: error.message }); }
    const resolution = ['auto', 'fullscreen', '1920x1080', '1600x900', '1366x768'].includes(body.resolution) ? body.resolution : 'auto';
    const args = [`/v:${host}:${port}`];
    if (resolution === 'fullscreen') args.push('/f');
    else if (/^\d+x\d+$/.test(resolution)) { const [width, height] = resolution.split('x'); args.push(`/w:${width}`, `/h:${height}`); }
    try {
      const child = spawn('mstsc.exe', args, { detached: true, stdio: 'ignore', windowsHide: false });
      child.on('error', () => {});
      child.unref();
      const history = await remoteSessions.addHistory(auth.user.id, { protocol: 'rdp', host, port, username: String(body.username || '').trim().slice(0, 128), deviceType: 'Windows', resolution });
      await recordAudit({ type: '远程管理', action: `启动 RDP ${host}:${port}`, ok: true, issue: `操作人：${auth.user.username}`, output: `分辨率：${resolution}；密码未记录。` });
      return send(res, 200, { ok: true, history, output: `已启动 Windows 远程桌面：${host}:${port}` });
    } catch (error) { return send(res, 500, { ok: false, output: `无法启动 mstsc.exe：${error.message}` }); }
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
  if (pathname === '/api/tools/dns-benchmark') return send(res, 200, await dnsBenchmark({ domain: body.domain, servers: body.servers, attempts: body.attempts }));
  if (pathname === '/api/tools/ip-conflict-check') return send(res, 200, await ipConflictCheck());
  if (pathname === '/api/tools/flow-monitor-sample') return send(res, 200, await networkTrafficSample({ interfaceAlias: body.interfaceAlias }));
  if (pathname === '/api/tools/wifi-channel-analysis') return send(res, 200, await wifiChannelAnalysis());
  if (pathname === '/api/tools/wifi-profile-export') {
    const reveal = body.reveal === true || body.reveal === 'true';
    if (reveal && (!auth.user || !hasPermission(auth.user, 'backup_manage'))) return deny(res, '仅管理员可以导出 Wi-Fi 明文密钥。');
    if (reveal && body.confirmed !== true) return send(res, 400, { ok: false, output: '导出明文 Wi-Fi 密钥前必须二次确认。' });
    const result = await wifiProfileExport({ reveal });
    if (reveal) await recordAudit({ type: '敏感数据导出', action: '导出 Wi-Fi 配置明文密钥', ok: result.ok, issue: `操作人：${auth.user.username}`, output: `共导出 ${result.profiles.length} 个配置；密钥内容未写入审计。` });
    return send(res, 200, result);
  }
  if (pathname === '/api/tools/link-monitor-sample') {
    const result = await linkMonitorSample({ targets: body.targets });
    return send(res, result.ok ? 200 : 400, result);
  }
  if (pathname === '/api/tools/monitor-webhook') {
    const result = await sendMonitorWebhook({ url: body.url, text: body.text });
    return send(res, result.ok ? 200 : 400, result);
  }
  if (pathname === '/api/tools/system-launcher') {
    if (req.method === 'GET') return send(res, 200, systemLauncherRegistry.map(({ id, name }) => ({ id, name })));
    const target = systemLauncherRegistry.find(item => item.id === String(body.target || ''));
    if (!target) return send(res, 400, { ok: false, output: '系统工具不在允许启动的白名单中。' });
    if (target.elevated) return send(res, 200, await runPowerShell("Start-Process cmd.exe -Verb RunAs; '已请求启动管理员命令提示符，请在 Windows UAC 窗口确认。'", 8000));
    const child = spawn(target.command, target.args, { detached: true, stdio: 'ignore', windowsHide: false });
    child.on('error', () => {});
    child.unref();
    return send(res, 200, { ok: true, output: `已启动：${target.name}` });
  }
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
  if (pathname === '/api/tools/firewall-manager') {
    try { return send(res, 200, await firewallManager(body, auth.user)); }
    catch (error) { return send(res, 400, { ok: false, output: error.message }); }
  }
  if (pathname === '/api/tools/route-manager') {
    try { return send(res, 200, await routeManager(body, auth.user)); }
    catch (error) { return send(res, 400, { ok: false, output: error.message }); }
  }
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
  if (pathname === '/api/tools/software-inventory') return send(res, 200, await bundleChecks([
    { name: '已安装桌面软件', task: () => runPowerShell("$paths = 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'; Get-ItemProperty $paths -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -and $_.SystemComponent -ne 1 -and $_.ReleaseType -notmatch 'Update|Hotfix' } | Select-Object DisplayName,DisplayVersion,Publisher,InstallDate,InstallLocation | Sort-Object DisplayName | Format-Table -AutoSize", 30000) },
    { name: '运行库与常用组件', task: () => runPowerShell("$paths = 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'; Get-ItemProperty $paths -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match 'Visual C\\+\\+|Microsoft .NET|Java|WebView2|Edge|Microsoft 365|Office|WPS' } | Select-Object DisplayName,DisplayVersion,Publisher | Sort-Object DisplayName | Format-Table -AutoSize; ''; Get-ChildItem 'HKLM:\\SOFTWARE\\Microsoft\\NET Framework Setup\\NDP' -Recurse -ErrorAction SilentlyContinue | Get-ItemProperty -Name Version,Release -ErrorAction SilentlyContinue | Where-Object Version | Select-Object PSChildName,Version,Release | Format-Table -AutoSize", 30000) },
  ]));
  if (pathname === '/api/tools/spooler-start') return send(res, 200, await runAuditedAction('受控打印修复', '启动 Print Spooler', () => runPowerShell("Start-Service -Name Spooler; Get-Service -Name Spooler | Format-Table -AutoSize")));
  if (pathname === '/api/tools/onsite-baseline') return send(res, 200, await bundleChecks([
    { name: '网络配置', task: () => run('ipconfig', ['/all'], 10000) },
    { name: '外网 DNS', task: () => run('nslookup', ['www.cloudflare.com'], 8000) },
    { name: '公网连通性', task: () => run('ping', ['-n', '2', '-w', '1500', '1.1.1.1'], 6000) },
    { name: '系统与磁盘', task: () => runPowerShell("Get-CimInstance Win32_OperatingSystem | Select-Object CSName,Caption,LastBootUpTime,FreePhysicalMemory | Format-List; ''; Get-Volume | Where-Object DriveLetter | Select-Object DriveLetter,SizeRemaining,Size,HealthStatus | Format-Table -AutoSize") },
    { name: '打印服务', task: async () => { const result = await runPowerShell("Get-Service Spooler | Select-Object Name,Status,StartType | Format-Table -AutoSize"); return { ...result, ok: result.ok && /Running/i.test(result.output) }; } },
  ]));
  if (pathname === '/api/tools/desktop-inventory') return send(res, 200, await bundleChecks([
    { name: '设备与操作系统', task: () => runPowerShell("Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer,Model,Name,Domain,TotalPhysicalMemory | Format-List; Get-CimInstance Win32_BIOS | Select-Object SerialNumber,SMBIOSBIOSVersion,ReleaseDate | Format-List; Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber,LastBootUpTime | Format-List", 15000) },
    { name: '磁盘与电池', task: () => runPowerShell("Get-Volume | Where-Object DriveLetter | Select-Object DriveLetter,FileSystemLabel,SizeRemaining,Size,HealthStatus | Format-Table -AutoSize; Get-PhysicalDisk | Select-Object FriendlyName,MediaType,HealthStatus,OperationalStatus,Size | Format-Table -AutoSize; Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object Name,EstimatedChargeRemaining,BatteryStatus | Format-Table -AutoSize", 15000) },
    { name: '网卡与显示设备', task: () => runPowerShell("Get-NetAdapter -IncludeHidden | Select-Object Name,Status,LinkSpeed,MacAddress | Format-Table -AutoSize; Get-PnpDevice -PresentOnly | Where-Object Class -in 'Monitor','Display' | Select-Object Class,FriendlyName,Status | Format-Table -AutoSize", 15000) },
  ]));
  if (pathname === '/api/tools/office-health') return send(res, 200, await bundleChecks([
    { name: 'Office / WPS 安装与版本', task: () => runPowerShell("$paths='HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'; Get-ItemProperty $paths -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match 'Microsoft 365|Microsoft Office|Office|WPS' } | Select-Object DisplayName,DisplayVersion,Publisher,InstallLocation | Format-Table -AutoSize", 15000) },
    { name: '运行进程与文件关联', task: () => runPowerShell("Get-Process WINWORD,EXCEL,POWERPNT,OUTLOOK,wps,et,wpp -ErrorAction SilentlyContinue | Select-Object ProcessName,Id,StartTime,Responding | Format-Table -AutoSize; ''; Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.docx\\UserChoice','HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.xlsx\\UserChoice','HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.pptx\\UserChoice' -ErrorAction SilentlyContinue | Select-Object PSPath,ProgId | Format-Table -AutoSize", 15000) },
    { name: '最近应用崩溃日志', task: () => runPowerShell("Get-WinEvent -FilterHashtable @{LogName='Application';Level=2;StartTime=(Get-Date).AddDays(-7)} -MaxEvents 80 -ErrorAction SilentlyContinue | Where-Object { $_.ProviderName -match 'Application Error|Office|WPS' -or $_.Message -match 'WINWORD|EXCEL|POWERPNT|OUTLOOK|wps' } | Select-Object -First 15 TimeCreated,ProviderName,Id,Message | Format-List", 20000) },
  ]));
  if ((pathname === '/api/tools/desktop-optimizer' || pathname === '/api/tools/office-repair' || pathname === '/api/tools/windows-repair' || pathname === '/api/tools/data-migration' || pathname === '/api/tools/software-uninstall') && req.method === 'GET') {
    const toolId = pathname.slice('/api/tools/'.length);
    const products = toolId === 'software-uninstall' ? await listMsiProducts() : undefined;
    return send(res, 200, { ok: true, ...controlledRepairPlan(toolId), ...(products ? { products } : {}) });
  }
  if ((pathname === '/api/tools/desktop-optimizer' || pathname === '/api/tools/office-repair' || pathname === '/api/tools/windows-repair' || pathname === '/api/tools/data-migration' || pathname === '/api/tools/software-uninstall') && req.method === 'POST') {
    const toolId = pathname.slice('/api/tools/'.length);
    const plan = controlledRepairPlan(toolId);
    const selected = selectedControlledActions(toolId, body.actions);
    if (!selected) return send(res, 400, { ok: false, output: '请选择当前修复计划中的一个或多个动作。', ...plan });
    if (body.confirmed !== true) return send(res, 400, { ok: false, output: '该操作会修改本机状态。请阅读风险与回滚说明后明确确认执行。', selectedActions: selected, ...plan });
    if (selected.some((item) => item.id === 'msi-uninstall') && !isMsiProductCode(body.productCode)) return send(res, 400, { ok: false, output: '静默卸载必须从本机 MSI 软件清单中精确选择产品。' });
    return send(res, 200, await runControlledRepair(toolId, body.actions, { productCode: body.productCode }));
  }
  if (pathname === '/api/tools/incident-evidence') return send(res, 200, await bundleChecks([
    { name: '网络快照', task: () => run('ipconfig', ['/all'], 10000) },
    { name: '系统错误', task: () => runPowerShell("Get-WinEvent -FilterHashtable @{LogName='System';Level=1,2,3;StartTime=(Get-Date).AddDays(-3)} -MaxEvents 20 | Select-Object TimeCreated,ProviderName,Id,LevelDisplayName,Message | Format-List", 15000) },
    { name: '应用程序错误', task: () => runPowerShell("Get-WinEvent -FilterHashtable @{LogName='Application';Level=1,2;StartTime=(Get-Date).AddDays(-3)} -MaxEvents 20 | Select-Object TimeCreated,ProviderName,Id,LevelDisplayName,Message | Format-List", 15000) },
    { name: '进程与服务', task: () => runPowerShell("Get-Process | Sort-Object CPU -Descending | Select-Object -First 20 ProcessName,Id,CPU,WorkingSet | Format-Table -AutoSize; ''; Get-Service | Where-Object Status -eq 'Stopped' | Select-Object -First 30 Name,DisplayName,Status | Format-Table -AutoSize", 15000) },
  ]));
  if (pathname === '/api/tools/desktop-diagnosis') {
    const symptom = String(body.symptom || 'general').trim().toLowerCase();
    const playbooks = {
      'no-network': [
        { name: '网络快照', task: () => run('ipconfig', ['/all'], 10000) },
        { name: '网关连通', task: () => runPowerShell("$route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Where-Object NextHop | Sort-Object RouteMetric | Select-Object -First 1; if ($route) { Test-Connection $route.NextHop -Count 2 | Select-Object Address,Status,ResponseTime | Format-Table -AutoSize } else { '未找到默认网关。' }", 10000) },
        { name: 'DNS 解析', task: () => run('nslookup', ['www.microsoft.com'], 10000) },
      ],
      'software-not-open': [
        { name: 'Office / WPS 进程与崩溃', task: () => runPowerShell("Get-Process WINWORD,EXCEL,POWERPNT,OUTLOOK,wps,et,wpp -ErrorAction SilentlyContinue | Select-Object ProcessName,Id,Responding | Format-Table -AutoSize; Get-WinEvent -FilterHashtable @{LogName='Application';Level=2;StartTime=(Get-Date).AddDays(-3)} -MaxEvents 15 | Where-Object Message -match 'WINWORD|EXCEL|POWERPNT|OUTLOOK|wps' | Select-Object TimeCreated,ProviderName,Id,Message | Format-List", 18000) },
        { name: '软件运行环境', task: () => runPowerShell("Get-ItemProperty 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object DisplayName -match 'Microsoft 365|Office|WPS|Java|\\.NET|Visual C' | Select-Object DisplayName,DisplayVersion,Publisher | Format-Table -AutoSize", 15000) },
      ],
      'computer-slow': [
        { name: '资源热点', task: () => runPowerShell("Get-Process | Sort-Object CPU -Descending | Select-Object -First 12 ProcessName,Id,@{Name='CPUSeconds';Expression={[math]::Round($_.CPU,1)}},@{Name='MemoryMB';Expression={[math]::Round($_.WorkingSet64 / 1MB,1)}} | Format-Table -AutoSize", 15000) },
        { name: '磁盘空间', task: () => runPowerShell("Get-Volume | Where-Object DriveLetter | Select-Object DriveLetter,SizeRemaining,Size,HealthStatus | Format-Table -AutoSize", 10000) },
        { name: '启动项', task: () => runPowerShell("Get-CimInstance Win32_StartupCommand | Select-Object Name,Command,Location,User | Sort-Object Name | Format-Table -AutoSize", 15000) },
      ],
      printer: [
        { name: '打印服务', task: () => runPowerShell("Get-Service Spooler | Select-Object Name,Status,StartType | Format-Table -AutoSize; Get-Printer | Select-Object Name,PrinterStatus,WorkOffline,PortName | Format-Table -AutoSize", 12000) },
        { name: '打印驱动', task: () => runPowerShell("Get-PrinterDriver | Select-Object Name,MajorVersion,Manufacturer | Format-Table -AutoSize", 12000) },
      ],
      bluescreen: [
        { name: '蓝屏与系统事件', task: () => runPowerShell("Get-WinEvent -FilterHashtable @{LogName='System';StartTime=(Get-Date).AddDays(-14)} -MaxEvents 120 -ErrorAction SilentlyContinue | Where-Object { $_.ProviderName -match 'BugCheck|WHEA|volmgr|Kernel-Power' -or $_.Id -in 41,1001,6008 } | Select-Object TimeCreated,ProviderName,Id,LevelDisplayName,Message | Format-List", 20000) },
      ],
    };
    const tasks = playbooks[symptom] || [...playbooks['no-network'], ...playbooks['computer-slow']].slice(0, 5);
    const result = await bundleChecks(tasks);
    return send(res, result.ok ? 200 : 500, { ...result, symptom, conclusion: `已按“${symptom}”串联 ${tasks.length} 项现场检查，请结合每项输出确认根因。` });
  }
  if (pathname === '/api/tools/delivery-acceptance') return send(res, 200, await bundleChecks([
    { name: '网络与 DNS', task: () => bundleChecks([{ name: '默认网关', task: () => runPowerShell("$route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Where-Object NextHop | Sort-Object RouteMetric | Select-Object -First 1; if ($route) { Test-Connection $route.NextHop -Count 2 | Select-Object Address,Status,ResponseTime | Format-Table -AutoSize } else { '未发现默认网关。' }", 10000) }, { name: '外网解析', task: () => run('nslookup', ['www.microsoft.com'], 10000) }]) },
    { name: '磁盘与系统', task: () => runPowerShell("Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,LastBootUpTime | Format-List; Get-Volume | Where-Object DriveLetter | Select-Object DriveLetter,SizeRemaining,Size,HealthStatus | Format-Table -AutoSize", 15000) },
    { name: '打印服务', task: () => runPowerShell("Get-Service Spooler | Select-Object Name,Status,StartType | Format-Table -AutoSize; Get-Printer | Select-Object Name,PrinterStatus,WorkOffline | Format-Table -AutoSize", 12000) },
    { name: 'Office / WPS', task: () => runPowerShell("Get-ItemProperty 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object DisplayName -match 'Microsoft 365|Office|WPS' | Select-Object DisplayName,DisplayVersion | Format-Table -AutoSize", 15000) },
    { name: '安全状态', task: () => runPowerShell("Get-MpComputerStatus -ErrorAction SilentlyContinue | Select-Object AMServiceEnabled,AntivirusEnabled,RealTimeProtectionEnabled,AntivirusSignatureLastUpdated | Format-List; Get-NetFirewallProfile | Select-Object Name,Enabled | Format-Table -AutoSize", 15000) },
  ]));
  if (pathname === '/api/tools/user-permissions') return send(res, 200, await bundleChecks([
    { name: '本地账户', task: () => run('cmd.exe', ['/d', '/c', 'net', 'user'], 10000) },
    { name: '管理员组', task: () => run('cmd.exe', ['/d', '/c', 'net', 'localgroup', 'Administrators'], 10000) },
    { name: '域加入与当前身份', task: () => runPowerShell("Get-CimInstance Win32_ComputerSystem | Select-Object Name,Domain,PartOfDomain,UserName | Format-List; whoami /groups", 12000) },
  ]));
  if (pathname === '/api/tools/peripheral-health') return send(res, 200, await bundleChecks([
    { name: 'USB 与即插即用设备', task: () => runPowerShell("Get-PnpDevice -PresentOnly | Where-Object { $_.Class -in 'USB','Bluetooth','Image','Camera','Ports','Monitor' } | Select-Object Class,FriendlyName,Status,Problem | Format-Table -AutoSize", 15000) },
    { name: '蓝牙与摄像头', task: () => runPowerShell("Get-PnpDevice -PresentOnly | Where-Object FriendlyName -match 'Bluetooth|Camera|Webcam|Scanner|Projector' | Select-Object Class,FriendlyName,Status | Format-Table -AutoSize", 12000) },
  ]));
  if (pathname === '/api/tools/browser-health') return send(res, 200, await bundleChecks([
    { name: '代理配置', task: () => run('netsh', ['winhttp', 'show', 'proxy'], 8000) },
    { name: '浏览器安装', task: () => runPowerShell("Get-ItemProperty 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object DisplayName -match 'Chrome|Edge|Firefox' | Select-Object DisplayName,DisplayVersion | Format-Table -AutoSize", 12000) },
    { name: '证书存储', task: () => runPowerShell("Get-ChildItem Cert:\\CurrentUser\\My | Select-Object Subject,NotAfter,Thumbprint | Sort-Object NotAfter | Format-Table -AutoSize", 12000) },
  ]));
  if (pathname === '/api/tools/collaboration-health') return send(res, 200, await bundleChecks([
    { name: '协作软件进程', task: () => runPowerShell("Get-Process Teams,ms-teams,WXWork,DingTalk,OUTLOOK -ErrorAction SilentlyContinue | Select-Object ProcessName,Id,Responding | Format-Table -AutoSize", 10000) },
    { name: '代理与时间', task: () => bundleChecks([{ name: '代理', task: () => run('netsh', ['winhttp', 'show', 'proxy'], 8000) }, { name: '时间同步', task: () => run('w32tm', ['/query', '/status'], 8000) }]) },
  ]));
  if (pathname === '/api/tools/business-runtime-health') return send(res, 200, await bundleChecks([
    { name: 'Java / .NET / VC++', task: () => runPowerShell("$commands = 'java -version','dotnet --info','Get-ItemProperty HKLM:\\Software\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64 -ErrorAction SilentlyContinue'; foreach ($command in $commands) { Write-Output ('> ' + $command); try { Invoke-Expression $command 2>&1 | Select-Object -First 12 } catch { Write-Output $_.Exception.Message } }", 15000) },
    { name: '串口与加密狗线索', task: () => runPowerShell("Get-PnpDevice -PresentOnly | Where-Object { $_.Class -in 'Ports','USB' } | Select-Object Class,FriendlyName,Status,InstanceId | Format-Table -AutoSize", 12000) },
  ]));
  if (pathname === '/api/tools/desktop-health') return send(res, 200, await bundleChecks([
    { name: '系统与磁盘', task: () => runPowerShell("Get-CimInstance Win32_OperatingSystem | Select-Object CSName,Caption,Version,LastBootUpTime,FreePhysicalMemory | Format-List; Get-Volume | Where-Object DriveLetter | Select-Object DriveLetter,SizeRemaining,Size,HealthStatus | Format-Table -AutoSize", 15000) },
    { name: '驱动与事件', task: () => runPowerShell("$drivers = Get-PnpDevice -PresentOnly | Where-Object Status -ne 'OK' | Select-Object Class,FriendlyName,Status,Problem; if ($drivers) { $drivers | Format-Table -AutoSize } else { '未发现即插即用设备异常。' }; Get-WinEvent -FilterHashtable @{LogName='System';Level=1,2;StartTime=(Get-Date).AddDays(-3)} -MaxEvents 12 | Select-Object TimeCreated,ProviderName,Id,Message | Format-List", 20000) },
    { name: '更新与启动项', task: () => runPowerShell("Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 8 HotFixID,InstalledOn,Description | Format-Table -AutoSize; Get-CimInstance Win32_StartupCommand | Select-Object Name,Location,User | Sort-Object Name | Format-Table -AutoSize", 18000) },
  ]));
  if (pathname === '/api/tools/vpn-proxy-health') return send(res, 200, await bundleChecks([
    { name: 'WinHTTP 与用户代理', task: () => runPowerShell("netsh winhttp show proxy; Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' | Select-Object ProxyEnable,ProxyServer,AutoConfigURL | Format-List", 10000) },
    { name: 'VPN 适配器与路由', task: () => runPowerShell("Get-NetAdapter -IncludeHidden | Where-Object { $_.InterfaceDescription -match 'VPN|TAP|WireGuard|WAN Miniport|Fortinet|Cisco|AnyConnect' -or $_.Name -match 'VPN|TAP|WireGuard' } | Select-Object Name,Status,InterfaceDescription,LinkSpeed | Format-Table -AutoSize; Get-NetRoute -AddressFamily IPv4 | Where-Object { $_.DestinationPrefix -eq '0.0.0.0/0' -or $_.NextHop -ne '0.0.0.0' } | Sort-Object RouteMetric | Select-Object -First 20 DestinationPrefix,NextHop,InterfaceAlias,RouteMetric | Format-Table -AutoSize", 15000) },
    { name: 'DNS 配置', task: () => runPowerShell("Get-DnsClientServerAddress -AddressFamily IPv4 | Select-Object InterfaceAlias,ServerAddresses | Format-Table -AutoSize", 10000) },
  ]));
  if (pathname === '/api/tools/share-nas-health') {
    const target = String(body.host || '').trim();
    if (target && !validHost(target)) return send(res, 400, { ok: false, output: 'NAS 或共享主机地址无效。' });
    const checks = [
      { name: 'SMB 客户端配置', task: () => runPowerShell("Get-SmbClientConfiguration | Select-Object EnableSecuritySignature,RequireSecuritySignature,EnableInsecureGuestLogons | Format-List; Get-SmbConnection -ErrorAction SilentlyContinue | Select-Object ServerName,ShareName,UserName,Dialect | Format-Table -AutoSize", 12000) },
      { name: '映射盘与凭据', task: () => runPowerShell("Get-PSDrive -PSProvider FileSystem | Select-Object Name,Root,Used,Free,Description | Format-Table -AutoSize; cmdkey /list", 12000) },
    ];
    if (target) checks.push({ name: `SMB 端口 ${target}`, task: () => multiPortCheck(target, [445, 139]) });
    return send(res, 200, await bundleChecks(checks));
  }
  if (pathname === '/api/tools/security-baseline') return send(res, 200, await bundleChecks([
    { name: 'Defender 与补丁', task: () => runPowerShell("Get-MpComputerStatus -ErrorAction SilentlyContinue | Select-Object AMServiceEnabled,AntivirusEnabled,RealTimeProtectionEnabled,AntispywareEnabled,AntivirusSignatureLastUpdated | Format-List; Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 8 HotFixID,InstalledOn,Description | Format-Table -AutoSize", 18000) },
    { name: 'BitLocker 与防火墙', task: () => runPowerShell("Get-BitLockerVolume -ErrorAction SilentlyContinue | Select-Object MountPoint,VolumeStatus,ProtectionStatus,EncryptionPercentage | Format-Table -AutoSize; Get-NetFirewallProfile | Select-Object Name,Enabled,DefaultInboundAction | Format-Table -AutoSize", 15000) },
    { name: '远程桌面暴露', task: () => runPowerShell("$rdp = Get-ItemProperty 'HKLM:\\System\\CurrentControlSet\\Control\\Terminal Server' -ErrorAction SilentlyContinue; [pscustomobject]@{ RemoteDesktopEnabled = ($rdp.fDenyTSConnections -eq 0) } | Format-List; Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object LocalPort -eq 3389 | Select-Object LocalAddress,LocalPort,OwningProcess | Format-Table -AutoSize", 12000) },
  ]));
  if (pathname === '/api/tools/server-health') return send(res, 200, await bundleChecks([
    { name: '资源与磁盘', task: () => runPowerShell("Get-CimInstance Win32_OperatingSystem | Select-Object CSName,Caption,LastBootUpTime,FreePhysicalMemory | Format-List; Get-Volume | Where-Object DriveLetter | Select-Object DriveLetter,SizeRemaining,Size,HealthStatus | Format-Table -AutoSize", 15000) },
    { name: '关键服务与端口', task: () => runPowerShell("Get-Service | Where-Object { $_.Status -eq 'Stopped' -and $_.StartType -eq 'Automatic' } | Select-Object -First 30 Name,DisplayName,Status,StartType | Format-Table -AutoSize; Get-NetTCPConnection -State Listen | Select-Object -First 40 LocalAddress,LocalPort,OwningProcess | Sort-Object LocalPort | Format-Table -AutoSize", 18000) },
    { name: '时间同步', task: () => run('w32tm', ['/query', '/status'], 8000) },
  ]));
  if (pathname === '/api/tools/ad-health') return send(res, 200, await bundleChecks([
    { name: '域加入与 DNS', task: () => runPowerShell("Get-CimInstance Win32_ComputerSystem | Select-Object Name,Domain,PartOfDomain,UserName | Format-List; Get-DnsClientServerAddress -AddressFamily IPv4 | Select-Object InterfaceAlias,ServerAddresses | Format-Table -AutoSize", 12000) },
    { name: '组策略状态', task: () => run('gpresult', ['/r'], 15000) },
    { name: '域控发现', task: () => run('nltest', ['/dsgetdc:'], 10000) },
  ]));
  if (pathname === '/api/tools/certificate-domain') {
    const target = String(body.host || '').trim();
    if (!validHost(target)) return send(res, 400, { ok: false, output: '请输入有效域名或主机地址。' });
    return send(res, 200, await bundleChecks([{ name: 'DNS 解析', task: () => run('nslookup', [target], 10000) }, { name: 'TLS 证书链', task: () => certificateProbe(target) }, { name: 'HTTPS 连通性', task: () => webProbe(target, 443, true) }]));
  }
  if (pathname === '/api/tools/batch-check') {
    const targets = Array.isArray(body.targets) ? body.targets : String(body.targets || body.csv || '').split(/[\s,;\r\n]+/).filter((item) => !/^(host|hostname|ip|target|目标)$/i.test(item));
    const hosts = [...new Set(targets.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, 50);
    if (!hosts.length || hosts.some((host) => !validHost(host))) return send(res, 400, { ok: false, output: '请输入不超过 50 个有效 IP 或主机名，可使用逗号或换行分隔。' });
    const port = Number(body.port || 0);
    if (port && (!Number.isInteger(port) || port < 1 || port > 65535)) return send(res, 400, { ok: false, output: '端口必须在 1 到 65535 之间。' });
    const results = await Promise.all(hosts.map(async (host) => {
      const ping = await run('ping', ['-n', '1', '-w', '1200', host], 3000);
      const service = port ? await portCheck(host, port) : null;
      return { host, ping: ping.ok, port: service ? service.ok : null, detail: service?.output || '' };
    }));
    const output = ['目标\tPing\t端口', ...results.map((item) => `${item.host}\t${item.ping ? '正常' : '失败'}\t${item.port === null ? '-' : item.port ? '开放' : '关闭'}`)].join('\n');
    const csv = ['目标,Ping,端口', ...results.map((item) => `${item.host},${item.ping ? '正常' : '失败'},${item.port === null ? '-' : item.port ? '开放' : '关闭'}`)].join('\r\n');
    return send(res, 200, { ok: results.every((item) => item.ping && (item.port === null || item.port)), total: results.length, results, csv, output });
  }
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
    const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>IT 运维百宝箱 离线应急诊断</title><style>body{max-width:860px;margin:30px auto;padding:0 20px;color:#1e293b;font:14px/1.7 "Microsoft YaHei",sans-serif;background:#f8fafc}h1{color:#0d766c;font-size:22px}.card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:18px;margin:14px 0}.card h2{font-size:16px;margin:0 0 10px}input{width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:7px;font:inherit;margin-bottom:12px}.tools{display:flex;flex-wrap:wrap;gap:8px}.tools button{padding:8px 14px;border:1px solid #bddad4;border-radius:7px;background:#f0faf7;color:#0d766c;cursor:pointer;font:13px "Microsoft YaHei",sans-serif}.tools button:hover{background:#d9f2eb}pre{white-space:pre-wrap;background:#12202d;color:#dbe9f6;padding:14px;border-radius:8px;font:12px/1.6 Consolas,monospace;max-height:500px;overflow:auto}.note{color:#718096;font-size:12px;margin:16px 0 8px}</style><body><h1>IT 运维百宝箱 离线应急诊断</h1><p class="note">不依赖后台服务。填入目标 IP 后点击工具按钮，PowerShell 在本地执行。</p><div class="card"><h2>目标</h2><input id="host" placeholder="目标 IP（留空则检查本机）" value=""/><div class="tools">${tools.map(t => `<button onclick="runTool('${t.name}')">${t.name}</button>`).join('')}</div></div><div class="card"><h2>结果</h2><pre id="output">点击上方工具开始诊断。\n\n本页面为自包含 HTML，无需后台服务。\n所有命令通过 PowerShell 在本机执行，不会上传数据。</pre></div><script>const apiMap={ping:'ping -n 4 -w 1500',dns_lookup:'nslookup',check_arp:'arp -a',get_network_info:'ipconfig /all',get_network_snapshot:'ipconfig /all & route print -4 & arp -a',check_gateway:'powershell -Command "$r=Get-NetRoute -DestinationPrefix 0.0.0.0/0|?{$_.NextHop}|Sort RouteMetric|Select -First 1;if($r){Test-Connection $r.NextHop -Count 2|ft Address,Status,ResponseTime}"',check_internet:'powershell -Command "nslookup www.cloudflare.com; ping -n 2 1.1.1.1"',check_adapter_health:'powershell -Command "Get-NetAdapter|select Name,Status,LinkSpeed,MacAddress|ft"',get_system_info:'powershell -Command "Get-CimInstance Win32_OperatingSystem|fl CSName,Caption,LastBootUpTime;Get-Volume|? DriveLetter|ft DriveLetter,SizeRemaining,Size,HealthStatus"',check_spooler:'powershell -Command "Get-Service Spooler|ft;Get-Printer|select Name,PrinterStatus,WorkOffline|ft"',get_system_errors:'powershell -Command "Get-WinEvent -FilterHashtable @{LogName=System;Level=1,2;StartTime=(Get-Date).AddDays(-3)} -MaxEvents 10|fl TimeCreated,Id,Message"',check_drivers:'powershell -Command "Get-PnpDevice -PresentOnly|?{$_.Status -ne \\'OK\\'}|ft Class,FriendlyName,Status"'};async function runTool(name){const host=document.getElementById('host').value.trim()||'127.0.0.1';const cmd=(apiMap[name]||name).replace(/\\$host/g,host);const out=document.getElementById('output');out.textContent='执行中: '+name+'...';try{const result=await execPowerShell(cmd);out.textContent=name+'\\n'+'='.repeat(40)+'\\n'+result}catch(e){out.textContent='错误: '+e.message}};async function execPowerShell(cmd){return new Promise((resolve,reject)=>{try{const shell=new ActiveXObject('WScript.Shell');const proc=shell.Exec('powershell.exe -NoProfile -Command "'+cmd.replace(/"/g,'\\"')+'"');let out='';while(proc.Status===0){new Promise(r=>setTimeout(r,50))};out=proc.StdOut.ReadAll();if(!out)out=proc.StdErr.ReadAll();resolve(out)}catch(e){reject(e)}})};</script></body></html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': 'attachment; filename="IT运维百宝箱-离线应急诊断.html"', 'Cache-Control': 'no-store' });
    res.end(html); return;
  }
  if (pathname === '/api/tools/wifi-scan') return send(res, 200, await runPowerShell("Get-NetAdapter | Where-Object InterfaceType -eq 71 | ForEach-Object { $iface = $_.Name; netsh wlan show networks mode=bssid interface=\"$iface\" }", 15000));
  if (pathname === '/api/tools/dhcp-test') return send(res, 200, await runPowerShell("$adapters = Get-NetAdapter -Physical | Where-Object Status -eq 'Up'; $results = @(); foreach ($a in $adapters) { $ip = Get-NetIPConfiguration -InterfaceIndex $a.InterfaceIndex -ErrorAction SilentlyContinue; $dhcp = Get-NetIPInterface -InterfaceIndex $a.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Dhcp -ErrorAction SilentlyContinue; $server = ($ip | Select-Object -ExpandProperty DhcpServer -ErrorAction SilentlyContinue) -join ', '; $results += \"$($a.Name): DHCP=$dhcp, Server=$server, IP=$($ip.IPv4Address.IPAddress -join ', ')\" }; $results -join \"`n\"", 10000));
  if (pathname === '/api/tools/process-list') return send(res, 200, await runPowerShell("Get-Process | Sort-Object CPU -Descending | Select-Object -First 25 ProcessName,Id,CPU,WorkingSet,StartTime,Company | Format-Table -AutoSize", 10000));
  if (pathname === '/api/tools/service-list') return send(res, 200, await runPowerShell("Get-Service | Sort-Object Status,Name | Select-Object Status,Name,DisplayName,StartType | Format-Table -AutoSize", 10000));
  if (pathname === '/api/tools/login-history') return send(res, 200, await runPowerShell("Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4624; StartTime=(Get-Date).AddDays(-7)} -MaxEvents 20 -ErrorAction SilentlyContinue | Select-Object TimeCreated,@{N='用户';E={$_.Properties[5].Value}},@{N='登录类型';E={switch($_.Properties[8].Value){2{'交互式'}3{'网络'}4{'批处理'}5{'服务'}7{'解锁'}10{'远程桌面'}default{$_.Properties[8].Value}}}},@{N='来源IP';E={$_.Properties[18].Value}} | Format-Table -AutoSize", 15000));
  if (pathname === '/api/tools/shared-folders') return send(res, 200, await runPowerShell("Get-WmiObject Win32_Share | Select-Object Name,Path,Description,Type | Format-Table -AutoSize", 10000));
  if (pathname === '/api/tools/scheduled-tasks') return send(res, 200, await runPowerShell("Get-ScheduledTask | Where-Object State -ne 'Disabled' | Sort-Object TaskPath,TaskName | Select-Object -First 30 TaskPath,TaskName,State,@{N='上次运行';E={(Get-ScheduledTaskInfo -TaskName $_.TaskName -TaskPath $_.TaskPath).LastRunTime}},@{N='上次结果';E={(Get-ScheduledTaskInfo -TaskName $_.TaskName -TaskPath $_.TaskPath).LastTaskResult}} | Format-Table -AutoSize", 15000));
  if (pathname === '/api/tools/time-sync') return send(res, 200, await bundleChecks([{ name: '当前系统时间', task: () => runPowerShell("Get-Date -Format 'yyyy-MM-dd HH:mm:ss 星期dddd'") }, { name: '时间源配置', task: () => run('w32tm', ['/query', '/source'], 5000) }, { name: '时间同步状态', task: () => run('w32tm', ['/query', '/status'], 5000) }]));
  if (pathname === '/api/tools/env-vars') return send(res, 200, await runPowerShell("Get-ChildItem Env: | Sort-Object Name | Format-Table -AutoSize", 5000));
  if (pathname === '/api/tools/usb-history') return send(res, 200, await runPowerShell("$paths = 'HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\USBSTOR'; if (Test-Path $paths) { Get-ChildItem $paths | ForEach-Object { $name = $_.PSChildName; $friendly = (Get-ItemProperty \"$($_.PSPath)\\*\" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FriendlyName -ErrorAction SilentlyContinue); \"$name - $friendly\" } } else { '未找到 USB 存储设备历史记录。' }", 10000));
  if (pathname === '/api/tools/audio-check') return send(res, 200, await runPowerShell("$render = Get-PnpDevice -Class AudioEndpoint -Status OK -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -notlike '*输入*' -and $_.FriendlyName -notlike '*Input*' } | Select-Object FriendlyName,Status; $capture = Get-PnpDevice -Class AudioEndpoint -Status OK -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -like '*输入*' -or $_.FriendlyName -like '*Input*' -or $_.FriendlyName -like '*麦克风*' } | Select-Object FriendlyName,Status; Write-Output '播放设备:'; if ($render) { $render | Format-Table -AutoSize } else { '  无' }; Write-Output '录制/麦克风设备:'; if ($capture) { $capture | Format-Table -AutoSize } else { '  无' }", 10000));
  if (pathname === '/api/tools/pos-peripherals') return send(res, 200, await runPowerShell("$com = Get-PnpDevice -Class Ports -ErrorAction SilentlyContinue | Select-Object FriendlyName,Status; $hid = Get-PnpDevice -Class HIDClass -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -match '扫描|扫码|条码|Scanner|Barcode' } | Select-Object FriendlyName,Status; Write-Output '串口/COM设备（可能接扫码枪/客显/秤）:'; if ($com) { $com | Format-Table -AutoSize } else { '  无' }; Write-Output 'HID 扫码设备:'; if ($hid) { $hid | Format-Table -AutoSize } else { '  未检测到明确标识为扫码枪的 HID 设备（部分扫码枪为键盘模式，可在键盘设备中查看）' }", 10000));
  if (pathname === '/api/tools/conn-tracker') return send(res, 200, await connTracker());
  if (pathname === '/api/tools/domain-whois') return send(res, 200, await domainWhois(body.domain));
  if (pathname === '/api/tools/http-api') return send(res, 200, await httpApiTest({ url: body.url, method: body.method, headers: body.headers, body: body.body, timeout: body.timeout }));
  if (pathname === '/api/tools/websocket-test') return send(res, 200, await websocketTest({ url: body.url, timeout: body.timeout }));
  if (pathname === '/api/tools/ptr-lookup') return send(res, 200, await ptrLookup(body.ip));
  if (pathname === '/api/tools/mitm-hints') return send(res, 200, await mitmHints());
  if (pathname === '/api/tools/netflow-listen') return send(res, 200, await netflowListen({ port: body.port, duration: body.duration }));
  if (pathname === '/api/tools/subnet-calc') return send(res, 200, subnetCalc({ cidr: body.cidr }));
  if (pathname === '/api/tools/route-table') return send(res, 200, await routeTable());
  if (pathname === '/api/tools/firewall-status') return send(res, 200, await firewallStatus());
  if (pathname === '/api/tools/port-occupancy') return send(res, 200, await portOccupancy({ port: body.port }));
  if (pathname === '/api/tools/ip-info') return send(res, 200, await ipInfo());
  if (pathname === '/api/tools/dhcp-detect') return send(res, 200, await dhcpDetect());
  if (pathname === '/api/tools/host-discovery') return send(res, 200, await hostDiscovery({ subnet: body.subnet }));
  if (pathname === '/api/tools/loop-detection') return send(res, 200, await loopDetection({ target: body.target }));
  if (pathname === '/api/tools/speed-test') return send(res, 200, await speedTest());
  if (pathname === '/api/tools/network-health') return send(res, 200, await networkHealth());
  if (pathname === '/api/tools/arp-table') return send(res, 200, await arpTable());
  if (pathname === '/api/tools/port-service-probe') {
    const target = body.host?.trim();
    const p = Number(body.port);
    if (!validHost(target)) return send(res, 400, { ok: false, output: 'Target must be a valid IP address or hostname.' });
    if (!Number.isInteger(p) || p < 1 || p > 65535) return send(res, 400, { ok: false, output: 'Port must be between 1 and 65535.' });
    return send(res, 200, await portServiceProbe({ host: target, port: p }));
  }
  if (pathname === '/api/tools/temp-http-server') {
    if (req.method === 'DELETE') return send(res, 200, await stopTempHttpServer(body.port));
    return send(res, 200, await tempHttpServer({ port: body.port, dir: body.dir }));
  }
  if (pathname === '/api/tools/temp-http-server/status') return send(res, 200, { ok: true, servers: getActiveTempServers() });

  // FTP 服务器
  if (pathname === '/api/tools/ftp-server') {
    if (req.method === 'DELETE') return send(res, 200, await stopFtpServer(body.port));
    return send(res, 200, await startFtpServer({ port: body.port, root: body.root, user: body.user, password: body.password, anonymous: body.anonymous }));
  }
  if (pathname === '/api/tools/ftp-server/status') return send(res, 200, { ok: true, servers: getActiveFtpServers() });

  // TFTP 服务器
  if (pathname === '/api/tools/tftp-server') {
    if (req.method === 'DELETE') return send(res, 200, await stopTftpServer(body.port));
    return send(res, 200, await startTftpServer({ port: body.port, root: body.root }));
  }
  if (pathname === '/api/tools/tftp-server/status') return send(res, 200, { ok: true, servers: getActiveTftpServers() });

  // Syslog 服务器
  if (pathname === '/api/tools/syslog-server') {
    if (req.method === 'DELETE') return send(res, 200, await stopSyslogServer(body.port));
    return send(res, 200, await startSyslogServer({ port: body.port, proto: body.proto }));
  }
  if (pathname === '/api/tools/syslog-server/status') return send(res, 200, { ok: true, servers: getActiveSyslogServers() });
  if (pathname === '/api/tools/syslog-server/messages') return send(res, 200, { ok: true, messages: getSyslogMessages(body.port) });

  // 摄像头扫描
  if (pathname === '/api/tools/camera-scan') {
    return send(res, 200, await cameraScan({ subnet: body.subnet, ports: body.ports, timeout: body.timeout }));
  }

  // 服务发现
  if (pathname === '/api/tools/service-discovery') {
    return send(res, 200, await serviceDiscovery({ mdnsSec: body.mdnsSec, ssdpSec: body.ssdpSec }));
  }

  // DHCP 服务器
  if (pathname === '/api/tools/dhcp-server') {
    if (req.method === 'DELETE') return send(res, 200, await stopDhcpServer(body.port));
    return send(res, 200, await startDhcpServer({ port: body.port, subnet: body.subnet, gateway: body.gateway, startIp: body.startIp, endIp: body.endIp, dns: body.dns }));
  }
  if (pathname === '/api/tools/dhcp-server/status') return send(res, 200, { ok: true, servers: getActiveDhcpServers() });

  // 内网测速
  if (pathname === '/api/tools/lan-speed-test') {
    return send(res, 200, await lanSpeedTest({ host: body.host, duration: body.duration }));
  }

  // Ping QoS 分析
  if (pathname === '/api/tools/ping-qos') {
    return send(res, 200, await pingQoS({ host: body.host, port: body.port, count: body.count, timeout: body.timeout }));
  }

  // 路由策略分析
  if (pathname === '/api/tools/route-policy') {
    return send(res, 200, await routePolicy());
  }

  // 连接测试
  if (pathname === '/api/tools/connection-test') {
    return send(res, 200, await connectionTest({ host: body.host, port: body.port, protocol: body.protocol, timeout: body.timeout }));
  }

  // 跳转前先检查监控路由（避免被下方的 host 校验误拦截）
  if (pathname === '/api/server/monitor/report' && req.method === 'POST') {
    const hostname = String(body.hostname || '').trim();
    if (!hostname || !body) return send(res, 400, { ok: false, output: '缺少 hostname 或监控数据' });
    const result = monitorStore.report(hostname, body);
    return send(res, result.alerts.length ? 200 : 200, result);
  }
  if (pathname === '/api/server/monitor/servers') {
    return send(res, 200, { ok: true, servers: monitorStore.listServers() });
  }
  if (pathname.startsWith('/api/server/monitor/status/')) {
    const hostname = decodeURIComponent(pathname.slice(27));
    const server = monitorStore.getServer(hostname);
    return send(res, 200, { ok: true, ...server });
  }
  if (pathname === '/api/server/monitor/threshold' && req.method === 'POST') {
    const hostname = String(body.hostname || '').trim();
    if (!hostname) return send(res, 400, { ok: false, output: '缺少 hostname' });
    monitorStore.setThreshold(hostname, body.thresholds || {});
    return send(res, 200, { ok: true });
  }
  if (pathname === '/api/server/monitor/agent-script') {
    try {
      const script = await readFile(join(root, 'agent', 'linux-monitor.sh'), 'utf-8');
      return send(res, 200, script, 'text/plain; charset=utf-8');
    } catch { return send(res, 404, { ok: false, output: 'Agent 脚本未找到' }); }
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
  if (pathname === '/api/tools/tcp-ping') { const n = Number(body.port) || 80; return send(res, 200, await tcpPing(host, n, Number(body.count) || 5)); }
  if (pathname === '/api/tools/mtu-probe') return send(res, 200, await mtuProbe(host));
  if (pathname === '/api/tools/network-quality') return send(res, 200, await networkQuality(host, Math.min(Math.max(Number(body.count) || 20, 1), 200)));
  if (pathname === '/api/tools/snmp-probe') return send(res, 200, await snmpProbe({ host: body.host, community: body.community, oid: body.oid, port: body.port, timeout: body.timeout }));
  if (pathname === '/api/tools/tls-scan') return send(res, 200, await tlsScan({ host: body.host, port: body.port }));
  if (pathname === '/api/tools/traceroute-analyze') return send(res, 200, await tracerouteAnalyze(body.host));
  return send(res, 404, { ok: false, output: 'Not found.' });
}
const app = express();
const authJson = express.json({ limit: '1mb' });

app.set('trust proxy', 'loopback');
app.disable('x-powered-by');
app.use(cors());
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.post('/api/email/sendCode', authJson, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!isQqEmail(email)) return apiError(res, '仅支持 QQ 邮箱，请填写例如 123456@qq.com', 400);
  if (!rateLimitStore.allowCode(email, clientIp(req))) return apiError(res, '请求过于频繁，请稍后再试', 429);
  const code = String(randomInt(100000, 1000000));
  try {
    await mysqlPool.execute('DELETE FROM email_code WHERE email = ?', [email]);
    await mysqlPool.execute('INSERT INTO email_code (email, code, expire_time) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))', [email, code]);
    await mailTransporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: '【运维百宝箱】注册验证码',
      html: `<p>您的注册验证码为：<strong style="font-size:24px;letter-spacing:4px">${code}</strong></p><p>验证码 5 分钟内有效，请勿泄露给他人。</p>`,
    });
    return apiSuccess(res, {}, '验证码已发送，请查收邮箱');
  } catch (error) {
    console.error('[email/sendCode]', error.message);
    return apiError(res, '验证码发送失败，请检查邮件和数据库配置', 500);
  }
});

app.post('/api/user/register', authJson, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const code = String(req.body?.code || '').trim();
  const nickname = String(req.body?.nickname || '').trim().slice(0, 64);
  const phone = String(req.body?.phone || '').trim().slice(0, 32);
  if (!isQqEmail(email) || !/^\d{6}$/.test(code)) return apiError(res, '仅支持 QQ 邮箱，且验证码必须为 6 位数字', 400);
  if (password.length < 8 || password.length > 200) return apiError(res, '密码长度必须为 8-200 位', 400);
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.beginTransaction();
    const [codes] = await connection.execute('SELECT id FROM email_code WHERE email = ? AND code = ? AND expire_time > NOW() ORDER BY id DESC LIMIT 1 FOR UPDATE', [email, code]);
    if (!codes.length) { await connection.rollback(); return apiError(res, '验证码错误或已过期', 400); }
    const [users] = await connection.execute('SELECT id FROM `user` WHERE email = ? LIMIT 1 FOR UPDATE', [email]);
    if (users.length) { await connection.rollback(); return apiError(res, '该邮箱已注册', 409); }
    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await connection.execute('INSERT INTO `user` (email, password, phone, nickname, role) VALUES (?, ?, ?, ?, \'user\')', [email, passwordHash, phone || null, nickname || null]);
    await connection.execute('DELETE FROM email_code WHERE id = ?', [codes[0].id]);
    await connection.commit();
    return apiSuccess(res, { id: result.insertId, email, nickname, role: 'user' }, '注册成功', 201);
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    console.error('[user/register]', error.message);
    return apiError(res, '注册失败，请稍后重试', 500);
  } finally { connection?.release(); }
});

app.post('/api/user/login', authJson, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!isValidEmail(email) || !password) return apiError(res, '邮箱或密码不能为空', 400);
  if (!jwtSecret()) return apiError(res, 'JWT_SECRET 未配置', 500);
  const ip = clientIp(req);
  if (!rateLimitStore.allowLogin(ip)) return apiError(res, '请求过于频繁，请稍后再试', 429);
  try {
    const [users] = await mysqlPool.execute('SELECT id, email, password, nickname, role FROM `user` WHERE email = ? LIMIT 1', [email]);
    if (!users.length || !(await bcrypt.compare(password, users[0].password))) {
      if (rateLimitStore.recordLoginFailure(ip)) return apiError(res, '请求过于频繁，请稍后再试', 429);
      return apiError(res, '邮箱或密码错误', 401);
    }
    rateLimitStore.clearLoginFailures(ip);
    const user = users[0];
    const token = jwt.sign({ userId: user.id, role: user.role }, jwtSecret(), { expiresIn: process.env.JWT_EXPIRES || '7d' });
    return apiSuccess(res, { token, role: user.role, nickname: user.nickname || '' }, '登录成功');
  } catch (error) {
    console.error('[user/login]', error.message);
    return apiError(res, '登录失败，请稍后重试', 500);
  }
});

app.post('/api/announcement/publish', authJson, authMiddleware, adminMiddleware, async (req, res) => {
  const title = String(req.body?.title || '').trim().slice(0, 255);
  const content = String(req.body?.content || '').trim();
  const level = String(req.body?.level || 'info').trim();
  if (!title || !content) return apiError(res, '标题和内容不能为空', 400);
  if (!['info', 'warning', 'danger'].includes(level)) return apiError(res, '公告级别无效', 400);
  try {
    const [result] = await mysqlPool.execute('INSERT INTO announcement (title, content, level, is_enable) VALUES (?, ?, ?, 1)', [title, content, level]);
    return apiSuccess(res, { id: result.insertId, title, content, level, is_enable: 1 }, '公告发布成功', 201);
  } catch (error) {
    console.error('[announcement/publish]', error.message);
    return apiError(res, '公告发布失败，请稍后重试', 500);
  }
});

app.get('/api/announcement/latest', authMiddleware, async (_req, res) => {
  try {
    const [rows] = await mysqlPool.execute('SELECT id, title, content, level, is_enable, created_at FROM announcement WHERE is_enable = 1 ORDER BY id DESC LIMIT 1');
    return apiSuccess(res, rows[0] || {}, rows.length ? '获取成功' : '暂无公告');
  } catch (error) {
    console.error('[announcement/latest]', error.message);
    return apiError(res, '公告获取失败，请稍后重试', 500);
  }
});

app.get('/api/version/latest', async (_req, res) => {
  try {
    const [rows] = await mysqlPool.execute('SELECT version, download_url, update_log FROM app_version WHERE is_enable = 1 ORDER BY id DESC LIMIT 1');
    if (!rows.length) return apiError(res, '暂无新版本', 200);
    return apiSuccess(res, rows[0], '成功');
  } catch (error) {
    console.error('[version/latest]', error.message);
    return apiError(res, '版本检查失败，请稍后重试', 500);
  }
});

app.post('/api/version/publish', authJson, authMiddleware, adminMiddleware, async (req, res) => {
  const version = String(req.body?.version || '').trim().slice(0, 32);
  const downloadUrl = String(req.body?.download_url || '').trim().slice(0, 500);
  const updateLog = String(req.body?.update_log || '').trim();
  if (!version || !downloadUrl || !updateLog) return apiError(res, '版本号、下载地址和更新日志不能为空', 400);
  try {
    const url = new URL(downloadUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return apiError(res, '下载地址必须是 HTTP 或 HTTPS 链接', 400);
  } catch { return apiError(res, '下载地址格式不正确', 400); }
  try {
    const [result] = await mysqlPool.execute('INSERT INTO app_version (version, download_url, update_log, is_enable) VALUES (?, ?, ?, 1)', [version, downloadUrl, updateLog]);
    return apiSuccess(res, { id: result.insertId, version, download_url: downloadUrl, update_log: updateLog, is_enable: 1 }, '版本发布成功', 201);
  } catch (error) {
    console.error('[version/publish]', error.message);
    return apiError(res, '版本发布失败，请稍后重试', 500);
  }
});

// 账号管理 - 列表（super/manager/admin可访问）
app.get('/api/user/list', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, search = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    let whereClause = '';
    let params = [];
    if (search) {
      whereClause = 'WHERE email LIKE ? OR nickname LIKE ? OR phone LIKE ?';
      params = [`%${search}%`, `%${search}%`, `%${search}%`];
    }
    // 角色权限控制：下级不能查看上级
    const currentRole = req.user.role;
    let roleFilter = '';
    if (currentRole === 'manager') {
      roleFilter = whereClause ? ' AND role IN ("admin","distributor","user")' : 'WHERE role IN ("admin","distributor","user")';
    } else if (currentRole === 'admin') {
      roleFilter = whereClause ? ' AND role IN ("distributor","user")' : 'WHERE role IN ("distributor","user")';
    }

    const [rows] = await mysqlPool.query(
      `SELECT id, email, nickname, phone, role, create_at, COALESCE(disabled, 0) AS disabled FROM user ${whereClause}${roleFilter} ORDER BY create_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );
    const [countRows] = await mysqlPool.query(
      `SELECT COUNT(*) as total FROM user ${whereClause}${roleFilter}`,
      params
    );
    res.json({ code: 0, msg: 'success', data: { list: rows, total: countRows[0].total, page: parseInt(page), pageSize: parseInt(pageSize) } });
  } catch (err) {
    console.error('[User List]', err);
    res.status(500).json({ code: -1, msg: '获取用户列表失败', data: {} });
  }
});

// 账号管理 - 新增账号（super/manager/admin可访问）
app.post('/api/user/create', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { email, password, nickname, phone, role } = req.body;
    const currentRole = req.user.role;

    // 角色权限校验
    const roleHierarchy = { super: 5, manager: 4, admin: 3, distributor: 2, user: 1 };
    if (roleHierarchy[role] > roleHierarchy[currentRole]) {
      return res.status(403).json({ code: -1, msg: '不能创建比自己角色更高的账号', data: {} });
    }
    // 只有 super 可以创建 manager
    if (role === 'manager' && currentRole !== 'super') {
      return res.status(403).json({ code: -1, msg: '只有超级管理员可以创建店长账号', data: {} });
    }
    // 不能创建 super
    if (role === 'super') {
      return res.status(403).json({ code: -1, msg: '不能创建超级管理员账号', data: {} });
    }

    const validRoles = ['manager', 'admin', 'distributor', 'user'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ code: -1, msg: '无效的角色', data: {} });
    }

    const [existing] = await mysqlPool.query('SELECT id FROM user WHERE email = ?', [email]);
    if (existing.length > 0) return res.status(409).json({ code: -1, msg: '邮箱已被注册', data: {} });

    const passwordHash = await bcrypt.hash(password, 10);
    await mysqlPool.query(
      'INSERT INTO user (email, password, phone, nickname, role) VALUES (?, ?, ?, ?, ?)',
      [email, passwordHash, phone || null, nickname || null, role]
    );
    res.json({ code: 0, msg: '账号创建成功', data: {} });
  } catch (err) {
    console.error('[User Create]', err);
    res.status(500).json({ code: -1, msg: '创建账号失败', data: {} });
  }
});

// 账号管理 - 编辑账号
app.patch('/api/user/update/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { nickname, role, phone } = req.body;
    const currentRole = req.user.role;

    const [users] = await mysqlPool.query('SELECT role FROM user WHERE id = ?', [id]);
    if (users.length === 0) return res.status(404).json({ code: -1, msg: '用户不存在', data: {} });

    const targetRole = users[0].role;
    const roleHierarchy = { super: 5, manager: 4, admin: 3, distributor: 2, user: 1 };

    // 不能操作上级
    if (roleHierarchy[targetRole] > roleHierarchy[currentRole]) {
      return res.status(403).json({ code: -1, msg: '不能修改上级角色账号', data: {} });
    }
    // 不能修改 super（除非自己是 super）
    if (targetRole === 'super' && currentRole !== 'super') {
      return res.status(403).json({ code: -1, msg: '不能修改超级管理员账号', data: {} });
    }

    const updates = [];
    const params = [];
    if (nickname) { updates.push('nickname = ?'); params.push(nickname); }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
    if (role) {
      if (role === 'super') return res.status(403).json({ code: -1, msg: '不能分配超级管理员角色', data: {} });
      if (roleHierarchy[role] > roleHierarchy[currentRole]) return res.status(403).json({ code: -1, msg: '不能分配比自己更高的角色', data: {} });
      updates.push('role = ?'); params.push(role);
    }
    params.push(id);
    await mysqlPool.query(`UPDATE user SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ code: 0, msg: '更新成功', data: {} });
  } catch (err) {
    console.error('[User Update]', err);
    res.status(500).json({ code: -1, msg: '更新失败', data: {} });
  }
});

// 账号管理 - 重置密码
app.post('/api/user/reset-password/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    const currentRole = req.user.role;

    const [users] = await mysqlPool.query('SELECT role FROM user WHERE id = ?', [id]);
    if (users.length === 0) return res.status(404).json({ code: -1, msg: '用户不存在', data: {} });

    const targetRole = users[0].role;
    const roleHierarchy = { super: 5, manager: 4, admin: 3, distributor: 2, user: 1 };
    if (roleHierarchy[targetRole] > roleHierarchy[currentRole]) {
      return res.status(403).json({ code: -1, msg: '不能重置上级账号密码', data: {} });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await mysqlPool.query('UPDATE user SET password = ? WHERE id = ?', [passwordHash, id]);
    res.json({ code: 0, msg: '密码重置成功', data: {} });
  } catch (err) {
    console.error('[Reset Password]', err);
    res.status(500).json({ code: -1, msg: '重置失败', data: {} });
  }
});

// 账号管理 - 启用/禁用账号
app.patch('/api/user/toggle/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { disabled } = req.body;
    const currentRole = req.user.role;

    const [users] = await mysqlPool.query('SELECT role FROM user WHERE id = ?', [id]);
    if (users.length === 0) return res.status(404).json({ code: -1, msg: '用户不存在', data: {} });

    const targetRole = users[0].role;
    const roleHierarchy = { super: 5, manager: 4, admin: 3, distributor: 2, user: 1 };
    if (roleHierarchy[targetRole] > roleHierarchy[currentRole]) {
      return res.status(403).json({ code: -1, msg: '不能操作上级账号', data: {} });
    }

    // 需要在 user 表添加 disabled 字段，如果不存在就跳过
    try {
      await mysqlPool.query('UPDATE user SET disabled = ? WHERE id = ?', [disabled ? 1 : 0, id]);
    } catch (e) {
      // 如果 disabled 字段不存在，添加它
      await mysqlPool.query('ALTER TABLE user ADD COLUMN IF NOT EXISTS disabled TINYINT(1) DEFAULT 0');
      await mysqlPool.query('UPDATE user SET disabled = ? WHERE id = ?', [disabled ? 1 : 0, id]);
    }
    res.json({ code: 0, msg: disabled ? '账号已禁用' : '账号已启用', data: {} });
  } catch (err) {
    console.error('[Toggle User]', err);
    res.status(500).json({ code: -1, msg: '操作失败', data: {} });
  }
});

// 忘记密码 - 通过邮箱验证码重置
app.post('/api/user/forgot-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) return res.status(400).json({ code: -1, msg: '参数缺失', data: {} });
    if (newPassword.length < 8) return res.status(400).json({ code: -1, msg: '密码至少8位', data: {} });

    const conn = await mysqlPool.getConnection();
    try {
      await conn.beginTransaction();
      const [codes] = await conn.query('SELECT id FROM email_code WHERE email = ? AND code = ? AND expire_time > NOW() FOR UPDATE', [email, code]);
      if (codes.length === 0) { await conn.rollback(); return res.status(400).json({ code: -1, msg: '验证码错误或已过期', data: {} }); }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await conn.query('UPDATE user SET password = ? WHERE email = ?', [passwordHash, email]);
      await conn.query('DELETE FROM email_code WHERE id = ?', [codes[0].id]);
      await conn.commit();
      res.json({ code: 0, msg: '密码重置成功', data: {} });
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  } catch (err) {
    console.error('[Forgot Password]', err);
    res.status(500).json({ code: -1, msg: '重置失败', data: {} });
  }
});

app.use(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url.pathname);
    let requestPath;
    try { requestPath = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname); } catch { return send(res, 400, 'Invalid path', 'text/plain'); }
    const file = normalize(join(root, requestPath));
    if (file !== root && !file.startsWith(root + sep)) return send(res, 403, 'Forbidden', 'text/plain');
    if (!isStaticPathAllowed(requestPath)) return send(res, 404, 'Not found', 'text/plain');
    try { return await serveStaticFile(req, res, file); }
    catch {
      if (!extname(requestPath)) {
        try { return await serveStaticFile(req, res, join(root, 'index.html')); } catch { /* 落到 404 */ }
      }
      return send(res, 404, 'Not found', 'text/plain');
    }
  } catch (error) {
    console.error('[request]', error.message);
    if (res.headersSent) return;
    return req.path.startsWith('/api/email/') || req.path.startsWith('/api/user/') || req.path.startsWith('/api/announcement/') || req.path.startsWith('/api/version/')
      ? apiError(res, '服务异常，请稍后重试', 500)
      : send(res, 500, { ok: false, output: '服务异常，请稍后重试。' });
  }
});

app.use((error, req, res, _next) => {
  console.error('[express]', error.message);
  if (res.headersSent) return;
  const isNewApi = req.path.startsWith('/api/email/') || req.path.startsWith('/api/user/') || req.path.startsWith('/api/announcement/') || req.path.startsWith('/api/version/');
  if (error instanceof SyntaxError && Object.hasOwn(error, 'body')) return isNewApi ? apiError(res, '请求 JSON 格式不正确', 400) : send(res, 400, { ok: false, output: '请求 JSON 格式不正确。' });
  return isNewApi ? apiError(res, '服务异常，请稍后重试', 500) : send(res, 500, { ok: false, output: '服务异常，请稍后重试。' });
});

const webServer = app.listen(port, '0.0.0.0', () => console.log(`IT 运维百宝箱运行于 http://0.0.0.0:${port}`));
let serverClosing = false;
async function shutdownServer() {
  if (serverClosing) return;
  serverClosing = true;
  await packetCapture.shutdown();
  await serialSessions.closeAll();
  webServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.once('SIGINT', shutdownServer);
process.once('SIGTERM', shutdownServer);
