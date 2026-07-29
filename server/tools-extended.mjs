/**
 * OpsHub 扩展现场工具模块
 * 包含运维场景常用但原版未内置的诊断工具
 * 由 server.mjs 在 handleApi 中调用
 */
import dgram from 'node:dgram';
import { execFile } from 'node:child_process';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { join, extname } from 'node:path';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat, readdir } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { Resolver } from 'node:dns/promises';

/* ── 通用执行器 ── */
export function run(command, args, timeout = 10000) {
  return new Promise((resolve) => execFile(command, args, { windowsHide: true, timeout, maxBuffer: 1024 * 1024, encoding: 'buffer' }, (error, stdout, stderr) => {
    const data = stdout?.length ? stdout : stderr;
    const output = data?.length ? new TextDecoder('gbk').decode(data).trim() : (error?.message || 'No output');
    resolve({ ok: !error, output });
  }));
}
export function runPowerShell(script, timeout = 15000) {
  return new Promise((resolve) => execFile('powershell.exe', ['-NoProfile', '-Command', `$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); ${script}`], { windowsHide: true, timeout, maxBuffer: 1024 * 1024, encoding: 'buffer' }, (error, stdout, stderr) => {
    const data = stdout?.length ? stdout : stderr;
    const output = data?.length ? new TextDecoder('utf-8').decode(data).trim() : (error?.message || 'No output');
    resolve({ ok: !error, output });
  }));
}
export async function bundleChecks(checks) {
  const results = await Promise.all(checks.map(async ({ name, task }) => ({ name, ...(await task()) })));
  return { ok: results.every((item) => item.ok), output: results.map((item) => `===== ${item.name}：${item.ok ? '正常' : '发现异常'} =====\n${item.output}`).join('\n\n') };
}

/* ── Wake-on-LAN 唤醒 ── */
export function sendWakeOnLan(macAddress) {
  return new Promise((resolve) => {
    const mac = String(macAddress || '').replace(/[:-\s]/g, '').toLowerCase();
    if (!/^[0-9a-f]{12}$/.test(mac)) return resolve({ ok: false, output: 'MAC 地址格式无效。正确格式如 AA:BB:CC:DD:EE:FF 或 AABBCCDDEEFF。' });
    const macBytes = Buffer.from(mac, 'hex');
    const packet = Buffer.concat([Buffer.alloc(6, 0xff), ...Array.from({ length: 16 }, () => macBytes)]);
    const socket = dgram.createSocket('udp4');
    let resolved = false;
    const done = (result) => { if (!resolved) { resolved = true; try { socket.close(); } catch { /* closed */ } resolve(result); } };
    socket.on('error', (error) => done({ ok: false, output: `发送 WOL 包失败：${error.message}` }));
    socket.bind(() => {
      socket.setBroadcast(true);
      socket.send(packet, 0, packet.length, 9, '255.255.255.255', (error) =>
        done(error
          ? { ok: false, output: `发送失败：${error.message}` }
          : { ok: true, output: `已向 ${macAddress} 发送 Wake-on-LAN 唤醒包（UDP 广播端口 9）。\n注意：目标设备必须已配置 WOL 功能且网卡支持远程唤醒。\n如广播不通，可尝试指定目标网段广播地址。` })
      );
    });
    setTimeout(() => done({ ok: false, output: 'WOL 发送超时。' }), 5000);
  });
}

/* ── MAC 厂商查询（本地 OUI 库 + 在线 API） ── */
const ouiVendors = {
  '001251': 'Hikvision (海康威视)', '18A905': 'Hikvision (海康威视)', '3C1300': 'Hikvision (海康威视)', '549BEC': 'Hikvision (海康威视)', '001D28': 'Hikvision (海康威视)', 'BCAD28': 'Hikvision (海康威视)',
  '001AA0': 'Dahua (大华)', '4C11BF': 'Dahua (大华)', '38AF43': 'Dahua (大华)', '901A86': 'Uniview (宇视)', '00A0DA': 'Uniview (宇视)', 'C0E842': 'Uniview (宇视)',
  '000FE2': 'H3C (新华三)', '002389': 'H3C (新华三)', '3CB26F': 'H3C (新华三)', '001E73': 'Ruijie (锐捷)', '0090F0': 'Ruijie (锐捷)', '001321': 'Ruijie (锐捷)', 'D0D412': 'Ruijie (锐捷)',
  '000AF0': 'TP-Link', '001018': 'TP-Link', '001234': 'TP-Link', '00146C': 'TP-Link', '002191': 'TP-Link', '50C7BF': 'TP-Link', '0C8268': 'TP-Link',
  '0080C6': 'Huawei (华为)', '00E0FC': 'Huawei (华为)', 'CC81DA': 'Huawei (华为)', '48462B': 'Huawei (华为)',
  '001802': 'Ubiquiti', '0418D6': 'Ubiquiti', '44D9E7': 'Ubiquiti', '00B0F0': 'Ubiquiti', '788A20': 'Ubiquiti',
  '000B5F': 'Cisco', '0011F4': 'Cisco', '0015C5': 'Cisco', '0019AA': 'Cisco', '0021A0': 'Cisco', '002414': 'Cisco', '00307F': 'Cisco', 'B0FFFE': 'Cisco',
  '0021CC': 'HP', '0024E8': 'HP', '3CA3F4': 'HP', '001CC0': 'HP',
  '001AA1': 'Dell', '0019B9': 'Dell', '001F29': 'Dell', '0023AE': 'Dell', '00F1F1': 'Dell', 'D4AE52': 'Dell',
  '00114C': 'Lenovo', '0050B6': 'Lenovo', '5CF1C7': 'Lenovo', '001320': 'Lenovo', '0019D1': 'Lenovo', '00262C': 'Lenovo',
  '000FE0': 'Epson', '00144F': 'Epson', '0020AE': 'Epson', '3C0E23': 'Epson', '78B92C': 'Epson',
  '0040C3': 'Canon', '002457': 'Canon', '00187F': 'Canon', 'B43043': 'Canon', 'C0619C': 'Canon',
  '000E0C': 'Brother', '00507F': 'Brother', '00269A': 'Brother', '78E7D1': 'Brother', '3051F7': 'Brother',
  '00A0F8': 'Zebra', '001372': 'Zebra', '002559': 'Zebra', '00C076': 'Zebra', 'C45A77': 'Zebra',
  '000C29': 'VMware', '005056': 'VMware', '080027': 'VirtualBox (Oracle)', '001C42': 'Parallels',
  '001281': 'Synology (群晖)', '001132': 'Synology (群晖)',
  '000C76': 'Samsung', '00117F': 'Samsung', 'F4B85E': 'Samsung', '002538': 'Samsung',
  '00A0C5': 'Realtek', '00E04C': 'Realtek', 'EC086B': 'Realtek',
  '00E081': 'ASUS', '001111': 'ASUS', '0014DA': 'ASUS', '002354': 'ASUS', 'AC9E17': 'ASUS',
  '001BFC': 'Gigabyte', '00D861': 'MSI', '002682': 'MSI',
  '00307F': 'Super Micro', '00111F': 'Super Micro', '0CC47A': 'Super Micro',
  'F46D04': 'TP-Link', 'A0F3C1': 'TP-Link', 'E89C25': 'TP-Link', 'C006C3': 'TP-Link',
};
export async function lookupMacVendor(macAddress) {
  const mac = String(macAddress || '').replace(/[:-\s]/g, '').toLowerCase();
  if (!/^[0-9a-f]{12}$/.test(mac)) return { ok: false, output: 'MAC 地址格式无效。正确格式如 AA:BB:CC:DD:EE:FF 或 AABBCCDDEEFF。' };
  const oui = mac.slice(0, 6).toUpperCase();
  const vendor = ouiVendors[oui];
  if (vendor) return { ok: true, output: `MAC 地址：${macAddress}\nOUI 前缀：${oui}\n厂商：${vendor}` };
  try {
    const response = await fetch(`https://api.maclookup.app/v2/macs/${mac}`, { signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'OpsHub-MacLookup/0.1' } });
    const data = await response.json();
    if (data?.company) return { ok: true, output: `MAC 地址：${macAddress}\nOUI 前缀：${oui}\n厂商：${data.company}\n来源：在线查询` };
  } catch { /* offline or timeout */ }
  return { ok: true, output: `MAC 地址：${macAddress}\nOUI 前缀：${oui}\n厂商：本地库未匹配，在线查询未返回结果。\n可手动在 https://maclookup.app 查询。` };
}

/* ── 新增工具端点定义 ── */
/* 每个工具返回 { ok, output } 结构，与原有工具一致 */
export const extendedTools = {

  /* 系统深度诊断类 */
  async 'startup-programs'() {
    return runPowerShell("Get-CimInstance Win32_StartupCommand | Select-Object Name,Command,Location,User | Format-Table -AutoSize -Wrap");
  },

  async 'scheduled-tasks'() {
    return runPowerShell("Get-ScheduledTask | Where-Object { $_.State -ne 'Disabled' -and $_.TaskPath -notmatch '\\\\Microsoft\\\\' } | Select-Object TaskName,State,TaskPath | Sort-Object TaskPath,TaskName | Format-Table -AutoSize");
  },

  async 'windows-update'() {
    return runPowerShell("Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 15 HotFixID,Description,InstalledOn | Format-Table -AutoSize", 15000);
  },

  async 'power-config'() {
    return runPowerShell("powercfg /getactivescheme; ''; '--- 睡眠/休眠超时 ---'; powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE 2>$null | Select-String 'AC/DC'; powercfg /query SCHEME_CURRENT SUB_SLEEP HIBERNATEIDLE 2>$null | Select-String 'AC/DC'; ''; $bat = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue; if ($bat) { $statusMap = @('Unknown','Discharging','AC','Charging'); '电池状态：' + $statusMap[$bat.BatteryStatus]; '剩余电量：' + $bat.EstimatedChargeRemaining + '%' } else { '本机无电池（台式机或未检测到）。' }", 12000);
  },

  async 'shared-folders'() {
    return runPowerShell("Get-SmbShare | Select-Object Name,Path,Description | Format-Table -AutoSize");
  },

  async 'large-files'() {
    return runPowerShell("@(\"$env:USERPROFILE\", 'C:\\Windows\\Temp', \"$env:TEMP\", 'C:\\ProgramData\") | ForEach-Object { if (Test-Path $_) { Get-ChildItem -Path $_ -Recurse -File -ErrorAction SilentlyContinue } } | Where-Object { $_.Length -gt 50MB } | Sort-Object Length -Descending | Select-Object -First 20 @{Name='SizeMB';Expression={[math]::Round($_.Length/1MB,1)}},FullName | Format-Table -AutoSize", 30000);
  },

  async 'hosts-file'() {
    return runPowerShell("$content = Get-Content \"$env:WINDIR\\System32\\drivers\\etc\\hosts\" -ErrorAction Stop; $content | ForEach-Object { $line = $_.Trim(); if ($line -and $line -notmatch '^#') { $line } } | Format-Table -AutoSize");
  },

  async 'time-sync'() {
    return runPowerShell("w32tm /query /status 2>$null; ''; w32tm /query /source 2>$null", 10000);
  },

  async 'usb-history'() {
    return runPowerShell("Get-PnpDevice -PresentOnly | Where-Object { $_.Class -match 'USB|Camera|Image|Printer|Net' } | Select-Object Status,Class,FriendlyName | Sort-Object Class | Format-Table -AutoSize");
  },

  async 'bitlocker-status'() {
    return runPowerShell("if (Get-Command Get-BitLockerVolume -ErrorAction SilentlyContinue) { Get-BitLockerVolume | Select-Object MountPoint,VolumeStatus,ProtectionStatus,EncryptionPercentage | Format-Table -AutoSize } else { manage-bde -status 2>$null }", 12000);
  },

  async 'local-users'() {
    return runPowerShell("Get-LocalUser | Select-Object Name,Enabled,LastLogon,Description | Format-Table -AutoSize; ''; '--- 本地组 ---'; Get-LocalGroup | Select-Object Name,Description | Format-Table -AutoSize");
  },

  async 'env-vars'() {
    return runPowerShell("Get-ChildItem Env: | Sort-Object Name | ForEach-Object { [pscustomobject]@{ Name=$_.Name; Value=$_.Value.Substring(0,[math]::Min(100,$_.Value.Length)) } } | Format-Table -AutoSize");
  },

  async 'process-tree'() {
    return runPowerShell("Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | Sort-Object Name | Format-Table -AutoSize", 10000);
  },

  async 'dns-cache'() {
    return runPowerShell("ipconfig /displaydns | Select-String -Pattern 'Record Name|Record Type|A \\(Host\\)' -Context 0,2 | Select-Object -First 40", 10000);
  },

  async 'netstat-connections'() {
    return runPowerShell("Get-NetTCPConnection | Where-Object { $_.State -ne 'Listen' } | Select-Object LocalAddress,LocalPort,RemoteAddress,RemotePort,State,OwningProcess | Sort-Object State | Format-Table -AutoSize", 10000);
  },

  async 'event-log-security'() {
    return runPowerShell("Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4624,4625,4634,4647,4720,4722,4724,4726; StartTime=(Get-Date).AddDays(-3)} -MaxEvents 20 | Select-Object TimeCreated,Id,Message | Format-List", 15000);
  },

  async 'dns-server-check'() {
    return runPowerShell("$dns = Get-DnsClientServerAddress -AddressFamily IPv4 | Where-Object { $_.ServerAddresses } | Select-Object -First 3; foreach ($s in $dns) { Write-Output ('接口：' + $s.InterfaceAlias); foreach ($srv in $s.ServerAddresses) { $result = Resolve-DnsName -Server $srv -Name www.baidu.com -ErrorAction SilentlyContinue; if ($result) { Write-Output ($srv + ' -> 正常 (' + ($result.IPAddress -join ', ') + ')') } else { Write-Output ($srv + ' -> 异常') } }; Write-Output '' }", 15000);
  },

  async 'wifi-scan'() {
    return runPowerShell("netsh wlan show networks mode=bssid", 10000);
  },

  async 'disk-usage'() {
    return runPowerShell("Get-Volume | Where-Object DriveLetter | ForEach-Object { [pscustomobject]@{ Drive=$_.DriveLetter+':'; Label=$_.FileSystemLabel; FileSystem=$_.FileSystem; TotalGB=[math]::Round($_.Size/1GB,1); FreeGB=[math]::Round($_.SizeRemaining/1GB,1); UsedPct=if ($_.Size -gt 0) { [math]::Round(($_.Size-$_.SizeRemaining)/$_.Size*100,0) } else { 0 }; Health=$_.HealthStatus } } | Format-Table -AutoSize");
  },

  async 'memory-info'() {
    return runPowerShell("$os = Get-CimInstance Win32_OperatingSystem; $totalMB = [math]::Round($os.TotalVisibleMemorySize/1024,0); $freeMB = [math]::Round($os.FreePhysicalMemory/1024,0); $usedPct = [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory)/$os.TotalVisibleMemorySize*100,0); Write-Output ('总内存：' + $totalMB + ' MB'); Write-Output ('可用内存：' + $freeMB + ' MB (' + (100-$usedPct) + '% 空闲)'); Write-Output ('已用：' + $usedPct + '%'); ''; $slots = Get-CimInstance Win32_PhysicalMemory | Select-Object BankLabel,Capacity,Speed,Manufacturer,PartNumber; if ($slots) { '--- 物理内存条 ---'; $slots | ForEach-Object { [pscustomobject]@{ Slot=$_.BankLabel; SizeGB=[math]::Round($_.Capacity/1GB,0); SpeedMHz=$_.Speed; Brand=$_.Manufacturer; Model=$_.PartNumber } } | Format-Table -AutoSize }");
  },
};

/* ── AI Agent 只读工具扩展 ── */
export const extendedAgentTools = [
  { type: 'function', function: { name: 'get_startup_programs', description: '获取 Windows 开机启动项列表，用于排查开机慢或自启冲突', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'get_scheduled_tasks', description: '获取非微软的计划任务列表，用于排查异常定时任务或自启项', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'check_windows_update', description: '获取最近安装的 Windows 补丁列表，用于排查补丁引起的故障', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'get_power_config', description: '获取电源计划和电池状态，用于排查设备自动休眠或 UPS 供电问题', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'get_shared_folders', description: '获取本机共享文件夹列表，用于排查文件共享或权限问题', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'check_time_sync', description: '检查 Windows 时间同步状态，用于排查 Kerberos 认证失败或时间不同步问题', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'get_usb_devices', description: '获取已连接的 USB 和外设列表，用于排查 USB 设备识别或驱动问题', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'check_bitlocker', description: '检查 BitLocker 磁盘加密状态，用于安全合规检查', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'get_local_users', description: '获取本地用户和组列表，用于安全审计和排查异常账号', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'get_env_vars', description: '获取系统环境变量，用于排查应用程序配置或路径问题', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'get_process_tree', description: '获取进程树（PID/PPID/名称），用于排查进程关系和异常进程', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'get_disk_usage', description: '获取各磁盘分区的容量和使用率，用于排查磁盘空间不足', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'get_memory_info', description: '获取内存总量、使用率和物理内存条信息，用于排查内存故障或升级需求', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'get_network_connections', description: '获取当前网络连接状态表（netstat），用于排查异常连接或端口占用', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'check_dns_servers', description: '检查本机配置的 DNS 服务器解析能力，用于排查 DNS 解析问题', parameters: { type: 'object', properties: {}, required: [] } } },
];

export const extendedAgentAllowlist = new Set(extendedAgentTools.map(t => t.function.name));

/* AI Agent 工具执行器 */
export async function executeExtendedAgentTool(name) {
  const map = {
    get_startup_programs: () => extendedTools['startup-programs'](),
    get_scheduled_tasks: () => extendedTools['scheduled-tasks'](),
    check_windows_update: () => extendedTools['windows-update'](),
    get_power_config: () => extendedTools['power-config'](),
    get_shared_folders: () => extendedTools['shared-folders'](),
    check_time_sync: () => extendedTools['time-sync'](),
    get_usb_devices: () => extendedTools['usb-history'](),
    check_bitlocker: () => extendedTools['bitlocker-status'](),
    get_local_users: () => extendedTools['local-users'](),
    get_env_vars: () => extendedTools['env-vars'](),
    get_process_tree: () => extendedTools['process-tree'](),
    get_disk_usage: () => extendedTools['disk-usage'](),
    get_memory_info: () => extendedTools['memory-info'](),
    get_network_connections: () => extendedTools['netstat-connections'](),
    check_dns_servers: () => extendedTools['dns-server-check'](),
  };
  const fn = map[name];
  if (!fn) return null;
  return await fn();
}

/* Agent 工具显示名 */
export const extendedAgentDisplayNames = {
  get_startup_programs: '开机启动项',
  get_scheduled_tasks: '计划任务',
  check_windows_update: 'Windows 更新',
  get_power_config: '电源配置',
  get_shared_folders: '共享文件夹',
  check_time_sync: '时间同步',
  get_usb_devices: 'USB 设备',
  check_bitlocker: 'BitLocker 状态',
  get_local_users: '本地用户组',
  get_env_vars: '环境变量',
  get_process_tree: '进程树',
  get_disk_usage: '磁盘使用率',
  get_memory_info: '内存信息',
  get_network_connections: '网络连接表',
  check_dns_servers: 'DNS 服务器检查',
};

/* ── 网络诊断增强工具（来自 net-tools-box） ── */

/* 连接追踪：本机 TCP/UDP 连接状态统计 */
export async function connTracker() {
  return runPowerShell("$tcp = Get-NetTCPConnection | Select-Object LocalAddress,LocalPort,RemoteAddress,RemotePort,State,OwningProcess; $udp = Get-NetUDPEndpoint | Select-Object LocalAddress,LocalPort,OwningProcess; '=== TCP 连接 ==='; $tcp | Sort-Object State | Format-Table -AutoSize; ''; '=== UDP 监听 ==='; $udp | Format-Table -AutoSize; ''; '=== 连接统计 ==='; $tcp | Group-Object State | Select-Object Name,Count | Format-Table -AutoSize", 15000);
}

/* 域名 WHOIS 查询 */
export async function domainWhois(domain) {
  const d = String(domain || '').trim().toLowerCase();
  if (!d || !/^[a-z0-9][-a-z0-9]*(\.[a-z0-9][-a-z0-9]*)+$/.test(d)) return { ok: false, output: '请输入有效的域名，例如 example.com' };
  try {
    const response = await fetch(`https://rdap.org/domain/${d}`, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'OpsHub-Whois/0.1' } });
    if (response.ok) {
      const data = await response.json();
      const lines = [`域名：${d}`, `查询来源：RDAP (rdap.org)`, ''];
      if (data.handle) lines.push(`注册局句柄：${data.handle}`);
      if (data.ldhName) lines.push(`LDH 名称：${data.ldhName}`);
      if (data.status?.length) lines.push(`状态：${data.status.join(', ')}`);
      if (data.events?.length) {
        data.events.forEach(e => { if (e.eventAction && e.eventDate) lines.push(`${e.eventAction}：${e.eventDate}`); });
      }
      if (data.nameservers?.length) lines.push(`NS 服务器：${data.nameservers.map(ns => ns.ldhName || ns.unicodeName).join(', ')}`);
      return { ok: true, output: lines.join('\n') };
    }
  } catch { /* fall through to CLI */ }
  return runPowerShell(`try { $r = whois ${d} 2>$null; if ($r) { $r } else { 'whois 命令未返回结果，建议访问 https://who.is/${d} 查询' } } catch { 'whois 命令执行失败，建议访问 https://who.is/${d} 查询' }`, 15000);
}

/* HTTP API 测试 */
export async function httpApiTest({ url, method = 'GET', headers = '', body = '', timeout = 10 }) {
  const target = String(url || '').trim();
  if (!target) return { ok: false, output: '请输入目标 URL，例如 http://192.168.1.1:80/api/status' };
  const timeoutMs = Math.min(Math.max(Number(timeout) || 10, 1), 60) * 1000;
  try {
    const parsed = new URL(target);
    const isHttps = parsed.protocol === 'https:';
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: String(method || 'GET').toUpperCase(),
      timeout: timeoutMs,
      headers: { 'User-Agent': 'OpsHub-HTTP-Test/0.1' },
      rejectUnauthorized: false,
    };
    if (headers) {
      headers.split(/\r?\n/).forEach(line => {
        const idx = line.indexOf(':');
        if (idx > 0) options.headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      });
    }
    const start = Date.now();
    const result = await new Promise((resolve) => {
      const req = (isHttps ? https : http).request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({
          ok: true,
          output: `状态码：${res.statusCode} ${res.statusMessage || ''}\n响应时间：${Date.now() - start} ms\nContent-Type：${res.headers['content-type'] || 'N/A'}\nContent-Length：${res.headers['content-length'] || data.length}\n\n响应头：\n${Object.entries(res.headers).map(([k, v]) => `  ${k}: ${v}`).join('\n')}\n\n响应体（前2000字符）：\n${data.slice(0, 2000)}${data.length > 2000 ? '\n...（已截断）' : ''}`
        }));
      });
      req.on('error', (err) => resolve({ ok: false, output: `请求失败：${err.message}` }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, output: '请求超时' }); });
      if (body) req.write(body);
      req.end();
    });
    return result;
  } catch (err) {
    return { ok: false, output: `URL 解析失败：${err.message}` };
  }
}

/* — PowerShell 字符串注入防护（单引号加倍 + 命令参数转义） — */
const psQuote = (s) => String(s).replace(/'/g, "''");
const psCmdArg = (s) => `"${String(s).replace(/["`$\\]/g, '`$&')}"`;

/* SNMP 探测 */
export async function snmpProbe({ host, community = 'public', oid = '1.3.6.1.2.1.1.5.0', port = 161, timeout = 5 }) {
  const target = String(host || '').trim();
  if (!target) return { ok: false, output: '请输入目标 IP 地址或主机名' };
  const targetPort = Math.min(Math.max(Number(port) || 161, 1), 65535);
  const to = Math.min(Math.max(Number(timeout) || 5, 1), 30);
  return runPowerShell(`$exe = Get-Command snmpget -ErrorAction SilentlyContinue; if (-not $exe) { '未找到 snmpget 命令。Windows 可安装 Net-SNMP（https://www.netsnmp.org/）。' } else { & snmpget -v2c -c ${psCmdArg(community)} -t ${to} -r 1 -Oqv ${psCmdArg(target)}:${targetPort} ${psCmdArg(oid)} 2>&1 }`, 15000);
}

/* WebSocket 测试 */
export async function websocketTest({ url, timeout = 10 }) {
  const target = String(url || '').trim();
  if (!target || !/^wss?:\/\//i.test(target)) return { ok: false, output: '请输入有效的 WebSocket URL，例如 ws://192.168.1.1:8080/ws' };
  const to = Math.min(Math.max(Number(timeout) || 10, 1), 60);
  return runPowerShell(`try { Add-Type -AssemblyName System.Net.WebSockets.Client; $cts = New-Object System.Threading.CancellationTokenSource([TimeSpan]::FromSeconds(${to})); $client = New-Object System.Net.WebSockets.ClientWebSocket; $task = $client.ConnectAsync([System.Uri]::new('${psQuote(target)}'), $cts.Token); $task.Wait($cts.Token); if ($client.State -eq [System.Net.WebSockets.WebSocketState]::Open) { '✓ WebSocket 连接成功'; '状态：' + $client.State; '子协议：' + ($client.SubProtocol ?: '无'); $client.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, '测试完成', $cts.Token).Wait($cts.Token); '✓ 连接正常关闭' } else { '✗ 连接失败，状态：' + $client.State } } catch { '✗ WebSocket 测试失败：' + $_.Exception.Message }`, to * 1000 + 5000);
}

/* 反向 DNS 查询 (PTR) */
export async function ptrLookup(ip) {
  const target = String(ip || '').trim();
  if (!target || !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(target)) return { ok: false, output: '请输入有效的 IPv4 地址' };
  return runPowerShell(`try { $r = [System.Net.Dns]::GetHostEntry('${target}'); 'IP：${target}'; '主机名：' + $r.HostName; '别名：' + ($r.Aliases -join ', ' ?: '无') } catch { '反向解析失败：' + $_.Exception.Message + '\n可尝试 nslookup -type=PTR ${target}' }`, 10000);
}

/* TLS/SSL 扫描增强 */
export async function tlsScan({ host, port = 443 }) {
  const target = String(host || '').trim();
  if (!target) return { ok: false, output: '请输入目标主机名或 IP' };
  const p = Math.min(Math.max(Number(port) || 443, 1), 65535);
  return runPowerShell(`$target = '${psQuote(target)}'; $port = ${p}; $versions = @('Tls13','Tls12','Tls11','Tls'); $results = @(); foreach ($ver in $versions) { try { $tcp = New-Object System.Net.Sockets.TcpClient; $tcp.Connect($target, $port); $ssl = New-Object System.Net.Security.SslStream($tcp.GetStream(), $false, { $true }); $ssl.AuthenticateAsClient($target, $null, [System.Security.Authentication.SslProtocols]::$ver, $false); $cert = $ssl.RemoteCertificate; $cert2 = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($cert); $results += [pscustomobject]@{ 版本=$ver; 成功=$true; 协商协议=$ssl.SslProtocol; 密码套件=$ssl.CipherAlgorithm; 密钥交换=$ssl.KeyExchangeAlgorithm; 证书主题=$cert2.Subject; 颁发者=$cert2.Issuer; 有效期至=$cert2.NotAfter; 剩余天数=(($cert2.NotAfter - (Get-Date)).Days) }; $ssl.Close(); $tcp.Close() } catch { $results += [pscustomobject]@{ 版本=$ver; 成功=$false; 错误=$_.Exception.Message } } }; '=== TLS/SSL 扫描结果 ==='; '目标：' + $target + ':' + $port; ''; $results | Format-Table -AutoSize`, 20000);
}

/* 路由追踪分析增强 */
export async function tracerouteAnalyze(host) {
  const target = String(host || '').trim();
  if (!target) return { ok: false, output: '请输入目标 IP 或域名' };
  const escTarget = psQuote(target);
  return runPowerShell(`$target = '${escTarget}'; $output = tracert -d -h 30 $target 2>&1; $lines = $output -split '\\r?\\n'; $hops = @(); $starCount = 0; $prevIp = $null; $loopWarn = @(); foreach ($line in $lines) { if ($line -match '^\s*(\d+)\s+.*?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})') { $hop = [int]$matches[1]; $ip = $matches[2]; $hops += [pscustomobject]@{ 跳数=$hop; IP=$ip }; if ($prevIp -and $ip -eq $prevIp -and $starCount -ge 2) { $loopWarn += "跳 $hop 出现重复 IP $ip（可能环路）" } $starCount = 0; $prevIp = $ip } elseif ($line -match '请求超时|Request timed out') { $starCount++ } }; '=== 路由追踪分析 ==='; '目标：' + $target; ''; '路径摘要：'; $hops | ForEach-Object { '  跳 ' + $_.跳数.ToString().PadLeft(2) + ' -> ' + $_.IP }; if ($loopWarn.Count -gt 0) { ''; '⚠ 环路警告：'; $loopWarn } if ($starCount -gt 3) { ''; '⚠ 末尾多跳超时：可能是目标禁 ICMP 或存在黑洞' }; ''; '原始输出：'; $output`, 45000);
}

/* MITM/ARP 欺骗提示 */
export async function mitmHints() {
  return runPowerShell(`$arp = arp -a; $lines = $arp -split '\\r?\\n'; $macs = @{}; $warns = @(); foreach ($line in $lines) { if ($line -match '([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}') { $parts = $line -split '\s+'; $ip = $parts[1]; $mac = ($parts | Where-Object { $_ -match '^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$' }) | Select-Object -First 1; if ($mac) { if (-not $macs[$mac]) { $macs[$mac] = @() } $macs[$mac] += $ip } } }; foreach ($m in $macs.Keys) { if ($macs[$m].Count -gt 1 -and $m -ne 'ff-ff-ff-ff-ff-ff') { $warns += "MAC $m 对应多个 IP: " + ($macs[$m] -join ', ') } }; '=== ARP / MITM 检测 ==='; if ($warns.Count -gt 0) { '⚠ 发现异常：'; $warns; ''; '建议：同一 MAC 对应多个 IP 可能存在 ARP 欺骗或网关集群。请结合拓扑核对。' } else { '✓ 未发现明显的 ARP 异常（同一 MAC 多 IP）。' }; ''; 'ARP 表摘要：'; $arp | Select-Object -First 30`, 10000);
}

/* NetFlow/sFlow 监听 */
export async function netflowListen({ port = 2055, duration = 10 }) {
  const p = Math.min(Math.max(Number(port) || 2055, 1024), 65535);
  const d = Math.min(Math.max(Number(duration) || 10, 1), 60);
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const packets = [];
    let timer = null;
    const done = (result) => { clearTimeout(timer); try { socket.close(); } catch { /* closed */ } resolve(result); };
    socket.on('error', (err) => done({ ok: false, output: `监听失败：${err.message}` }));
    socket.on('message', (msg, rinfo) => {
      packets.push({ time: new Date().toISOString(), size: msg.length, from: rinfo.address, port: rinfo.port });
      if (packets.length >= 100) done({ ok: true, output: `NetFlow 监听结果（端口 ${p}）：\n已接收 ${packets.length} 个数据包（已达上限）\n\n最近 10 条：\n${packets.slice(-10).map(pk => `  [${pk.time}] ${pk.from}:${pk.port} -> ${pk.size} bytes`).join('\n')}\n\n说明：如需完整解析 NetFlow v5/v9/IPFIX，建议启用专业收集器。` });
    });
    socket.bind(p, () => {
      timer = setTimeout(() => {
        const summary = packets.length > 0 ? `已接收 ${packets.length} 个数据包\n\n最近 10 条：\n${packets.slice(-10).map(pk => `  [${pk.time}] ${pk.from}:${pk.port} -> ${pk.size} bytes`).join('\n')}` : '指定时间内未收到任何 UDP 数据包。';
        done({ ok: true, output: `NetFlow 监听结果（端口 ${p}，持续 ${d} 秒）：\n${summary}\n\n说明：NetFlow/sFlow 需要网络设备配置导出目标为 ${p} 端口。` });
      }, d * 1000);
    });
  });
}

/* ── 子网计算器 ── */
export function subnetCalc({ cidr }) {
  const input = String(cidr || '').trim();
  if (!input) return { ok: false, output: '请输入网络地址，例如 192.168.1.0/24' };
  try {
    const [addr, prefixStr] = input.split('/');
    if (!addr || !prefixStr) throw new Error('格式错误');
    const prefix = parseInt(prefixStr, 10);
    if (isNaN(prefix) || prefix < 0 || prefix > 32) throw new Error('掩码范围 0-32');
    const parts = addr.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) throw new Error('IP 格式错误');
    const ipInt = parts.reduce((acc, p) => (acc << 8) | p, 0) >>> 0;
    const mask = prefix === 0 ? 0 : (-1 << (32 - prefix)) >>> 0;
    const network = ipInt & mask;
    const broadcast = network | (~mask >>> 0);
    const hostCount = prefix >= 31 ? 0 : broadcast - network - 1;
    const toIp = (n) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff].join('.');
    const maskBytes = [(mask >>> 24) & 0xff, (mask >>> 16) & 0xff, (mask >>> 8) & 0xff, mask & 0xff].join('.');
    const lines = ['=== 子网计算结果 ===', `输入：${input}`, `网络地址：${toIp(network)}`, `广播地址：${toIp(broadcast)}`, `子网掩码：${maskBytes}`, `可用主机数：${hostCount.toLocaleString()}`, `可用 IP 范围：${prefix >= 31 ? 'N/A' : `${toIp(network + 1)} - ${toIp(broadcast - 1)}`}`, `CIDR：/${prefix}`, `Wildcard：${toIp(~mask >>> 0)}`];
    return { ok: true, output: lines.join('\n') };
  } catch (err) {
    return { ok: false, output: `计算失败：${err.message}。正确格式如 192.168.1.0/24` };
  }
}

/* ── 路由表查看 ── */
export async function routeTable() {
  return runPowerShell("'=== IPv4 路由表 ==='; Get-NetRoute -AddressFamily IPv4 | Select-Object DestinationPrefix,NextHop,InterfaceAlias,RouteMetric,State | Sort-Object DestinationPrefix | Format-Table -AutoSize; ''; '=== IPv6 路由表 ==='; Get-NetRoute -AddressFamily IPv6 | Select-Object DestinationPrefix,NextHop,InterfaceAlias,RouteMetric,State | Sort-Object DestinationPrefix | Format-Table -AutoSize", 15000);
}

/* ── 防火墙状态与规则 ── */
export async function firewallStatus() {
  return runPowerShell("Get-NetFirewallProfile | Select-Object Name,Enabled,DefaultInboundAction,DefaultOutboundAction | Format-Table -AutoSize; ''; '=== 防火墙规则统计 ==='; $rules = Get-NetFirewallRule | Where-Object { $_.Enabled -eq 'True' }; $rules | Group-Object Direction | Select-Object Name,Count | Format-Table -AutoSize; ''; '常用放行规则（前 20 条）：'; $rules | Select-Object -First 20 DisplayName,Direction,Action,Profile | Format-Table -AutoSize", 15000);
}

/* ── 端口占用诊断 ── */
export async function portOccupancy({ port }) {
  const p = Number(port);
  if (!Number.isInteger(p) || p < 1 || p > 65535) {
    return runPowerShell("Get-NetTCPConnection -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess,@{N='ProcessName';E={(Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName}} | Sort-Object LocalPort | Format-Table -AutoSize", 15000);
  }
  return runPowerShell(`$conn = Get-NetTCPConnection -LocalPort ${p} -ErrorAction SilentlyContinue; if (-not $conn) { "端口 ${p} 未被占用。" } else { $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue; "端口 ${p} 占用情况："; $conn | Select-Object LocalAddress,LocalPort,State,OwningProcess,@{N='ProcessName';E={$proc.ProcessName}},@{N='Path';E={$proc.Path}} | Format-Table -AutoSize }`, 15000);
}

/* ── IP 信息检测（本机+公网） ── */
export async function ipInfo() {
  const local = await runPowerShell("Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Select-Object InterfaceAlias,IPAddress,PrefixLength | Format-Table -AutoSize; ''; '默认网关：'; (Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Select-Object NextHop,InterfaceAlias | Format-Table -AutoSize)", 10000);
  let publicIp = '查询失败';
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(8000) });
    if (res.ok) { const data = await res.json(); publicIp = data.ip; }
  } catch { /* ignore */ }
  return { ok: true, output: `=== 本机网络信息 ===\n${local.output}\n\n公网 IP：${publicIp}` };
}

/* ── DHCP 检测 ── */
export async function dhcpDetect() {
  return runPowerShell("$adapters = Get-NetIPConfiguration | Where-Object { $_.NetIPv4Interface.DHCP -eq 'Enabled' }; '=== DHCP 检测 ==='; if (-not $adapters) { '未找到启用 DHCP 的网卡。' } else { foreach ($a in $adapters) { '网卡：' + $a.InterfaceAlias; '  IPv4：' + ($a.IPv4Address.IPAddress -join ', '); '  网关：' + ($a.IPv4DefaultGateway.NextHop -join ', '); '  DHCP 服务器：' + ($a.NetIPv4Interface.DhcpServer -join ', '); '  DNS：' + ($a.DnsServer.ServerAddresses -join ', '); '' } }; '=== 多 DHCP / 私接路由风险 ==='; $dhcpServers = @(); foreach ($a in $adapters) { if ($a.NetIPv4Interface.DhcpServer) { $dhcpServers += $a.NetIPv4Interface.DhcpServer } }; $unique = $dhcpServers | Sort-Object -Unique; if ($unique.Count -gt 1) { '⚠ 发现多个 DHCP 服务器：' + ($unique -join ', ') + '，可能存在私接路由。' } else { '✓ 仅发现一个 DHCP 服务器：' + ($unique -join ', ') }", 15000);
}

/* ── 主机发现（/24 Ping Sweep） ── */
export async function hostDiscovery({ subnet }) {
  const input = String(subnet || '').trim();
  if (!input) return { ok: false, output: '请输入网段，例如 192.168.1.0/24' };
  const match = input.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.(\d{1,3})\/24$/);
  if (!match) return { ok: false, output: '目前仅支持 /24 网段，例如 192.168.1.0/24' };
  const prefix = match[1] + '.' + match[2];
  const ips = Array.from({ length: 254 }, (_, i) => `${prefix}.${i + 1}`);
  const batchSize = 20;
  const online = [];
  for (let i = 0; i < ips.length; i += batchSize) {
    const batch = ips.slice(i, i + batchSize);
    const results = await Promise.all(batch.map((ip) => run('ping', ['-n', '1', '-w', '800', ip], 3000).then((r) => ({ ip, ok: r.ok }))));
    online.push(...results.filter((r) => r.ok).map((r) => r.ip));
  }
  return { ok: true, output: `=== 主机发现结果 (${input}) ===\n在线设备：${online.length} 台\n\n${online.join('\n')}\n\n共扫描 254 个地址。` };
}

/* ── 环路检测（Traceroute 分析） ── */
export async function loopDetection({ target }) {
  const t = String(target || '').trim();
  if (!t) return { ok: false, output: '请输入目标 IP 或域名' };
  const escT = psQuote(t);
  return runPowerShell(`$target = '${escT}'; $output = tracert -d -h 15 $target 2>&1; $lines = $output -split '\\r?\\n'; $hops = @(); $seen = @{}; $loopWarn = @(); $starCount = 0; foreach ($line in $lines) { if ($line -match '^\s*(\d+)\s+.*?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})') { $hop = [int]$matches[1]; $ip = $matches[2]; $hops += "$hop -> $ip"; if ($seen[$ip]) { $loopWarn += "跳 $hop 出现重复 IP $ip（疑似环路）" } else { $seen[$ip] = $hop } $starCount = 0 } elseif ($line -match '请求超时|Request timed out') { $starCount++ } }; '=== 环路检测结果 ==='; '目标：' + $target; ''; '路径：'; $hops; if ($loopWarn.Count -gt 0) { ''; '⚠ 环路警告：'; $loopWarn } else { ''; '✓ 未发现明显环路迹象。' }; if ($starCount -gt 3) { ''; '⚠ 多跳超时：可能目标禁 ICMP 或存在路由黑洞' }`, 30000);
}

/* ── 外网测速（Cloudflare 下载） ── */
export async function speedTest() {
  const url = 'https://speed.cloudflare.com/__down?bytes=10000000'; // 10 MB
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 30000 }, (res) => {
      let bytes = 0;
      const t0 = Date.now();
      res.on('data', (chunk) => { bytes += chunk.length; });
      res.on('end', () => {
        const sec = (Date.now() - t0) / 1000;
        const mbps = (bytes * 8 / 1024 / 1024 / sec).toFixed(2);
        resolve({ ok: true, output: `下载测速完成\n文件大小：${(bytes / 1024 / 1024).toFixed(2)} MB\n用时：${sec.toFixed(2)} 秒\n估算带宽：${mbps} Mbps` });
      });
    });
    req.on('error', (err) => resolve({ ok: false, output: `测速失败：${err.message}` }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, output: '测速超时' }); });
  });
}

/* ── 网络健康检查（一键综合诊断） ── */
export async function networkHealth() {
  return bundleChecks([
    { name: '网卡状态', task: () => runPowerShell("Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | Select-Object Name,LinkSpeed,MacAddress | Format-Table -AutoSize", 10000) },
    { name: 'IP 配置', task: () => runPowerShell("Get-NetIPConfiguration | Where-Object { $_.NetAdapter.Status -eq 'Up' } | Select-Object InterfaceAlias,IPv4Address,IPv4DefaultGateway,DnsServer | Format-Table -AutoSize", 10000) },
    { name: '网关连通性', task: () => runPowerShell("$gw = (Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Select-Object -First 1).NextHop; if ($gw) { $r = Test-Connection -TargetName $gw -Count 2 -ErrorAction SilentlyContinue; if ($r) { '网关 ' + $gw + ' 可达，平均延迟 ' + ([math]::Round(($r | Measure-Object Latency -Average).Average,1)) + 'ms' } else { '网关 ' + $gw + ' 不可达' } } else { '未找到默认网关' }", 10000) },
    { name: 'DNS 解析', task: () => runPowerShell("try { $r = Resolve-DnsName -Name www.baidu.com -ErrorAction Stop; 'DNS 解析正常：' + ($r.IPAddress -join ', ') } catch { 'DNS 解析失败：' + $_.Exception.Message }", 10000) },
    { name: '外网连通性', task: () => runPowerShell("try { $r = Test-Connection -TargetName 223.5.5.5 -Count 2 -ErrorAction SilentlyContinue; if ($r) { '外网 ICMP 可达' } else { '外网 ICMP 不可达（可能禁 ping）' } }; try { $wc = New-Object System.Net.WebClient; $wc.DownloadString('https://www.baidu.com') | Out-Null; 'HTTP 出口正常' } catch { 'HTTP 出口异常：' + $_.Exception.Message }", 15000) },
    { name: 'DHCP 状态', task: () => runPowerShell("$adapters = Get-NetIPConfiguration | Where-Object { $_.NetIPv4Interface.DHCP -eq 'Enabled' }; if ($adapters) { 'DHCP 已启用' } else { 'DHCP 未启用（静态 IP）' }", 10000) },
  ]);
}

/* ── ARP 表查看 ── */
export async function arpTable() {
  return runPowerShell("$arp = arp -a; $lines = $arp -split '\\r?\\n'; $entries = @(); $gateway = $null; foreach ($line in $lines) { if ($line -match '(\\d+\\.\\d+\\.\\d+\\.\\d+)\\s+([0-9a-f]{2}[:-][0-9a-f]{2}[:-][0-9a-f]{2}[:-][0-9a-f]{2}[:-][0-9a-f]{2}[:-][0-9a-f]{2})') { $ip = $matches[1]; $mac = $matches[2]; $type = if ($line -match 'static') { '静态' } else { '动态' }; $entries += [pscustomobject]@{ IP=$ip; MAC=$mac; Type=$type }; if ($ip -match '\\.1$') { $gateway = $ip } } }; '=== ARP 表 ==='; $entries | Format-Table -AutoSize; ''; '记录数：' + $entries.Count; if ($gateway) { '疑似网关：' + $gateway }", 10000);
}

/* ── 端口服务探测（Banner 抓取） ── */
export async function portServiceProbe({ host, port }) {
  const target = String(host || '').trim();
  const p = Number(port);
  if (!target) return { ok: false, output: '请输入目标 IP 或域名' };
  if (!Number.isInteger(p) || p < 1 || p > 65535) return { ok: false, output: '请输入有效的端口号（1-65535）' };

  return new Promise((resolve) => {
    const socket = new net.Socket();
    const probes = {
      21: ['', 'QUIT\r\n'],
      22: ['', ''],
      25: ['', 'QUIT\r\n'],
      80: ['HEAD / HTTP/1.0\r\nHost: ' + target + '\r\n\r\n', ''],
      110: ['', 'QUIT\r\n'],
      143: ['', ''],
      554: ['OPTIONS * RTSP/1.0\r\n\r\n', ''],
      3389: ['', ''],
    };

    let banner = '';
    let resolved = false;
    const done = (result) => { if (!resolved) { resolved = true; try { socket.destroy(); } catch {} resolve(result); } };

    socket.setTimeout(8000);
    socket.on('timeout', () => done({ ok: false, output: `端口 ${p} 连接超时` }));
    socket.on('error', (err) => done({ ok: false, output: `连接失败：${err.message}` }));

    socket.connect(p, target, () => {
      const probe = probes[p] || ['', ''];
      if (probe[0]) socket.write(probe[0]);
    });

    socket.on('data', (data) => {
      banner += data.toString('utf-8').slice(0, 512);
      const probe = probes[p] || ['', ''];
      if (probe[1]) { socket.write(probe[1]); socket.end(); }
      else { socket.end(); }
    });

    socket.on('close', () => {
      if (!banner) return done({ ok: true, output: `端口 ${p} 已开放，但未返回 Banner。可能是非文本协议或被防火墙限制。` });

      let service = '未知';
      const lower = banner.toLowerCase();
      if (lower.includes('ssh')) service = 'SSH';
      else if (lower.includes('smtp')) service = 'SMTP';
      else if (lower.includes('ftp')) service = 'FTP';
      else if (lower.includes('http')) service = 'HTTP';
      else if (lower.includes('rtsp')) service = 'RTSP';
      else if (lower.includes('pop3')) service = 'POP3';
      else if (lower.includes('imap')) service = 'IMAP';
      else if (lower.includes('mysql')) service = 'MySQL';
      else if (lower.includes('rdp') || lower.includes('microsoft windows')) service = 'RDP / Windows Terminal';

      done({ ok: true, output: `=== 端口服务探测结果 ===\n目标：${target}:${p}\n识别服务：${service}\nBanner（前512字符）：\n${banner}\n\n提示：Banner 识别仅供参考，实际服务可能经过伪装。` });
    });
  });
}

/* ── 临时 HTTP 服务器 ── */
const activeTempServers = new Map();

export function getActiveTempServers() {
  return Array.from(activeTempServers.entries()).map(([port, info]) => ({ port, dir: info.dir, startTime: info.startTime }));
}

function getLocalIps() {
  const ips = [];
  const ifaces = networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
    }
  }
  return ips.length ? ips : ['127.0.0.1'];
}

export async function tempHttpServer({ port = 8080, dir = process.cwd() }) {
  const p = Math.min(Math.max(Number(port) || 8080, 1024), 65535);
  const rootDir = String(dir || process.cwd());

  if (activeTempServers.has(p)) {
    const info = activeTempServers.get(p);
    return { ok: true, output: `端口 ${p} 的临时服务器已在运行（目录：${info.dir}）` };
  }

  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent(req.url.split('?')[0]);
        const safePath = join(rootDir, urlPath);
        if (!safePath.startsWith(rootDir)) { res.writeHead(403); res.end('Forbidden'); return; }
        const stats = await stat(safePath).catch(() => null);
        if (!stats) { res.writeHead(404); res.end('Not Found'); return; }
        if (stats.isDirectory()) {
          const files = await readdir(safePath);
          const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Index of ${urlPath}</title><style>body{font-family:sans-serif;margin:20px}h1{border-bottom:1px solid #ccc}ul{list-style:none;padding:0}a{text-decoration:none;color:#0066cc}a:hover{text-decoration:underline}</style></head><body><h1>Index of ${urlPath}</h1><ul>${files.map(f => `<li><a href="${(urlPath.endsWith('/') ? urlPath : urlPath + '/') + encodeURIComponent(f)}">${f}</a></li>`).join('')}</ul></body></html>`;
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);
        } else {
          const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.pdf': 'application/pdf', '.txt': 'text/plain' }[extname(safePath).toLowerCase()] || 'application/octet-stream';
          res.writeHead(200, { 'Content-Type': mime });
          createReadStream(safePath).pipe(res);
        }
      } catch (err) {
        res.writeHead(500);
        res.end(String(err.message));
      }
    });

    server.on('error', (err) => resolve({ ok: false, output: `启动失败：${err.message}` }));
    server.listen(p, () => {
      activeTempServers.set(p, { server, dir: rootDir, startTime: new Date().toISOString() });
      const ips = getLocalIps();
      resolve({ ok: true, output: `临时 HTTP 文件服务器已启动！\n\n端口：${p}\n根目录：${rootDir}\n本机访问地址：\n${ips.map(ip => `  http://${ip}:${p}`).join('\n')}\n  http://127.0.0.1:${p}\n\n提示：服务器将持续运行直到手动停止或程序退出。` });
    });
  });
}

export async function stopTempHttpServer(port) {
  const p = Number(port);
  const entry = activeTempServers.get(p);
  if (!entry) return { ok: false, output: `端口 ${p} 没有运行中的临时服务器。` };
  entry.server.close();
  activeTempServers.delete(p);
  return { ok: true, output: `端口 ${p} 的临时 HTTP 服务器已停止。` };
}

/* ── 临时 FTP 服务器 ── */
const activeFtpServers = new Map();

export function getActiveFtpServers() {
  return Array.from(activeFtpServers.entries()).map(([port, info]) => ({ port, root: info.root, user: info.user, startTime: info.startTime }));
}

export async function startFtpServer({ port = 2121, root = process.cwd(), user = 'admin', password = 'admin', anonymous = false }) {
  const p = Math.min(Math.max(Number(port) || 2121, 1024), 65535);
  const rootDir = String(root || process.cwd());

  if (activeFtpServers.has(p)) {
    return { ok: true, output: `FTP 服务器已在端口 ${p} 运行（目录：${activeFtpServers.get(p).root}）` };
  }

  try {
    const stats = await stat(rootDir);
    if (!stats.isDirectory()) return { ok: false, output: `目录不存在：${rootDir}` };
  } catch {
    return { ok: false, output: `目录不存在：${rootDir}` };
  }

  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      let loggedIn = false;
      let cwd = '/';
      let pasvSocket = null;
      let pasvPort = 0;
      let dataType = 'A'; // ASCII
      let mode = 'S'; // Stream
      let structure = 'F'; // File

      const reply = (code, msg) => socket.write(`${code} ${msg}\r\n`);

      socket.setEncoding('utf8');
      reply(220, 'OpsHub FTP Server ready');

      const resolvePath = (p) => {
        if (p.startsWith('/')) return p;
        return cwd === '/' ? '/' + p : cwd + '/' + p;
      };

      const toNativePath = (ftpPath) => {
        let p = ftpPath.replace(/\\/g, '/');
        if (p.startsWith('/')) p = p.slice(1);
        const resolved = join(rootDir, p);
        if (!resolved.startsWith(rootDir + '/') && resolved !== rootDir) throw new Error('Path traversal denied');
        return resolved;
      };

      socket.on('data', (data) => {
        const line = data.toString().trim();
        const parts = line.split(/\s+/);
        const cmd = parts[0].toUpperCase();
        const arg = parts.slice(1).join(' ');

        switch (cmd) {
          case 'USER':
            if (anonymous && arg.toLowerCase() === 'anonymous') {
              loggedIn = true;
              reply(230, 'Anonymous login OK');
            } else if (arg === user) {
              reply(331, 'Password required');
            } else {
              reply(530, 'Login incorrect');
            }
            break;

          case 'PASS':
            if (anonymous || arg === password) {
              loggedIn = true;
              reply(230, 'Login OK');
            } else {
              reply(530, 'Login incorrect');
            }
            break;

          case 'SYST':
            reply(215, 'UNIX Type: L8');
            break;

          case 'FEAT':
            socket.write('211-Features:\r\n UTF8\r\n211 End\r\n');
            break;

          case 'PWD':
            if (!loggedIn) return reply(530, 'Not logged in');
            reply(257, `"${cwd}" is current directory`);
            break;

          case 'CWD':
            if (!loggedIn) return reply(530, 'Not logged in');
            const newDir = resolvePath(arg);
            const nativePath = toNativePath(newDir);
            stat(nativePath).then(s => {
              if (s.isDirectory()) {
                cwd = newDir;
                reply(250, 'Directory changed');
              } else {
                reply(550, 'Not a directory');
              }
            }).catch(() => reply(550, 'Directory not found'));
            break;

          case 'TYPE':
            dataType = arg.toUpperCase() || 'A';
            reply(200, 'Type set');
            break;

          case 'MODE':
            mode = arg.toUpperCase() || 'S';
            reply(200, 'Mode set');
            break;

          case 'STRU':
            structure = arg.toUpperCase() || 'F';
            reply(200, 'Structure set');
            break;

          case 'PASV':
            if (!loggedIn) return reply(530, 'Not logged in');
            const pasv = net.createServer();
            pasv.listen(0, () => {
              pasvPort = pasv.address().port;
              pasvSocket = pasv;
              const ips = getLocalIps();
              const ip = ips[0].replace(/\./g, ',');
              reply(227, `Entering Passive Mode (${ip},${Math.floor(pasvPort / 256)},${pasvPort % 256})`);
            });
            pasv.on('connection', (s) => {
              pasvSocket = s;
            });
            break;

          case 'LIST':
          case 'NLST':
            if (!loggedIn) return reply(530, 'Not logged in');
            if (!pasvSocket) return reply(425, 'Use PASV first');
            reply(150, 'Opening data connection');
            const listPath = toNativePath(cwd);
            readdir(listPath).then(files => {
              const list = files.map(f => {
                const fullPath = join(listPath, f);
                return stat(fullPath).then(s => {
                  const isDir = s.isDirectory();
                  const size = s.size;
                  const date = s.mtime.toISOString().slice(0, 10);
                  return `${isDir ? 'drwxr-xr-x' : '-rw-r--r--'} 1 owner group ${String(size).padStart(12)} ${date} ${f}`;
                }).catch(() => `---------- 1 owner group ${String(0).padStart(12)} Jan 01 ${f}`);
              });
              Promise.all(list).then(lines => {
                pasvSocket.end(lines.join('\r\n') + '\r\n');
                reply(226, 'Transfer complete');
              });
            }).catch(() => {
              reply(550, 'List failed');
              pasvSocket.destroy();
            });
            break;

          case 'RETR':
            if (!loggedIn) return reply(530, 'Not logged in');
            if (!pasvSocket) return reply(425, 'Use PASV first');
            const retrPath = toNativePath(resolvePath(arg));
            reply(150, 'Opening data connection');
            stat(retrPath).then(s => {
              if (!s.isFile()) throw new Error('Not a file');
              createReadStream(retrPath).pipe(pasvSocket);
              pasvSocket.on('finish', () => reply(226, 'Transfer complete'));
              pasvSocket.on('error', () => reply(550, 'Transfer failed'));
            }).catch(() => {
              reply(550, 'File not found');
              pasvSocket.destroy();
            });
            break;

          case 'STOR':
            if (!loggedIn) return reply(530, 'Not logged in');
            if (!pasvSocket) return reply(425, 'Use PASV first');
            const storPath = toNativePath(resolvePath(arg));
            reply(150, 'Opening data connection');
            const storStream = createWriteStream(storPath);
            pasvSocket.pipe(storStream);
            storStream.on('finish', () => reply(226, 'Transfer complete'));
            storStream.on('error', () => reply(550, 'Store failed'));
            break;

          case 'QUIT':
            reply(221, 'Goodbye');
            socket.destroy();
            break;

          default:
            reply(502, 'Not implemented');
        }
      });

      socket.on('error', () => {});
      socket.on('close', () => {
        if (pasvSocket) try { pasvSocket.close(); } catch {}
      });
    });

    server.on('error', (err) => resolve({ ok: false, output: `FTP 服务器启动失败：${err.message}` }));
    server.listen(p, () => {
      activeFtpServers.set(p, { server, root: rootDir, user, startTime: new Date().toISOString() });
      const ips = getLocalIps();
      resolve({ ok: true, output: `FTP 服务器已启动！\n\n端口：${p}\n根目录：${rootDir}\n用户名：${user}\n密码：${password}\n匿名访问：${anonymous ? '允许' : '禁止'}\n\n客户端访问地址：\n${ips.map(ip => `  ftp://${ip}:${p}`).join('\n')}\n  ftp://127.0.0.1:${p}\n\n提示：支持基础 FTP 命令（LIST/RETR/STOR/PASV）。服务器将持续运行直到手动停止。` });
    });
  });
}

export async function stopFtpServer(port) {
  const p = Number(port);
  const entry = activeFtpServers.get(p);
  if (!entry) return { ok: false, output: `端口 ${p} 没有 FTP 服务器运行。` };
  entry.server.close();
  activeFtpServers.delete(p);
  return { ok: true, output: `FTP 服务器（端口 ${p}）已停止。` };
}

/* ── 临时 TFTP 服务器 ── */
const activeTftpServers = new Map();

export function getActiveTftpServers() {
  return Array.from(activeTftpServers.entries()).map(([port, info]) => ({ port, root: info.root, startTime: info.startTime }));
}

export async function startTftpServer({ port = 69, root = process.cwd() }) {
  const p = Math.min(Math.max(Number(port) || 69, 1024), 65535);
  const rootDir = String(root || process.cwd());

  if (activeTftpServers.has(p)) {
    return { ok: true, output: `TFTP 服务器已在端口 ${p} 运行（目录：${activeTftpServers.get(p).root}）` };
  }

  try {
    const stats = await stat(rootDir);
    if (!stats.isDirectory()) return { ok: false, output: `目录不存在：${rootDir}` };
  } catch {
    return { ok: false, output: `目录不存在：${rootDir}` };
  }

  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const sessions = new Map();
    let sessionId = 0;

    socket.on('error', (err) => resolve({ ok: false, output: `TFTP 服务器启动失败：${err.message}` }));

    socket.on('message', (msg, rinfo) => {
      const opcode = msg.readUInt16BE(0);

      if (opcode === 1) { // RRQ
        let offset = 2;
        let filename = '';
        while (msg[offset] !== 0) filename += String.fromCharCode(msg[offset++]);
        offset++; // null terminator
        let mode = '';
        while (offset < msg.length && msg[offset] !== 0) mode += String.fromCharCode(msg[offset++]);

        const safePath = join(rootDir, filename);
        if (!safePath.startsWith(rootDir)) {
          const errBuf = Buffer.alloc(5);
          errBuf.writeUInt16BE(5, 0); // ERROR
          errBuf.writeUInt16BE(4, 2); // Access violation
          socket.send(errBuf, rinfo.port, rinfo.address);
          return;
        }

        stat(safePath).then(s => {
          if (!s.isFile()) throw new Error('Not a file');
          const fileStream = createReadStream(safePath);
          const tid = ++sessionId;
          let blockNum = 1;
          let lastChunkSize = 0;
          const bufSize = 512;
          const sendBuf = Buffer.alloc(bufSize + 4);

          fileStream.on('data', (chunk) => {
            lastChunkSize = chunk.length;
            const pkt = Buffer.alloc(chunk.length + 4);
            pkt.writeUInt16BE(3, 0); // DATA
            pkt.writeUInt16BE(blockNum, 2);
            chunk.copy(pkt, 4);
            socket.send(pkt, rinfo.port, rinfo.address);
            sessions.set(tid, { blockNum, fileStream, address: rinfo.address, port: rinfo.port });
          });

          fileStream.on('end', () => {
            if (lastChunkSize === 512) {
              const lastPkt = Buffer.alloc(4);
              lastPkt.writeUInt16BE(3, 0);
              lastPkt.writeUInt16BE(++blockNum, 2);
              socket.send(lastPkt, rinfo.port, rinfo.address);
            }
          });

          fileStream.on('error', () => {
            const errBuf = Buffer.alloc(5);
            errBuf.writeUInt16BE(5, 0);
            errBuf.writeUInt16BE(2, 2); // Access violation
            socket.send(errBuf, rinfo.port, rinfo.address);
          });
        }).catch(() => {
          const errBuf = Buffer.alloc(5);
          errBuf.writeUInt16BE(5, 0);
          errBuf.writeUInt16BE(1, 2); // File not found
          socket.send(errBuf, rinfo.port, rinfo.address);
        });
      } else if (opcode === 2) { // WRQ
        let offset = 2;
        let filename = '';
        while (msg[offset] !== 0) filename += String.fromCharCode(msg[offset++]);
        offset++;
        let mode = '';
        while (offset < msg.length && msg[offset] !== 0) mode += String.fromCharCode(msg[offset++]);

        const safePath = join(rootDir, filename);
        if (!safePath.startsWith(rootDir)) {
          const errBuf = Buffer.alloc(5);
          errBuf.writeUInt16BE(5, 0);
          errBuf.writeUInt16BE(4, 2);
          socket.send(errBuf, rinfo.port, rinfo.address);
          return;
        }

        const ack = Buffer.alloc(4);
        ack.writeUInt16BE(4, 0); // ACK
        ack.writeUInt16BE(0, 2);
        socket.send(ack, rinfo.port, rinfo.address);

        const fileStream = createWriteStream(safePath);
        const tid = ++sessionId;
        sessions.set(tid, { fileStream, address: rinfo.address, port: rinfo.port, blockNum: 0 });
      } else if (opcode === 4) { // ACK
        // Handle ACK for data sent
      } else if (opcode === 3) { // DATA
        const blockNum = msg.readUInt16BE(2);
        const data = msg.slice(4);

        // Find corresponding session (simplified)
        for (const [tid, sess] of sessions) {
          if (sess.address === rinfo.address && sess.port === rinfo.port) {
            sess.fileStream.write(data);
            const ack = Buffer.alloc(4);
            ack.writeUInt16BE(4, 0);
            ack.writeUInt16BE(blockNum, 2);
            socket.send(ack, rinfo.port, rinfo.address);

            if (data.length < 512) {
              sess.fileStream.end();
              sessions.delete(tid);
            }
            break;
          }
        }
      }
    });

    socket.bind(p, () => {
      activeTftpServers.set(p, { socket, root: rootDir, startTime: new Date().toISOString() });
      const ips = getLocalIps();
      resolve({ ok: true, output: `TFTP 服务器已启动！\n\n端口：${p} (UDP)\n根目录：${rootDir}\n\n客户端访问地址：\n${ips.map(ip => `  ${ip}:${p}`).join('\n')}\n\n提示：支持基础 TFTP 读写（RRQ/WRQ）。常用于网络设备固件传输。服务器将持续运行直到手动停止。` });
    });
  });
}

export async function stopTftpServer(port) {
  const p = Number(port);
  const entry = activeTftpServers.get(p);
  if (!entry) return { ok: false, output: `端口 ${p} 没有 TFTP 服务器运行。` };
  entry.socket.close();
  activeTftpServers.delete(p);
  return { ok: true, output: `TFTP 服务器（端口 ${p}）已停止。` };
}

/* ── Syslog 服务器 ── */
const activeSyslogServers = new Map();

export function getActiveSyslogServers() {
  return Array.from(activeSyslogServers.entries()).map(([port, info]) => ({ port, proto: info.proto, startTime: info.startTime, messageCount: info.messages.length }));
}

export async function startSyslogServer({ port = 514, proto = 'udp', timeout = 0 }) {
  const p = Math.min(Math.max(Number(port) || 514, 1024), 65535);
  const protocol = String(proto || 'udp').toLowerCase();

  if (activeSyslogServers.has(p)) {
    return { ok: true, output: `Syslog 服务器已在端口 ${p} 运行（协议：${activeSyslogServers.get(p).proto}）` };
  }

  const messages = [];

  return new Promise((resolve) => {
    if (protocol === 'udp') {
      const socket = dgram.createSocket('udp4');
      socket.on('error', (err) => resolve({ ok: false, output: `Syslog 服务器启动失败：${err.message}` }));
      socket.on('message', (msg, rinfo) => {
        const timestamp = new Date().toISOString();
        const entry = { timestamp, from: rinfo.address, port: rinfo.port, message: msg.toString('utf8').trim() };
        messages.push(entry);
        if (messages.length > 500) messages.shift();
      });
      socket.bind(p, () => {
        activeSyslogServers.set(p, { socket, proto: 'udp', messages, startTime: new Date().toISOString() });
        const ips = getLocalIps();
        resolve({ ok: true, output: `Syslog 服务器已启动（UDP）！\n\n端口：${p}\n监听地址：\n${ips.map(ip => `  ${ip}:${p}`).join('\n')}\n\n提示：接收到的日志将保存在内存中（最多 500 条），可通过状态接口查看。服务器将持续运行直到手动停止。` });
      });
    } else {
      // TCP
      const server = net.createServer((socket) => {
        socket.setEncoding('utf8');
        socket.on('data', (data) => {
          const lines = data.split('\n');
          lines.forEach(line => {
            if (!line.trim()) return;
            const timestamp = new Date().toISOString();
            const entry = { timestamp, from: socket.remoteAddress, port: socket.remotePort, message: line.trim() };
            messages.push(entry);
            if (messages.length > 500) messages.shift();
          });
        });
      });
      server.on('error', (err) => resolve({ ok: false, output: `Syslog 服务器启动失败：${err.message}` }));
      server.listen(p, () => {
        activeSyslogServers.set(p, { server, proto: 'tcp', messages, startTime: new Date().toISOString() });
        const ips = getLocalIps();
        resolve({ ok: true, output: `Syslog 服务器已启动（TCP）！\n\n端口：${p}\n监听地址：\n${ips.map(ip => `  ${ip}:${p}`).join('\n')}\n\n提示：接收到的日志将保存在内存中（最多 500 条）。服务器将持续运行直到手动停止。` });
      });
    }
  });
}

export async function stopSyslogServer(port) {
  const p = Number(port);
  const entry = activeSyslogServers.get(p);
  if (!entry) return { ok: false, output: `端口 ${p} 没有 Syslog 服务器运行。` };
  if (entry.socket) entry.socket.close();
  if (entry.server) entry.server.close();
  activeSyslogServers.delete(p);
  return { ok: true, output: `Syslog 服务器（端口 ${p}）已停止。共接收 ${entry.messages.length} 条日志。` };
}

export function getSyslogMessages(port) {
  const p = Number(port);
  const entry = activeSyslogServers.get(p);
  if (!entry) return [];
  return entry.messages.slice(-100);
}

/* ── 摄像头扫描（网段探测） ── */
export async function cameraScan({ subnet, ports = '80,443,554,8000,8080,37777', timeout = 3 }) {
  const input = String(subnet || '').trim();
  if (!input) return { ok: false, output: '请输入网段，例如 192.168.1.0/24' };

  const match = input.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.(\d{1,3})\/24$/);
  if (!match) return { ok: false, output: '目前仅支持 /24 网段，例如 192.168.1.0/24' };

  const prefix = match[1];
  const portList = String(ports || '80,443,554,8000,8080,37777').split(',').map(p => parseInt(p.trim(), 10)).filter(p => p > 0 && p < 65536);
  if (portList.length === 0) return { ok: false, output: '请输入有效的端口列表，例如 80,443,554' };

  const to = Math.min(Math.max(Number(timeout) || 3, 1), 10) * 1000;
  const results = [];
  const batchSize = 20;

  for (let i = 0; i < 254; i += batchSize) {
    const batch = [];
    for (let j = 0; j < batchSize && i + j < 254; j++) {
      const ip = `${prefix}.${i + j + 1}`;
      batch.push(
        Promise.all(portList.map(port =>
          new Promise((resolve) => {
            const socket = new net.Socket();
            const timer = setTimeout(() => { socket.destroy(); resolve({ ip, port, open: false }); }, to);
            socket.connect(port, ip, () => {
              clearTimeout(timer);
              socket.destroy();
              resolve({ ip, port, open: true });
            });
            socket.on('error', () => { clearTimeout(timer); resolve({ ip, port, open: false }); });
          })
        )).then(ports => ({ ip, ports: ports.filter(p => p.open).map(p => p.port) }))
      );
    }
    const batchResults = await Promise.all(batch);
    batchResults.forEach(r => {
      if (r.ports.length > 0) {
        const services = r.ports.map(p => {
          if ([80, 8080, 8000].includes(p)) return 'HTTP';
          if (p === 443) return 'HTTPS';
          if (p === 554) return 'RTSP';
          if (p === 37777) return 'Dahua';
          return `Port ${p}`;
        });
        results.push({ ip: r.ip, ports: r.ports, services });
      }
    });
  }

  const lines = [`=== 摄像头扫描结果 ===`, `网段：${input}`, `探测端口：${portList.join(', ')}`, '', `发现 ${results.length} 个响应设备：`, ''];
  results.forEach(r => {
    lines.push(`${r.ip} -> ${r.ports.join(', ')} (${r.services.join(', ')})`);
  });

  return { ok: true, output: lines.join('\n') };
}

/* ── 服务发现（mDNS + SSDP） ── */
export async function serviceDiscovery({ mdnsSec = 8, ssdpSec = 3 }) {
  const mdnsDuration = Math.min(Math.max(Number(mdnsSec) || 8, 2), 30) * 1000;
  const ssdpDuration = Math.min(Math.max(Number(ssdpSec) || 3, 1), 12) * 1000;

  const results = [];

  // mDNS query
  const mdnsTypes = [
    '_printer._tcp.local', '_ipp._tcp.local', '_pdl-datastream._tcp.local',
    '_googlecast._tcp.local', '_airplay._tcp.local', '_daap._tcp.local',
    '_http._tcp.local', '_https._tcp.local', '_smb._tcp.local',
    '_ssh._tcp.local', '_sftp-ssh._tcp.local', '_ftp._tcp.local'
  ];

  const mdnsSocket = dgram.createSocket('udp4');
  const mdnsMessages = [];
  let mdnsError = null;

  mdnsSocket.on('error', (err) => {
    mdnsError = err;
    mdnsSocket.close();
  });

  mdnsSocket.on('message', (msg) => {
    try {
      // Simple mDNS response parsing
      const lines = [];
      let i = 0;
      while (i < msg.length) {
        const len = msg[i];
        if (len === 0) break;
        const label = msg.slice(i + 1, i + 1 + len).toString('utf8');
        lines.push(label);
        i += len + 1;
      }
      if (lines.length > 0) {
        mdnsMessages.push(lines.join('.'));
      }
    } catch {}
  });

  mdnsSocket.bind(5353, '0.0.0.0', () => {
    if (mdnsError) return;
    mdnsSocket.setBroadcast(true);
    try { mdnsSocket.addMembership('224.0.0.251'); } catch {} // 无多播接口时忽略

    // Send mDNS queries
    mdnsTypes.forEach(type => {
      const query = Buffer.alloc(12 + type.length + 2 + 4);
      query.writeUInt16BE(0, 0); // Transaction ID
      query.writeUInt16BE(0x0120, 2); // Flags: Standard query
      query.writeUInt16BE(1, 4); // Questions
      query.writeUInt16BE(0, 6); // Answer RRs
      query.writeUInt16BE(0, 8); // Authority RRs
      query.writeUInt16BE(0, 10); // Additional RRs

      const parts = type.split('.');
      let offset = 12;
      parts.forEach(part => {
        query.writeUInt8(part.length, offset++);
        query.write(part, offset);
        offset += part.length;
      });
      query.writeUInt8(0, offset++); // Null terminator
      query.writeUInt16BE(255, offset); // ANY
      query.writeUInt16BE(1, offset + 2); // IN

      mdnsSocket.send(query, 5353, '224.0.0.251');
    });
  });

  await new Promise(resolve => setTimeout(resolve, mdnsDuration));
  mdnsSocket.close();

  if (mdnsMessages.length > 0) {
    const unique = [...new Set(mdnsMessages)];
    unique.forEach(m => {
      results.push({ proto: 'mDNS', service: m, type: 'device' });
    });
  }

  // SSDP discovery
  const ssdpSocket = dgram.createSocket('udp4');
  const ssdpMessages = [];
  ssdpSocket.on('error', () => { ssdpSocket.close(); });

  ssdpSocket.on('message', (msg) => {
    const str = msg.toString('utf8');
    if (str.includes('NOTIFY') || str.includes('HTTP/1.1 200')) {
      const lines = str.split('\r\n');
      const info = {};
      lines.forEach(line => {
        const colon = line.indexOf(':');
        if (colon > 0) {
          const key = line.slice(0, colon).toLowerCase();
          const value = line.slice(colon + 1).trim();
          if (['location', 'server', 'st', 'usn', 'nt'].includes(key)) {
            info[key] = value;
          }
        }
      });
      if (info.st || info.nt) {
        ssdpMessages.push(info);
      }
    }
  });

  const ssdpQuery = Buffer.from(
    'M-SEARCH * HTTP/1.1\r\n' +
    'HOST: 239.255.255.250:1900\r\n' +
    'MAN: "ssdp:discover"\r\n' +
    'MX: 2\r\n' +
    'ST: upnp:rootdevice\r\n' +
    '\r\n'
  );

  ssdpSocket.bind(() => {
    ssdpSocket.setBroadcast(true);
    ssdpSocket.send(ssdpQuery, 1900, '239.255.255.250');
  });

  await new Promise(resolve => setTimeout(resolve, ssdpDuration));
  ssdpSocket.close();

  ssdpMessages.forEach(m => {
    results.push({ proto: 'SSDP', service: m.st || m.nt || 'unknown', server: m.server, location: m.location });
  });

  const lines = [`=== 服务发现结果 ===`, `mDNS 监听：${mdnsDuration / 1000} 秒`, `SSDP 超时：${ssdpDuration / 1000} 秒`, '', `发现 ${results.length} 个服务：`, ''];
  results.forEach(r => {
    if (r.proto === 'mDNS') {
      lines.push(`[mDNS] ${r.service}`);
    } else {
      lines.push(`[SSDP] ${r.service}${r.server ? ` (${r.server})` : ''}`);
    }
  });

  return { ok: true, output: lines.join('\n') };
}

/* ── DHCP 服务器 ── */
const activeDhcpServers = new Map();
const ipToNum = (ip) => { const p = ip.split('.'); return ((+p[0]||0)*16777216 + (+p[1]||0)*65536 + (+p[2]||0)*256 + (+p[3]||0)) >>> 0; };
const validIp4 = (ip) => /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) && ip.split('.').every((v) => { const n = +v; return n >= 0 && n <= 255; });

export function getActiveDhcpServers() {
  return Array.from(activeDhcpServers.entries()).map(([port, info]) => ({
    port,
    subnet: info.subnet,
    gateway: info.gateway,
    startIp: info.startIp,
    endIp: info.endIp,
    startTime: info.startTime
  }));
}

export async function startDhcpServer({ port = 67, subnet = '192.168.1.0/24', gateway = '192.168.1.1', startIp = '192.168.1.100', endIp = '192.168.1.200', dns = '8.8.8.8' }) {
  port = Math.min(Math.max(Number(port) || 67, 1), 65535);
  if (activeDhcpServers.has(port)) {
    return { ok: false, output: `DHCP 服务器已在端口 ${port} 运行` };
  }
  if (!validIp4(gateway)) return { ok: false, output: `网关地址无效：${gateway}` };
  if (!validIp4(startIp)) return { ok: false, output: `起始 IP 无效：${startIp}` };
  if (!validIp4(endIp)) return { ok: false, output: `结束 IP 无效：${endIp}` };
  if (!dns || !dns.split(',').every((s) => validIp4(s.trim()))) return { ok: false, output: `DNS 地址无效：${dns}` };
  if (!/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.test(subnet)) return { ok: false, output: `子网格式无效：${subnet}` };
  if (ipToNum(startIp) >= ipToNum(endIp)) return { ok: false, output: '起始 IP 必须小于结束 IP' };

  try {
    const dgramMod = await import('dgram');
    const socket = dgramMod.createSocket('udp4');
    const leases = new Map();
    let nextIpNum = ipToNum(startIp);
    const endIpNum = ipToNum(endIp);

    socket.on('message', (msg, rinfo) => {
      if (msg.length < 240) return;
      const op = msg.readUInt8(0);
      if (op !== 1) return; // 只处理 DISCOVER 和 REQUEST

      const transactionId = msg.slice(4, 8);
      const clientMac = msg.slice(28, 34).toString('hex').toUpperCase().replace(/(.{2})/g, '$1:');

      if (!leases.has(clientMac)) {
        const assignedIp = [0,0,0,0].map((_, i) => ((nextIpNum >> (24 - i * 8)) & 0xFF));
        leases.set(clientMac, { ip: assignedIp.join('.'), time: Date.now() });
        nextIpNum++;
        if (nextIpNum > endIpNum) nextIpNum = ipToNum(startIp);
      }

      const lease = leases.get(clientMac);
      const ipParts = lease.ip.split('.').map(Number);

      const response = Buffer.alloc(240);
      response.writeUInt8(2, 0); // BOOTREPLY
      response.writeUInt8(1, 1); // Ethernet
      response.writeUInt8(6, 2); // MAC length
      response.writeUInt8(0, 3); // Hops
      transactionId.copy(response, 4);
      // yiaddr = lease IP
      response.writeUInt8(ipParts[0], 28);
      response.writeUInt8(ipParts[1], 29);
      response.writeUInt8(ipParts[2], 30);
      response.writeUInt8(ipParts[3], 31);

      const gwParts = gateway.split('.').map(Number);
      response.writeUInt8(gwParts[0], 36); // siaddr
      response.writeUInt8(gwParts[1], 37);
      response.writeUInt8(gwParts[2], 38);
      response.writeUInt8(gwParts[3], 39);

      const submask = subnet.split('/')[1] || 24;
      const maskParts = [];
      for (let i = 0; i < 4; i++) {
        const bits = Math.min(Math.max(+submask - i * 8, 0), 8);
        maskParts.push(bits === 8 ? 255 : (256 - (1 << (8 - bits))));
      }
      response.writeUInt8(maskParts[0], 40);
      response.writeUInt8(maskParts[1], 41);
      response.writeUInt8(maskParts[2], 42);
      response.writeUInt8(maskParts[3], 43);

      response.writeUInt32BE(86400, 44); // lease time

      const dnsParts = dns.split(',').map((s) => s.trim().split('.').map(Number))[0];
      response.writeUInt8(dnsParts[0], 156);
      response.writeUInt8(dnsParts[1], 157);
      response.writeUInt8(dnsParts[2], 158);
      response.writeUInt8(dnsParts[3], 159);

      // DHCP message type = OFFER (option 53)
      const opt53off = 240;
      response.writeUInt8(53, opt53off); response.writeUInt8(1, opt53off + 1); response.writeUInt8(2, opt53off + 2); // 2=OFFER
      const optEnd = opt53off + 3;
      response.writeUInt8(255, optEnd); // End option

      socket.send(response, 0, optEnd + 1, 68, rinfo.address);
    });

    socket.on('error', () => {});

    await new Promise((resolve, reject) => {
      socket.bind(port, '0.0.0.0', () => {
        socket.setBroadcast(true);
        resolve();
      });
      socket.on('error', (err) => { if (!socket.__bound) reject(err); });
    });
    socket.__bound = true;

    activeDhcpServers.set(port, { socket, subnet, gateway, startIp, endIp, dns, leases, startTime: new Date().toLocaleString() });

    return { ok: true, output: `[高危] DHCP 服务器已在端口 ${port} 启动（绑定 0.0.0.0，全网可达）。\n子网: ${subnet}\n网关: ${gateway}\nIP范围: ${startIp} - ${endIp}\nDNS: ${dns}\n注意：此功能是 rogue DHCP，使用后请立即用 /api/tools/stop-dhcp-server 停止。` };
  } catch (err) {
    return { ok: false, output: `DHCP 服务器启动失败: ${err.message}\n请使用管理员权限运行或更换端口` };
  }
}

export async function stopDhcpServer(port) {
  const server = activeDhcpServers.get(port);
  if (!server) {
    return { ok: false, output: `未找到端口 ${port} 的 DHCP 服务器` };
  }

  server.socket.close();
  activeDhcpServers.delete(port);
  return { ok: true, output: `DHCP 服务器 (端口 ${port}) 已停止` };
}

/* ── 内网测速 ── */
export async function lanSpeedTest({ host, duration = 10 }) {
  try {
    const net = await import('net');
    let totalBytes = 0;
    let startTime = 0;
    let endTime = 0;

    const result = await new Promise((resolve) => {
      const server = net.createServer((socket) => {
        socket.on('data', (data) => {
          totalBytes += data.length;
        });
        socket.on('end', () => {
          endTime = Date.now();
          const elapsed = (endTime - startTime) / 1000;
          const speedMbps = (totalBytes * 8 / 1000 / 1000) / elapsed;
          server.close();
          resolve({ ok: true, speedMbps, totalBytes, elapsed });
        });
      });

      server.listen(0, () => {
        const port = server.address().port;
        startTime = Date.now();
        
        const client = net.connect(port, host, () => {
          const buffer = Buffer.alloc(64 * 1024);
          const sendData = () => {
            if (Date.now() - startTime < duration * 1000) {
              client.write(buffer, sendData);
            } else {
              client.end();
            }
          };
          sendData();
        });

        client.on('error', () => {
          server.close();
          resolve({ ok: false, error: '连接失败' });
        });
      });
    });

    if (!result.ok) {
      return { ok: false, output: `内网测速失败: ${result.error}` };
    }

    return { ok: true, output: `=== 内网测速结果 ===\n目标主机: ${host}\n测试时长: ${result.elapsed.toFixed(2)} 秒\n传输数据: ${(result.totalBytes / 1024 / 1024).toFixed(2)} MB\n平均速度: ${result.speedMbps.toFixed(2)} Mbps` };
  } catch (err) {
    return { ok: false, output: `内网测速失败: ${err.message}` };
  }
}

/* ── Ping QoS 分析 ── */
export async function pingQoS({ host, port = 80, count = 50, timeout = 2 }) {
  try {
    const net = await import('net');
    const times = [];
    const lost = [];

    for (let i = 0; i < count; i++) {
      const start = Date.now();
      let connected = false;

      await new Promise(resolve => {
        const timer = setTimeout(() => {
          resolve();
        }, timeout * 1000);

        const socket = net.connect({ host, port: parseInt(port), timeout: timeout * 1000 });

        socket.on('connect', () => {
          clearTimeout(timer);
          connected = true;
          socket.destroy();
          resolve();
        });

        socket.on('error', () => {
          clearTimeout(timer);
          socket.destroy();
          resolve();
        });

        socket.on('timeout', () => {
          clearTimeout(timer);
          socket.destroy();
          resolve();
        });
      });

      const elapsed = Date.now() - start;
      if (connected) {
        times.push(elapsed);
      } else {
        lost.push(i);
      }

      await new Promise(r => setTimeout(r, 50));
    }

    if (times.length === 0) {
      return { ok: false, output: `Ping QoS 测试失败: 全部丢包` };
    }

    const min = Math.min(...times);
    const max = Math.max(...times);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const variance = times.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / times.length;
    const jitter = Math.sqrt(variance);
    const lossRate = (lost.length / count) * 100;

    let mos = 5.0;
    if (avg > 100) mos -= (avg - 100) / 200;
    if (jitter > 20) mos -= (jitter - 20) / 100;
    if (lossRate > 0) mos -= lossRate / 20;
    mos = Math.max(1.0, Math.min(5.0, mos));

    const lines = [
      `=== Ping QoS 分析结果 ===`,
      `目标主机: ${host}`,
      `探测端口: ${port}`,
      `探测次数: ${count}`,
      '',
      `延迟统计 (ms):`,
      `  最小值: ${min.toFixed(2)}`,
      `  最大值: ${max.toFixed(2)}`,
      `  平均值: ${avg.toFixed(2)}`,
      `  抖动: ${jitter.toFixed(2)}`,
      '',
      `丢包统计:`,
      `  丢包数: ${lost.length}`,
      `  丢包率: ${lossRate.toFixed(2)}%`,
      '',
      `QoS 评估:`,
      `  MOS评分: ${mos.toFixed(2)} (${mos >= 4.0 ? '优秀' : mos >= 3.0 ? '良好' : mos >= 2.0 ? '一般' : '较差'})`,
    ];

    return { ok: true, output: lines.join('\n') };
  } catch (err) {
    return { ok: false, output: `Ping QoS 测试失败: ${err.message}` };
  }
}

/* ── 路由策略分析 ── */
export async function routePolicy() {
  try {
    const result = await runPowerShell(`route print`);

    if (!result || !result.output) {
      return { ok: false, output: '路由策略获取失败' };
    }

    const lines = result.output.trim().split('\n');
    const policyLines = ['=== 路由策略分析 ===', ''];
    
    let inIpv4 = false;
    let inIpv6 = false;

    lines.forEach(line => {
      if (line.includes('IPv4 路由表')) {
        inIpv4 = true;
        inIpv6 = false;
        policyLines.push('', 'IPv4 路由表:', '');
      } else if (line.includes('IPv6 路由表')) {
        inIpv6 = true;
        inIpv4 = false;
        policyLines.push('', 'IPv6 路由表:', '');
      } else if ((inIpv4 || inIpv6) && line.trim() && !line.startsWith('---') && !line.includes('========') && line.length > 10) {
        policyLines.push(line.trim());
      }
    });

    if (policyLines.length <= 3) {
      policyLines.push('');
      policyLines.push('详细路由信息:');
      policyLines.push(result.output.trim().slice(0, 2000));
    }

    return { ok: true, output: policyLines.join('\n') };
  } catch (err) {
    return { ok: false, output: `路由策略分析失败: ${err.message}` };
  }
}

/* ── 连接测试 ── */
export async function connectionTest({ host, port, protocol = 'tcp', timeout = 5 }) {
  try {
    const net = await import('net');
    const tls = await import('tls');

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({ ok: false, output: `${protocol.toUpperCase()} 连接超时 (${timeout}秒)` });
      }, timeout * 1000);

      const connectOptions = {
        host,
        port: parseInt(port),
        timeout: timeout * 1000
      };

      let socket;
      if (protocol === 'tls') {
        socket = tls.connect(connectOptions);
      } else {
        socket = net.connect(connectOptions);
      }

      socket.on('connect', () => {
        clearTimeout(timer);
        const localPort = socket.localPort;
        socket.destroy();
        resolve({ ok: true, output: `${protocol.toUpperCase()} 连接测试成功\n目标: ${host}:${port}\n本地端口: ${localPort}` });
      });

      socket.on('error', (err) => {
        clearTimeout(timer);
        resolve({ ok: false, output: `${protocol.toUpperCase()} 连接失败: ${err.message}` });
      });

      socket.on('timeout', () => {
        clearTimeout(timer);
        socket.destroy();
        resolve({ ok: false, output: `${protocol.toUpperCase()} 连接超时` });
      });
    });
  } catch (err) {
    return { ok: false, output: `连接测试失败: ${err.message}` };
  }
}

/* ── DNS 多服务器基准测试 ── */
export async function dnsBenchmark({ domain = 'www.baidu.com', servers = '223.5.5.5,119.29.29.29,1.1.1.1', attempts = 3 }) {
  const target = String(domain || '').trim().toLowerCase();
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(target)) {
    return { ok: false, output: '域名格式无效，请输入完整域名，例如 www.example.com。' };
  }
  const serverList = [...new Set(String(servers || '').split(/[\s,;]+/).map(item => item.trim()).filter(Boolean))].slice(0, 8);
  if (!serverList.length || serverList.some(server => !net.isIP(server))) {
    return { ok: false, output: 'DNS 服务器必须是有效 IP 地址，多个地址可用逗号或换行分隔，最多 8 个。' };
  }
  const sampleCount = Math.min(Math.max(Number(attempts) || 3, 1), 5);
  const results = await Promise.all(serverList.map(async (server) => {
    const samples = [];
    const addressSets = [];
    const errors = [];
    for (let index = 0; index < sampleCount; index += 1) {
      const resolver = new Resolver({ timeout: 2500, tries: 1 });
      resolver.setServers([server]);
      const startedAt = performance.now();
      try {
        const addresses = (await resolver.resolve4(target)).sort();
        samples.push(performance.now() - startedAt);
        addressSets.push(addresses);
      } catch (error) {
        errors.push(error.code || error.message || '解析失败');
      }
    }
    const averageMs = samples.length ? samples.reduce((sum, value) => sum + value, 0) / samples.length : null;
    const addresses = [...new Set(addressSets.flat())].sort();
    return { server, averageMs, success: samples.length, failures: errors.length, addresses, errors };
  }));
  const successful = results.filter(item => item.success > 0);
  const answerGroups = new Set(successful.map(item => item.addresses.join(',')));
  const inconsistent = answerGroups.size > 1;
  const ranked = [...results].sort((a, b) => (a.averageMs ?? Infinity) - (b.averageMs ?? Infinity));
  const lines = ['DNS 多服务器基准测试', '='.repeat(72), `测试域名        ${target}`, `每台测试次数    ${sampleCount}`, ''];
  ranked.forEach((item, index) => {
    lines.push(`${String(index + 1).padStart(2, '0')}. ${item.server}`);
    lines.push(`    状态 ${item.success}/${sampleCount} 成功  平均 ${item.averageMs === null ? '-' : `${item.averageMs.toFixed(1)} ms`}`);
    lines.push(`    A 记录 ${item.addresses.length ? item.addresses.join(', ') : '-'}`);
    if (item.errors.length) lines.push(`    错误 ${[...new Set(item.errors)].join(', ')}`);
  });
  lines.push('', `答案一致性      ${inconsistent ? '存在差异，需要核查 CDN/污染/劫持可能' : successful.length ? '一致' : '无法判断'}`);
  lines.push(`结论：${successful.length ? `当前最快可用 DNS 为 ${ranked.find(item => item.averageMs !== null)?.server}；${inconsistent ? '不同服务器答案不一致，建议结合权威 DNS 和多次复测。' : '未发现答案分歧。'}` : '所有 DNS 服务器均解析失败，请检查 UDP/TCP 53、代理或上游网络。'}`);
  return { ok: successful.length > 0, output: lines.join('\n'), results, inconsistent };
}

/* ── Windows IP 冲突证据检查 ── */
export async function ipConflictCheck() {
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$since = (Get-Date).AddDays(-30)
$events = @(Get-WinEvent -FilterHashtable @{ LogName='System'; Id=4199; StartTime=$since } -MaxEvents 20 | Where-Object { $_.ProviderName -match 'TCPIP' })
$neighbors = @(Get-NetNeighbor -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch '^(0\\.|224\\.|239\\.|255\\.)' -and $_.State -notin @('Unreachable','Permanent') })
$suspects = @($neighbors | Group-Object IPAddress | ForEach-Object {
  $macs = @($_.Group.LinkLayerAddress | Where-Object { $_ -and $_ -ne '00-00-00-00-00-00' } | Sort-Object -Unique)
  if ($macs.Count -gt 1) { [pscustomobject]@{ IPAddress=$_.Name; MACAddresses=($macs -join ', '); Interfaces=(($_.Group.InterfaceAlias | Sort-Object -Unique) -join ', ') } }
})
'IP 冲突证据检查'
'========================================================================'
'检查范围        最近 30 天 TCP/IP 冲突事件 + 当前 IPv4 邻居表'
''
'[本机 IPv4 地址]'
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch '^(127\\.|169\\.254\\.)' } | Select-Object InterfaceAlias,IPAddress,PrefixLength,AddressState | Format-Table -AutoSize | Out-String -Width 240
'[事件日志 4199]'
if ($events.Count) { $events | Select-Object TimeCreated,ProviderName,Id,@{N='Message';E={$_.Message -replace '[\\r\\n]+',' '}} | Format-Table -Wrap -AutoSize | Out-String -Width 240 } else { '未发现 TCP/IP 4199 地址冲突事件。' }
''
'[当前邻居表重复 IP 证据]'
if ($suspects.Count) { $suspects | Format-Table -Wrap -AutoSize | Out-String -Width 240 } else { '未发现同一 IP 对应多个 MAC 的当前邻居表证据。' }
''
if ($events.Count -or $suspects.Count) { '结论：发现 IP 冲突迹象，请记录时间、IP、MAC 和交换机端口后进一步定位。' } else { '结论：本次检查未发现 IP 冲突证据。持续或间歇问题应在故障发生时复测。' }
`;
  return runPowerShell(script, 20000);
}

/* ── 网卡流量计数快照（前端按时间差计算速率） ── */
export async function networkTrafficSample({ interfaceAlias = '' } = {}) {
  const requestedAlias = String(interfaceAlias || '').trim();
  if (requestedAlias.length > 128 || /[\r\n'"`]/.test(requestedAlias)) return { ok: false, output: '网卡名称格式无效。' };
  const escapedAlias = requestedAlias.replace(/'/g, "''");
  const filter = escapedAlias ? ` | Where-Object { $_.Name -eq '${escapedAlias}' }` : '';
  const result = await runPowerShell(`$items = @(Get-NetAdapter -Physical -ErrorAction SilentlyContinue${filter} | ForEach-Object { $stats = Get-NetAdapterStatistics -Name $_.Name -ErrorAction SilentlyContinue; if ($stats) { [pscustomobject]@{ name=$_.Name; description=$_.InterfaceDescription; status=[string]$_.Status; linkSpeed=[string]$_.LinkSpeed; receivedBytes=[uint64]$stats.ReceivedBytes; sentBytes=[uint64]$stats.SentBytes } } }); $items | ConvertTo-Json -Compress`, 12000);
  if (!result.ok) return result;
  try {
    const parsed = JSON.parse(result.output || '[]');
    const adapters = (Array.isArray(parsed) ? parsed : parsed ? [parsed] : []).map(item => ({
      name: String(item.name || ''), description: String(item.description || ''), status: String(item.status || ''), linkSpeed: String(item.linkSpeed || ''),
      receivedBytes: Number(item.receivedBytes || 0), sentBytes: Number(item.sentBytes || 0),
    }));
    return { ok: true, sampledAt: Date.now(), adapters, output: adapters.length ? `已采集 ${adapters.length} 个物理网卡的真实流量计数。` : '未找到符合条件的物理网卡。' };
  } catch {
    return { ok: false, output: `网卡流量数据解析失败：${result.output}` };
  }
}

/* ── Wi-Fi 信道占用分析 ── */
export async function wifiChannelAnalysis() {
  const result = await run('netsh', ['wlan', 'show', 'networks', 'mode=bssid'], 15000);
  const raw = String(result.output || '');
  const networks = [];
  let currentSsid = '';
  let current = null;
  for (const line of raw.split(/\r?\n/)) {
    const ssidMatch = line.match(/^\s*SSID\s+\d+\s*:\s*(.*)$/i);
    if (ssidMatch) { currentSsid = ssidMatch[1].trim() || '(隐藏网络)'; current = null; continue; }
    const bssidMatch = line.match(/^\s*BSSID\s+\d+\s*:\s*([0-9a-f:-]{17})/i);
    if (bssidMatch) { current = { ssid: currentSsid, bssid: bssidMatch[1], signal: null, channel: null }; networks.push(current); continue; }
    if (!current) continue;
    const signalMatch = line.match(/^\s*(?:Signal|信号)\s*:\s*(\d+)%/i);
    if (signalMatch) { current.signal = Number(signalMatch[1]); continue; }
    const channelMatch = line.match(/^\s*(?:Channel|频道)\s*:\s*(\d+)/i);
    if (channelMatch) current.channel = Number(channelMatch[1]);
  }
  const valid = networks.filter(item => Number.isInteger(item.channel));
  const channelCounts = valid.reduce((counts, item) => { counts[item.channel] = (counts[item.channel] || 0) + 1; return counts; }, {});
  const rankedChannels = Object.entries(channelCounts).sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]));
  const lines = ['Wi-Fi 信道占用分析', '='.repeat(72), `发现 BSSID      ${valid.length}`, ''];
  if (!valid.length) {
    lines.push('未发现可分析的 Wi-Fi BSSID。请确认无线网卡已启用、WLAN AutoConfig 服务正在运行，并在有无线网络覆盖的位置复测。');
  } else {
    lines.push('信道占用统计');
    rankedChannels.forEach(([channel, count]) => lines.push(`  信道 ${String(channel).padStart(3)}    ${count} 个 BSSID ${'█'.repeat(Math.min(count, 30))}`));
    lines.push('', '附近接入点');
    valid.sort((a, b) => (b.signal || 0) - (a.signal || 0)).slice(0, 40).forEach(item => lines.push(`  CH ${String(item.channel).padStart(3)}  ${String(item.signal ?? '-').padStart(3)}%  ${item.ssid}  ${item.bssid}`));
    const busiest = rankedChannels[0];
    lines.push('', `结论：当前最拥挤信道为 ${busiest[0]}（${busiest[1]} 个 BSSID）。2.4GHz 优先在 1/6/11 中选择邻近干扰较少者；5GHz 需结合终端支持与现场覆盖调整。`);
  }
  return { ok: result.ok, output: lines.join('\n'), networks: valid, channels: channelCounts };
}

/* ── Wi-Fi 配置导出：默认脱敏，明文仅由上层权限与二次确认放行 ── */
export async function wifiProfileExport({ reveal = false } = {}) {
  const listResult = await run('netsh', ['wlan', 'show', 'profiles'], 10000);
  const names = [...new Set(String(listResult.output || '').split(/\r?\n/).map(line => {
    const match = line.match(/^\s*(?:All User Profile|所有用户配置文件)\s*:\s*(.+)$/i);
    return match?.[1]?.trim() || '';
  }).filter(Boolean))].slice(0, 50);
  const profiles = await Promise.all(names.map(async name => {
    const args = ['wlan', 'show', 'profile', `name=${name}`];
    if (reveal) args.push('key=clear');
    const result = await run('netsh', args, 10000);
    const output = String(result.output || '');
    const field = pattern => output.match(pattern)?.[1]?.trim() || '-';
    const authentication = field(/^\s*(?:Authentication|身份验证)\s*:\s*(.+)$/im);
    const cipher = field(/^\s*(?:Cipher|密码)\s*:\s*(.+)$/im);
    const connectionMode = field(/^\s*(?:Connection mode|连接模式)\s*:\s*(.+)$/im);
    const clearKey = reveal ? field(/^\s*(?:Key Content|关键内容)\s*:\s*(.+)$/im) : '';
    const keyPresent = /(?:Security key|安全密钥)\s*:\s*(?:Present|存在)/i.test(output);
    return { name, authentication, cipher, connectionMode, password: reveal ? clearKey : (keyPresent ? '已保存（隐藏）' : '未保存或开放网络') };
  }));
  const lines = [
    `Wi-Fi 配置导出（${reveal ? '管理员明文模式' : '脱敏模式'}）`,
    '='.repeat(78),
    `配置文件数量：${profiles.length}`,
    '',
    ...profiles.flatMap(profile => [
      `SSID：${profile.name}`,
      `  认证：${profile.authentication}  加密：${profile.cipher}  连接：${profile.connectionMode}`,
      `  密钥：${profile.password}`,
    ]),
    '',
    profiles.length ? '结论：配置已导出。迁移到其他终端前请核对企业无线策略和证书要求。' : '未发现已保存的 Wi-Fi 配置文件。',
  ];
  const csvEscape = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = ['SSID,认证,加密,连接模式,密钥', ...profiles.map(profile => [profile.name, profile.authentication, profile.cipher, profile.connectionMode, profile.password].map(csvEscape).join(','))].join('\r\n');
  return { ok: listResult.ok, output: lines.join('\n'), profiles, csv, revealed: Boolean(reveal) };
}

/* ── 链路可用性单次采样（由前端任务控制器持续轮询） ── */
export async function linkMonitorSample({ targets = '' } = {}) {
  const targetList = [...new Set((Array.isArray(targets) ? targets : String(targets || '').split(/[\s,;]+/)).map(item => String(item || '').trim()).filter(Boolean))].slice(0, 20);
  const validTarget = value => value.length <= 253 && (/^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)$/i.test(value) || net.isIP(value));
  if (!targetList.length || targetList.some(target => !validTarget(target))) return { ok: false, output: '请输入 1-20 个有效 IP 或主机名。' };
  const sampledAt = Date.now();
  const results = await Promise.all(targetList.map(async target => {
    const startedAt = performance.now();
    const response = await run('ping', ['-n', '1', '-w', '1200', target], 3000);
    const elapsedMs = Math.round(performance.now() - startedAt);
    const match = String(response.output || '').match(/时间[=<](\d+)ms|time[=<](\d+)ms/i);
    return { target, up: Boolean(response.ok), latencyMs: response.ok ? Number(match?.[1] || match?.[2] || elapsedMs) : null };
  }));
  const up = results.filter(item => item.up).length;
  const output = [`链路监控采样 ${new Date(sampledAt).toLocaleString('zh-CN')}`, ...results.map(item => `${item.target}\t${item.up ? '在线' : '离线'}\t${item.latencyMs === null ? '-' : `${item.latencyMs} ms`}`), `在线 ${up}/${results.length}`].join('\n');
  return { ok: true, sampledAt, results, output };
}

export async function sendMonitorWebhook({ url = '', text = '' } = {}) {
  let target;
  try { target = new URL(String(url || '').trim()); } catch { return { ok: false, output: 'Webhook URL 格式无效。' }; }
  const allowedHosts = new Set(['open.feishu.cn', 'qyapi.weixin.qq.com']);
  if (target.protocol !== 'https:' || !allowedHosts.has(target.hostname)) return { ok: false, output: '仅允许飞书或企业微信官方 HTTPS 机器人 Webhook。' };
  const message = String(text || '').trim().slice(0, 2000);
  if (!message) return { ok: false, output: '告警内容不能为空。' };
  const body = target.hostname === 'open.feishu.cn'
    ? { msg_type: 'text', content: { text: message } }
    : { msgtype: 'text', text: { content: message } };
  try {
    const response = await fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    const responseText = (await response.text()).slice(0, 1000);
    return { ok: response.ok, output: response.ok ? 'Webhook 告警已发送。' : `Webhook 返回 HTTP ${response.status}：${responseText}` };
  } catch (error) {
    return { ok: false, output: `Webhook 发送失败：${error.message}` };
  }
}

/* 前端工具名映射 */
export const extendedToolNames = {
  'startup-programs': '开机启动项',
  'scheduled-tasks': '计划任务',
  'windows-update': 'Windows 更新状态',
  'power-config': '电源配置/电池',
  'shared-folders': '共享文件夹',
  'large-files': '大文件查找',
  'hosts-file': 'Hosts 文件',
  'time-sync': '时间同步',
  'usb-history': 'USB 设备历史',
  'bitlocker-status': 'BitLocker 状态',
  'local-users': '本地用户与组',
  'env-vars': '环境变量',
  'process-tree': '进程树',
  'dns-cache': 'DNS 缓存',
  'netstat-connections': '网络连接表',
  'event-log-security': '安全日志',
  'dns-server-check': 'DNS 服务器检查',
  'wifi-scan': 'Wi-Fi 扫描',
  'disk-usage': '磁盘使用率',
  'memory-info': '内存信息',
  'wol': '网络唤醒 (WOL)',
  'mac-vendor': 'MAC 厂商查询',
  'conn-tracker': '连接追踪',
  'domain-whois': '域名 WHOIS',
  'http-api': 'HTTP API 测试',
  'snmp-probe': 'SNMP 探测',
  'websocket-test': 'WebSocket 测试',
  'ptr-lookup': '反向 DNS',
  'tls-scan': 'TLS/SSL 扫描',
  'traceroute-analyze': '路由追踪分析',
  'mitm-hints': 'ARP/MITM 检测',
  'netflow-listen': 'NetFlow 监听',
  'subnet-calc': '子网计算器',
  'route-table': '路由表查看',
  'firewall-status': '防火墙状态',
  'port-occupancy': '端口占用诊断',
  'ip-info': 'IP 信息检测',
  'dhcp-detect': 'DHCP 检测',
  'host-discovery': '主机发现',
  'loop-detection': '环路检测',
  'speed-test': '外网测速',
  'network-health': '网络健康检查',
  'arp-table': 'ARP 表查看',
  'port-service-probe': '端口服务探测',
  'temp-http-server': '临时 HTTP 服务器',
  'ftp-server': '临时 FTP 服务器',
  'tftp-server': '临时 TFTP 服务器',
  'syslog-server': 'Syslog 服务器',
  'camera-scan': '摄像头扫描',
  'service-discovery': '服务发现',
  'dhcp-server': 'DHCP 服务器',
  'lan-speed-test': '内网测速',
  'ping-qos': 'Ping QoS 分析',
  'route-policy': '路由策略分析',
  'connection-test': '连接测试',
};
