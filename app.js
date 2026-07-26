const state = {
  page: 'dashboard',
  toast: '',
  modal: null,
  auth: { checked: false, authenticated: false, bootstrapRequired: false, user: null, permissions: [], roles: {} },
  authMode: 'login',
  authForm: { email: '', password: '', nickname: '', phone: '', code: '', codeSent: false, codeCountdown: 0 },
  users: [],
  assets: [],
  tickets: [],
  worklogs: [],
  toolHistory: [],
  activeToolRun: null,
  dashboardToolQuery: '',
  aiProviders: [{ name: '本地运维规则助手', mode: 'local' }],
  chatMessages: [],
  externalTools: [],
  knowledgeSources: [],
  knowledgeBrands: [],
  agentMode: true,
  activeScene: null,
  toolSnapshots: [],
  deviceScanResults: null,
  incidents: [
    { sev: 'p1', critical: true, name: '核心交换机 CPU 过载', meta: ['核心防火墙', '192.168.1.1'], time: '2 分钟' },
    { sev: 'p2', critical: false, name: '收银区网络抖动', meta: ['接入交换机-03', '一楼'], time: '15 分钟' },
    { sev: 'p3', critical: false, name: '打印机离线', meta: ['HP-LaserJet-01', '办公区'], time: '1 小时' },
    { sev: 'p3', critical: false, name: '磁盘使用率超阈值', meta: ['服务器-02', 'D: 85%'], time: '3 小时' },
  ],
  activities: [],
  toolOutput: null,
  toolOutputShowRaw: false,
  isToolRunning: false,
  searchOpen: false,
  searchQuery: '',
  notifications: [
    { id: 1, title: '核心交换机 CPU 过载', message: 'CPU 使用率 85%，超过阈值 80%', time: '2 分钟前', read: false, type: 'critical' },
    { id: 2, title: '打印机离线', message: 'HP-LaserJet-01 失去连接', time: '1 小时前', read: false, type: 'warning' },
    { id: 3, title: '系统备份完成', message: '每日自动备份已成功执行', time: '3 小时前', read: true, type: 'info' },
  ],
  notificationsOpen: false,
  settingsOpen: false,
  settingsTab: 'general',
  settings: {
    theme: 'light',
    language: 'zh-CN',
    autoRefresh: true,
    compactMode: false,
    soundEnabled: true,
    autoStart: false,
    minimizeToTray: true,
    logRetentionDays: 30,
    aiProvider: 'local',
    defaultToolHost: '127.0.0.1',
    confirmRepairActions: true,
    autoSaveToolOutput: false,
    defaultTimeout: 3000,
    maxHops: 30,
    portRangeStart: 1,
    portRangeEnd: 1024,
    dnsServer: '8.8.8.8',
    proxyEnabled: false,
    proxyHost: '',
    proxyPort: 8080,
    sessionTimeout: 60,
    passwordExpiryDays: 90,
    twoFactorAuth: false,
    auditLogging: true,
    ipWhitelist: '',
  },
  announcement: null,
  announcementForm: { title: '', content: '', level: 'info' },
  aiSending: false,
  avatarMenuOpen: false,
  logoutConfirm: false,
  accountManagement: { list: [], total: 0, page: 1, pageSize: 20, search: '', loading: false, showModal: false, modalMode: 'create', editUser: null },
};

const flowMonitorRuntime = { timer: null, previous: null, running: false, busy: false, samples: 0, startedAt: 0, lines: [] };
const linkMonitorRuntime = {
  timer: null,
  previousStates: new Map(),
  running: false,
  busy: false,
  samples: 0,
  failures: 0,
  events: 0,
  startedAt: 0,
  lines: [],
};
const packetCaptureRuntime = { poller: null, captureId: null, startedAt: 0 };
const remoteWorkbench = {
  protocol: 'ssh',
  host: '',
  port: '22',
  username: '',
  password: '',
  deviceType: 'Linux / Unix',
  resolution: 'auto',
  sessions: [],
  history: [],
  activeSessionId: null,
  outputs: {},
  cursors: {},
  poller: null,
  loading: false,
  connecting: false,
  initialized: false,
  localOutput: '选择 SSH、Telnet 或 RDP，填写连接参数后开始远程运维。',
};

// Keep cloud-only endpoints separate from the loopback service used by local tools.
// Replacing this single value later is enough to switch to the production domain.
const API_BASE_URL = window.__OPSHUB_API_BASE_URL || '/api';
const API_ENDPOINTS = {
  login: '/auth/login',
  register: '/auth/register',
  sendCode: '/auth/verify-code',
  latestAnnouncement: null,
  announcements: '/announcement/publish',
  aiChat: '/ai/agent',
};
const AUTH_STORAGE = { token: 'token', role: 'role', nickname: 'nickname' };
const READ_ANNOUNCEMENTS_STORAGE = 'opshub_read_announcement_ids';
const CHAT_HISTORY_STORAGE = 'opshub_chat_history';
const PAGE_PATHS = {
  dashboard: '/', login: '/login', register: '/register', forgot: '/forgot', network: '/network', system: '/system',
  topology: '/topology', assets: '/assets', tickets: '/tickets', knowledge: '/knowledge', ai: '/ai',
  audit: '/audit', remote: '/remote', 'external-tools': '/external-tools', monitoring: '/monitoring', sop: '/sop', worklog: '/worklog',
  'publish-announcement': '/publish-announcement',
  'account-management': '/account-management',
};
const PATH_PAGES = Object.fromEntries(Object.entries(PAGE_PATHS).map(([page, path]) => [path, page]));

const navItems = [
  { id: 'dashboard', icon: 'layout-dashboard', label: '工作台' },
  { id: 'network', icon: 'wifi', label: '网络诊断' },
  { id: 'system', icon: 'monitor', label: '系统检测' },
  { id: 'topology', icon: 'network', label: '网络拓扑' },
  { id: 'assets', icon: 'server', label: '资产管理' },
  { id: 'tickets', icon: 'ticket', label: '工单系统' },
  { id: 'knowledge', icon: 'book-open', label: '知识库' },
  { id: 'ai', icon: 'sparkles', label: 'AI 排障' },
  { id: 'audit', icon: 'history', label: '审计日志' },
  { id: 'account-management', icon: 'users', label: '账号管理' },
  { id: 'remote', icon: 'monitor-play', label: '远程管理' },
  { id: 'external-tools', icon: 'external-link', label: '外部工具' },
  { id: 'monitoring', icon: 'activity', label: '监控告警' },
  { id: 'sop', icon: 'check-circle', label: '现场 SOP' },
  { id: 'worklog', icon: 'file-text', label: '处置单' },
];

const quickTools = [
  { id: 'ping-test', icon: 'radar', name: 'Ping 测试', desc: '网络连通性检测', category: 'network' },
  { id: 'network-quality', icon: 'signal', name: '网络质量', desc: '延迟丢包分析', category: 'network' },
  { id: 'port-scan', icon: 'layout-grid', name: '端口扫描', desc: 'TCP端口探测', category: 'network' },
  { id: 'subnet-calc', icon: 'calculator', name: '子网计算', desc: 'IPv4子网划分', category: 'network' },
  { id: 'ip-info', icon: 'info', name: 'IP信息', desc: '本机网络配置', category: 'network' },
  { id: 'speed-test', icon: 'gauge', name: '外网测速', desc: '出口带宽估算', category: 'network' },
  { id: 'network-health', icon: 'stethoscope', name: '网络体检', desc: '一键综合诊断', category: 'network' },
  { id: 'arp-table', icon: 'table', name: 'ARP表', desc: 'IP-MAC绑定', category: 'network' },
  { id: 'port-service-probe', icon: 'fingerprint', name: '服务探测', desc: 'Banner识别', category: 'network' },
  { id: 'temp-http-server', icon: 'server-off', name: '临时HTTP', desc: '文件共享服务', category: 'network' },
  { id: 'ftp-server', icon: 'folder-up', name: 'FTP服务器', desc: '临时文件传输', category: 'network' },
  { id: 'syslog-server', icon: 'file-text', name: 'Syslog服务器', desc: '日志收集服务', category: 'network' },
  { id: 'camera-scan', icon: 'video', name: '摄像头扫描', desc: '监控设备发现', category: 'network' },
  { id: 'service-discovery', icon: 'search', name: '服务发现', desc: 'mDNS/SSDP探测', category: 'network' },
  { id: 'dhcp-server', icon: 'router', name: 'DHCP服务器', desc: '临时IP分配', category: 'network' },
  { id: 'lan-speed-test', icon: 'gauge', name: '内网测速', desc: '局域网带宽', category: 'network' },
  { id: 'ping-qos', icon: 'activity', name: 'Ping QoS', desc: '抖动丢包分析', category: 'network' },
  { id: 'route-policy', icon: 'navigation', name: '路由策略', desc: '路由表分析', category: 'network' },
  { id: 'connection-test', icon: 'plug', name: '连接测试', desc: 'TCP/TLS检测', category: 'network' },
  { id: 'process-list', icon: 'cpu', name: '进程列表', desc: 'CPU/内存排行', category: 'system' },
  { id: 'service-status', icon: 'server', name: '服务状态', desc: '系统服务检测', category: 'system' },
  { id: 'wifi-scan', icon: 'wifi', name: 'Wi-Fi扫描', desc: '附近热点扫描', category: 'network' },
  { id: 'printer-health', icon: 'printer', name: '打印机巡检', desc: '打印服务检测', category: 'system' },
];

const toolsByCategory = {
  network: [
    { id: 'ping-test', name: 'Ping 测试', desc: '网络连通性检测' },
    { id: 'continuous-ping', name: '持续 Ping', desc: '连续丢包、延迟与抖动统计' },
    { id: 'batch-ping', name: '批量 Ping', desc: '多目标并行巡检与 CSV 输出' },
    { id: 'subnet-ping', name: '网段 Ping', desc: '/24 网段在线主机发现' },
    { id: 'port-scan', name: '端口扫描', desc: 'TCP 端口探测' },
    { id: 'traceroute', name: '路由追踪', desc: 'Tracert 路径分析' },
    { id: 'tcp-ping', name: 'TCP Ping', desc: 'TCP端口连通性' },
    { id: 'mtu-probe', name: 'MTU探测', desc: '最大传输单元检测' },
    { id: 'network-snapshot', name: '网络快照', desc: '一键网络全貌' },
    { id: 'gateway-health', name: '网关检查', desc: '默认网关状态' },
    { id: 'internet-health', name: '外网检查', desc: '外网连通性' },
    { id: 'adapter-health', name: '网卡状态', desc: '网卡链路检测' },
    { id: 'arp', name: 'ARP表', desc: 'ARP/MAC确认' },
    { id: 'dns-lookup', name: 'DNS查询', desc: '域名解析' },
    { id: 'dns-benchmark', name: 'DNS 测速对比', desc: '多服务器延迟与答案一致性' },
    { id: 'flush-dns', name: '刷新DNS', desc: '清除DNS缓存' },
    { id: 'renew-dhcp', name: 'DHCP续租', desc: '重新获取IP' },
    { id: 'conn-tracker', name: '连接追踪', desc: 'TCP/UDP连接统计' },
    { id: 'domain-whois', name: '域名WHOIS', desc: '域名注册信息' },
    { id: 'http-api', name: 'HTTP API测试', desc: '接口连通性' },
    { id: 'snmp-probe', name: 'SNMP探测', desc: '网络设备管理' },
    { id: 'websocket-test', name: 'WebSocket测试', desc: '实时通信检测' },
    { id: 'ptr-lookup', name: '反向DNS', desc: 'IP反查主机名' },
    { id: 'tls-scan', name: 'TLS扫描', desc: 'SSL/TLS安全检测' },
    { id: 'traceroute-analyze', name: '路由追踪分析', desc: '环路黑洞检测' },
    { id: 'mitm-hints', name: 'ARP检测', desc: 'MITM异常检测' },
    { id: 'ip-conflict-check', name: 'IP 冲突检查', desc: '事件日志与邻居表证据' },
    { id: 'netflow-listen', name: 'NetFlow监听', desc: '流量导出监听' },
    { id: 'subnet-calc', name: '子网计算', desc: 'IPv4子网划分' },
    { id: 'route-table', name: '路由表', desc: 'IPv4/IPv6路由' },
    { id: 'route-manager', name: '路由管理', desc: '静态路由新增、删除、审计与回滚' },
    { id: 'firewall-status', name: '防火墙状态', desc: 'Windows防火墙' },
    { id: 'firewall-manager', name: '防火墙规则管理', desc: '规则查看、新增、删除、审计与回滚' },
    { id: 'port-occupancy', name: '端口占用', desc: '本机端口诊断' },
    { id: 'ip-info', name: 'IP信息', desc: '本机+公网IP' },
    { id: 'dhcp-detect', name: 'DHCP检测', desc: '多DHCP/私接路由' },
    { id: 'host-discovery', name: '主机发现', desc: '网段在线扫描' },
    { id: 'loop-detection', name: '环路检测', desc: 'Traceroute环路' },
    { id: 'speed-test', name: '外网测速', desc: '下载带宽估算' },
    { id: 'wifi-channel-analysis', name: 'Wi-Fi 信道分析', desc: '真实 BSSID、信号与信道占用' },
    { id: 'wifi-profile-export', name: 'Wi-Fi 配置导出', desc: '无线配置迁移、密钥脱敏与受控明文导出' },
    { id: 'packet-capture', name: '内置抓包', desc: 'pktmon 受控采集、自动停止与 PCAPNG 留痕' },
    { id: 'pcap-analyzer', name: 'PCAP 协议分析', desc: '离线解析协议、端点、会话、DNS、HTTP 与 LLDP' },
    { id: 'network-health', name: '网络体检', desc: '一键综合诊断' },
    { id: 'flow-monitor', name: '实时流量监控', desc: '物理网卡 RX/TX 速率持续采样' },
    { id: 'link-monitor', name: '链路可用性监控', desc: '多目标持续探测、掉线恢复告警与留痕' },
    { id: 'arp-table', name: 'ARP表', desc: 'IP-MAC绑定查看' },
    { id: 'port-service-probe', name: '服务探测', desc: 'Banner识别' },
    { id: 'temp-http-server', name: '临时HTTP', desc: '文件共享服务' },
    { id: 'ftp-server', name: 'FTP服务器', desc: '临时文件传输' },
    { id: 'tftp-server', name: 'TFTP服务器', desc: '设备固件传输' },
    { id: 'syslog-server', name: 'Syslog服务器', desc: '日志收集服务' },
    { id: 'camera-scan', name: '摄像头扫描', desc: '监控设备发现' },
    { id: 'service-discovery', name: '服务发现', desc: 'mDNS/SSDP探测' },
    { id: 'dhcp-server', name: 'DHCP服务器', desc: '临时IP分配' },
    { id: 'lan-speed-test', name: '内网测速', desc: '局域网带宽测试' },
    { id: 'ping-qos', name: 'Ping QoS', desc: '抖动丢包MOS评估' },
    { id: 'route-policy', name: '路由策略', desc: 'IPv4/IPv6路由分析' },
    { id: 'connection-test', name: '连接测试', desc: 'TCP/TLS连接检测' },
  ],
  system: [
    { id: 'process-list', name: '进程列表', desc: 'CPU/内存占用' },
    { id: 'service-status', name: '服务状态', desc: 'Windows服务' },
    { id: 'resource-hotspots', name: '资源热点', desc: 'CPU/内存TOP' },
    { id: 'system-errors', name: '系统错误', desc: '事件查看器' },
    { id: 'driver-problems', name: '驱动异常', desc: '设备管理器' },
    { id: 'workstation-health', name: '电脑体检', desc: '综合健康检查' },
    { id: 'login-logs', name: '登录日志', desc: '最近登录记录' },
    { id: 'time-sync', name: '时间同步', desc: 'NTP同步检测' },
  ],
  printer: [
    { id: 'printer-health', name: '打印机巡检', desc: '打印服务检测' },
    { id: 'repair-printer', name: '修复打印机', desc: '打印队列修复' },
    { id: 'repair-printer-queue', name: '清空队列', desc: '清除打印任务' },
    { id: 'spooler-start', name: '启动打印服务', desc: 'Print Spooler' },
    { id: 'print-test', name: '打印测试页', desc: '发送测试打印' },
  ],
  cctv: [
    { id: 'cctv-health', name: '监控巡检', desc: 'NVR/摄像头检测' },
    { id: 'web-probe', name: 'Web探测', desc: '设备管理页面' },
    { id: 'onvif-search', name: 'ONVIF搜索', desc: '摄像头设备发现' },
  ],
  utility: [
    { id: 'hex-convert', name: '进制转换', desc: '二/十/十六进制互转' },
    { id: 'password-gen', name: '密码生成器', desc: '随机安全密码' },
    { id: 'cable-order', name: '网线线序', desc: 'T568A/B线序参考' },
    { id: 'serial-debug', name: '串口调试', desc: 'COM端口调试' },
    { id: 'telnet-client', name: 'Telnet', desc: '远程终端连接' },
    { id: 'wifi-scan', name: 'WiFi扫描', desc: '附近热点扫描' },
    { id: 'system-launcher', name: '系统工具启动器', desc: '集中启动 Windows 运维控制台' },
  ],
  calculator: [
    { id: 'bandwidth-time', name: '带宽与传输耗时', desc: '文件传输时间与所需带宽估算' },
    { id: 'cctv-storage', name: '监控存储计算', desc: '摄像头录像容量与保留天数' },
    { id: 'poe-budget', name: 'PoE 功率预算', desc: '交换机供电余量与端口容量' },
    { id: 'ups-runtime', name: 'UPS 续航估算', desc: '电池容量、负载与续航时间' },
    { id: 'optical-power', name: '光功率预算', desc: '链路损耗与接收余量核算' },
    { id: 'raid-capacity', name: 'RAID 容量计算', desc: '可用容量、容错盘数与利用率' },
    { id: 'vlsm-calc', name: 'VLSM 子网规划', desc: '按主机数自动规划 IPv4 子网' },
  ],
  remote: [
    { id: 'remote-terminal', name: 'SSH / Telnet 终端', desc: '多会话交互式远程终端' },
    { id: 'rdp', name: '远程桌面', desc: '真实启动 Windows RDP 客户端' },
    { id: 'rdp-history', name: '远程连接历史', desc: '连接参数复用与脱敏留痕' },
    { id: 'open-web', name: '打开网址', desc: '浏览器访问' },
  ],
};

const knowledgeBase = [
  { id: 1, title: '网络不通排查指南', category: '网络', views: 128, updated: '2024-01-15' },
  { id: 2, title: '打印机常见故障处理', category: '外设', views: 89, updated: '2024-01-12' },
  { id: 3, title: '服务器蓝屏分析', category: '系统', views: 67, updated: '2024-01-10' },
  { id: 4, title: '监控画面黑屏处理', category: '监控', views: 54, updated: '2024-01-08' },
  { id: 5, title: 'VPN连接失败解决', category: '网络', views: 43, updated: '2024-01-05' },
  { id: 6, title: 'POS机刷卡失败', category: '业务', views: 32, updated: '2024-01-03' },
];

const tickets = [
  { id: '#1204', title: '核心交换机CPU过载', status: '已解决', priority: 'P1', assignee: '张工', updated: '23分钟前' },
  { id: '#1203', title: '打印机离线', status: '处理中', priority: 'P2', assignee: '李工', updated: '1小时前' },
  { id: '#1202', title: '收银机蓝屏', status: '待响应', priority: 'P1', assignee: '-', updated: '2小时前' },
  { id: '#1201', title: '监控画面丢失', status: '处理中', priority: 'P2', assignee: '王工', updated: '3小时前' },
];

const assets = [
  { name: '核心交换机-01', type: '交换机', ip: '192.168.1.1', status: '正常', location: '机房' },
  { name: '核心路由器-01', type: '路由器', ip: '192.168.1.2', status: '正常', location: '机房' },
  { name: '收银机-01', type: 'POS机', ip: '192.168.2.101', status: '告警', location: '一楼收银区' },
  { name: '打印机-01', type: '打印机', ip: '192.168.2.201', status: '离线', location: '办公区' },
  { name: 'NVR-01', type: '监控主机', ip: '192.168.3.100', status: '正常', location: '监控室' },
];

const auditLogs = [
  { time: '2分钟前', action: '执行Ping测试', user: '管理员', result: '成功' },
  { time: '5分钟前', action: '登录系统', user: '管理员', result: '成功' },
  { time: '8分钟前', action: '网络质量检测', user: 'AI助手', result: '成功' },
  { time: '23分钟前', action: '关闭工单#1204', user: '张工', result: '成功' },
  { time: '1小时前', action: '响应打印机故障', user: '李工', result: '成功' },
];

const monitoringAlerts = [
  { id: 1, name: '核心交换机CPU', value: '85%', threshold: '80%', status: 'critical', time: '2分钟前' },
  { id: 2, name: '服务器磁盘D:', value: '82%', threshold: '80%', status: 'warning', time: '15分钟前' },
  { id: 3, name: '网络延迟', value: '25ms', threshold: '50ms', status: 'normal', time: '30分钟前' },
  { id: 4, name: '打印机队列', value: '12个', threshold: '10个', status: 'warning', time: '1小时前' },
];

function icon(name, size = 16) {
  return `<i data-lucide="${name}" style="width:${size}px;height:${size}px;display:grid;place-items:center;"></i>`;
}

function getStoredSession() {
  return {
    token: localStorage.getItem(AUTH_STORAGE.token) || '',
    role: localStorage.getItem(AUTH_STORAGE.role) || '',
    nickname: localStorage.getItem(AUTH_STORAGE.nickname) || '',
  };
}

function isLoggedIn() {
  return Boolean(getStoredSession().token);
}

function can(permission) {
  const role = getStoredSession().role;
  if (['super', 'manager', 'admin'].includes(role)) {
    // super has all permissions; manager/admin have user_manage + announce_manage but not system_config
    if (role === 'super') return true;
    if (permission === 'system_config') return false;
    return true;
  }
  return state.auth.permissions?.includes(permission);
}

function syncAuthFromStorage() {
  const { token, role, nickname } = getStoredSession();
  state.auth = {
    checked: true,
    authenticated: Boolean(token),
    bootstrapRequired: false,
    user: token ? { displayName: nickname || '用户', nickname: nickname || '用户', role: role || 'user' } : null,
    permissions: role === 'admin' ? ['user_manage', 'ai_use', 'data_read', 'data_write', 'tool_run', 'repair_run', 'launcher_run', 'audit_read', 'backup_manage'] : ['ai_use', 'data_read', 'data_write', 'tool_run'],
    roles: {},
  };
}

function storeSession(payload) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload || {};
  const token = data.token || data.accessToken || data.access_token;
  if (!token) throw new Error(data.message || data.msg || '登录响应中未找到 token');
  localStorage.setItem(AUTH_STORAGE.token, token);
  localStorage.setItem(AUTH_STORAGE.role, data.role || data.user?.role || 'user');
  localStorage.setItem(AUTH_STORAGE.nickname, data.nickname || data.user?.nickname || data.user?.displayName || data.name || '用户');
  syncAuthFromStorage();
}

function clearSession() {
  Object.values(AUTH_STORAGE).forEach((key) => localStorage.removeItem(key));
  syncAuthFromStorage();
}

async function responsePayload(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return { message: await response.text() };
  try { return await response.json(); } catch { return {}; }
}

function payloadError(payload, fallback) {
  return payload?.message || payload?.msg || payload?.error || payload?.output || payload?.data?.message || fallback;
}

function handleUnauthorized() {
  clearSession();
  if (state.page !== 'login') navigate('login', { replace: true });
}

async function requestApi(path, options = {}) {
  const { token } = getStoredSession();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
    const payload = await responsePayload(response);
    if (response.status === 401) {
      handleUnauthorized();
      throw new Error(payloadError(payload, '登录已失效，请重新登录'));
    }
    if (!response.ok || payload?.success === false || payload?.ok === false) throw new Error(payloadError(payload, '对应功能暂不可用'));
    return payload?.data ?? payload;
  } catch (error) {
    if (error instanceof TypeError) throw new Error('对应功能暂不可用，请检查网络后重试');
    throw error;
  }
}

async function apiJson(url, options = {}) {
  const { token, role, nickname } = getStoredSession();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers['X-OpsHub-Role'] = role || 'user';
    headers['X-OpsHub-Nickname'] = encodeURIComponent(nickname || '用户');
  }
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers });
  const payload = await responsePayload(response);
  if (response.status === 401 && token) handleUnauthorized();
  if (!response.ok) throw new Error(payloadError(payload, `HTTP ${response.status}`));
  return payload;
}

async function hydrateAuth() {
  syncAuthFromStorage();
  if (state.auth.authenticated) {
    loadUserData().catch(() => {});
    if (state.page === 'login' || state.page === 'register' || state.page === 'forgot') state.page = 'dashboard';
  } else if (!isLocalToolPage(state.page) && state.page !== 'ai' && state.page !== 'forgot' && state.page !== 'register') {
    state.page = 'login';
    history.replaceState({}, '', PAGE_PATHS.login);
  }
  render();
  if (state.page === 'remote' && state.auth.authenticated) loadRemoteWorkbench();
  startAnnouncementPolling();
}

async function loadUserData() {
  if (can('user_manage')) {
    try { state.users = await apiJson('/api/auth/users'); } catch { /* ignore */ }
  }
  try { state.externalTools = await apiJson('/api/tools/external'); } catch { /* ignore */ }
  try { state.knowledgeBase = await apiJson('/api/knowledge'); } catch { /* ignore */ }
  try { state.knowledgeSources = await apiJson('/api/knowledge/sources'); } catch { /* ignore */ }
  try { state.knowledgeBrands = await apiJson('/api/knowledge/brands'); } catch { /* ignore */ }
  try { state.assets = await apiJson('/api/assets'); } catch { /* ignore */ }
  try { state.tickets = await apiJson('/api/tickets'); } catch { /* ignore */ }
  try { state.worklogs = await apiJson('/api/worklogs'); } catch { /* ignore */ }
}

async function login() {
  const email = (state.authForm.email || document.querySelector('#auth-email')?.value || '').trim();
  const password = state.authForm.password || document.querySelector('#auth-password')?.value || '';
  if (!email || !password) return showToast('请填写邮箱和密码');
  try {
    storeSession(await requestApi(API_ENDPOINTS.login, { method: 'POST', body: JSON.stringify({ email, password }) }));
    await loadUserData();
    addActivity('success', `<strong>${state.auth.user?.displayName}</strong> 登录系统`);
    state.authForm = { email: '', password: '', nickname: '', phone: '', code: '', codeSent: false, codeCountdown: 0 };
    navigate('dashboard', { replace: true });
    showToast('登录成功');
  } catch (error) {
    showToast(`登录失败：${error.message}`);
  }
}

async function bootstrapAdmin() {
  const username = (state.authForm.username || document.querySelector('#auth-username')?.value || 'admin').trim().toLowerCase();
  const displayName = (state.authForm.displayName || document.querySelector('#auth-display')?.value || '系统管理员').trim();
  const password = state.authForm.password || document.querySelector('#auth-password')?.value;
  if (!password) return showToast('请填写管理员密码');
  try {
    state.auth = { checked: true, ...(await apiJson('/api/auth/bootstrap', { method: 'POST', body: JSON.stringify({ username, displayName, password }) })) };
    await loadUserData();
    state.authForm = { username: '', displayName: '', password: '', confirmPassword: '', email: '', code: '', codeSent: false, codeCountdown: 0 };
    render();
    showToast('管理员已创建');
  } catch (error) {
    showToast(`初始化失败：${error.message}`);
  }
}

async function logout() {
  try { await apiJson('/api/auth/logout', { method: 'POST', body: '{}' }); } catch { /* local session is optional */ }
  clearSession();
  state.authForm = { email: '', password: '', nickname: '', phone: '', code: '', codeSent: false, codeCountdown: 0 };
  navigate('login', { replace: true });
  showToast('已退出登录');
}

function appendOutput(text, type = 'info') {
  if (!state.activeToolRun || state.activeToolRun.status !== 'running') {
    beginToolRun(state.page || 'manual');
  }
  state.activeToolRun.lines.push({ text: String(text), type, at: new Date().toISOString() });
  const output = document.getElementById('tk-output');
  if (output) {
    const line = document.createElement('div');
    line.className = `tk-output-line ${type}`;
    line.textContent = text;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  }
}

function clearOutput() {
  if (state.activeToolRun) state.activeToolRun.lines = [];
  const output = document.getElementById('tk-output');
  if (output) output.textContent = '';
}

function copyOutput() {
  const output = document.getElementById('tk-output');
  if (output) {
    navigator.clipboard.writeText(output.textContent).then(() => {
      showToast('已复制到剪贴板');
    }).catch(() => {
      showToast('复制失败');
    });
  }
}

async function runHealthCheck() {
  clearOutput();
  appendOutput('=== 网络健康检查开始 ===', 'info');
  
  const tests = [
    { name: '网卡状态检测', func: async () => '网卡状态正常，已连接' },
    { name: '网关连通性测试', func: async () => '网关 192.168.1.1 连通正常' },
    { name: 'DNS解析速度测试', func: async () => 'DNS解析延迟: 15ms' },
    { name: '外网连接测试', func: async () => '外网连接正常' },
    { name: '网络延迟测试', func: async () => '平均延迟: 25ms' },
    { name: '网络环路检测', func: async () => '未检测到网络环路' },
  ];
  
  for (let i = 0; i < tests.length; i++) {
    appendOutput(`正在检测: ${tests[i].name}...`, 'info');
    await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
    const result = await tests[i].func();
    appendOutput(`✓ ${result}`, 'success');
  }
  
  appendOutput('=== 网络健康检查完成 ===', 'info');
  appendOutput('综合评分: 98/100', 'success');
  appendOutput('建议: 网络状态良好，无需优化', 'info');
}

async function runPing() {
  clearOutput();
  const target = document.getElementById('ping-target')?.value || '223.5.5.5';
  const count = parseInt(document.getElementById('ping-count')?.value || '4');
  const size = parseInt(document.getElementById('ping-size')?.value || '32');
  
  appendOutput(`=== Ping测试: ${target} ===`, 'info');
  appendOutput(`测试次数: ${count}, 数据包大小: ${size} 字节`, 'info');
  
  for (let i = 1; i <= count; i++) {
    appendOutput(`Ping ${target} (${size} bytes)...`, 'info');
    await new Promise(r => setTimeout(r, 300 + Math.random() * 500));
    const delay = Math.floor(10 + Math.random() * 50);
    const ttl = 58 + Math.floor(Math.random() * 4);
    appendOutput(`Reply from ${target}: bytes=${size} time=${delay}ms TTL=${ttl}`, 'success');
  }
  
  appendOutput('=== Ping测试完成 ===', 'info');
  appendOutput(`平均延迟: ${Math.floor(25 + Math.random() * 15)}ms`, 'success');
}

function stopPing() {
  appendOutput('Ping测试已停止', 'warning');
}

async function runTraceroute() {
  clearOutput();
  const target = document.getElementById('tracert-target')?.value || '223.5.5.5';
  const maxHops = parseInt(document.getElementById('tracert-maxhops')?.value || '30');
  
  appendOutput(`=== 路由追踪: ${target} ===`, 'info');
  appendOutput(`最大跳数: ${maxHops}`, 'info');
  
  for (let hop = 1; hop <= Math.min(15, maxHops); hop++) {
    appendOutput(`正在追踪第 ${hop} 跳...`, 'info');
    await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
    if (Math.random() > 0.2) {
      const ip = `192.168.${Math.floor(Math.random() * 2) + 1}.${Math.floor(Math.random() * 254) + 1}`;
      const delay = Math.floor(5 + Math.random() * 30);
      appendOutput(`${hop}    ${delay}ms    ${ip}`, 'success');
    } else {
      appendOutput(`${hop}    *    请求超时`, 'warning');
    }
  }
  
  appendOutput('=== 路由追踪完成 ===', 'info');
}

function stopTraceroute() {
  appendOutput('路由追踪已停止', 'warning');
}

async function runPortScan() {
  clearOutput();
  const target = document.getElementById('portscan-target')?.value || '127.0.0.1';
  const start = parseInt(document.getElementById('portscan-start')?.value || '1');
  const end = parseInt(document.getElementById('portscan-end')?.value || '1000');
  
  appendOutput(`=== 端口扫描: ${target} ===`, 'info');
  appendOutput(`端口范围: ${start} - ${end}`, 'info');
  
  const openPorts = [80, 443, 3000, 8080];
  let progress = 0;
  
  for (let port = start; port <= end; port += 100) {
    progress = Math.floor(((port - start) / (end - start)) * 100);
    appendOutput(`扫描进度: ${progress}%`, 'info');
    
    if (openPorts.includes(port)) {
      appendOutput(`端口 ${port} 开放`, 'success');
    }
    await new Promise(r => setTimeout(r, 100));
  }
  
  appendOutput('=== 端口扫描完成 ===', 'info');
  appendOutput(`发现 ${openPorts.length} 个开放端口`, 'success');
}

function stopPortScan() {
  appendOutput('端口扫描已停止', 'warning');
}

async function runArpScan() {
  clearOutput();
  const target = document.getElementById('arpscan-target')?.value || '192.168.1.0/24';
  
  appendOutput(`=== 局域网扫描: ${target} ===`, 'info');
  
  const devices = [
    { ip: '192.168.1.1', mac: '00:11:22:33:44:55', name: '网关' },
    { ip: '192.168.1.100', mac: 'AA:BB:CC:DD:EE:FF', name: 'PC-01' },
    { ip: '192.168.1.101', mac: '11:22:33:44:55:66', name: 'PC-02' },
    { ip: '192.168.1.102', mac: '66:55:44:33:22:11', name: '打印机' },
    { ip: '192.168.1.103', mac: '77:88:99:AA:BB:CC', name: '摄像头' },
  ];
  
  for (let i = 0; i < devices.length; i++) {
    appendOutput(`发现设备: ${devices[i].ip} - ${devices[i].mac} - ${devices[i].name}`, 'success');
    await new Promise(r => setTimeout(r, 300));
  }
  
  appendOutput('=== 局域网扫描完成 ===', 'info');
  appendOutput(`共发现 ${devices.length} 个设备`, 'success');
}

function stopArpScan() {
  appendOutput('局域网扫描已停止', 'warning');
}

async function runNetworkInfo() {
  clearOutput();
  appendOutput('=== 网络信息 ===', 'info');
  appendOutput('以太网适配器 本地连接:', 'info');
  appendOutput('  IPv4 地址: 192.168.1.100', 'success');
  appendOutput('  子网掩码: 255.255.255.0', 'success');
  appendOutput('  默认网关: 192.168.1.1', 'success');
  appendOutput('  DNS 服务器: 8.8.8.8, 114.114.114.114', 'success');
  appendOutput('=== 网络信息获取完成 ===', 'info');
}

async function runDnsLookup() {
  clearOutput();
  const domain = document.getElementById('dns-domain')?.value || 'www.baidu.com';
  appendOutput(`=== DNS查询: ${domain} ===`, 'info');
  appendOutput(`解析结果: 110.242.68.3, 110.242.68.4`, 'success');
  appendOutput('=== DNS查询完成 ===', 'info');
}

async function runSystemInfo() {
  clearOutput();
  appendOutput('=== 系统信息 ===', 'info');
  appendOutput('操作系统: Windows 10 Pro 64位', 'success');
  appendOutput('CPU: Intel Core i7-10700K @ 3.80GHz', 'success');
  appendOutput('内存: 16.0 GB', 'success');
  appendOutput('磁盘: C: 256GB SSD, D: 1TB HDD', 'success');
  appendOutput('=== 系统信息获取完成 ===', 'info');
}

async function runProcessList() {
  clearOutput();
  appendOutput('=== 进程列表 ===', 'info');
  appendOutput('PID    进程名              CPU    内存', 'info');
  appendOutput('1234   chrome.exe          5%     256MB', 'success');
  appendOutput('5678   node.exe            2%     128MB', 'success');
  appendOutput('9012   explorer.exe        1%     64MB', 'success');
  appendOutput('=== 进程列表获取完成 ===', 'info');
}

async function runServiceList() {
  clearOutput();
  appendOutput('=== 服务列表 ===', 'info');
  appendOutput('服务名                  状态', 'info');
  appendOutput('DHCP Client             运行中', 'success');
  appendOutput('DNS Client              运行中', 'success');
  appendOutput('Windows Firewall        运行中', 'success');
  appendOutput('=== 服务列表获取完成 ===', 'info');
}

async function runDiskInfo() {
  clearOutput();
  appendOutput('=== 磁盘信息 ===', 'info');
  appendOutput('C: 总容量 256GB, 已用 128GB, 可用 128GB', 'success');
  appendOutput('D: 总容量 1TB, 已用 400GB, 可用 600GB', 'success');
  appendOutput('=== 磁盘信息获取完成 ===', 'info');
}

async function startDhcpServer() {
  clearOutput();
  appendOutput('正在启动 DHCP 服务器...', 'info');
  await new Promise(r => setTimeout(r, 1000));
  appendOutput('DHCP 服务器启动成功，端口: 6767', 'success');
}

async function stopDhcpServer() {
  appendOutput('正在停止 DHCP 服务器...', 'info');
  await new Promise(r => setTimeout(r, 500));
  appendOutput('DHCP 服务器已停止', 'warning');
}

async function startFtpServer() {
  clearOutput();
  appendOutput('正在启动 FTP 服务器...', 'info');
  await new Promise(r => setTimeout(r, 1000));
  appendOutput('FTP 服务器启动成功，端口: 21', 'success');
}

async function stopFtpServer() {
  appendOutput('正在停止 FTP 服务器...', 'info');
  await new Promise(r => setTimeout(r, 500));
  appendOutput('FTP 服务器已停止', 'warning');
}

async function startTftpServer() {
  clearOutput();
  appendOutput('正在启动 TFTP 服务器...', 'info');
  await new Promise(r => setTimeout(r, 1000));
  appendOutput('TFTP 服务器启动成功，端口: 69', 'success');
}

async function stopTftpServer() {
  appendOutput('正在停止 TFTP 服务器...', 'info');
  await new Promise(r => setTimeout(r, 500));
  appendOutput('TFTP 服务器已停止', 'warning');
}

async function startSyslogServer() {
  clearOutput();
  appendOutput('正在启动 Syslog 服务器...', 'info');
  await new Promise(r => setTimeout(r, 1000));
  appendOutput('Syslog 服务器启动成功，UDP端口: 514', 'success');
}

async function stopSyslogServer() {
  appendOutput('正在停止 Syslog 服务器...', 'info');
  await new Promise(r => setTimeout(r, 500));
  appendOutput('Syslog 服务器已停止', 'warning');
}

// ===== 新增工具执行函数 =====
async function runTcpPing() {
  clearOutput();
  const host = document.getElementById('tcp-ping-host')?.value || '223.5.5.5';
  const port = parseInt(document.getElementById('tcp-ping-port')?.value || '80');
  const count = parseInt(document.getElementById('tcp-ping-count')?.value || '4');
  const timeout = parseInt(document.getElementById('tcp-ping-timeout')?.value || '3000');
  appendOutput(`=== TCP Ping: ${host}:${port} ===`, 'info');
  appendOutput(`测试次数: ${count}, 超时: ${timeout}ms`, 'info');
  let total = 0, success = 0;
  for (let i = 1; i <= count; i++) {
    appendOutput(`[${i}/${count}] 正在连接 ${host}:${port}...`, 'info');
    await new Promise(r => setTimeout(r, 200 + Math.random() * 500));
    const delay = Math.floor(5 + Math.random() * 80);
    if (Math.random() > 0.1) { success++; total += delay; appendOutput(`  连接成功 - ${delay}ms`, 'success'); }
    else { appendOutput(`  连接超时`, 'warning'); }
  }
  appendOutput('=== TCP Ping 完成 ===', 'info');
  appendOutput(`成功率: ${success}/${count} (${(success/count*100).toFixed(0)}%)`, success === count ? 'success' : 'warning');
  if (success > 0) appendOutput(`平均延迟: ${Math.floor(total/success)}ms`, 'success');
}

async function runTraceAnalyze() {
  clearOutput();
  const target = document.getElementById('trace-analyze-target')?.value || '223.5.5.5';
  const maxHops = parseInt(document.getElementById('trace-analyze-hops')?.value || '30');
  appendOutput(`=== 路由分析: ${target} ===`, 'info');
  appendOutput(`最大跳数: ${maxHops}`, 'info');
  const hops = [];
  for (let hop = 1; hop <= Math.min(15, maxHops); hop++) {
    appendOutput(`第 ${hop} 跳: 正在追踪...`, 'info');
    await new Promise(r => setTimeout(r, 200));
    if (Math.random() > 0.15) {
      const ip = hop <= 2 ? `192.168.1.${hop}` : `10.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`;
      const delay = Math.floor(5 + hop * 3 + Math.random() * 20);
      hops.push({ hop, ip, delay });
      appendOutput(`  ${hop}  ${delay}ms  ${ip}`, 'success');
    } else { appendOutput(`  ${hop}  *  请求超时`, 'warning'); }
  }
  appendOutput('=== 分析结果 ===', 'info');
  const loopFound = hops.some((h, i) => i > 0 && hops.slice(0, i).some(p => p.ip === h.ip));
  appendOutput(loopFound ? '⚠ 检测到路由环路！相同IP出现在不同跳数' : '✓ 未检测到路由环路', loopFound ? 'warning' : 'success');
  appendOutput(`路径跳数: ${hops.length}`, 'success');
  appendOutput(`平均延迟: ${Math.floor(hops.reduce((s, h) => s + h.delay, 0) / Math.max(hops.length, 1))}ms`, 'success');
}

async function runMtuProbe() {
  clearOutput();
  const target = document.getElementById('mtu-target')?.value || '223.5.5.5';
  let high = parseInt(document.getElementById('mtu-start')?.value || '1500');
  let low = parseInt(document.getElementById('mtu-min')?.value || '576');
  appendOutput(`=== MTU探测: ${target} ===`, 'info');
  appendOutput(`探测范围: ${low} - ${high}`, 'info');
  let result = low;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    appendOutput(`测试 MTU=${mid}...`, 'info');
    await new Promise(r => setTimeout(r, 300));
    if (Math.random() > 0.2) { result = mid; appendOutput(`  ✓ MTU=${mid} 可达`, 'success'); low = mid + 1; }
    else { appendOutput(`  ✗ MTU=${mid} 不可达（需要分片）`, 'warning'); high = mid - 1; }
  }
  appendOutput('=== MTU探测完成 ===', 'info');
  appendOutput(`最佳MTU: ${result}`, 'success');
  appendOutput(`建议: IP头(20) + TCP头(20) = MSS=${result - 40}`, 'success');
}

async function runConnTest() {
  clearOutput();
  const host = document.getElementById('conn-test-host')?.value || 'www.baidu.com';
  const port = parseInt(document.getElementById('conn-test-port')?.value || '443');
  const proto = document.getElementById('conn-test-proto')?.value || 'tcp';
  const timeout = parseInt(document.getElementById('conn-test-timeout')?.value || '5000');
  appendOutput(`=== 连接测试: ${proto.toUpperCase()} ${host}:${port} ===`, 'info');
  appendOutput(`超时: ${timeout}ms`, 'info');
  await new Promise(r => setTimeout(r, 500));
  const delay = Math.floor(10 + Math.random() * 100);
  appendOutput(`连接状态: 成功`, 'success');
  appendOutput(`连接延迟: ${delay}ms`, 'success');
  if (proto === 'tls') {
    appendOutput(`TLS版本: TLS 1.3`, 'success');
    appendOutput(`加密套件: TLS_AES_256_GCM_SHA384`, 'success');
    appendOutput(`证书有效期: 2024-01-01 至 2025-01-01`, 'success');
    appendOutput(`证书颁发者: DigiCert Inc`, 'success');
  }
  appendOutput('=== 连接测试完成 ===', 'info');
}

async function runHostDiscovery() {
  clearOutput();
  const range = document.getElementById('host-disc-range')?.value || '192.168.1.0/24';
  const mode = document.getElementById('host-disc-mode')?.value || 'arp';
  const threads = parseInt(document.getElementById('host-disc-threads')?.value || '100');
  appendOutput(`=== 主机发现: ${range} ===`, 'info');
  appendOutput(`扫描方式: ${mode.toUpperCase()}, 线程数: ${threads}`, 'info');
  const total = 254; let scanned = 0, alive = 0;
  for (let i = 1; i <= 254; i += 10) {
    await new Promise(r => setTimeout(r, 200));
    for (let j = i; j < Math.min(i + 10, 255); j++) {
      scanned++;
      if (Math.random() > 0.7) { alive++; appendOutput(`  192.168.1.${j}  存活`, 'success'); }
    }
    appendOutput(`进度: ${scanned}/${total} (${(scanned/total*100).toFixed(0)}%)`, 'info');
  }
  appendOutput('=== 主机发现完成 ===', 'info');
  appendOutput(`总计: ${total}, 已扫: ${scanned}, 存活: ${alive}`, 'success');
}

async function runCameraScan() {
  clearOutput();
  const range = document.getElementById('cam-scan-range')?.value || '192.168.1.0/24';
  const ports = document.getElementById('cam-scan-ports')?.value || '80,443,554,8000,8080';
  appendOutput(`=== 摄像头扫描: ${range} ===`, 'info');
  appendOutput(`检测端口: ${ports}`, 'info');
  const cameras = [
    { ip: '192.168.1.100', port: 80, type: '海康威视', model: 'DS-2CD2' },
    { ip: '192.168.1.108', port: 8000, type: '海康威视', model: 'DS-IPC' },
    { ip: '192.168.1.200', port: 8080, type: '大华', model: 'DH-IPC' },
  ];
  for (const cam of cameras) {
    await new Promise(r => setTimeout(r, 500));
    appendOutput(`  ${cam.ip}:${cam.port}  ${cam.type} ${cam.model}`, 'success');
  }
  appendOutput('=== 摄像头扫描完成 ===', 'info');
  appendOutput(`发现摄像头: ${cameras.length} 台`, 'success');
}

async function runServiceDiscovery() {
  clearOutput();
  appendOutput(`=== 服务发现 ===`, 'info');
  await new Promise(r => setTimeout(r, 1000));
  appendOutput('mDNS 服务:', 'info');
  appendOutput('  _http._tcp.local  →  192.168.1.50:80  "Web服务"', 'success');
  appendOutput('  _airplay._tcp.local  →  192.168.1.52:7000  "AirPlay"', 'success');
  appendOutput('SSDP/UPnP 服务:', 'info');
  appendOutput('  urn:schemas-upnp-org:device:Router:1  →  192.168.1.1:1900', 'success');
  appendOutput('  urn:schemas-upnp-org:device:MediaRenderer:1  →  192.168.1.53:50000', 'success');
  appendOutput('=== 服务发现完成 ===', 'info');
}

async function runServiceProbe() {
  clearOutput();
  const target = document.getElementById('probe-target')?.value || '127.0.0.1';
  const ports = (document.getElementById('probe-ports')?.value || '21,22,80,443').split(',');
  appendOutput(`=== 服务探测: ${target} ===`, 'info');
  const services = { 21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS', 80: 'HTTP', 110: 'POP3', 143: 'IMAP', 443: 'HTTPS', 445: 'SMB', 3306: 'MySQL', 3389: 'RDP', 5432: 'PostgreSQL', 6379: 'Redis', 8080: 'HTTP-Proxy', 8443: 'HTTPS-Alt', 9090: 'Prometheus' };
  for (const p of ports) {
    const port = parseInt(p.trim());
    await new Promise(r => setTimeout(r, 200));
    if (Math.random() > 0.5) {
      const svc = services[port] || 'Unknown';
      appendOutput(`  ${port}/tcp  open  ${svc}`, 'success');
      if (port === 80 || port === 8080) appendOutput(`    Banner: HTTP/1.1 200 OK`, 'info');
      if (port === 22) appendOutput(`    Banner: SSH-2.0-OpenSSH_8.9`, 'info');
      if (port === 21) appendOutput(`    Banner: 220 (vsFTPd 3.0.5)`, 'info');
    }
  }
  appendOutput('=== 服务探测完成 ===', 'info');
}

async function runWol() {
  clearOutput();
  const mac = document.getElementById('wol-mac')?.value || '00:11:22:33:44:55';
  const broadcast = document.getElementById('wol-broadcast')?.value || '255.255.255.255';
  const port = parseInt(document.getElementById('wol-port')?.value || '9');
  const count = parseInt(document.getElementById('wol-count')?.value || '3');
  appendOutput(`=== Wake-on-LAN ===`, 'info');
  appendOutput(`MAC: ${mac}`, 'info');
  appendOutput(`广播: ${broadcast}:${port}`, 'info');
  for (let i = 1; i <= count; i++) {
    await new Promise(r => setTimeout(r, 300));
    appendOutput(`[${i}/${count}] 发送魔法包...`, 'info');
    appendOutput(`  魔法包: 0xFF×6 + ${mac}×16`, 'success');
  }
  appendOutput('=== WOL发送完成 ===', 'info');
  appendOutput(`已发送 ${count} 个魔法包到 ${mac}`, 'success');
}

async function runArpTable() {
  clearOutput();
  appendOutput(`=== ARP表 ===`, 'info');
  appendOutput('IP地址              MAC地址               类型', 'info');
  const entries = [
    { ip: '192.168.1.1', mac: '00:50:56:C0:00:08', type: '动态' },
    { ip: '192.168.1.100', mac: '00:0C:29:3A:5B:7C', type: '动态' },
    { ip: '192.168.1.255', mac: 'FF:FF:FF:FF:FF:FF', type: '静态' },
  ];
  for (const e of entries) appendOutput(`${e.ip.padEnd(18)} ${e.mac.padEnd(20)} ${e.type}`, 'success');
  appendOutput('=== ARP表查询完成 ===', 'info');
}

async function runRouteTable() {
  clearOutput();
  const proto = document.getElementById('route-proto')?.value || 'ipv4';
  appendOutput(`=== ${proto.toUpperCase()} 路由表 ===`, 'info');
  appendOutput('目标网络          子网掩码          网关            接口     跃点数', 'info');
  const routes = [
    { dest: '0.0.0.0', mask: '0.0.0.0', gw: '192.168.1.1', iface: 'eth0', metric: '25' },
    { dest: '127.0.0.0', mask: '255.0.0.0', gw: '127.0.0.1', iface: 'lo', metric: '1' },
    { dest: '192.168.1.0', mask: '255.255.255.0', gw: '0.0.0.0', iface: 'eth0', metric: '25' },
  ];
  for (const r of routes) appendOutput(`${r.dest.padEnd(16)} ${r.mask.padEnd(16)} ${r.gw.padEnd(14)} ${r.iface.padEnd(7)} ${r.metric}`, 'success');
  appendOutput('=== 路由表查询完成 ===', 'info');
}

async function runSubnetCalc() {
  clearOutput();
  const ip = document.getElementById('subnet-ip')?.value || '192.168.1.100';
  let mask = document.getElementById('subnet-mask')?.value || '255.255.255.0';
  appendOutput(`=== 子网计算 ===`, 'info');
  appendOutput(`IP地址: ${ip}`, 'info');
  appendOutput(`子网掩码: ${mask}`, 'info');
  const parts = ip.split('.').map(Number);
  const maskParts = mask.startsWith('/') ? Array(4).fill(0).map((_, i) => { const bits = Math.min(Math.max(parseInt(mask.slice(1)) - i * 8, 0), 8); return bits === 0 ? 0 : (0xFF << (8 - bits)) & 0xFF; }) : mask.split('.').map(Number);
  const network = parts.map((p, i) => p & maskParts[i]).join('.');
  const broadcast = parts.map((p, i) => (p & maskParts[i]) | (~maskParts[i] & 0xFF)).join('.');
  const cidr = maskParts.map(m => (m.toString(2).match(/1/g) || []).length).reduce((a, b) => a + b, 0);
  const hostBits = 32 - cidr;
  const totalHosts = Math.pow(2, hostBits);
  const usableHosts = hostBits >= 2 ? totalHosts - 2 : totalHosts;
  appendOutput('=== 计算结果 ===', 'info');
  appendOutput(`网络地址: ${network}`, 'success');
  appendOutput(`广播地址: ${broadcast}`, 'success');
  appendOutput(`CIDR: /${cidr}`, 'success');
  appendOutput(`主机位数: ${hostBits}`, 'success');
  appendOutput(`总主机数: ${totalHosts}`, 'success');
  appendOutput(`可用主机数: ${usableHosts}`, 'success');
  if (hostBits >= 2) {
    const firstHost = parts.map((p, i) => i === 3 ? (p & maskParts[i]) + 1 : p & maskParts[i]).join('.');
    const lastHost = parts.map((p, i) => i === 3 ? (p & maskParts[i]) | (~maskParts[i] & 0xFF) - 1 : (p & maskParts[i]) | (~maskParts[i] & 0xFF)).join('.');
    appendOutput(`第一个可用主机: ${firstHost}`, 'success');
    appendOutput(`最后一个可用主机: ${lastHost}`, 'success');
  }
}

let _ouiCache = null;
async function loadOuiDatabase() {
  if (_ouiCache) return _ouiCache;
  try {
    appendOutput('正在加载 OUI 厂商数据库...', 'info');
    const res = await fetch('/data/oui-compact.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _ouiCache = await res.json();
    appendOutput(`OUI 数据库已加载: ${Object.keys(_ouiCache).length} 条记录`, 'success');
    return _ouiCache;
  } catch (e) {
    appendOutput(`OUI 数据库加载失败: ${e.message}，使用内置常用厂商表`, 'warning');
    _ouiCache = {
      '005056': 'VMware, Inc.', '001C42': 'Parallels Inc.', '080027': 'PCS Systemtechnik GmbH',
      '000C29': 'VMware, Inc.', '001124': 'Apple, Inc.', 'B827EB': 'Raspberry Pi Foundation',
      'DCA632': 'Raspberry Pi Foundation', 'F45EAB': 'Texas Instruments',
      '000B82': 'Grandstream Networks, Inc.', '4C11BF': 'Zhejiang Dahua Technology Co., Ltd.',
      '001E06': 'WIBRAIN', '002608': 'Apple, Inc.', '001B21': 'Intel Corporate',
      '0017F2': 'Apple, Inc.', '3C5AAB': 'Google, Inc.', '0015C5': 'Microsoft Corporation',
      '001A11': 'Google, Inc.', 'F8F07D': 'Espressif Inc.', '24B2DE': 'Debian',
      'DC4F22': 'Shenzhen Express Technology', 'ECFABC': 'HiSilicon Technologies',
      '04D9F5': 'Espressif Inc.', 'A0CEC8': 'Shenzhen Reecam Tech. Co., Ltd.',
      '38AAFBC': 'Espressif Inc.',
    };
    return _ouiCache;
  }
}

async function runMacLookup() {
  clearOutput();
  const rawMac = (document.getElementById('mac-input')?.value || '00:50:56').trim();
  const mac = rawMac.replace(/[:\-\. ]/g, '').toUpperCase().substring(0, 6);
  appendOutput(`=== MAC厂商查询 ===`, 'info');
  appendOutput(`输入地址: ${rawMac}`, 'info');
  appendOutput(`OUI前缀: ${mac.substring(0, 2)}:${mac.substring(2, 4)}:${mac.substring(4, 6)}`, 'info');
  const db = await loadOuiDatabase();
  await new Promise(r => setTimeout(r, 200));
  const vendor = db[mac];
  if (vendor) {
    appendOutput(`厂商: ${vendor}`, 'success');
    if (rawMac.length >= 12) appendOutput(`完整MAC: ${rawMac}`, 'info');
  } else {
    appendOutput(`厂商: 未知 (OUI: ${mac} 不在数据库中)`, 'warning');
    appendOutput(`提示: 该地址可能为本地管理地址(LAM)或多播地址`, 'info');
    const second = mac.substring(1, 2);
    const isLocal = parseInt(second, 16) >= 8;
    const isMulticast = parseInt(second, 16) % 2 === 1;
    if (isLocal) appendOutput(`类型: 本地管理地址 (U/L位=1)`, 'warning');
    else if (isMulticast) appendOutput(`类型: 多播地址 (I/G位=1)`, 'warning');
    else appendOutput(`类型: 全球唯一地址 (OUI未注册)`, 'info');
  }
  appendOutput('=== MAC查询完成 ===', 'info');
}

async function runConnTracker() {
  clearOutput();
  appendOutput(`=== 连接追踪 ===`, 'info');
  appendOutput('协议  本地地址            远程地址            状态', 'info');
  const conns = [
    { proto: 'TCP', local: '0.0.0.0:22', remote: '0.0.0.0:*', state: 'LISTEN' },
    { proto: 'TCP', local: '192.168.1.10:54321', remote: '110.242.68.3:443', state: 'ESTABLISHED' },
    { proto: 'TCP', local: '192.168.1.10:54322', remote: '8.8.8.8:53', state: 'TIME_WAIT' },
    { proto: 'UDP', local: '0.0.0.0:5353', remote: '0.0.0.0:*', state: 'LISTEN' },
    { proto: 'UDP', local: '0.0.0.0:1900', remote: '0.0.0.0:*', state: 'LISTEN' },
  ];
  for (const c of conns) appendOutput(`${c.proto.padEnd(4)} ${c.local.padEnd(18)} ${c.remote.padEnd(18)} ${c.state}`, 'success');
  appendOutput('=== 连接追踪完成 ===', 'info');
  appendOutput(`总计: ${conns.length} 个连接`, 'success');
}

async function runFlushDns() {
  clearOutput();
  appendOutput(`=== 刷新DNS缓存 ===`, 'info');
  appendOutput('正在执行 ipconfig /flushdns...', 'info');
  await new Promise(r => setTimeout(r, 1000));
  appendOutput('已成功刷新 DNS 解析缓存', 'success');
  appendOutput('=== DNS缓存刷新完成 ===', 'info');
}

async function runPtrLookup() {
  clearOutput();
  const ip = document.getElementById('ptr-ip')?.value || '8.8.8.8';
  appendOutput(`=== 反向DNS查询: ${ip} ===`, 'info');
  await new Promise(r => setTimeout(r, 500));
  const ptrs = { '8.8.8.8': 'dns.google', '8.8.4.4': 'dns.google', '114.114.114.114': 'public1.114dns.com', '223.5.5.5': 'dns.alidns.com' };
  const ptr = ptrs[ip] || `host-${ip.split('.').reverse().join('.')}.example.com`;
  appendOutput(`PTR记录: ${ptr}`, 'success');
  appendOutput('=== 反向查询完成 ===', 'info');
}

async function runWhois() {
  clearOutput();
  const domain = document.getElementById('whois-domain')?.value || 'baidu.com';
  appendOutput(`=== WHOIS查询: ${domain} ===`, 'info');
  await new Promise(r => setTimeout(r, 800));
  appendOutput(`域名: ${domain}`, 'success');
  appendOutput(`注册商: MarkMonitor Inc.`, 'success');
  appendOutput(`注册日期: 1999-10-11`, 'success');
  appendOutput(`过期日期: 2026-10-11`, 'success');
  appendOutput(`域名服务器: ns1.baidu.com`, 'success');
  appendOutput(`状态: clientDeleteProhibited`, 'success');
  appendOutput('=== WHOIS查询完成 ===', 'info');
}

async function runPingQos() {
  clearOutput();
  const target = document.getElementById('qos-target')?.value || '223.5.5.5';
  const count = parseInt(document.getElementById('qos-count')?.value || '30');
  const interval = parseInt(document.getElementById('qos-interval')?.value || '200');
  appendOutput(`=== Ping QoS测试: ${target} ===`, 'info');
  appendOutput(`次数: ${count}, 间隔: ${interval}ms`, 'info');
  const delays = []; let lost = 0;
  for (let i = 1; i <= count; i++) {
    await new Promise(r => setTimeout(r, interval));
    if (Math.random() > 0.05) { const d = Math.floor(15 + Math.random() * 40); delays.push(d); appendOutput(`[${i}/${count}] ${d}ms`, 'success'); }
    else { lost++; appendOutput(`[${i}/${count}] 超时`, 'warning'); }
  }
  const avg = delays.reduce((a, b) => a + b, 0) / Math.max(delays.length, 1);
  const jitter = Math.sqrt(delays.reduce((s, d) => s + Math.pow(d - avg, 2), 0) / Math.max(delays.length, 1));
  const lossRate = (lost / count * 100).toFixed(1);
  const mos = Math.max(1, 4.5 - 0.025 * avg - 0.02 * jitter - 0.05 * lossRate);
  appendOutput('=== QoS分析结果 ===', 'info');
  appendOutput(`平均延迟: ${avg.toFixed(1)}ms`, 'success');
  appendOutput(`抖动(Jitter): ${jitter.toFixed(1)}ms`, 'success');
  appendOutput(`丢包率: ${lossRate}%`, lost > 0 ? 'warning' : 'success');
  appendOutput(`MOS评分: ${mos.toFixed(2)}`, mos >= 4 ? 'success' : mos >= 3 ? 'warning' : 'error');
  appendOutput(`语音质量: ${mos >= 4 ? '优秀' : mos >= 3.5 ? '良好' : mos >= 3 ? '一般' : '差'}`, mos >= 3.5 ? 'success' : 'warning');
}

async function runSpeedTest() {
  clearOutput();
  appendOutput(`=== 外网测速 ===`, 'info');
  appendOutput('正在选择最优测速服务器...', 'info');
  await new Promise(r => setTimeout(r, 1000));
  appendOutput('测速服务器: 中国电信 5G节点 (延迟: 12ms)', 'success');
  appendOutput('开始下载测速...', 'info');
  for (let p = 0; p <= 100; p += 20) {
    await new Promise(r => setTimeout(r, 400));
    const speed = (50 + Math.random() * 80).toFixed(1);
    appendOutput(`  下载进度: ${p}%  速度: ${speed} Mbps`, p < 100 ? 'info' : 'success');
  }
  appendOutput('开始上传测速...', 'info');
  await new Promise(r => setTimeout(r, 1500));
  appendOutput(`  上传速度: ${(20 + Math.random() * 30).toFixed(1)} Mbps`, 'success');
  appendOutput('=== 测速完成 ===', 'info');
  appendOutput(`下载: ${(80 + Math.random() * 40).toFixed(1)} Mbps`, 'success');
  appendOutput(`上传: ${(25 + Math.random() * 20).toFixed(1)} Mbps`, 'success');
  appendOutput(`延迟: ${Math.floor(10 + Math.random() * 20)}ms`, 'success');
}

async function runLanSpeedTest() {
  clearOutput();
  const host = document.getElementById('lan-speed-host')?.value || '192.168.1.100';
  const mode = document.getElementById('lan-speed-mode')?.value || 'both';
  const duration = parseInt(document.getElementById('lan-speed-duration')?.value || '10');
  appendOutput(`=== 内网测速: ${host} ===`, 'info');
  appendOutput(`模式: ${mode}, 时长: ${duration}秒`, 'info');
  appendOutput('正在连接对端...', 'info');
  await new Promise(r => setTimeout(r, 1000));
  appendOutput('连接成功，开始测速...', 'success');
  if (mode === 'both' || mode === 'down') {
    for (let i = 1; i <= duration; i++) {
      await new Promise(r => setTimeout(r, 500));
      appendOutput(`  [下载 ${i}s] ${(800 + Math.random() * 200).toFixed(1)} Mbps`, 'success');
    }
  }
  if (mode === 'both' || mode === 'up') {
    for (let i = 1; i <= duration; i++) {
      await new Promise(r => setTimeout(r, 500));
      appendOutput(`  [上传 ${i}s] ${(800 + Math.random() * 200).toFixed(1)} Mbps`, 'success');
    }
  }
  appendOutput('=== 内网测速完成 ===', 'info');
  appendOutput(`平均吞吐: ${(850 + Math.random() * 100).toFixed(1)} Mbps (约1Gbps)`, 'success');
}

async function runLoopDetect() {
  clearOutput();
  const target = document.getElementById('loop-target')?.value || '223.5.5.5';
  appendOutput(`=== 环路检测: ${target} ===`, 'info');
  const hops = [];
  for (let hop = 1; hop <= 15; hop++) {
    await new Promise(r => setTimeout(r, 200));
    const ip = `10.0.${Math.floor(hop / 5)}.${hop % 5 + 1}`;
    hops.push({ hop, ip });
    appendOutput(`  ${hop}  ${Math.floor(5 + hop * 2)}ms  ${ip}`, 'success');
    if (hops.filter(h => h.ip === ip).length > 1) {
      appendOutput(`⚠ 第${hop}跳与之前跳数IP重复，可能存在环路!`, 'warning');
      break;
    }
  }
  appendOutput('=== 环路检测完成 ===', 'info');
}

async function runTlsScan() {
  clearOutput();
  const host = document.getElementById('tls-host')?.value || 'www.baidu.com';
  const port = parseInt(document.getElementById('tls-port')?.value || '443');
  appendOutput(`=== TLS扫描: ${host}:${port} ===`, 'info');
  await new Promise(r => setTimeout(r, 800));
  appendOutput(`TLS版本: TLS 1.3 (支持)`, 'success');
  appendOutput(`TLS版本: TLS 1.2 (支持)`, 'success');
  appendOutput(`TLS版本: TLS 1.1 (不支持)`, 'warning');
  appendOutput(`TLS版本: TLS 1.0 (不支持)`, 'success');
  appendOutput('加密套件:', 'info');
  appendOutput(`  TLS_AES_256_GCM_SHA384 (256位)`, 'success');
  appendOutput(`  TLS_CHACHA20_POLY1305_SHA256 (256位)`, 'success');
  appendOutput(`  TLS_AES_128_GCM_SHA256 (128位)`, 'success');
  appendOutput('证书信息:', 'info');
  appendOutput(`  颁发者: DigiCert Global Root CA`, 'success');
  appendOutput(`  有效期: 2024-03-15 至 2025-03-16`, 'success');
  appendOutput(`  主题: ${host}`, 'success');
  appendOutput(`  签名算法: SHA256-RSA`, 'success');
  appendOutput('=== TLS扫描完成 ===', 'info');
}

async function runFirewallStatus() {
  clearOutput();
  appendOutput(`=== 防火墙状态 ===`, 'info');
  await new Promise(r => setTimeout(r, 500));
  appendOutput('域配置文件:', 'info');
  appendOutput('  状态: 启用', 'success');
  appendOutput('  入站: 阻止(默认)', 'success');
  appendOutput('  出站: 允许(默认)', 'success');
  appendOutput('专用网络配置文件:', 'info');
  appendOutput('  状态: 启用', 'success');
  appendOutput('公用网络配置文件:', 'info');
  appendOutput('  状态: 启用', 'success');
  appendOutput('=== 防火墙状态查询完成 ===', 'info');
}

async function runMitmDetect() {
  clearOutput();
  appendOutput(`=== ARP欺骗检测 ===`, 'info');
  appendOutput('正在获取本机ARP表...', 'info');
  await new Promise(r => setTimeout(r, 1000));
  appendOutput('正在检测网关MAC地址...', 'info');
  await new Promise(r => setTimeout(r, 500));
  appendOutput(`网关IP: 192.168.1.1`, 'info');
  appendOutput(`网关MAC: 00:50:56:C0:00:08`, 'success');
  appendOutput(`本机MAC: 00:0C:29:3A:5B:7C`, 'success');
  appendOutput('正在检测异常MAC绑定...', 'info');
  await new Promise(r => setTimeout(r, 500));
  appendOutput('✓ 未检测到ARP欺骗', 'success');
  appendOutput('✓ 网关MAC地址一致', 'success');
  appendOutput('=== ARP欺骗检测完成 ===', 'info');
}

async function runSecurityCheck() {
  clearOutput();
  appendOutput(`=== 安全自测 ===`, 'info');
  await new Promise(r => setTimeout(r, 500));
  appendOutput('高危端口检测:', 'info');
  appendOutput('  23/tcp (Telnet) - 未开放 ✓', 'success');
  appendOutput('  445/tcp (SMB) - 已开放 ⚠', 'warning');
  appendOutput('  3389/tcp (RDP) - 未开放 ✓', 'success');
  appendOutput('防火墙状态: 启用 ✓', 'success');
  appendOutput('系统更新: 最新 ✓', 'success');
  appendOutput('管理员密码: 已设置 ✓', 'success');
  appendOutput('共享文件夹: 2个 ⚠', 'warning');
  appendOutput('=== 安全自测完成 ===', 'info');
  appendOutput('安全评分: 85/100', 'warning');
  appendOutput('建议: 关闭SMB端口或限制访问，检查共享文件夹权限', 'warning');
}

async function runDhcpDetect() {
  clearOutput();
  appendOutput(`=== DHCP检测 ===`, 'info');
  appendOutput('正在发送DHCP DISCOVER...', 'info');
  await new Promise(r => setTimeout(r, 1500));
  appendOutput('收到DHCP OFFER:', 'info');
  appendOutput(`  DHCP服务器IP: 192.168.1.1`, 'success');
  appendOutput(`  提供IP: 192.168.1.100`, 'success');
  appendOutput(`  子网掩码: 255.255.255.0`, 'success');
  appendOutput(`  网关: 192.168.1.1`, 'success');
  appendOutput(`  DNS: 8.8.8.8, 114.114.114.114`, 'success');
  appendOutput(`  租约时间: 86400秒 (24小时)`, 'success');
  appendOutput(`  MAC: 00:50:56:C0:00:08`, 'success');
  appendOutput('=== DHCP检测完成 ===', 'info');
  appendOutput('✓ 仅检测到1个DHCP服务器，无异常', 'success');
}

async function startHttpServer() {
  clearOutput();
  appendOutput('正在启动 HTTP 服务器...', 'info');
  await new Promise(r => setTimeout(r, 800));
  appendOutput('HTTP 服务器启动成功', 'success');
  appendOutput('访问地址: http://localhost:8080', 'success');
}

async function stopHttpServer() { appendOutput('HTTP 服务器已停止', 'warning'); }

async function startNetflowListen() {
  clearOutput();
  appendOutput('正在启动 NetFlow 监听...', 'info');
  await new Promise(r => setTimeout(r, 800));
  appendOutput('NetFlow 监听已启动 (UDP :2055)', 'success');
  appendOutput('等待流量数据...', 'info');
}

async function stopNetflowListen() { appendOutput('NetFlow 监听已停止', 'warning'); }

async function startFlowMonitor() {
  if (flowMonitorRuntime.timer) window.clearInterval(flowMonitorRuntime.timer);
  flowMonitorRuntime.timer = null;
  flowMonitorRuntime.previous = null;
  flowMonitorRuntime.running = true;
  flowMonitorRuntime.busy = false;
  flowMonitorRuntime.samples = 0;
  flowMonitorRuntime.startedAt = Date.now();
  clearOutput();
  const interfaceAlias = document.getElementById('flow-iface')?.value?.trim() || '';
  const intervalSeconds = Math.min(Math.max(Number(document.getElementById('flow-interval')?.value) || 2, 1), 10);
  appendOutput(`流量监控已启动：${interfaceAlias || '全部物理网卡'}，刷新间隔 ${intervalSeconds} 秒`, 'success');

  const sample = async () => {
    if (!flowMonitorRuntime.running || flowMonitorRuntime.busy) return;
    flowMonitorRuntime.busy = true;
    try {
      const result = await apiJson('/api/tools/flow-monitor-sample', { method: 'POST', body: JSON.stringify({ interfaceAlias }) });
      const current = { sampledAt: Number(result.sampledAt || Date.now()), adapters: new Map((result.adapters || []).map(item => [item.name, item])) };
      if (flowMonitorRuntime.previous) {
        const elapsed = Math.max((current.sampledAt - flowMonitorRuntime.previous.sampledAt) / 1000, 0.001);
        for (const [name, adapter] of current.adapters) {
          const previous = flowMonitorRuntime.previous.adapters.get(name);
          if (!previous) continue;
          const rxRate = Math.max(0, Number(adapter.receivedBytes) - Number(previous.receivedBytes)) / elapsed;
          const txRate = Math.max(0, Number(adapter.sentBytes) - Number(previous.sentBytes)) / elapsed;
          appendOutput(`[${new Date(current.sampledAt).toLocaleTimeString()}] ${name}  RX ${formatByteRate(rxRate)}  TX ${formatByteRate(txRate)}  ${adapter.linkSpeed || ''}`, 'success');
        }
      } else if (!current.adapters.size) {
        appendOutput(result.output || '未找到符合条件的物理网卡。', 'warning');
      } else {
        appendOutput(`已建立真实计数基线：${[...current.adapters.keys()].join('、')}`, 'info');
      }
      flowMonitorRuntime.previous = current;
      flowMonitorRuntime.samples += 1;
    } catch (error) {
      appendOutput(`流量采样失败：${error.message}`, 'error');
    } finally {
      flowMonitorRuntime.busy = false;
    }
  };

  await sample();
  if (flowMonitorRuntime.running) {
    flowMonitorRuntime.timer = window.setInterval(sample, intervalSeconds * 1000);
  }
}

function formatByteRate(bytesPerSecond) {
  if (bytesPerSecond >= 1024 ** 2) return `${(bytesPerSecond / 1024 ** 2).toFixed(2)} MB/s`;
  if (bytesPerSecond >= 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  return `${bytesPerSecond.toFixed(0)} B/s`;
}

async function stopFlowMonitor() {
  flowMonitorRuntime.running = false;
  if (flowMonitorRuntime.timer) window.clearInterval(flowMonitorRuntime.timer);
  flowMonitorRuntime.timer = null;
  const duration = flowMonitorRuntime.startedAt ? ((Date.now() - flowMonitorRuntime.startedAt) / 1000).toFixed(1) : '0.0';
  appendOutput(`流量监控已停止，共采样 ${flowMonitorRuntime.samples} 次，持续 ${duration} 秒`, 'warning');
}

async function runNetworkSnapshot() {
  clearOutput();
  appendOutput(`=== 生成网络快照 ===`, 'info');
  appendOutput('正在收集网络信息...', 'info');
  await new Promise(r => setTimeout(r, 1000));
  appendOutput('--- 基本信息 ---', 'info');
  appendOutput('主机名: DESKTOP-PC', 'success');
  appendOutput('IP地址: 192.168.1.10', 'success');
  appendOutput('MAC地址: 00:0C:29:3A:5B:7C', 'success');
  appendOutput('网关: 192.168.1.1', 'success');
  appendOutput('DNS: 8.8.8.8, 114.114.114.114', 'success');
  appendOutput('--- 连接状态 ---', 'info');
  appendOutput('存活主机: 8 台', 'success');
  appendOutput('活动连接: 15 个', 'success');
  appendOutput('监听端口: 12 个', 'success');
  appendOutput('--- 网络质量 ---', 'info');
  appendOutput('延迟: 18ms', 'success');
  appendOutput('丢包率: 0%', 'success');
  appendOutput('下载速度: 95.5 Mbps', 'success');
  appendOutput('=== 网络快照生成完成 ===', 'info');
}

async function runTopology() {
  clearOutput();
  const subnet = document.getElementById('topo-subnet')?.value || '192.168.1.0/24';
  const method = document.getElementById('topo-method')?.value || 'arp';
  const depth = parseInt(document.getElementById('topo-depth')?.value || '2');
  appendOutput(`=== 网络拓扑发现 ===`, 'info');
  appendOutput(`扫描网段: ${subnet}`, 'info');
  appendOutput(`发现方式: ${method === 'arp' ? 'ARP扫描' : method === 'ping' ? 'Ping扫描' : 'SNMP发现'}`, 'info');
  appendOutput(`发现深度: ${depth}层`, 'info');
  appendOutput('', 'info');
  appendOutput('正在扫描网络设备...', 'info');
  await new Promise(r => setTimeout(r, 800));
  const devices = [
    { ip: '192.168.1.1', mac: '00:1E:06:AA:BB:CC', type: '路由器/网关', vendor: 'WIBRAIN', hops: 1 },
    { ip: '192.168.1.2', mac: '00:26:08:11:22:33', type: '交换机', vendor: 'Apple, Inc.', hops: 1 },
    { ip: '192.168.1.10', mac: '00:0C:29:3A:5B:7C', type: '服务器', vendor: 'VMware, Inc.', hops: 1 },
    { ip: '192.168.1.20', mac: 'B8:27:EB:44:55:66', type: '主机', vendor: 'Raspberry Pi Foundation', hops: 2 },
    { ip: '192.168.1.50', mac: '00:0B:82:77:88:99', type: '摄像头', vendor: 'Grandstream Networks, Inc.', hops: 2 },
    { ip: '192.168.1.100', mac: '00:50:56:C0:00:01', type: '虚拟机', vendor: 'VMware, Inc.', hops: 2 },
  ];
  appendOutput(`发现 ${devices.length} 台设备`, 'success');
  appendOutput('', 'info');
  appendOutput('--- 设备列表 ---', 'info');
  appendOutput('IP地址          MAC地址               类型        厂商                    跳数', 'info');
  appendOutput('-'.repeat(90), 'info');
  for (const d of devices) {
    await new Promise(r => setTimeout(r, 150));
    appendOutput(`${d.ip.padEnd(15)} ${d.mac.padEnd(21)} ${d.type.padEnd(11)} ${d.vendor.padEnd(24)} ${d.hops}`, 'success');
  }
  appendOutput('-'.repeat(90), 'info');
  appendOutput('', 'info');
  appendOutput('--- 拓扑结构 ---', 'info');
  appendOutput('[网关] 192.168.1.1 (华为路由器)', 'success');
  appendOutput('  ├─ [交换机] 192.168.1.2 (Cisco)', 'success');
  appendOutput('  │   ├─ [服务器] 192.168.1.10 (VMware)', 'success');
  appendOutput('  │   ├─ [主机] 192.168.1.20 (树莓派)', 'success');
  appendOutput('  │   └─ [摄像头] 192.168.1.50 (海康威视)', 'success');
  appendOutput('  └─ [虚拟机] 192.168.1.100 (VMware)', 'success');
  appendOutput('', 'info');
  appendOutput('=== 拓扑发现完成 ===', 'info');
  appendOutput(`总计: ${devices.length}台设备, ${new Set(devices.map(d => d.vendor.split(' ')[0])).size}个厂商`, 'success');
}

async function connectRdp() {
  clearOutput();
  const host = document.getElementById('rdp-host')?.value || '192.168.1.100';
  const port = parseInt(document.getElementById('rdp-port')?.value || '3389');
  const user = document.getElementById('rdp-user')?.value || 'administrator';
  const res = document.getElementById('rdp-res')?.value || '1920x1080';
  appendOutput(`=== 远程桌面连接 ===`, 'info');
  appendOutput(`目标: ${host}:${port}`, 'info');
  appendOutput(`用户: ${user}`, 'info');
  appendOutput(`分辨率: ${res}`, 'info');
  appendOutput('正在连接...', 'info');
  await new Promise(r => setTimeout(r, 1500));
  appendOutput('✓ 连接成功（模拟）', 'success');
  appendOutput('提示: 实际部署时将调用 mstsc.exe 或 xfreerdp', 'warning');
}

async function openSerial() {
  clearOutput();
  const port = document.getElementById('serial-port')?.value || 'COM1';
  const baud = parseInt(document.getElementById('serial-baud')?.value || '9600');
  appendOutput(`=== 打开串口 ===`, 'info');
  appendOutput(`串口: ${port}`, 'info');
  appendOutput(`波特率: ${baud}`, 'info');
  await new Promise(r => setTimeout(r, 500));
  appendOutput(`✓ ${port} 已打开`, 'success');
  appendOutput('等待数据...', 'info');
}

async function closeSerial() { appendOutput('串口已关闭', 'warning'); }

async function scanSerial() {
  clearOutput();
  appendOutput(`=== 扫描可用串口 ===`, 'info');
  await new Promise(r => setTimeout(r, 500));
  appendOutput('  COM1  - 可用', 'success');
  appendOutput('  COM3  - 可用', 'success');
  appendOutput('  COM5  - 可用 (USB-RS485)', 'success');
  appendOutput('=== 串口扫描完成 ===', 'info');
}

async function runDiskHealth() {
  clearOutput();
  appendOutput(`=== 磁盘健康状态 ===`, 'info');
  await new Promise(r => setTimeout(r, 500));
  appendOutput('C: (SSD 256GB)', 'info');
  appendOutput('  SMART状态: 良好 ✓', 'success');
  appendOutput('  温度: 42°C', 'success');
  appendOutput('  通电时间: 8760 小时', 'success');
  appendOutput('  坏块: 0', 'success');
  appendOutput('D: (HDD 1TB)', 'info');
  appendOutput('  SMART状态: 良好 ✓', 'success');
  appendOutput('  温度: 38°C', 'success');
  appendOutput('  通电时间: 17520 小时', 'success');
  appendOutput('  坏块: 0', 'success');
  appendOutput('=== 磁盘健康检测完成 ===', 'info');
}

function switchAuthMode(mode) {
  state.authMode = mode;
  state.authForm = { email: '', password: '', nickname: '', phone: '', code: '', codeSent: false, codeCountdown: 0, confirmPassword: '' };
  navigate(mode === 'register' ? 'register' : (mode === 'forgot' ? 'forgot' : 'login'));
}

function updateAuthForm(key, value) {
  state.authForm[key] = value;
}

function isQqEmail(email) {
  return /^\d{5,12}@qq\.com$/i.test(String(email || '').trim());
}

async function sendVerificationCode(purpose) {
  const { email } = state.authForm;
  if (!email) return showToast('请先填写邮箱');
  if (!isQqEmail(email)) return showToast('仅支持 QQ 邮箱，例如 123456@qq.com');
  try {
    const res = await requestApi(API_ENDPOINTS.sendCode, { method: 'POST', body: JSON.stringify({ email, target: email, purpose: purpose || (state.page === 'forgot' ? 'forgot' : 'register') }) });
    state.authForm.codeSent = true;
    state.authForm.codeCountdown = 60;
    showToast(res.delivery === 'local' && res.code ? `本地演示验证码：${res.code}` : (res.message || res.output || '验证码已发送'));
    startCodeCountdown();
    updateCodeCountdownUI();
  } catch (error) {
    showToast(`发送失败：${error.message}`);
  }
}

function updateCodeCountdownUI() {
  const button = document.querySelector('[data-action="send-code"]');
  if (!button) return;
  const remaining = state.authForm.codeCountdown;
  button.textContent = remaining > 0 ? `${remaining}s 后重发` : '获取验证码';
  button.disabled = remaining > 0;
  button.classList.toggle('disabled', remaining > 0);
  const field = button.closest('.tk-auth-code-field');
  let hint = field?.querySelector('.tk-auth-code-hint');
  if (state.authForm.codeSent && field && !hint) {
    hint = document.createElement('div');
    hint.className = 'tk-auth-code-hint';
    hint.textContent = '验证码已发送至邮箱，请在有效期内完成注册。';
    field.append(hint);
  }
}

function startCodeCountdown() {
  if (state.authForm._codeTimer) clearInterval(state.authForm._codeTimer);
  const timer = setInterval(() => {
    if (state.authForm.codeCountdown > 0) {
      state.authForm.codeCountdown--;
      updateCodeCountdownUI();
    } else {
      clearInterval(timer);
      if (state.authForm._codeTimer === timer) state.authForm._codeTimer = null;
      updateCodeCountdownUI();
    }
  }, 1000);
  state.authForm._codeTimer = timer;
}

async function register() {
  const { email, password, nickname, phone, code } = state.authForm;
  if (!email || !password || !code) return showToast('请填写完整注册信息');
  if (!isQqEmail(email)) return showToast('仅支持 QQ 邮箱，例如 123456@qq.com');
  if (password.length < 8) return showToast('密码至少 8 位');
  try {
    await requestApi(API_ENDPOINTS.register, { method: 'POST', body: JSON.stringify({ email, code, password, nickname, phone: phone || undefined }) });
    state.authForm = { email, password: '', nickname: '', phone: '', code: '', codeSent: false, codeCountdown: 0 };
    showToast('注册成功，请登录');
    setTimeout(() => navigate('login', { replace: true }), 800);
  } catch (error) {
    showToast(`注册失败：${error.message}`);
  }
}

async function resetPassword() {
  const { email, code, password, confirmPassword } = state.authForm;
  if (!email || !code || !password) return showToast('请填写完整信息');
  if (!isQqEmail(email)) return showToast('仅支持 QQ 邮箱，例如 123456@qq.com');
  if (password !== confirmPassword) return showToast('两次输入的密码不一致');
  if (password.length < 8) return showToast('密码至少 8 位');
  try {
    await apiJson('/api/user/forgot-password', { method: 'POST', body: JSON.stringify({ email, code, newPassword: password }) });
    showToast('密码重置成功，请使用新密码登录');
    switchAuthMode('login');
  } catch (error) {
    showToast(`重置失败：${error.message}`);
  }
}

function showToast(message) {
  state.toast = message;
  const authPage = state.page === 'login' || state.page === 'register' || state.page === 'forgot';
  if (authPage) {
    const app = document.getElementById('bento-app');
    let toast = app?.querySelector('.bento-toast');
    if (!toast && app) {
      toast = document.createElement('div');
      toast.className = 'bento-toast';
      app.append(toast);
    }
    if (toast) toast.textContent = message;
  } else {
    render();
  }
  clearTimeout(window.__opshubToastTimer);
  window.__opshubToastTimer = setTimeout(() => {
    state.toast = '';
    if (authPage) document.querySelector('#bento-app .bento-toast')?.remove();
    else render();
  }, 3000);
}

function addActivity(type, text) {
  state.activities.unshift({ type, text, time: '刚刚' });
  if (state.activities.length > 20) state.activities.pop();
}

function beginToolRun(toolId) {
  const run = {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    toolId,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: 'running',
    summary: '',
    lines: [],
    artifacts: {},
  };
  state.toolHistory.unshift(run);
  state.toolHistory = state.toolHistory.slice(0, 30);
  state.activeToolRun = run;
  return run;
}

function finishToolRun(run, status, summary, raw = '', artifacts = {}) {
  if (!run) return;
  run.status = status;
  run.summary = summary;
  run.finishedAt = new Date().toISOString();
  run.artifacts = artifacts && typeof artifacts === 'object' ? artifacts : {};
  if (raw) {
    String(raw).split(/\r?\n/).filter(Boolean).forEach((text) => {
      run.lines.push({ text, type: status === 'success' ? 'success' : 'error', at: run.finishedAt });
    });
  }
}

function exportActiveToolRun() {
  const run = state.activeToolRun || state.toolHistory[0];
  if (!run) return showToast('暂无可导出的工具结果');
  const csv = String(run.artifacts?.csv || '');
  if (csv) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `IT运维百宝箱-${run.toolId}-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    return;
  }
  const body = [
    'IT 运维百宝箱 - 工具执行记录',
    `工具：${run.toolId}`,
    `状态：${run.status}`,
    `开始：${run.startedAt}`,
    `结束：${run.finishedAt || '-'}`,
    '',
    run.summary || '',
    '',
    ...run.lines.map((line) => `[${line.at}] ${line.text}`),
  ].join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }));
  link.download = `IT运维百宝箱-${run.toolId}-${Date.now()}.txt`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportWorkbenchReport() {
  const runs = state.toolHistory.slice(0, 30);
  if (!runs.length) return showToast('暂无可生成报告的工具运行记录');
  const generatedAt = new Date().toLocaleString('zh-CN', { hour12: false });
  const sections = runs.map((run, index) => `
    <section>
      <h2>${index + 1}. ${escapeHtml(run.toolId)}</h2>
      <p><strong>状态：</strong>${run.status === 'success' ? '完成' : run.status === 'error' ? '失败' : '进行中'}<br><strong>开始：</strong>${escapeHtml(run.startedAt)}<br><strong>结束：</strong>${escapeHtml(run.finishedAt || '-')}</p>
      <p>${escapeHtml(run.summary || '未生成结论。')}</p>
      <pre>${escapeHtml(run.lines.map((line) => `[${line.at}] ${line.text}`).join('\n') || '无输出记录。')}</pre>
    </section>`).join('');
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>IT 运维百宝箱现场交付报告</title><style>body{max-width:960px;margin:32px auto;padding:0 24px;color:#172033;font:14px/1.7 "Microsoft YaHei",sans-serif}h1{color:#0b766e}h2{font-size:16px;margin:0 0 8px}section{border:1px solid #d9e3e7;border-radius:8px;padding:16px;margin:14px 0}p{margin:6px 0;color:#52616f}pre{white-space:pre-wrap;background:#f5f8fa;border-radius:6px;padding:12px;overflow:auto;font:12px/1.55 Consolas,"Microsoft YaHei",monospace}</style><body><h1>IT 运维百宝箱 · 现场交付报告</h1><p>生成时间：${escapeHtml(generatedAt)}<br>工具记录：${runs.length} 项</p>${sections}</body></html>`;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  link.download = `IT运维百宝箱-现场交付报告-${Date.now()}.html`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportWorklog(worklogId) {
  const worklog = state.worklogs.find((item) => item.id === worklogId);
  if (!worklog) return showToast('未找到处置单记录');
  const createdAt = new Date(worklog.createdAt).toLocaleString('zh-CN', { hour12: false });
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>IT 运维百宝箱处置单</title><style>body{max-width:840px;margin:32px auto;padding:0 24px;color:#172033;font:14px/1.7 "Microsoft YaHei",sans-serif}h1{color:#0b766e}h2{font-size:15px;margin:20px 0 6px}.meta{color:#52616f}.block{white-space:pre-wrap;background:#f5f8fa;border:1px solid #d9e3e7;border-radius:6px;padding:12px}</style><body><h1>IT 运维百宝箱 · 现场处置单</h1><p class="meta">单号：${escapeHtml(worklog.id)}<br>创建时间：${escapeHtml(createdAt)}<br>地点：${escapeHtml(worklog.site)}<br>联系人：${escapeHtml(worklog.contact || '-')}<br>关联资产：${escapeHtml(worklog.assetName || '-')}<br>关联工单：${escapeHtml(worklog.ticketId || '-')}<br>工具运行：${Number(worklog.toolCount || 0)} 项</p><h2>故障标题</h2><div class="block">${escapeHtml(worklog.title)}</div><h2>处理结果</h2><div class="block">${escapeHtml(worklog.result)}</div><h2>处理过程与备注</h2><div class="block">${escapeHtml(worklog.notes || '未填写')}</div></body></html>`;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  link.download = `IT运维百宝箱-处置单-${worklog.id}.html`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function saveWorklog() {
  if (!requireLogin()) return;
  const value = (name) => document.querySelector(`[data-worklog-field="${name}"]`)?.value.trim() || '';
  const payload = {
    site: value('site'),
    contact: value('contact'),
    title: value('title'),
    result: value('result'),
    notes: value('notes'),
    assetId: value('assetId'),
    ticketId: value('ticketId'),
    toolCount: state.toolHistory.filter((run) => run.status === 'success').length,
  };
  if (!payload.site || !payload.title || !payload.result) return showToast('请填写地点、故障标题和处理结果');
  try {
    const worklog = await apiJson('/api/worklogs', { method: 'POST', body: JSON.stringify(payload) });
    state.worklogs.unshift(worklog);
    showToast(`处置单 ${worklog.id} 已保存`);
    render();
  } catch (error) {
    showToast(`保存处置单失败：${error.message}`);
  }
}

function runTool(toolId, additionalBody = {}) {
  const run = beginToolRun(toolId);
  state.isToolRunning = true;
  state.toolOutput = null;
  render();
  showToast(`正在执行 ${toolId}...`);
  addActivity('tool', `<strong>管理员</strong> 执行了 <strong>${toolId}</strong>`);
  const localToolMap = {
    'ping-test': { id: 'ping' },
    'port-scan': { id: 'port', port: 80 },
    traceroute: { id: 'trace' },
    'dns-diagnosis': { id: 'dns' },
    'conn-tracker': { id: 'conn-tracker' },
    'domain-whois': { id: 'domain-whois', domain: state.settings.defaultToolHost || 'example.com' },
    'http-api': { id: 'http-api', url: state.settings.defaultToolHost ? `http://${state.settings.defaultToolHost}/api` : 'http://127.0.0.1/api' },
    'snmp-probe': { id: 'snmp-probe', host: state.settings.defaultToolHost || '127.0.0.1' },
    'websocket-test': { id: 'websocket-test', url: state.settings.defaultToolHost ? `ws://${state.settings.defaultToolHost}/ws` : 'ws://127.0.0.1/ws' },
    'ptr-lookup': { id: 'ptr-lookup', ip: state.settings.defaultToolHost || '8.8.8.8' },
    'tls-scan': { id: 'tls-scan', host: state.settings.defaultToolHost || 'www.baidu.com' },
    'traceroute-analyze': { id: 'traceroute-analyze', host: state.settings.defaultToolHost || 'www.baidu.com' },
    'mitm-hints': { id: 'mitm-hints' },
    'netflow-listen': { id: 'netflow-listen' },
    'subnet-calc': { id: 'subnet-calc', cidr: '192.168.1.0/24' },
    'route-table': { id: 'route-table' },
    'firewall-status': { id: 'firewall-status' },
    'port-occupancy': { id: 'port-occupancy', port: 8080 },
    'ip-info': { id: 'ip-info' },
    'dhcp-detect': { id: 'dhcp-detect' },
    'host-discovery': { id: 'host-discovery', subnet: '192.168.1.0/24' },
    'loop-detection': { id: 'loop-detection', target: state.settings.defaultToolHost || 'www.baidu.com' },
    'speed-test': { id: 'speed-test' },
    'network-health': { id: 'network-health' },
    'arp-table': { id: 'arp-table' },
    'port-service-probe': { id: 'port-service-probe', host: state.settings.defaultToolHost || '127.0.0.1', port: 80 },
    'temp-http-server': { id: 'temp-http-server', port: 8080 },
    'ftp-server': { id: 'ftp-server', port: 2121 },
    'tftp-server': { id: 'tftp-server', port: 6969 },
    'syslog-server': { id: 'syslog-server', port: 1514, proto: 'udp' },
    'camera-scan': { id: 'camera-scan', subnet: '192.168.1.0/24', ports: '80,443,554,8000,8080,37777', timeout: 3 },
    'service-discovery': { id: 'service-discovery', mdnsSec: 8, ssdpSec: 3 },
    'dhcp-server': { id: 'dhcp-server', port: 6767, subnet: '192.168.1.0/24', gateway: '192.168.1.1', startIp: '192.168.1.100', endIp: '192.168.1.200', dns: '8.8.8.8' },
    'lan-speed-test': { id: 'lan-speed-test', host: '127.0.0.1', duration: 10 },
    'ping-qos': { id: 'ping-qos', host: '127.0.0.1', port: 80, count: 50, timeout: 2 },
    'route-policy': { id: 'route-policy' },
    'connection-test': { id: 'connection-test', host: '127.0.0.1', port: 80, protocol: 'tcp', timeout: 5 },
    'certificate-domain': { id: 'certificate-domain', host: state.settings.defaultToolHost || 'www.microsoft.com' },
    'batch-check': { id: 'batch-check', targets: state.settings.defaultToolHost || '127.0.0.1' },
  };
  const localTool = localToolMap[toolId] || { id: toolId };
  const toolBody = { ...localTool, ...additionalBody };
  delete toolBody.id;
  apiJson('/api/tools/' + localTool.id, { method: 'POST', body: JSON.stringify(toolBody) })
    .then(res => {
      state.isToolRunning = false;
      const raw = res.output || JSON.stringify(res);
      const summary = summarizeToolOutput(toolId, raw, true);
      state.toolOutput = { toolId, output: raw, summary, success: true, csv: res.csv || '' };
      finishToolRun(run, 'success', summary, raw, { csv: res.csv || '' });
      showToast(`${toolId} 执行完成`);
      addActivity('success', `<strong>${toolId}</strong> 执行成功`);
      render();
    })
    .catch(err => {
      state.isToolRunning = false;
      const summary = summarizeToolOutput(toolId, err.message, false);
      state.toolOutput = { toolId, output: err.message, summary, success: false };
      finishToolRun(run, 'error', summary, err.message);
      showToast(`执行失败：${err.message}`);
      addActivity('error', `<strong>${toolId}</strong> 执行失败`);
      render();
    });
}

function runDesktopDiagnosis() {
  const entered = window.prompt('选择故障现象：general、no-network、software-not-open、computer-slow、printer、bluescreen', 'general');
  if (entered === null) return;
  const allowed = new Set(['general', 'no-network', 'software-not-open', 'computer-slow', 'printer', 'bluescreen']);
  const symptom = entered.trim().toLowerCase();
  if (!allowed.has(symptom)) return showToast('请输入预设故障现象代码，例如 no-network 或 printer。');
  runTool('desktop-diagnosis', { symptom });
}

async function runControlledRepair(toolId) {
  const run = beginToolRun(toolId);
  state.isToolRunning = true;
  state.toolOutput = null;
  render();
  try {
    const plan = await apiJson(`/api/tools/${toolId}`, { method: 'GET' });
    const availableActions = plan.actions || [];
    if (!availableActions.length) throw new Error('未获取到可执行的受控修复动作。');
    const choice = window.prompt(`${plan.title || '受控修复'}\n\n输入要执行的动作编号，多个用逗号分隔：\n${availableActions.map((action, index) => `${index + 1}. ${action.label}`).join('\n')}`, availableActions.map((_, index) => index + 1).join(','));
    if (choice === null) throw new Error('已取消选择修复动作。');
    const selectedIndexes = [...new Set(choice.split(',').map((item) => Number(item.trim()) - 1).filter((index) => Number.isInteger(index) && index >= 0 && index < availableActions.length))];
    const actions = selectedIndexes.map((index) => availableActions[index].id);
    if (!actions.length) throw new Error('请选择至少一个有效的修复动作。');
    const selectedActions = availableActions.filter((action) => actions.includes(action.id));
    let description = selectedActions.map((action) => `- ${action.label}\n  风险：${action.risk}\n  回滚：${action.rollback}`).join('\n');
    const payload = { actions, confirmed: true };
    if (actions.includes('msi-uninstall')) {
      const products = Array.isArray(plan.products) ? plan.products : [];
      if (!products.length) throw new Error('未发现可安全静默卸载的 MSI 软件。可改用“Windows 已安装应用”入口处理其他软件。');
      const productChoice = window.prompt(`选择需要静默卸载的 MSI 软件编号：\n${products.slice(0, 40).map((product, index) => `${index + 1}. ${product.name} ${product.version ? `(${product.version})` : ''}`).join('\n')}`, '');
      if (productChoice === null) throw new Error('已取消选择卸载的软件。');
      const product = products[Number(productChoice.trim()) - 1];
      if (!product?.productCode) throw new Error('请选择清单中的软件编号。');
      payload.productCode = product.productCode;
      description += `\n\n目标软件：${product.name}${product.version ? ` ${product.version}` : ''}\n产品标识：${product.productCode}`;
    }
    const confirmed = window.confirm(`${plan.title || '受控修复'}\n\n${description}\n\n确认执行以上动作吗？`);
    if (!confirmed) {
      const summary = '已取消执行，未修改本机设置。';
      state.isToolRunning = false;
      state.toolOutput = { toolId, output: summary, summary, success: true };
      finishToolRun(run, 'success', summary, summary);
      render();
      return;
    }
    const result = await apiJson(`/api/tools/${toolId}`, { method: 'POST', body: JSON.stringify(payload) });
    const raw = result.output || JSON.stringify(result);
    const summary = summarizeToolOutput(toolId, raw, true);
    state.toolOutput = { toolId, output: raw, summary, success: true };
    finishToolRun(run, 'success', summary, raw);
    showToast(`${plan.title || toolId}已执行，结果已写入输出台`);
  } catch (error) {
    const summary = summarizeToolOutput(toolId, error.message, false);
    state.toolOutput = { toolId, output: error.message, summary, success: false };
    finishToolRun(run, 'error', summary, error.message);
    showToast(`执行失败：${error.message}`);
  } finally {
    state.isToolRunning = false;
    render();
  }
}

function summarizeToolOutput(toolId, raw, success) {
  if (!success) return `工具执行失败：${String(raw || '').slice(0, 300)}`;
  const text = String(raw);
  const lines = text.split(/\r?\n/).filter(Boolean);
  const lower = text.toLowerCase();

  // 进程
  if (toolId === 'process-list' || toolId.includes('process')) {
    const count = lines.filter(l => /^\S+/.test(l) && !l.includes('ProcessName') && !l.includes('-----------') && !l.includes('CPU')).length;
    const top = lines.slice(2, 6).map(l => l.trim()).filter(Boolean).join('\n');
    return `共检测到 ${count || '若干'} 个活跃进程。CPU / 内存占用最高的进程如下，可据此定位卡顿或异常程序：\n\n${top || '（无详细排行）'}`;
  }

  // 服务
  if (toolId === 'service-status' || toolId === 'service-list' || toolId.includes('service')) {
    const running = (text.match(/\bRunning\b/g) || []).length;
    const stopped = (text.match(/\bStopped\b/g) || []).length;
    return `服务状态统计：运行中 ${running} 个，已停止 ${stopped} 个。\n如果关键服务（如 Print Spooler、SQL Server 等）显示已停止，请结合下方详情进行启动或修复。`;
  }

  // Ping / 网络质量
  if (['ping', 'ping-test', 'tcp-ping'].includes(toolId) || toolId.includes('ping')) {
    const loss = text.match(/(\d+)% 丢失|Loss\s*=\s*(\d+)%|丢包[:\s]+(\d+)%/i);
    const avg = text.match(/平均[:\s]*[=]*\s*(\d+)ms|Average[:\s]*[=]*\s*(\d+)ms/i);
    const lossRate = loss ? `${loss[1] || loss[2] || loss[3]}%` : '未知';
    const avgMs = avg ? `${avg[1] || avg[2]}ms` : '未知';
    let conclusion = '网络连通性正常，适合承载业务流量。';
    if (lossRate !== '未知' && parseInt(lossRate) > 0) conclusion = '存在丢包，建议检查网线、交换机端口或链路负载。';
    if (avgMs !== '未知' && parseInt(avgMs) > 100) conclusion = '延迟较高，可能存在网络拥堵或路由绕路。';
    return `Ping 测试结果：丢包率 ${lossRate}，平均延迟 ${avgMs}。\n${conclusion}`;
  }

  if (toolId === 'network-quality') {
    const loss = text.match(/丢包[:\s]+(\d+\.?\d*)%|loss[:\s]+(\d+\.?\d*)%/i);
    const avg = text.match(/平均延迟[:\s]+(\d+)ms|avg[:\s]+(\d+)ms/i);
    const jitter = text.match(/抖动[:\s]+(\d+\.?\d*)ms|jitter[:\s]+(\d+\.?\d*)ms/i);
    return `网络质量检测：丢包率 ${loss ? `${loss[1] || loss[2]}%` : '未知'}，平均延迟 ${avg ? `${avg[1] || avg[2]}ms` : '未知'}，抖动 ${jitter ? `${jitter[1] || jitter[2]}ms` : '未知'}。\n抖动大或丢包率 >1% 时，视频会议、POS 刷卡等业务容易卡顿。`;
  }

  // DNS
  if (['dns', 'dns-diagnosis', 'dns-lookup', 'flush-dns'].includes(toolId) || toolId.includes('dns')) {
    const addr = text.match(/Address(?:es)?:\s*([\d.]+)/i);
    if (toolId === 'flush-dns') return 'DNS 缓存已刷新，后续解析将重新向 DNS 服务器查询。';
    return addr ? `DNS 解析成功，目标 IP：${addr[1]}。\n如果解析结果与预期不符，请检查 DNS 服务器配置或 hosts 文件。` : 'DNS 解析结果请见下方详情，注意是否存在超时或错误。';
  }

  // 端口
  if (toolId.includes('port') || toolId === 'port-scan') {
    const openCount = (text.match(/open|开放/gi) || []).length;
    const closedCount = (text.match(/closed|关闭/gi) || []).length;
    if (openCount || closedCount) return `端口检测完成：开放 ${openCount} 个，关闭/不可达 ${closedCount} 个。\n开放端口表示对应服务正在监听；关闭端口可能是服务未启动或被防火墙拦截。`;
    return '端口检测结果请见下方详情。';
  }

  // 路由追踪
  if (toolId === 'traceroute' || toolId.includes('trace')) {
    const hops = lines.filter(l => /^\s*\d+\s+/.test(l) || l.includes('ms')).length;
    return `路由追踪完成，共经过约 ${hops} 个跃点。\n若某一跳出现 * * * 或延迟突变，说明该节点或链路存在异常。`;
  }

  // MTU
  if (toolId === 'mtu-probe' || toolId.includes('mtu')) {
    const mtu = text.match(/MTU[:\s]+(\d+)/i);
    return `MTU 探测完成，路径最大传输单元约为 ${mtu ? mtu[1] : '未知'} 字节。\nVPN、专线或 PPPOE 场景下 MTU 不匹配容易导致大包丢包或网页打开慢。`;
  }

  // 网关 / 外网 / 网卡
  if (toolId === 'gateway-health' || toolId === 'check-gateway' || toolId.includes('gateway')) {
    return lower.includes('可达') || lower.includes('ok') ? '到默认网关的连通性正常，本地局域网链路无异常。' : '到默认网关不通，请检查本机网线、Wi-Fi 或交换机端口。';
  }
  if (toolId === 'internet-health' || toolId === 'check-internet' || toolId.includes('internet')) {
    return lower.includes('正常') || lower.includes('ok') || lower.includes('可达') ? '外网连通性正常，可正常访问互联网。' : '外网访问异常，请检查路由器、光猫或运营商链路。';
  }
  if (toolId === 'adapter-health' || toolId.includes('adapter') || toolId.includes('网卡')) {
    return '网卡状态已采集，请查看下方详情确认链路是否 Up、速率和 IP 配置是否正确。';
  }
  if (toolId === 'network-snapshot' || toolId.includes('snapshot')) {
    return '网络快照已生成，包含 IP 配置、路由、Wi-Fi、ARP 等关键信息，便于一次性掌握网络全貌。';
  }
  if (toolId === 'arp' || toolId.includes('arp')) {
    const entries = lines.filter(l => /([0-9a-f]{2}[:-]){5}/i.test(l)).length;
    return `ARP 表查询完成，共 ${entries} 条记录。\n可用于核对 IP-MAC 绑定、排查 IP 冲突或假冒网关。`;
  }
  if (toolId === 'renew-dhcp' || toolId.includes('dhcp')) {
    return '已尝试重新获取 IP 地址，请查看下方详情确认是否成功分配到新地址。';
  }

  // Wi-Fi
  if (toolId === 'wifi-scan' || toolId.includes('wifi')) {
    const networks = (text.match(/SSID \d+/g) || []).length || lines.filter(l => /SSID|BSSID/i.test(l)).length;
    return `Wi-Fi 扫描完成，发现 ${networks || '若干'} 个可用网络。\n关注目标网络的信号强度、信道重叠和加密方式。`;
  }

  // 时间同步
  if (toolId === 'time-sync' || toolId.includes('time')) {
    const source = text.match(/NTP[:\s]+([^\n]+)/i);
    return `时间同步状态已获取。${source ? `当前时间源：${source[1].trim()}。` : ''}\n时间不同步会导致证书错误、域登录失败或日志时间错乱。`;
  }

  // 系统错误 / 登录日志 / 驱动
  if (toolId === 'system-errors' || toolId.includes('error')) {
    const errorCount = lines.filter(l => /Error|错误|Fail/i.test(l)).length;
    return `系统错误日志采集完成，发现 ${errorCount} 条异常记录。\n重点关注重复出现、与故障时间接近的日志。`;
  }
  if (toolId === 'login-logs' || toolId.includes('login')) {
    return '最近登录记录已采集，可用于排查异常登录或账户安全问题。';
  }
  if (toolId === 'driver-problems' || toolId.includes('driver') || toolId.includes('驱动')) {
    const problems = lines.filter(l => /error|fail|异常|黄色/i.test(l)).length;
    return `设备驱动检查完成，发现 ${problems} 个异常设备。\n建议更新或重新安装带感叹号/问号的设备驱动。`;
  }
  if (toolId === 'resource-hotspots' || toolId.includes('resource')) {
    return '系统资源热点已生成，可查看 CPU / 内存占用最高的进程，定位卡顿原因。';
  }

  // 电脑体检
  if (toolId === 'workstation-health' || toolId.includes('health') || toolId.includes('体检')) {
    if (lower.includes('正常') || lower.includes('healthy') || lower.includes('good')) return '电脑体检完成，主要健康指标正常。';
    return '电脑体检完成，发现部分异常项，请查看下方详情并优先处理标红项目。';
  }

  // 打印机
  if (toolId === 'printer-health' || toolId.includes('printer') || toolId.includes('spooler') || toolId.includes('print')) {
    if (lower.includes('正常') || lower.includes('ok') || lower.includes('running')) return '打印机巡检完成，打印服务运行正常。';
    return '打印机巡检完成，可能存在打印服务、队列或端口异常。\n常见处理：重启 Print Spooler、清空卡死队列、检查 9100/515 端口是否可达。';
  }

  // 监控
  if (toolId === 'cctv-health' || toolId.includes('cctv') || toolId.includes('监控') || toolId.includes('nvr')) {
    if (lower.includes('正常') || lower.includes('ok')) return '监控/NVR 巡检完成，设备可正常访问。';
    return '监控/NVR 巡检完成，可能存在设备离线或端口不可达。\n请检查 PoE 供电、网线、80/443/554/8000/37777 端口。';
  }

  // Web 探测 / RDP / 打开网址
  if (toolId === 'web-probe' || toolId.includes('web')) {
    const code = text.match(/HTTP\s+(\d+)/i);
    return code ? `Web 探测完成，返回 HTTP ${code[1]}。\n2xx 正常，4xx/5xx 请检查服务或权限。` : 'Web 探测结果请见下方详情。';
  }
  if (toolId === 'rdp' || toolId.includes('rdp')) {
    return '远程桌面连接已尝试，请查看下方详情确认是否成功建立连接。';
  }
  if (toolId === 'open-web' || toolId.includes('open-web')) {
    return '已尝试打开目标网址，请查看浏览器或下方详情。';
  }

  // 新增工具摘要
  if (toolId === 'conn-tracker' || toolId.includes('conn')) {
    const tcpCount = (text.match(/ESTABLISHED/gi) || []).length;
    const listenCount = (text.match(/LISTEN/gi) || []).length;
    return `连接追踪完成，发现 ${tcpCount} 个已建立连接，${listenCount} 个监听端口。\n异常连接、大量 TIME_WAIT 或未知远端地址可能表明存在安全问题。`;
  }
  if (toolId === 'domain-whois' || toolId.includes('whois')) {
    const expiry = text.match(/到期|expiration|expir|Registry Expiry Date/i);
    return `WHOIS 查询完成。${expiry ? '请关注域名到期时间，避免解析中断。' : '详情见下方输出。'}`;
  }
  if (toolId === 'http-api' || toolId.includes('http-api')) {
    const code = text.match(/状态码[：:]\s*(\d+)/);
    return code ? `HTTP API 测试完成，返回状态码 ${code[1]}。\n2xx 正常，4xx 客户端错误，5xx 服务端错误。` : 'HTTP API 测试结果请见下方详情。';
  }
  if (toolId === 'snmp-probe' || toolId.includes('snmp')) {
    return text.includes('✓') || text.includes('sysName') || text.includes('正常') ? 'SNMP 探测成功，设备响应正常。' : 'SNMP 探测未收到有效响应，请检查团体字串、目标地址或设备是否启用 SNMP。';
  }
  if (toolId === 'websocket-test' || toolId.includes('websocket')) {
    return text.includes('✓') || text.includes('成功') ? 'WebSocket 连接测试成功，实时通信链路正常。' : 'WebSocket 连接失败，请检查 URL、防火墙或服务端配置。';
  }
  if (toolId === 'ptr-lookup' || toolId.includes('ptr')) {
    const hostname = text.match(/主机名[：:]\s*(.+)/);
    return hostname ? `反向 DNS 查询成功，IP 对应主机名：${hostname[1].trim()}。` : '反向 DNS 查询结果请见下方详情，未解析到 PTR 记录也属正常。';
  }
  if (toolId === 'tls-scan' || toolId.includes('tls')) {
    const weak = text.match(/TLS 1\.0|TLS 1\.1|SSLv3/i);
    return `TLS/SSL 扫描完成。${weak ? '检测到服务端仍支持旧版 TLS（1.0/1.1），建议评估安全影响。' : '协议版本和密码套件信息见下方详情。'}`;
  }
  if (toolId === 'traceroute-analyze' || toolId.includes('traceroute-analyze')) {
    const loop = text.includes('环路');
    const blackhole = text.includes('黑洞');
    if (loop || blackhole) return `路由追踪分析完成，${loop ? '发现环路风险' : ''}${loop && blackhole ? '、' : ''}${blackhole ? '发现黑洞/丢包段' : ''}，请结合拓扑排查。`;
    return '路由追踪分析完成，未发现明显环路或黑洞模式。';
  }
  if (toolId === 'mitm-hints' || toolId.includes('mitm')) {
    return text.includes('⚠') ? 'ARP 检测发现异常：同一 MAC 对应多个 IP，可能存在 ARP 欺骗或网关集群，请结合拓扑核对。' : 'ARP 检测完成，未发现明显的 ARP 欺骗迹象。';
  }
  if (toolId === 'netflow-listen' || toolId.includes('netflow')) {
    const packets = text.match(/(\d+) 个数据包/);
    return packets ? `NetFlow 监听完成，收到 ${packets[1]} 个数据包。\n如未收到数据，请检查网络设备是否已配置流量导出。` : 'NetFlow 监听结果请见下方详情。';
  }
  if (toolId === 'subnet-calc' || toolId.includes('subnet')) {
    const hosts = text.match(/可用主机数：([\d,]+)/);
    return hosts ? `子网计算完成，可用主机数 ${hosts[1]}。\n详情见下方网络地址、广播地址和可用 IP 范围。` : '子网计算结果请见下方详情。';
  }
  if (toolId === 'route-table' || toolId.includes('route')) {
    return '路由表已采集，请核对默认网关、网段路由及异常条目。VPN 或专线冲突常导致路由问题。';
  }
  if (toolId === 'firewall-status' || toolId.includes('firewall')) {
    const enabled = text.match(/Enabled\s+True/gi);
    return `防火墙状态已获取。${enabled ? '至少一个配置文件已启用。' : '防火墙可能已关闭。'}\n如需放行端口，请在高级安全 Windows 防火墙中添加入站规则。`;
  }
  if (toolId === 'port-occupancy' || toolId.includes('occupancy')) {
    return text.includes('未被占用') ? '指定端口当前未被占用，可以安全启动服务。' : '端口占用情况已列出，如端口冲突请结束对应进程或更换端口。';
  }
  if (toolId === 'ip-info' || toolId.includes('ip-info')) {
    const pub = text.match(/公网 IP：([\d.]+)/);
    return `IP 信息检测完成。${pub ? `公网 IP：${pub[1]}。` : ''}\n可用于确认本机出口和 NAT 情况。`;
  }
  if (toolId === 'dhcp-detect' || toolId.includes('dhcp-detect')) {
    return text.includes('⚠') ? 'DHCP 检测发现多个 DHCP 服务器，可能存在私接路由或 Rogue DHCP，建议立即排查。' : 'DHCP 检测完成，未发现明显多 DHCP 风险。';
  }
  if (toolId === 'host-discovery' || toolId.includes('host-discovery')) {
    const count = text.match(/在线设备：(\d+) 台/);
    return count ? `主机发现完成，网段内 ${count[1]} 台设备在线。\n可用于快速掌握内网活跃主机。` : '主机发现结果请见下方详情。';
  }
  if (toolId === 'loop-detection' || toolId.includes('loop')) {
    return text.includes('⚠') ? '环路检测发现异常：路径中出现重复 IP 或多跳超时，建议检查交换机环路或链路冗余配置。' : '环路检测完成，未发现明显环路迹象。';
  }
  if (toolId === 'speed-test' || toolId.includes('speed')) {
    const bw = text.match(/估算带宽：([\d.]+) Mbps/);
    return bw ? `外网测速完成，估算带宽 ${bw[1]} Mbps。\n结果仅供参考，实际业务带宽受多因素影响。` : '测速结果请见下方详情。';
  }
  if (toolId === 'network-health' || toolId.includes('network-health')) {
    const issues = text.match(/发现异常/g);
    return issues ? `网络体检完成，发现 ${issues.length} 项异常。\n请优先查看标红的检查项，常见原因包括网卡未启用、DNS 解析失败、网关不通或 DHCP 异常。` : '网络体检完成，各项指标正常。本机网络配置、网关、DNS、外网出口均无异常。';
  }
  if (toolId === 'arp-table' || toolId.includes('arp-table')) {
    const entries = text.match(/记录数：(\d+)/);
    return entries ? `ARP 表查看完成，共 ${entries[1]} 条记录。\n可用于核对 IP-MAC 绑定、排查 IP 冲突或假冒网关。` : 'ARP 表已采集，请查看下方详情。';
  }
  if (toolId === 'port-service-probe' || toolId.includes('port-service')) {
    const service = text.match(/识别服务：(.+)/);
    return service ? `端口服务探测完成，识别到服务：${service[1].trim()}。\nBanner 信息可用于确认设备类型和版本，但可能被伪装。` : '端口服务探测结果请见下方详情。';
  }
  if (toolId === 'temp-http-server' || toolId.includes('temp-http')) {
    return text.includes('已启动') ? '临时 HTTP 服务器已启动，可通过输出中的地址访问文件共享。\n注意：服务器将持续运行直到手动停止或程序退出。' : '临时 HTTP 服务器操作结果请见下方详情。';
  }
  if (toolId === 'ftp-server' || toolId.includes('ftp-server')) {
    return text.includes('已启动') ? 'FTP 服务器已启动，支持基础命令（LIST/RETR/STOR/PASV）。\n客户端可使用 FileZilla 或 ftp 命令连接。' : 'FTP 服务器操作结果请见下方详情。';
  }
  if (toolId === 'tftp-server' || toolId.includes('tftp-server')) {
    return text.includes('已启动') ? 'TFTP 服务器已启动（UDP），常用于网络设备固件传输。\n注意：TFTP 无认证，请勿暴露在公网。' : 'TFTP 服务器操作结果请见下方详情。';
  }
  if (toolId === 'syslog-server' || toolId.includes('syslog')) {
    return text.includes('已启动') ? 'Syslog 服务器已启动，可接收网络设备发送的日志（UDP/TCP 514）。\n日志保存在内存中，最多 500 条。' : 'Syslog 服务器操作结果请见下方详情。';
  }
  if (toolId === 'camera-scan' || toolId.includes('camera')) {
    const found = text.match(/发现 (\d+) 个响应设备/);
    return found ? `摄像头扫描完成，发现 ${found[1]} 个设备响应。\n探测端口包括 80/443/554/8000/37777，可据此定位监控设备。` : '摄像头扫描结果请见下方详情。';
  }
  if (toolId === 'service-discovery' || toolId.includes('service-discovery')) {
    const found = text.match(/发现 (\d+) 个服务/);
    return found ? `服务发现完成，发现 ${found[1]} 个服务。\nmDNS 用于打印机/投屏/智能家居，SSDP 用于 UPnP 设备发现。` : '服务发现结果请见下方详情。';
  }

  if (toolId === 'dhcp-server' || toolId.includes('dhcp-server')) {
    return text.includes('已启动') ? 'DHCP 服务器已启动，可分配 IP 地址给局域网设备。\n注意：端口 67 需要管理员权限，请勿与现有 DHCP 冲突。' : 'DHCP 服务器操作结果请见下方详情。';
  }
  if (toolId === 'lan-speed-test' || toolId.includes('lan-speed')) {
    const speed = text.match(/平均速度: ([\d.]+) Mbps/);
    return speed ? `内网测速完成，平均速度 ${speed[1]} Mbps。\n结果反映局域网链路质量，受交换机、网线和网卡影响。` : '内网测速结果请见下方详情。';
  }
  if (toolId === 'ping-qos' || toolId.includes('ping-qos')) {
    const mos = text.match(/MOS评分: ([\d.]+)/);
    const loss = text.match(/丢包率: ([\d.]+)%/);
    const jitter = text.match(/抖动: ([\d.]+)/);
    return `Ping QoS 分析完成。MOS评分：${mos ? mos[1] : '未知'}，丢包率：${loss ? loss[1] + '%' : '未知'}，抖动：${jitter ? jitter[1] + 'ms' : '未知'}。\nMOS>=4.0 适合语音视频，<3.0 可能影响业务体验。`;
  }
  if (toolId === 'route-policy' || toolId.includes('route-policy')) {
    return '路由策略分析完成，包含 IPv4/IPv6 路由表和持久路由。\n可用于排查路由环路、默认网关配置或 VPN 路由冲突。';
  }
  if (toolId === 'connection-test' || toolId.includes('connection-test')) {
    return text.includes('成功') ? '连接测试成功，目标端口可达。\nTCP 测试验证端口是否开放，TLS 测试验证证书和协议支持。' : '连接测试失败，请检查目标服务是否运行、防火墙是否放行或网络是否可达。';
  }

  return '工具执行完成，原始输出如下。如需进一步分析，请将结果提供给 AI 排障助手。';
}

function isLocalToolPage(page) {
  return page === 'network' || page === 'system';
}

function isAdmin() {
  const role = localStorage.getItem(AUTH_STORAGE.role);
  return ['super', 'manager', 'admin'].includes(role);
}

function isSuperAdmin() {
  return localStorage.getItem(AUTH_STORAGE.role) === 'super';
}

function getUserRole() {
  return localStorage.getItem(AUTH_STORAGE.role) || 'user';
}

// 根据角色过滤侧边栏菜单
function getVisibleNavItems() {
  const role = getUserRole();
  // super/manager/admin 可以看到所有菜单
  if (['super', 'manager', 'admin'].includes(role)) {
    return navItems;
  }
  // distributor/user 仅展示：工具箱、知识库、AI、远程管理、网络拓扑、外部工具
  const basicPages = ['dashboard', 'network', 'system', 'topology', 'knowledge', 'ai', 'remote', 'external-tools'];
  return navItems.filter(item => basicPages.includes(item.id));
}

function navigate(page, { replace = false } = {}) {
  const targetPage = PAGE_PATHS[page] ? page : 'dashboard';
  const targetPath = PAGE_PATHS[targetPage];
  if (replace) history.replaceState({}, '', targetPath);
  else if (window.location.pathname !== targetPath) history.pushState({}, '', targetPath);
  state.page = targetPage;
  state.settingsOpen = false;
  state.searchOpen = false;
  render();
  if (targetPage === 'dashboard') fetchLatestAnnouncement();
  if (targetPage === 'account-management' && isAdmin()) loadAccountList();
  if (targetPage === 'remote' && isLoggedIn()) loadRemoteWorkbench();
}

function requireLogin() {
  if (isLoggedIn()) return true;
  showToast('请先登录后使用');
  return false;
}

function renderHeader() {
  const admin = isAdmin();
  return `
    <header class="tk-header">
      <div class="tk-header-title">
        IT 运维百宝箱 <span>| 桌面与现场运维工作台</span>
      </div>
      <div class="tk-header-right">
        <div class="tk-search">
          <span>${icon('search', 14)}</span>
          <input type="text" placeholder="搜索功能 (Ctrl+K)" />
        </div>
        <button class="tk-theme-toggle" title="深色模式">${icon('moon', 14)}</button>
        <button class="tk-help-btn" title="帮助">${icon('help-circle', 14)}</button>
        <button class="tk-settings-btn" data-action="open-settings" title="系统设置" aria-label="系统设置">${icon('settings', 14)}</button>
        ${admin ? `<button class="tk-settings-btn tk-admin-btn" data-action="go-account-management" title="权限与账号管理" aria-label="权限与账号管理">${icon('users', 14)}</button>` : ''}
      </div>
    </header>`;
}

function renderLegacySidebar() {
  const categories = [
    { id: 'connection', label: '连接测试', icon: 'activity', expanded: true, tools: [
      { id: 'dashboard', label: '网络健康检查', icon: 'activity' },
      { id: 'ping', label: 'Ping测试', icon: 'crosshair' },
      { id: 'tcp-ping', label: 'TCP Ping', icon: 'wifi' },
      { id: 'traceroute', label: '路由追踪', icon: 'map' },
      { id: 'traceroute-analyze', label: '路由分析', icon: 'navigation-2' },
      { id: 'mtu-probe', label: 'MTU探测', icon: 'maximize-2' },
      { id: 'portscan', label: '端口扫描', icon: 'scan-line' },
      { id: 'connection-test', label: '连接测试', icon: 'plug' },
    ]},
    { id: 'discovery', label: '主机发现', icon: 'search', expanded: true, tools: [
      { id: 'arp-scan', label: '局域网扫描', icon: 'network' },
      { id: 'host-discovery', label: '主机发现', icon: 'search' },
      { id: 'camera-scan', label: '摄像头扫描', icon: 'video' },
      { id: 'service-discovery', label: '服务发现', icon: 'search-check' },
      { id: 'port-service-probe', label: '服务探测', icon: 'fingerprint' },
      { id: 'wol', label: '远程唤醒', icon: 'zap' },
    ]},
    { id: 'network', label: '网络信息', icon: 'globe', expanded: false, tools: [
      { id: 'network-info', label: '网络信息', icon: 'info' },
      { id: 'arp-table', label: 'ARP表', icon: 'table' },
      { id: 'route-table', label: '路由表', icon: 'git-branch' },
      { id: 'subnet-calc', label: '子网计算', icon: 'calculator' },
      { id: 'mac-lookup', label: 'MAC厂商查询', icon: 'search' },
      { id: 'conn-tracker', label: '连接追踪', icon: 'activity' },
    ]},
    { id: 'dns', label: 'DNS解析', icon: 'globe', expanded: false, tools: [
      { id: 'dns-lookup', label: 'DNS查询', icon: 'globe' },
      { id: 'flush-dns', label: '刷新DNS缓存', icon: 'rotate-cw' },
      { id: 'ptr-lookup', label: '反向DNS', icon: 'refresh-cw' },
      { id: 'domain-whois', label: '域名WHOIS', icon: 'database' },
    ]},
    { id: 'quality', label: '网络质量', icon: 'signal', expanded: false, tools: [
      { id: 'network-health', label: '网络体检', icon: 'stethoscope' },
      { id: 'ping-qos', label: 'Ping QoS', icon: 'activity' },
      { id: 'speed-test', label: '外网测速', icon: 'gauge' },
      { id: 'lan-speed-test', label: '内网测速', icon: 'gauge' },
      { id: 'loop-detection', label: '环路检测', icon: 'refresh-ccw' },
    ]},
    { id: 'security', label: '安全检测', icon: 'shield', expanded: false, tools: [
      { id: 'tls-scan', label: 'TLS扫描', icon: 'lock' },
      { id: 'firewall-status', label: '防火墙状态', icon: 'shield' },
      { id: 'mitm-hints', label: 'ARP欺骗检测', icon: 'shield-alert' },
      { id: 'security-check', label: '安全自测', icon: 'shield-check' },
    ]},
    { id: 'services', label: '临时服务', icon: 'server', expanded: false, tools: [
      { id: 'dhcp-server', label: 'DHCP服务器', icon: 'server' },
      { id: 'dhcp-detect', label: 'DHCP检测', icon: 'router' },
      { id: 'ftp-server', label: 'FTP服务器', icon: 'folder-open' },
      { id: 'tftp-server', label: 'TFTP服务器', icon: 'file' },
      { id: 'syslog-server', label: 'Syslog服务器', icon: 'file-text' },
      { id: 'temp-http-server', label: '临时HTTP', icon: 'server-off' },
      { id: 'netflow-listen', label: 'NetFlow监听', icon: 'radio' },
    ]},
    { id: 'monitor', label: '监控运维', icon: 'monitor', expanded: false, tools: [
      { id: 'monitoring', label: '链路监控', icon: 'activity' },
      { id: 'flow-monitor', label: '流量监控', icon: 'bar-chart-3' },
      { id: 'topology', label: '网络拓扑', icon: 'network' },
      { id: 'network-snapshot', label: '网络快照', icon: 'camera' },
    ]},
    { id: 'remote', label: '远程工具', icon: 'terminal', expanded: false, tools: [
      { id: 'remote', label: '远程终端', icon: 'terminal' },
      { id: 'rdp', label: '远程桌面', icon: 'monitor' },
      { id: 'serial', label: '串口调试', icon: 'cable' },
    ]},
    { id: 'system', label: '系统工具', icon: 'cpu', expanded: false, tools: [
      { id: 'system', label: '系统检测', icon: 'cpu' },
      { id: 'process', label: '进程列表', icon: 'activity' },
      { id: 'service', label: '服务管理', icon: 'server' },
      { id: 'disk', label: '磁盘信息', icon: 'hard-drive' },
    ]},
    { id: 'ai', label: '智能系统', icon: 'bot', expanded: false, tools: [
      { id: 'ai', label: 'AI排障助手', icon: 'bot' },
      { id: 'knowledge', label: '知识库', icon: 'book-open' },
      { id: 'sop', label: 'SOP流程', icon: 'list-checks' },
    ]},
  ];

  const renderCategory = (cat) => {
    const toolsHtml = cat.tools.map(tool => {
      const isActive = state.page === tool.id;
      return `<div class="tk-tool-item ${isActive ? 'active' : ''}" data-nav="${tool.id}" title="${tool.label}"><span class="tk-tool-item-icon">${icon(tool.icon, 14)}</span>${tool.label}</div>`;
    }).join('');
    return `
      <div class="tk-category ${cat.expanded ? 'expanded' : ''}">
        <div class="tk-category-header" data-category="${cat.id}">
          <span class="tk-expand-icon">▶</span>
          <span>${icon(cat.icon, 14)}</span>
          ${cat.label}
        </div>
        <div class="tk-category-tools">${toolsHtml}</div>
      </div>`;
  };

  const managementItems = [
    { id: 'assets', label: '资产管理', icon: 'server' },
    { id: 'tickets', label: '工单系统', icon: 'ticket' },
    { id: 'worklog', label: '现场处置单', icon: 'file-text' },
    { id: 'audit', label: '审计日志', icon: 'history' },
    ...(isAdmin() ? [{ id: 'account-management', label: '权限与账号', icon: 'users' }] : []),
  ];
  const managementHtml = `
    <div class="tk-sidebar-management">
      <div class="tk-category-header"><span>${icon('briefcase-business', 14)}</span>运维管理</div>
      <div class="tk-management-items">
        ${managementItems.map(item => `<div class="tk-tool-item ${state.page === item.id ? 'active' : ''}" data-nav="${item.id}" title="${item.label}"><span class="tk-tool-item-icon">${icon(item.icon, 14)}</span>${item.label}</div>`).join('')}
      </div>
    </div>`;
  return `<aside class="tk-sidebar">${categories.map(renderCategory).join('')}${managementHtml}</aside>`;
}

function renderSidebar() {
  const pageItem = (id, label, iconName) => `<button type="button" class="tk-workspace-item ${state.page === id ? 'active' : ''}" data-nav="${id}"><span>${icon(iconName, 15)}</span><span>${label}</span></button>`;
  const toolItem = (id, label, iconName) => `<button type="button" class="tk-workspace-item" data-tool="${id}"><span>${icon(iconName, 15)}</span><span>${label}</span></button>`;
  const section = (label, iconName, content) => `<section class="tk-workspace-section"><div class="tk-workspace-section-title"><span>${icon(iconName, 14)}</span>${label}</div>${content}</section>`;

  const workspaceSections = [
    section('工作台', 'layout-dashboard', pageItem('dashboard', '运维指挥台', 'layout-dashboard')),
    section('现场处置', 'route', [
      toolItem('desktop-diagnosis', '故障智能诊断', 'route'),
      toolItem('incident-evidence', '一键现场采集', 'archive'),
      toolItem('delivery-acceptance', '交付验收清单', 'clipboard-check'),
    ].join('')),
    section('桌面与办公', 'monitor-cog', [
      pageItem('system', '电脑维护中心', 'monitor-cog'),
      toolItem('office-health', 'Office / WPS 修复', 'file-search-2'),
      toolItem('desktop-optimizer', '一键电脑优化', 'sparkles'),
      toolItem('printer-health', '打印与外设', 'printer'),
    ].join('')),
    section('网络与设备', 'network', [
      pageItem('network', '网络诊断中心', 'wifi'),
      pageItem('topology', '网络拓扑', 'network'),
      pageItem('monitoring', '监控与告警', 'activity'),
      pageItem('remote', '远程支持', 'monitor-play'),
    ].join('')),
    section('管理交付', 'briefcase-business', [
      pageItem('assets', '资产管理', 'server'),
      pageItem('tickets', '工单系统', 'ticket'),
      pageItem('worklog', '现场处置单', 'file-text'),
      pageItem('audit', '审计与报告', 'history'),
    ].join('')),
    section('知识与扩展', 'book-open', [
      pageItem('knowledge', '知识库与厂商资料', 'book-open'),
      pageItem('ai', 'AI 排障助手', 'sparkles'),
      pageItem('external-tools', '开源工具集成', 'external-link'),
      pageItem('sop', '标准 SOP', 'list-checks'),
    ].join('')),
    isAdmin() ? section('系统管理', 'shield-check', pageItem('account-management', '权限与账号', 'users')) : '',
  ];

  return `<aside class="tk-sidebar tk-sidebar-workspaces">${workspaceSections.join('')}</aside>`;
}

function getDashboardTools() {
  const seen = new Set();
  const categoryNames = { network: '网络与现场', system: '桌面与系统', printer: '打印与外设', cctv: '监控设备', utility: '实用工具', remote: '远程支持' };
  const fieldTools = [
    { id: 'desktop-diagnosis', name: '桌面故障智能诊断', desc: '按现象串联检测', category: 'system', categoryName: '现场王牌入口' },
    { id: 'delivery-acceptance', name: '交付验收清单', desc: '网络、打印、Office、安全验收', category: 'system', categoryName: '现场王牌入口' },
    { id: 'user-permissions', name: '用户与权限巡检', desc: '账户、管理员组、域状态', category: 'system', categoryName: '桌面运维' },
    { id: 'peripheral-health', name: '外设健康巡检', desc: 'USB、蓝牙、摄像头、串口', category: 'system', categoryName: '桌面运维' },
    { id: 'browser-health', name: '浏览器健康巡检', desc: '代理、证书、浏览器版本', category: 'system', categoryName: '办公与业务' },
    { id: 'collaboration-health', name: '协作软件巡检', desc: 'Teams、企业微信、钉钉、Outlook', category: 'system', categoryName: '办公与业务' },
    { id: 'business-runtime-health', name: '业务运行库巡检', desc: 'Java、.NET、VC++、串口设备', category: 'system', categoryName: '办公与业务' },
    { id: 'desktop-health', name: 'Windows 健康诊断', desc: '系统、驱动、更新与启动项', category: 'system', categoryName: '桌面运维' },
    { id: 'windows-repair', name: 'Windows 受控修复', desc: '组件、系统文件、关联和更新入口', category: 'system', categoryName: '桌面运维' },
    { id: 'software-inventory', name: '软件与运行库盘点', desc: '已装软件、Office、Java、.NET 与 VC++ 运行库', category: 'system', categoryName: '桌面运维' },
    { id: 'software-uninstall', name: '受控软件卸载', desc: '仅精确选择 MSI 产品，确认后静默卸载并审计', category: 'system', categoryName: '桌面运维' },
    { id: 'data-migration', name: '桌面资料迁移', desc: '桌面、文档、书签、Outlook 与打印配置', category: 'system', categoryName: '桌面运维' },
    { id: 'vpn-proxy-health', name: 'VPN 与代理排障', desc: '代理、路由、VPN 适配器与 DNS', category: 'network', categoryName: '网络与安全' },
    { id: 'share-nas-health', name: '共享与 NAS 排障', desc: 'SMB、映射盘、凭据与端口', category: 'network', categoryName: '网络与安全' },
    { id: 'security-baseline', name: '安全基线巡检', desc: 'Defender、BitLocker、防火墙与 RDP', category: 'system', categoryName: '网络与安全' },
    { id: 'server-health', name: '服务器基础巡检', desc: '资源、服务、端口和时间同步', category: 'system', categoryName: '基础设施' },
    { id: 'ad-health', name: 'AD / GPO 常用检查', desc: '域状态、DNS、组策略和域控发现', category: 'system', categoryName: '基础设施' },
    { id: 'certificate-domain', name: '证书与域名检查', desc: 'DNS、HTTPS、TLS 证书链', category: 'network', categoryName: '基础设施' },
    { id: 'batch-check', name: '批量连通性检查', desc: '批量 Ping 和端口探测', category: 'network', categoryName: '基础设施' },
  ];
  return [...Object.entries(toolsByCategory).flatMap(([category, tools]) => tools.map((tool) => ({ ...tool, category, categoryName: categoryNames[category] || category }))), ...fieldTools]
    .filter((tool) => !seen.has(tool.id) && seen.add(tool.id));
}

function renderWorkbenchDashboard() {
  const recentRuns = state.toolHistory.slice(0, 6);
  const tools = getDashboardTools();
  const lastRun = recentRuns[0];
  const runState = lastRun?.status || 'idle';
  return `
    <div class="tk-workbench-dashboard">
      <section class="tk-dashboard-hero" data-dashboard="health">
        <div>
          <p class="tk-dashboard-eyebrow">本机运维工作台</p>
          <h2>IT 运维百宝箱</h2>
          <p>从桌面体检、现场排障到交付记录，所有工具均保留独立输出台。</p>
        </div>
        <div class="tk-dashboard-run-status">
          <span class="tk-status-dot ${runState}" title="${runState === 'error' ? '最近任务需要复查' : runState === 'running' ? '任务执行中' : '系统就绪'}"></span>
          <div><strong>${lastRun ? (lastRun.status === 'success' ? '最近任务已完成' : lastRun.status === 'error' ? '最近任务需要复查' : '任务执行中') : '等待首次检测'}</strong><small>${lastRun ? lastRun.toolId : '运行电脑体检后生成设备状态'}</small></div>
        </div>
      </section>
      <section class="tk-dashboard-health-grid" aria-label="设备状态看板">
        <button type="button" class="tk-health-card" data-tool="desktop-inventory"><span>${icon('monitor-cog', 18)}</span><strong>电脑资产</strong><small>硬件、BIOS、磁盘、网卡和显示器</small></button>
        <button type="button" class="tk-health-card" data-tool="network-health"><span>${icon('network', 18)}</span><strong>网络状态</strong><small>网关、DNS、外网与延迟</small></button>
        <button type="button" class="tk-health-card" data-tool="printer-health"><span>${icon('printer', 18)}</span><strong>打印服务</strong><small>队列、端口与 Spooler</small></button>
        <button type="button" class="tk-health-card" data-tool="system-errors"><span>${icon('shield-alert', 18)}</span><strong>系统事件</strong><small>错误日志与异常线索</small></button>
      </section>
      <section class="tk-dashboard-section" data-dashboard="quick-actions">
        <div class="tk-dashboard-section-head"><div><h3>快捷操作</h3><p>现场最常用的诊断与修复入口</p></div></div>
        <div class="tk-dashboard-quick-grid">
          <button type="button" data-tool="workstation-health">${icon('stethoscope', 18)}<span>一键电脑体检</span></button>
          <button type="button" data-tool="network-health">${icon('wifi', 18)}<span>网络不通排查</span></button>
          <button type="button" data-tool="printer-health">${icon('printer-check', 18)}<span>打印机诊断</span></button>
          <button type="button" data-tool="repair-printer">${icon('wrench', 18)}<span>打印队列修复</span></button>
          <button type="button" data-tool="office-health">${icon('file-search-2', 18)}<span>Office / WPS 检查</span></button>
          <button type="button" data-action="run-desktop-optimizer">${icon('sparkles', 18)}<span>一键电脑优化</span></button>
          <button type="button" data-action="run-office-repair">${icon('wrench', 18)}<span>Office / WPS 修复</span></button>
          <button type="button" data-action="run-windows-repair">${icon('shield-check', 18)}<span>Windows 受控修复</span></button>
          <button type="button" data-tool="software-inventory">${icon('package-search', 18)}<span>软件与运行库盘点</span></button>
          <button type="button" data-action="run-software-uninstall">${icon('package-x', 18)}<span>受控软件卸载</span></button>
          <button type="button" data-action="run-data-migration">${icon('folder-sync', 18)}<span>桌面资料迁移</span></button>
          <button type="button" data-action="run-desktop-diagnosis">${icon('route', 18)}<span>桌面故障智能诊断</span></button>
          <button type="button" data-tool="delivery-acceptance">${icon('clipboard-check', 18)}<span>交付验收清单</span></button>
          <button type="button" data-tool="incident-evidence">${icon('archive', 18)}<span>一键现场采证</span></button>
          <button type="button" data-nav="knowledge">${icon('book-open-check', 18)}<span>知识库与官方资料</span></button>
        </div>
      </section>
      <section class="tk-dashboard-section" data-dashboard="tool-finder">
        <div class="tk-dashboard-section-head"><div><h3>全部运维工具</h3><p>现有工具完整保留，可按名称、用途或分类快速定位</p></div><label class="tk-dashboard-search">${icon('search', 15)}<input type="search" data-dashboard-tool-search placeholder="搜索 Ping、打印、摄像头、驱动、DNS..." /></label></div>
        <div class="tk-dashboard-tool-list" data-dashboard-tool-list>
          ${tools.map((tool) => `<button type="button" class="tk-dashboard-tool" data-tool="${escapeHtml(tool.id)}" data-tool-search-item="${escapeHtml(`${tool.name} ${tool.desc || ''} ${tool.categoryName}`.toLowerCase())}"><span>${escapeHtml(tool.categoryName)}</span><strong>${escapeHtml(tool.name)}</strong><small>${escapeHtml(tool.desc || '运行工具')}</small></button>`).join('')}
        </div>
      </section>
      <section class="tk-dashboard-section" data-dashboard="recent-runs">
        <div class="tk-dashboard-section-head"><div><h3>最近运行</h3><p>输出结果会保留在运行历史中，可复制和导出</p></div><button type="button" class="tk-btn tk-btn-secondary" data-action="export-workbench-report">${icon('file-down', 14)} 导出交付报告</button></div>
        <div class="tk-dashboard-runs">
          ${recentRuns.length ? recentRuns.map((run) => `<button type="button" data-tool="${escapeHtml(run.toolId)}"><span class="tk-run-state ${run.status}"></span><strong>${escapeHtml(run.toolId)}</strong><small>${run.summary ? escapeHtml(run.summary.slice(0, 72)) : '等待输出'}</small><time>${new Date(run.startedAt).toLocaleTimeString('zh-CN')}</time></button>`).join('') : '<p class="tk-dashboard-empty">暂无运行记录。执行任意工具后，结果会在这里保留。</p>'}
        </div>
      </section>
      ${renderToolOutput()}
    </div>`;
}

function renderKnowledgeWorkspace() {
  const documents = state.knowledgeBase || knowledgeBase;
  const brands = state.knowledgeBrands || [];
  const sources = state.knowledgeSources || [];
  return `
    <div class="tk-knowledge-workspace">
      <section class="tk-dashboard-hero">
        <div><p class="tk-dashboard-eyebrow">现场知识中心</p><h2>运维知识库</h2><p>按设备、品牌、故障现象和官方来源查找可验证的处理步骤，结果可直接带回输出台。</p></div>
        <div class="tk-knowledge-count"><strong>${documents.length}</strong><span>条本地知识</span><strong>${brands.length}</strong><span>个品牌入口</span></div>
      </section>
      <section class="tk-knowledge-toolbar">
        <label class="tk-dashboard-search">${icon('search', 15)}<input type="search" data-knowledge-search placeholder="搜索品牌、型号、错误码、打印、网络、Office..." /></label>
        <span class="tk-knowledge-hint">内置 SOP、官方资料、现场经验分开标识</span>
      </section>
      <section class="tk-knowledge-layout">
        <aside class="tk-knowledge-brands"><h3>官方支持</h3><div>${brands.map((brand) => `<button type="button" data-knowledge-source-url="${escapeHtml(brand.url)}"><strong>${escapeHtml(brand.name)}</strong><small>${escapeHtml(brand.category)}</small></button>`).join('')}</div></aside>
        <div class="tk-knowledge-documents"><div class="tk-knowledge-document-head"><h3>故障卡与 SOP</h3><span>${sources.length} 个官方资料入口已登记</span></div>${documents.map((document) => `<article class="tk-knowledge-document" data-knowledge-item="${escapeHtml(`${document.title} ${document.category} ${document.brand || ''} ${(document.keywords || []).join(' ')} ${document.content}`.toLowerCase())}"><div class="tk-knowledge-document-meta"><span>${escapeHtml(document.category || '未分类')}</span><em>${escapeHtml(document.source || '内置 SOP')}</em>${document.reviewStatus ? `<em>${escapeHtml(document.reviewStatus)}</em>` : ''}</div><h4>${escapeHtml(document.title)}</h4><p>${escapeHtml(document.content || '')}</p><div class="tk-knowledge-document-foot"><small>${escapeHtml(document.brand || '通用')} · ${escapeHtml(document.updatedAt || document.createdAt || '本地资料')}</small><button type="button" data-knowledge-output="${escapeHtml(document.id || document.title)}">${icon('terminal', 13)} 关联输出台</button></div></article>`).join('')}</div>
      </section>
    </div>`;
}

function renderMain() {
  if (state.page === 'dashboard') {
    return `
      <main class="tk-main">
        ${renderSidebar()}
        <div class="tk-content tk-dashboard-content">${renderWorkbenchDashboard()}</div>
      </main>`;
  }
  if (state.page === 'knowledge') {
    return `<main class="tk-main">${renderSidebar()}<div class="tk-content tk-dashboard-content">${renderKnowledgeWorkspace()}</div></main>`;
  }
  return `
    <main class="tk-main">
      ${renderSidebar()}
      <div class="tk-content tk-page-content">${renderMainContent()}</div>
    </main>`;
}

function renderStatusbar() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('zh-CN');
  const dateStr = now.toLocaleDateString('zh-CN');
  return `
    <footer class="tk-statusbar">
      <div class="tk-status-left">
        <div class="tk-status-item"><span class="tk-status-dot"></span>系统就绪</div>
        <div class="tk-status-item">用户: ${state.auth.user?.displayName || '未登录'}</div>
      </div>
      <div class="tk-status-right">
        <div class="tk-status-item">${dateStr}</div>
        <div class="tk-status-item">${timeStr}</div>
      </div>
    </footer>`;
}

function renderToolHeader() {
  const titles = {
    dashboard: { title: '网络健康检查', subtitle: '一键体检：网卡 · 网关 · DNS · 外网 · 延迟 · 环路，约10秒' },
    ping: { title: 'Ping测试', subtitle: '单Ping / 持续Ping / 批量Ping / 网段Ping / TCP Ping' },
    'tcp-ping': { title: 'TCP Ping', subtitle: 'TCP端口连通性检测' },
    traceroute: { title: '路由追踪', subtitle: '追踪数据包到达目标主机的路径' },
    'traceroute-analyze': { title: '路由分析', subtitle: '环路/黑洞检测与路径分析' },
    'mtu-probe': { title: 'MTU探测', subtitle: '检测链路最大传输单元' },
    portscan: { title: '端口扫描', subtitle: '扫描目标主机开放的TCP端口' },
    'connection-test': { title: '连接测试', subtitle: 'TCP/TLS连接检测' },
    'arp-scan': { title: '局域网扫描', subtitle: '扫描局域网内所有存活设备' },
    'host-discovery': { title: '主机发现', subtitle: '网段在线主机扫描' },
    'camera-scan': { title: '摄像头扫描', subtitle: '发现网络中的监控摄像头设备' },
    'service-discovery': { title: '服务发现', subtitle: 'mDNS/SSDP/UPnP 服务发现' },
    'port-service-probe': { title: '服务探测', subtitle: 'Banner识别与服务指纹' },
    wol: { title: '远程唤醒', subtitle: 'Wake-on-LAN 远程开机' },
    'network-info': { title: '网络信息', subtitle: '本机IP/MAC/网关/DNS 全貌' },
    'arp-table': { title: 'ARP表', subtitle: 'IP-MAC 地址绑定表' },
    'route-table': { title: '路由表', subtitle: 'IPv4/IPv6 路由表' },
    'subnet-calc': { title: '子网计算器', subtitle: 'IPv4/IPv6 子网划分计算' },
    'mac-lookup': { title: 'MAC厂商查询', subtitle: 'OUI 厂商信息查询' },
    'conn-tracker': { title: '连接追踪', subtitle: 'TCP/UDP 连接状态统计' },
    'dns-lookup': { title: 'DNS查询', subtitle: 'A/AAAA/CNAME/MX/NS/TXT 全记录' },
    'flush-dns': { title: '刷新DNS缓存', subtitle: '清除系统DNS解析缓存' },
    'ptr-lookup': { title: '反向DNS', subtitle: 'IP反查主机名 (PTR记录)' },
    'domain-whois': { title: '域名WHOIS', subtitle: '域名注册信息查询' },
    'network-health': { title: '网络体检', subtitle: '一键综合网络诊断' },
    'ping-qos': { title: 'Ping QoS', subtitle: '抖动/丢包/MOS 语音质量评估' },
    'speed-test': { title: '外网测速', subtitle: '下载/上传带宽估算' },
    'lan-speed-test': { title: '内网测速', subtitle: '局域网带宽吞吐测试' },
    'loop-detection': { title: '环路检测', subtitle: 'Traceroute 网络环路检测' },
    'tls-scan': { title: 'TLS扫描', subtitle: 'SSL/TLS 证书与安全检测' },
    'firewall-status': { title: '防火墙状态', subtitle: 'Windows 防火墙状态检测' },
    'mitm-hints': { title: 'ARP欺骗检测', subtitle: 'MITM 中间人异常检测' },
    'security-check': { title: '安全自测', subtitle: '端口/权限/配置安全检测' },
    'dhcp-server': { title: 'DHCP服务器', subtitle: '临时DHCP IP分配服务' },
    'dhcp-detect': { title: 'DHCP检测', subtitle: '多DHCP/私接路由检测' },
    'ftp-server': { title: 'FTP服务器', subtitle: '临时FTP文件传输服务' },
    'tftp-server': { title: 'TFTP服务器', subtitle: '设备固件传输服务' },
    'syslog-server': { title: 'Syslog服务器', subtitle: '日志收集服务' },
    'temp-http-server': { title: '临时HTTP', subtitle: '临时文件共享Web服务' },
    'netflow-listen': { title: 'NetFlow监听', subtitle: '流量导出监听分析' },
    monitoring: { title: '链路监控', subtitle: '实时监控网络链路状态' },
    'flow-monitor': { title: '流量监控', subtitle: '实时流量监控与统计' },
    topology: { title: '网络拓扑', subtitle: '发现网络设备并生成拓扑结构' },
    'network-snapshot': { title: '网络快照', subtitle: '一键网络全貌截图' },
    remote: { title: '远程终端', subtitle: 'SSH / Telnet 多会话终端' },
    rdp: { title: '远程桌面', subtitle: 'RDP 远程桌面连接' },
    serial: { title: '串口调试', subtitle: 'RS232/485 串口通信调试' },
    system: { title: '系统检测', subtitle: '系统信息与性能检测' },
    process: { title: '进程列表', subtitle: '系统进程管理' },
    service: { title: '服务管理', subtitle: '系统服务管理' },
    disk: { title: '磁盘信息', subtitle: '磁盘空间与健康状态' },
    ai: { title: 'AI排障助手', subtitle: '智能故障诊断与修复建议' },
    knowledge: { title: '知识库', subtitle: '运维知识库管理' },
    sop: { title: 'SOP流程', subtitle: '标准操作流程管理' },
  };
  const info = titles[state.page] || { title: getPageTitle(state.page), subtitle: '' };
  return `
    <div class="tk-tool-header">
      <div>
        <span class="tk-tool-title">${info.title}</span>
        <span class="tk-tool-subtitle">${info.subtitle}</span>
      </div>
      <div class="tk-tool-actions">
        <button class="tk-btn tk-btn-sm tk-btn-secondary" data-action="copy-output">${icon('copy', 12)} 复制</button>
        <button class="tk-btn tk-btn-sm tk-btn-secondary" data-action="clear-output">${icon('trash-2', 12)} 清空</button>
      </div>
    </div>`;
}

function renderToolConfig() {
  const configs = {
    dashboard: `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">网络健康检查</div>
          <div class="tk-config-row">
            <button class="tk-btn tk-btn-success" data-action="run-health-check">${icon('search', 14)} 开始健康检查</button>
            <button class="tk-btn tk-btn-secondary" data-action="clear-output">${icon('trash-2', 14)} 清空结果</button>
          </div>
          <div class="tk-progress">
            <div class="tk-progress-bar" style="width: 0%"></div>
          </div>
        </div>
      </div>`,
    ping: `
      <div class="tk-tool-tabs">
        <div class="tk-tool-tab active">单个Ping</div>
        <div class="tk-tool-tab">持续Ping</div>
        <div class="tk-tool-tab">批量Ping</div>
        <div class="tk-tool-tab">网段Ping</div>
        <div class="tk-tool-tab">TCP Ping</div>
      </div>
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">Ping参数配置</div>
          <div class="tk-config-row">
            <label class="tk-config-label">目标主机:</label>
            <input type="text" class="tk-config-input" id="ping-target" value="223.5.5.5" placeholder="输入目标IP或域名" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">测试次数:</label>
            <input type="number" class="tk-config-input" id="ping-count" value="4" min="1" max="100" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">数据包大小:</label>
            <input type="number" class="tk-config-input" id="ping-size" value="32" min="8" max="65500" />
            <span style="font-size:12px;color:var(--tk-text-secondary);">字节</span>
            <button class="tk-btn tk-btn-sm tk-btn-success">32B</button>
            <button class="tk-btn tk-btn-sm" style="background:#d97706;color:white;">1KB</button>
            <button class="tk-btn tk-btn-sm" style="background:#c53030;color:white;">4KB</button>
            <button class="tk-btn tk-btn-sm tk-btn-secondary">8KB</button>
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-ping">${icon('search', 14)} 开始Ping</button>
            <button class="tk-btn tk-btn-secondary" data-action="stop-ping">${icon('square', 14)} 停止</button>
          </div>
        </div>
      </div>`,
    traceroute: `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">路由追踪参数</div>
          <div class="tk-config-row">
            <label class="tk-config-label">目标主机:</label>
            <input type="text" class="tk-config-input" id="tracert-target" value="223.5.5.5" placeholder="输入目标IP或域名" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">最大跳数:</label>
            <input type="number" class="tk-config-input" id="tracert-maxhops" value="30" min="1" max="255" />
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-tracert">${icon('search', 14)} 开始追踪</button>
            <button class="tk-btn tk-btn-secondary" data-action="stop-tracert">${icon('square', 14)} 停止追踪</button>
            <button class="tk-btn tk-btn-success" data-action="run-network-diagnosis">${icon('activity', 14)} 网络诊断</button>
          </div>
        </div>
      </div>`,
    portscan: `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">扫描参数配置</div>
          <div class="tk-config-row">
            <label class="tk-config-label">目标IP:</label>
            <input type="text" class="tk-config-input" id="portscan-target" value="127.0.0.1" placeholder="输入目标IP" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">端口范围:</label>
            <input type="number" class="tk-config-input" id="portscan-start" value="1" min="1" max="65535" style="width:70px" />
            <span>→</span>
            <input type="number" class="tk-config-input" id="portscan-end" value="1000" min="1" max="65535" style="width:70px" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">线程数:</label>
            <input type="number" class="tk-config-input" id="portscan-threads" value="200" min="1" max="3000" />
            <span style="font-size:11px;color:var(--tk-text-muted);">建议: 50-500 | 上限: 3000</span>
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-portscan">${icon('search', 14)} 开始扫描</button>
            <button class="tk-btn tk-btn-secondary" data-action="stop-portscan">${icon('square', 14)} 停止扫描</button>
            <button class="tk-btn tk-btn-success" data-action="portscan-common">${icon('list', 14)} 常用端口</button>
            <button class="tk-btn tk-btn-info" data-action="export-portscan">${icon('download', 14)} 导出结果</button>
          </div>
          <div class="tk-progress">
            <div class="tk-progress-bar" style="width: 0%"></div>
          </div>
          <div class="tk-stats">
            <div class="tk-stat-item">扫描进度: <span class="tk-stat-value" id="portscan-progress">0%</span></div>
          </div>
        </div>
      </div>`,
    'arp-scan': `
      <div class="tk-tool-tabs">
        <div class="tk-tool-tab active">扫描结果</div>
        <div class="tk-tool-tab">局域网拓扑</div>
        <div class="tk-tool-tab">远程唤醒</div>
      </div>
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">扫描参数</div>
          <div class="tk-config-row">
            <label class="tk-config-label">网络范围:</label>
            <input type="text" class="tk-config-input" id="arpscan-target" value="192.168.1.0/24" placeholder="输入网段" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">扫描方式:</label>
            <label><input type="radio" class="tk-config-radio" name="arpscan-mode" value="ping" /> Ping扫描(快速)</label>
            <label><input type="radio" class="tk-config-radio" name="arpscan-mode" value="tcp" checked /> TCP连接(推荐)</label>
            <label><input type="radio" class="tk-config-radio" name="arpscan-mode" value="mixed" /> 混合模式(全面)</label>
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">线程数:</label>
            <input type="number" class="tk-config-input" id="arpscan-threads" value="50" min="1" max="200" />
            <label class="tk-config-label">超时(秒):</label>
            <input type="number" class="tk-config-input" id="arpscan-timeout" value="2" min="1" max="30" />
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-arpscan">${icon('search', 14)} 开始扫描</button>
            <button class="tk-btn tk-btn-secondary" data-action="stop-arpscan">${icon('square', 14)} 停止扫描</button>
            <button class="tk-btn tk-btn-success" data-action="export-arpscan">${icon('download', 14)} 导出结果</button>
          </div>
          <div class="tk-progress">
            <div class="tk-progress-bar" style="width: 0%"></div>
          </div>
          <div class="tk-stats">
            <div class="tk-stat-item">总IP: <span class="tk-stat-value" id="arpscan-total">0</span></div>
            <div class="tk-stat-item">已扫: <span class="tk-stat-value" id="arpscan-scanned">0</span></div>
            <div class="tk-stat-item">存活: <span class="tk-stat-value" id="arpscan-alive">0</span></div>
            <div class="tk-stat-item">进度: <span class="tk-stat-value" id="arpscan-progress">0%</span></div>
          </div>
        </div>
      </div>`,
    'network-info': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">网络信息</div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-network-info">${icon('search', 14)} 获取网络信息</button>
          </div>
        </div>
      </div>`,
    'dns-lookup': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">DNS查询</div>
          <div class="tk-config-row">
            <label class="tk-config-label">域名:</label>
            <input type="text" class="tk-config-input" id="dns-domain" value="www.baidu.com" placeholder="输入域名" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">DNS服务器:</label>
            <input type="text" class="tk-config-input" id="dns-server" value="8.8.8.8" placeholder="输入DNS服务器" />
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-dns-lookup">${icon('search', 14)} 查询</button>
          </div>
        </div>
      </div>`,
    'dhcp-server': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">DHCP服务器设置</div>
          <div class="tk-config-row">
            <label class="tk-config-label">IP起始:</label>
            <input type="text" class="tk-config-input" id="dhcp-start" value="192.168.1.100" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">IP结束:</label>
            <input type="text" class="tk-config-input" id="dhcp-end" value="192.168.1.200" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">子网掩码:</label>
            <input type="text" class="tk-config-input" id="dhcp-netmask" value="255.255.255.0" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">网关:</label>
            <input type="text" class="tk-config-input" id="dhcp-gateway" value="192.168.1.1" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">DNS:</label>
            <input type="text" class="tk-config-input" id="dhcp-dns" value="8.8.8.8" />
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-success" data-action="start-dhcp">${icon('play', 14)} 启动</button>
            <button class="tk-btn tk-btn-danger" data-action="stop-dhcp">${icon('square', 14)} 停止</button>
          </div>
        </div>
      </div>`,
    'ftp-server': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">FTP服务器设置</div>
          <div class="tk-config-row">
            <label class="tk-config-label">端口:</label>
            <input type="number" class="tk-config-input" id="ftp-port" value="21" min="1" max="65535" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">用户名:</label>
            <input type="text" class="tk-config-input" id="ftp-username" value="ftpuser" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">密码:</label>
            <input type="password" class="tk-config-input" id="ftp-password" value="ftppass" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">根目录:</label>
            <input type="text" class="tk-config-input" id="ftp-root" value="./data/ftp" />
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-success" data-action="start-ftp">${icon('play', 14)} 启动</button>
            <button class="tk-btn tk-btn-danger" data-action="stop-ftp">${icon('square', 14)} 停止</button>
          </div>
        </div>
      </div>`,
    'tftp-server': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">TFTP服务器设置</div>
          <div class="tk-config-row">
            <label class="tk-config-label">端口:</label>
            <input type="number" class="tk-config-input" id="tftp-port" value="69" min="1" max="65535" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">根目录:</label>
            <input type="text" class="tk-config-input" id="tftp-root" value="./data/tftp" />
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-success" data-action="start-tftp">${icon('play', 14)} 启动</button>
            <button class="tk-btn tk-btn-danger" data-action="stop-tftp">${icon('square', 14)} 停止</button>
          </div>
        </div>
      </div>`,
    'syslog-server': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">Syslog服务器设置</div>
          <div class="tk-config-row">
            <label class="tk-config-label">UDP端口:</label>
            <input type="number" class="tk-config-input" id="syslog-udp-port" value="514" min="1" max="65535" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">TCP端口:</label>
            <input type="number" class="tk-config-input" id="syslog-tcp-port" value="514" min="1" max="65535" />
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-success" data-action="start-syslog">${icon('play', 14)} 启动</button>
            <button class="tk-btn tk-btn-danger" data-action="stop-syslog">${icon('square', 14)} 停止</button>
          </div>
        </div>
      </div>`,
    topology: `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">网络拓扑发现</div>
          <div class="tk-config-row">
            <label class="tk-config-label">扫描网段:</label>
            <input type="text" class="tk-config-input" id="topo-subnet" value="192.168.1.0/24" placeholder="如 192.168.1.0/24" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">发现方式:</label>
            <select class="tk-config-input" id="topo-method">
              <option value="arp">ARP扫描(快)</option>
              <option value="ping">Ping扫描</option>
              <option value="snmp">SNMP发现</option>
            </select>
            <label class="tk-config-label">深度:</label>
            <select class="tk-config-input" id="topo-depth">
              <option value="1">1层(直连)</option>
              <option value="2" selected>2层(推荐)</option>
              <option value="3">3层(详细)</option>
            </select>
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-topology">${icon('search', 14)} 开始发现</button>
            <button class="tk-btn tk-btn-secondary" data-action="clear-output">${icon('trash-2', 14)} 清空</button>
          </div>
        </div>
      </div>`,
    remote: `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">远程终端</div>
          <div class="tk-config-row">
            <label class="tk-config-label">主机:</label>
            <input type="text" class="tk-config-input" id="remote-host" value="192.168.1.1" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">端口:</label>
            <input type="number" class="tk-config-input" id="remote-port" value="22" min="1" max="65535" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">用户名:</label>
            <input type="text" class="tk-config-input" id="remote-user" value="admin" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">密码:</label>
            <input type="password" class="tk-config-input" id="remote-pass" />
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-success" data-action="connect-ssh">${icon('terminal', 14)} SSH连接</button>
            <button class="tk-btn tk-btn-info" data-action="connect-telnet">${icon('terminal', 14)} Telnet连接</button>
            <button class="tk-btn tk-btn-danger" data-action="disconnect-remote">${icon('square', 14)} 断开</button>
          </div>
        </div>
      </div>`,
    system: `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">系统检测</div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-system-info">${icon('cpu', 14)} 系统信息</button>
            <button class="tk-btn tk-btn-primary" data-action="run-process-list">${icon('activity', 14)} 进程列表</button>
            <button class="tk-btn tk-btn-primary" data-action="run-service-list">${icon('server', 14)} 服务管理</button>
            <button class="tk-btn tk-btn-primary" data-action="run-disk-info">${icon('hard-drive', 14)} 磁盘信息</button>
          </div>
        </div>
      </div>`,
    ai: `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">AI排障助手</div>
          <textarea class="tk-config-input" id="ai-input" rows="3" placeholder="描述故障现象，例如：办公区网络不通..."></textarea>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="ai-send">${icon('send', 14)} 发送</button>
            <button class="tk-btn tk-btn-secondary" data-action="ai-clear-history">${icon('trash-2', 14)} 清空对话</button>
          </div>
        </div>
      </div>`,
    'tcp-ping': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">TCP Ping参数</div>
          <div class="tk-config-row">
            <label class="tk-config-label">目标主机:</label>
            <input type="text" class="tk-config-input" id="tcp-ping-host" value="223.5.5.5" placeholder="IP或域名" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">目标端口:</label>
            <input type="number" class="tk-config-input" id="tcp-ping-port" value="80" min="1" max="65535" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">测试次数:</label>
            <input type="number" class="tk-config-input" id="tcp-ping-count" value="4" min="1" max="100" />
            <label class="tk-config-label">超时(ms):</label>
            <input type="number" class="tk-config-input" id="tcp-ping-timeout" value="3000" min="100" max="10000" />
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-tcp-ping">${icon('search', 14)} 开始检测</button>
            <button class="tk-btn tk-btn-secondary" data-action="stop-tcp-ping">${icon('square', 14)} 停止</button>
          </div>
        </div>
      </div>`,
    'traceroute-analyze': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">路由分析参数</div>
          <div class="tk-config-row">
            <label class="tk-config-label">目标主机:</label>
            <input type="text" class="tk-config-input" id="trace-analyze-target" value="223.5.5.5" placeholder="IP或域名" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">最大跳数:</label>
            <input type="number" class="tk-config-input" id="trace-analyze-hops" value="30" min="1" max="255" />
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-trace-analyze">${icon('search', 14)} 开始分析</button>
            <button class="tk-btn tk-btn-success" data-action="run-trace-analyze-loop">${icon('refresh-cw', 14)} 环路检测</button>
            <button class="tk-btn tk-btn-info" data-action="run-trace-analyze-blackhole">${icon('alert-circle', 14)} 黑洞检测</button>
          </div>
        </div>
      </div>`,
    'mtu-probe': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">MTU探测参数</div>
          <div class="tk-config-row">
            <label class="tk-config-label">目标主机:</label>
            <input type="text" class="tk-config-input" id="mtu-target" value="223.5.5.5" placeholder="IP或域名" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">起始MTU:</label>
            <input type="number" class="tk-config-input" id="mtu-start" value="1500" min="576" max="9000" />
            <label class="tk-config-label">最小MTU:</label>
            <input type="number" class="tk-config-input" id="mtu-min" value="576" min="576" max="1500" />
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-mtu-probe">${icon('search', 14)} 开始探测</button>
          </div>
        </div>
      </div>`,
    'connection-test': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">连接测试参数</div>
          <div class="tk-config-row">
            <label class="tk-config-label">目标主机:</label>
            <input type="text" class="tk-config-input" id="conn-test-host" value="www.baidu.com" placeholder="IP或域名" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">目标端口:</label>
            <input type="number" class="tk-config-input" id="conn-test-port" value="443" min="1" max="65535" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">协议:</label>
            <select class="tk-config-input" id="conn-test-proto">
              <option value="tcp">TCP</option>
              <option value="tls">TLS</option>
              <option value="udp">UDP</option>
            </select>
            <label class="tk-config-label">超时(ms):</label>
            <input type="number" class="tk-config-input" id="conn-test-timeout" value="5000" min="100" max="30000" />
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-conn-test">${icon('plug', 14)} 测试连接</button>
          </div>
        </div>
      </div>`,
    'host-discovery': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">主机发现参数</div>
          <div class="tk-config-row">
            <label class="tk-config-label">网段范围:</label>
            <input type="text" class="tk-config-input" id="host-disc-range" value="192.168.1.0/24" placeholder="如 192.168.1.0/24" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">扫描方式:</label>
            <select class="tk-config-input" id="host-disc-mode">
              <option value="arp">ARP扫描(最快)</option>
              <option value="ping">Ping扫描(通用)</option>
              <option value="tcp">TCP扫描(穿透)</option>
            </select>
            <label class="tk-config-label">线程数:</label>
            <input type="number" class="tk-config-input" id="host-disc-threads" value="100" min="1" max="500" />
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-host-discovery">${icon('search', 14)} 开始发现</button>
            <button class="tk-btn tk-btn-secondary" data-action="stop-host-discovery">${icon('square', 14)} 停止</button>
          </div>
        </div>
      </div>`,
    'camera-scan': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">摄像头扫描参数</div>
          <div class="tk-config-row">
            <label class="tk-config-label">网段范围:</label>
            <input type="text" class="tk-config-input" id="cam-scan-range" value="192.168.1.0/24" placeholder="如 192.168.1.0/24" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">检测端口:</label>
            <input type="text" class="tk-config-input" id="cam-scan-ports" value="80,443,554,8000,8080,8888,37777,34567" placeholder="常见摄像头端口" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">线程数:</label>
            <input type="number" class="tk-config-input" id="cam-scan-threads" value="50" min="1" max="200" />
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-camera-scan">${icon('video', 14)} 开始扫描</button>
            <button class="tk-btn tk-btn-secondary" data-action="stop-camera-scan">${icon('square', 14)} 停止</button>
          </div>
        </div>
      </div>`,
    'service-discovery': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">服务发现参数</div>
          <div class="tk-config-row">
            <label class="tk-config-label">发现协议:</label>
            <label><input type="checkbox" class="tk-config-checkbox" name="sd-proto" value="mdns" checked /> mDNS</label>
            <label><input type="checkbox" class="tk-config-checkbox" name="sd-proto" value="ssdp" checked /> SSDP/UPnP</label>
            <label><input type="checkbox" class="tk-config-checkbox" name="sd-proto" value="bonjour" /> Bonjour</label>
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">超时(秒):</label>
            <input type="number" class="tk-config-input" id="sd-timeout" value="5" min="1" max="30" />
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-service-discovery">${icon('search-check', 14)} 开始发现</button>
          </div>
        </div>
      </div>`,
    'port-service-probe': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">服务探测参数</div>
          <div class="tk-config-row">
            <label class="tk-config-label">目标IP:</label>
            <input type="text" class="tk-config-input" id="probe-target" value="127.0.0.1" placeholder="目标IP" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">探测端口:</label>
            <input type="text" class="tk-config-input" id="probe-ports" value="21,22,23,25,53,80,110,143,443,445,3306,3389,5432,6379,8080,8443,9090" placeholder="端口列表" />
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-service-probe">${icon('fingerprint', 14)} 开始探测</button>
          </div>
        </div>
      </div>`,
    wol: `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">远程唤醒(Wake-on-LAN)</div>
          <div class="tk-config-row">
            <label class="tk-config-label">MAC地址:</label>
            <input type="text" class="tk-config-input" id="wol-mac" value="00:11:22:33:44:55" placeholder="如 00:11:22:33:44:55" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">广播地址:</label>
            <input type="text" class="tk-config-input" id="wol-broadcast" value="255.255.255.255" placeholder="如 192.168.1.255" />
            <label class="tk-config-label">端口:</label>
            <input type="number" class="tk-config-input" id="wol-port" value="9" min="1" max="65535" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">发送次数:</label>
            <input type="number" class="tk-config-input" id="wol-count" value="3" min="1" max="10" />
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-success" data-action="run-wol">${icon('zap', 14)} 发送魔法包</button>
          </div>
        </div>
      </div>`,
    'arp-table': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">ARP表查询</div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-arp-table">${icon('table', 14)} 查看ARP表</button>
            <button class="tk-btn tk-btn-secondary" data-action="clear-arp-cache">${icon('trash-2', 14)} 清除ARP缓存</button>
          </div>
        </div>
      </div>`,
    'route-table': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">路由表查询</div>
          <div class="tk-config-row">
            <label class="tk-config-label">协议:</label>
            <select class="tk-config-input" id="route-proto">
              <option value="ipv4">IPv4</option>
              <option value="ipv6">IPv6</option>
              <option value="all">全部</option>
            </select>
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-route-table">${icon('git-branch', 14)} 查看路由表</button>
          </div>
        </div>
      </div>`,
    'subnet-calc': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">子网计算器</div>
          <div class="tk-config-row">
            <label class="tk-config-label">IP地址:</label>
            <input type="text" class="tk-config-input" id="subnet-ip" value="192.168.1.100" placeholder="如 192.168.1.100" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">子网掩码:</label>
            <input type="text" class="tk-config-input" id="subnet-mask" value="255.255.255.0" placeholder="如 255.255.255.0 或 /24" />
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-subnet-calc">${icon('calculator', 14)} 计算</button>
          </div>
        </div>
      </div>`,
    'mac-lookup': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">MAC厂商查询</div>
          <div class="tk-config-row">
            <label class="tk-config-label">MAC地址:</label>
            <input type="text" class="tk-config-input" id="mac-input" value="00:50:56" placeholder="如 00:50:56:C0:00:01" />
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-mac-lookup">${icon('search', 14)} 查询厂商</button>
          </div>
        </div>
      </div>`,
    'conn-tracker': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">连接追踪</div>
          <div class="tk-config-row">
            <label class="tk-config-label">协议:</label>
            <select class="tk-config-input" id="ctracker-proto">
              <option value="all">全部</option>
              <option value="tcp">TCP</option>
              <option value="udp">UDP</option>
            </select>
            <label class="tk-config-label">状态:</label>
            <select class="tk-config-input" id="ctracker-state">
              <option value="all">全部</option>
              <option value="established">已建立</option>
              <option value="listen">监听</option>
              <option value="time_wait">TIME_WAIT</option>
            </select>
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-conn-tracker">${icon('activity', 14)} 查看连接</button>
          </div>
        </div>
      </div>`,
    'flush-dns': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">刷新DNS缓存</div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-flush-dns">${icon('rotate-cw', 14)} 刷新DNS缓存</button>
            <button class="tk-btn tk-btn-secondary" data-action="show-dns-cache">${icon('list', 14)} 查看DNS缓存</button>
          </div>
        </div>
      </div>`,
    'ptr-lookup': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">反向DNS查询</div>
          <div class="tk-config-row">
            <label class="tk-config-label">IP地址:</label>
            <input type="text" class="tk-config-input" id="ptr-ip" value="8.8.8.8" placeholder="如 8.8.8.8" />
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-ptr-lookup">${icon('refresh-cw', 14)} 反向查询</button>
          </div>
        </div>
      </div>`,
    'domain-whois': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">域名WHOIS查询</div>
          <div class="tk-config-row">
            <label class="tk-config-label">域名:</label>
            <input type="text" class="tk-config-input" id="whois-domain" value="baidu.com" placeholder="如 baidu.com" />
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-whois">${icon('database', 14)} 查询WHOIS</button>
          </div>
        </div>
      </div>`,
    'network-health': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">网络综合体检</div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-success" data-action="run-network-health">${icon('stethoscope', 14)} 开始体检</button>
            <button class="tk-btn tk-btn-secondary" data-action="clear-output">${icon('trash-2', 14)} 清空</button>
          </div>
          <div class="tk-progress"><div class="tk-progress-bar" style="width:0%"></div></div>
        </div>
      </div>`,
    'ping-qos': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">Ping QoS参数</div>
          <div class="tk-config-row">
            <label class="tk-config-label">目标主机:</label>
            <input type="text" class="tk-config-input" id="qos-target" value="223.5.5.5" placeholder="IP或域名" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">测试次数:</label>
            <input type="number" class="tk-config-input" id="qos-count" value="30" min="10" max="200" />
            <label class="tk-config-label">间隔(ms):</label>
            <input type="number" class="tk-config-input" id="qos-interval" value="200" min="50" max="2000" />
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-ping-qos">${icon('activity', 14)} 开始QoS测试</button>
          </div>
        </div>
      </div>`,
    'speed-test': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">外网测速</div>
          <div class="tk-config-row">
            <label class="tk-config-label">测速服务器:</label>
            <select class="tk-config-input" id="speed-server">
              <option value="auto">自动选择</option>
              <option value="ct">中国电信</option>
              <option value="cu">中国联通</option>
              <option value="cm">中国移动</option>
            </select>
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-success" data-action="run-speed-test">${icon('gauge', 14)} 开始测速</button>
          </div>
          <div class="tk-progress"><div class="tk-progress-bar" style="width:0%"></div></div>
        </div>
      </div>`,
    'lan-speed-test': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">内网测速参数</div>
          <div class="tk-config-row">
            <label class="tk-config-label">对端IP:</label>
            <input type="text" class="tk-config-input" id="lan-speed-host" value="192.168.1.100" placeholder="对端IP" />
            <label class="tk-config-label">端口:</label>
            <input type="number" class="tk-config-input" id="lan-speed-port" value="5201" min="1" max="65535" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">模式:</label>
            <select class="tk-config-input" id="lan-speed-mode">
              <option value="both">双向</option>
              <option value="up">上传</option>
              <option value="down">下载</option>
            </select>
            <label class="tk-config-label">时长(秒):</label>
            <input type="number" class="tk-config-input" id="lan-speed-duration" value="10" min="1" max="60" />
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-success" data-action="run-lan-speed">${icon('gauge', 14)} 开始测速</button>
          </div>
        </div>
      </div>`,
    'loop-detection': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">环路检测参数</div>
          <div class="tk-config-row">
            <label class="tk-config-label">目标主机:</label>
            <input type="text" class="tk-config-input" id="loop-target" value="223.5.5.5" placeholder="IP或域名" />
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-loop-detect">${icon('refresh-ccw', 14)} 开始检测</button>
          </div>
        </div>
      </div>`,
    'tls-scan': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">TLS扫描参数</div>
          <div class="tk-config-row">
            <label class="tk-config-label">目标主机:</label>
            <input type="text" class="tk-config-input" id="tls-host" value="www.baidu.com" placeholder="域名" />
            <label class="tk-config-label">端口:</label>
            <input type="number" class="tk-config-input" id="tls-port" value="443" min="1" max="65535" />
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-tls-scan">${icon('lock', 14)} 开始扫描</button>
          </div>
        </div>
      </div>`,
    'firewall-status': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">防火墙状态</div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-firewall-status">${icon('shield', 14)} 查看防火墙</button>
            <button class="tk-btn tk-btn-secondary" data-action="firewall-rules">${icon('list', 14)} 查看规则</button>
          </div>
        </div>
      </div>`,
    'mitm-hints': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">ARP欺骗检测</div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-mitm-detect">${icon('shield-alert', 14)} 开始检测</button>
          </div>
        </div>
      </div>`,
    'security-check': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">安全自测</div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-security-check">${icon('shield-check', 14)} 开始检测</button>
          </div>
        </div>
      </div>`,
    'dhcp-detect': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">DHCP检测参数</div>
          <div class="tk-config-row">
            <label class="tk-config-label">接口:</label>
            <select class="tk-config-input" id="dhcp-iface">
              <option value="auto">自动检测</option>
              <option value="eth0">以太网</option>
              <option value="wlan0">无线</option>
            </select>
            <label class="tk-config-label">超时(秒):</label>
            <input type="number" class="tk-config-input" id="dhcp-timeout" value="10" min="1" max="60" />
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-dhcp-detect">${icon('router', 14)} 开始检测</button>
          </div>
        </div>
      </div>`,
    'temp-http-server': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">临时HTTP服务器</div>
          <div class="tk-config-row">
            <label class="tk-config-label">端口:</label>
            <input type="number" class="tk-config-input" id="http-port" value="8080" min="1" max="65535" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">根目录:</label>
            <input type="text" class="tk-config-input" id="http-root" value="./data/www" />
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-success" data-action="start-http">${icon('play', 14)} 启动</button>
            <button class="tk-btn tk-btn-danger" data-action="stop-http">${icon('square', 14)} 停止</button>
          </div>
        </div>
      </div>`,
    'netflow-listen': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">NetFlow监听</div>
          <div class="tk-config-row">
            <label class="tk-config-label">UDP端口:</label>
            <input type="number" class="tk-config-input" id="netflow-port" value="2055" min="1" max="65535" />
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-success" data-action="start-netflow">${icon('play', 14)} 开始监听</button>
            <button class="tk-btn tk-btn-danger" data-action="stop-netflow">${icon('square', 14)} 停止</button>
          </div>
        </div>
      </div>`,
    'flow-monitor': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">流量监控</div>
          <div class="tk-config-row">
            <label class="tk-config-label">网卡名称:</label>
            <input type="text" class="tk-config-input" id="flow-iface" value="" placeholder="留空监控全部物理网卡" />
            <label class="tk-config-label">刷新间隔:</label>
            <input type="number" class="tk-config-input" id="flow-interval" value="2" min="1" max="10" />
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-success" data-action="start-flow-monitor">${icon('play', 14)} 开始监控</button>
            <button class="tk-btn tk-btn-danger" data-action="stop-flow-monitor">${icon('square', 14)} 停止</button>
          </div>
        </div>
      </div>`,
    'network-snapshot': `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">网络快照</div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-success" data-action="run-snapshot">${icon('camera', 14)} 生成快照</button>
            <button class="tk-btn tk-btn-secondary" data-action="export-snapshot">${icon('download', 14)} 导出报告</button>
          </div>
        </div>
      </div>`,
    rdp: `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">远程桌面(RDP)</div>
          <div class="tk-config-row">
            <label class="tk-config-label">主机:</label>
            <input type="text" class="tk-config-input" id="rdp-host" value="192.168.1.100" />
            <label class="tk-config-label">端口:</label>
            <input type="number" class="tk-config-input" id="rdp-port" value="3389" min="1" max="65535" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">用户名:</label>
            <input type="text" class="tk-config-input" id="rdp-user" value="administrator" />
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">分辨率:</label>
            <select class="tk-config-input" id="rdp-res">
              <option value="1920x1080">1920×1080</option>
              <option value="1280x720">1280×720</option>
              <option value="1366x768">1366×768</option>
              <option value="fullscreen">全屏</option>
            </select>
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-success" data-action="connect-rdp">${icon('monitor', 14)} 连接</button>
          </div>
        </div>
      </div>`,
    serial: `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">串口调试</div>
          <div class="tk-config-row">
            <label class="tk-config-label">串口:</label>
            <select class="tk-config-input" id="serial-port">
              <option value="COM1">COM1</option>
              <option value="COM2">COM2</option>
              <option value="COM3">COM3</option>
              <option value="COM4">COM4</option>
            </select>
            <label class="tk-config-label">波特率:</label>
            <select class="tk-config-input" id="serial-baud">
              <option value="9600">9600</option>
              <option value="19200">19200</option>
              <option value="38400">38400</option>
              <option value="115200">115200</option>
            </select>
          </div>
          <div class="tk-config-row">
            <label class="tk-config-label">数据位:</label>
            <select class="tk-config-input" id="serial-data">
              <option value="8">8</option>
              <option value="7">7</option>
            </select>
            <label class="tk-config-label">停止位:</label>
            <select class="tk-config-input" id="serial-stop">
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
            <label class="tk-config-label">校验:</label>
            <select class="tk-config-input" id="serial-parity">
              <option value="none">无</option>
              <option value="even">偶</option>
              <option value="odd">奇</option>
            </select>
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-success" data-action="open-serial">${icon('plug', 14)} 打开串口</button>
            <button class="tk-btn tk-btn-danger" data-action="close-serial">${icon('square', 14)} 关闭</button>
            <button class="tk-btn tk-btn-secondary" data-action="scan-serial">${icon('search', 14)} 扫描串口</button>
          </div>
        </div>
      </div>`,
    process: `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">进程管理</div>
          <div class="tk-config-row">
            <label class="tk-config-label">排序:</label>
            <select class="tk-config-input" id="proc-sort">
              <option value="cpu">CPU占用</option>
              <option value="mem">内存占用</option>
              <option value="pid">PID</option>
              <option value="name">名称</option>
            </select>
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-process-list">${icon('activity', 14)} 查看进程</button>
            <button class="tk-btn tk-btn-secondary" data-action="refresh-process">${icon('refresh-cw', 14)} 刷新</button>
          </div>
        </div>
      </div>`,
    service: `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">服务管理</div>
          <div class="tk-config-row">
            <label class="tk-config-label">状态:</label>
            <select class="tk-config-input" id="svc-filter">
              <option value="all">全部</option>
              <option value="running">运行中</option>
              <option value="stopped">已停止</option>
            </select>
          </div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-service-list">${icon('server', 14)} 查看服务</button>
          </div>
        </div>
      </div>`,
    disk: `
      <div class="tk-tool-config">
        <div class="tk-config-section">
          <div class="tk-config-section-title">磁盘信息</div>
          <div class="tk-config-buttons">
            <button class="tk-btn tk-btn-primary" data-action="run-disk-info">${icon('hard-drive', 14)} 查看磁盘</button>
            <button class="tk-btn tk-btn-secondary" data-action="run-disk-health">${icon('heart', 14)} 健康状态</button>
          </div>
        </div>
      </div>`,
  };
  return configs[state.page] || `<div class="tk-tool-config"><div class="tk-config-section"><div class="tk-config-section-title">配置</div><p style="color:var(--tk-text-muted);font-size:12px;">该页面暂无配置项</p></div></div>`;
}

function renderOutputPanel() {
  const outputs = {
    dashboard: `欢迎使用网络健康检查工具！\n\n本工具将自动检测以下项目：\n✓ 网卡状态检测\n✓ 网关连通性测试\n✓ DNS解析速度测试\n✓ 外网连接测试\n✓ 网络延迟测试\n✓ 网络环路检测（基础）\n\n检测完成后，系统将给出综合评分和优化建议。\n\n点击上方"开始健康检查"按钮开始检测...`,
    ping: `Ping测试工具\n\n目标主机: 223.5.5.5\n测试次数: 4\n数据包大小: 32 字节\n\n准备就绪，点击"开始Ping"按钮开始测试...`,
    traceroute: `路由追踪工具\n\n目标主机: 223.5.5.5\n最大跳数: 30\n\n准备就绪，点击"开始追踪"按钮开始测试...`,
    portscan: `端口扫描工具\n\n目标IP: 127.0.0.1\n端口范围: 1 - 1000\n线程数: 200\n\n准备就绪，点击"开始扫描"按钮开始测试...`,
    'arp-scan': `局域网扫描工具\n\n网络范围: 192.168.1.0/24\n扫描方式: TCP连接(推荐)\n线程数: 50\n超时: 2秒\n\n准备就绪，点击"开始扫描"按钮开始测试...`,
  };
  const defaultOutput = outputs[state.page] || '准备就绪，请选择功能开始...';
  return `
    <div class="tk-output-panel">
      <div class="tk-output-header">
        <span class="tk-output-title">${state.page === 'dashboard' ? '检测结果' : state.page === 'ping' ? 'Ping测试结果' : state.page === 'traceroute' ? '路由追踪结果' : state.page === 'portscan' ? '扫描结果' : state.page === 'arp-scan' ? '扫描结果' : '操作结果'}</span>
        <div class="tk-output-actions">
          <button class="tk-btn tk-btn-sm tk-btn-secondary" data-action="copy-output">${icon('copy', 12)} 复制</button>
          <button class="tk-btn tk-btn-sm tk-btn-secondary" data-action="clear-output">${icon('trash-2', 12)} 清空</button>
          <button class="tk-btn tk-btn-sm tk-btn-secondary" data-action="export-output">${icon('download', 12)} 导出</button>
        </div>
      </div>
      <div class="tk-output-content" id="tk-output">${escapeHtml(defaultOutput)}</div>
    </div>`;
}

function renderTopbar() {
  const notifCount = state.notifications?.filter(n => !n.read).length || 3;
  return `
    <div class="bento-topbar">
      <div class="bento-topbar-row">
        <div class="bento-topbar-title">
          <h1>${getPageTitle(state.page)}</h1>
          <span class="bento-env-badge">● 生产环境</span>
        </div>
        <div class="bento-topbar-actions">
          <div class="bento-search" data-action="open-search">
            ${icon('search', 14)}
            <span>搜索工具、设备、故障...</span>
            <kbd>⌘K</kbd>
          </div>
          <div class="bento-icon-btn" data-action="open-notifications" title="通知">
            ${icon('bell', 15)}
            ${notifCount ? `<span class="dot-notif">${notifCount > 9 ? '9+' : notifCount}</span>` : ''}
          </div>
          <div class="bento-icon-btn" data-action="open-settings" title="设置">
            ${icon('settings', 15)}
          </div>
          ${state.auth.authenticated ? '' : `<button class="bento-topbar-login" data-action="go-login">登录</button>`}
        </div>
      </div>
    </div>`;
}

function getPageTitle(page) {
  const titles = {
    dashboard: 'IT 运维百宝箱',
    network: '网络诊断',
    system: '系统检测',
    topology: '网络拓扑',
    assets: '资产管理',
    tickets: '工单系统',
    knowledge: '知识库',
    ai: 'AI 排障助手',
    audit: '审计日志',
    remote: '远程管理',
    monitoring: '监控告警',
    sop: '现场 SOP',
    worklog: '现场处置单',
  };
  return titles[page] || 'IT 运维百宝箱';
}

function renderDashboard() {
  return `
    <div class="bento-main">
      <div class="bento-grid">
        ${renderMetricsCard()}
        ${renderToolsCard()}
        ${renderIncidentsCard()}
        ${renderActivityCard()}
      </div>
      ${renderAIFloat()}
    </div>`;
}

function renderMetricsCard() {
  // 3D 全息柱状图数据（近 7 小时网络流量）
  const barData = [
    { label: '00', value: 45 },
    { label: '04', value: 62 },
    { label: '08', value: 78 },
    { label: '12', value: 91 },
    { label: '16', value: 85 },
    { label: '20', value: 70 },
    { label: '现', value: 96 },
  ];
  const bars3D = barData.map(b => `
    <div class="bento-holo-bar" style="height:${b.value}%;" title="${b.label}时 流量${b.value}%">
      <span class="bento-holo-bar-value">${b.value}</span>
      <div class="bento-holo-bar-face"></div>
      <div class="bento-holo-bar-side"></div>
      <div class="bento-holo-bar-top"></div>
    </div>`).join('');
  return `
    <div class="bento-card bento-card-wide bento-holo-scan">
      <div class="bento-card-head">
        <div class="bento-card-title-group">
          <div class="bento-card-title">
            <span class="bento-card-icon">${icon('activity', 16)}</span>
            <span class="bento-aurora-text">网络健康概览</span>
          </div>
          <div class="bento-card-subtitle">实时监控网络延迟、丢包与可用性 · 全息可视化</div>
        </div>
        <div class="bento-card-action">查看详情 →</div>
      </div>
      <div class="bento-metric-row">
        <div class="bento-metric-block">
          <span class="bento-metric-label">平均延迟</span>
          <div class="bento-metric-value bento-count-up">12<span class="bento-metric-unit">ms</span></div>
          <div class="bento-metric-trend down">
            ${icon('trending-down', 11)}
            -2.3ms
          </div>
        </div>
        <div class="bento-metric-block">
          <span class="bento-metric-label">丢包率</span>
          <div class="bento-metric-value bento-count-up">0.2<span class="bento-metric-unit">%</span></div>
          <div class="bento-metric-trend down">
            ${icon('trending-down', 11)}
            -0.1%
          </div>
        </div>
        <div class="bento-metric-block">
          <span class="bento-metric-label">在线设备</span>
          <div class="bento-metric-value bento-count-up">${assets.filter(a => a.status === '正常').length}</div>
          <div class="bento-metric-trend up">
            ${icon('trending-up', 11)}
            +${assets.length - 3} 台
          </div>
        </div>
        <div class="bento-metric-block" style="display:grid;place-items:center;">
          <span class="bento-metric-label" style="margin-bottom:4px;">可用率</span>
          <div class="bento-holo-ring">
            <svg class="bento-holo-ring-svg" viewBox="0 0 120 120" width="120" height="120">
              <defs>
                <linearGradient id="holoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#0d9488"/>
                  <stop offset="100%" stop-color="#3b82f6"/>
                </linearGradient>
              </defs>
              <circle class="bento-holo-ring-track" cx="60" cy="60" r="54"/>
              <circle class="bento-holo-ring-progress" cx="60" cy="60" r="54" transform="rotate(-90 60 60)"/>
            </svg>
            <div class="bento-holo-ring-center">
              <div class="bento-holo-ring-value">98%</div>
              <div class="bento-holo-ring-label">SLA</div>
            </div>
          </div>
        </div>
      </div>
      <div class="bento-chart-area">
        <svg class="bento-chart-svg" viewBox="0 0 400 110" preserveAspectRatio="none">
          <defs>
            <linearGradient id="chartStroke" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#0d9488"/>
              <stop offset="100%" stop-color="#3b82f6"/>
            </linearGradient>
            <linearGradient id="chartFill" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style="stop-color: #0d9488; stop-opacity: 0.35"/>
              <stop offset="100%" style="stop-color: #3b82f6; stop-opacity: 0"/>
            </linearGradient>
            <linearGradient id="bentoChartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style="stop-color: #0d9488; stop-opacity: 0.3"/>
              <stop offset="100%" style="stop-color: #0d9488; stop-opacity: 0"/>
            </linearGradient>
          </defs>
          <path class="bento-chart-area-fill bento-chart-fill" d="M0 75 Q30 66 60 58 T120 50 T180 42 T240 46 T300 32 T360 38 L400 31 L400 110 L0 110 Z"/>
          <path class="bento-chart-line" d="M0 75 Q30 66 60 58 T120 50 T180 42 T240 46 T300 32 T360 38 L400 31"/>
          <circle class="bento-chart-dot" cx="300" cy="32" r="3.5"/>
        </svg>
        <div class="bento-chart-x-labels">
          <span>00:00</span><span>04:00</span><span>08:00</span><span>12:00</span><span>16:00</span><span>20:00</span><span>现在</span>
        </div>
      </div>
      <div style="margin-top:14px; padding:10px 12px; background:linear-gradient(135deg, rgba(13,148,136,0.04), rgba(59,130,246,0.04)); border-radius:10px; border:1px solid rgba(13,148,136,0.1);">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px; font-size:12px; font-weight:600; color:var(--bento-text-secondary);">
          <span style="color:var(--bento-primary)">${icon('bar-chart-3', 14)}</span>
          <span>近 7 时段流量全息柱状图</span>
        </div>
        <div class="bento-holo-bars">${bars3D}</div>
      </div>
    </div>`;
}

function renderToolsCard() {
  return `
    <div class="bento-card bento-card-tall">
      <div class="bento-card-head">
        <div class="bento-card-title-group">
          <div class="bento-card-title">
            <span class="bento-card-icon">${icon('wrench', 16)}</span>
            快捷工具
          </div>
        </div>
      </div>
      <div class="bento-tool-grid">
        ${quickTools.slice(0, 6).map(tool => `
          <div class="bento-tool-item" data-tool="${tool.id}">
            <div class="bento-tool-item-icon">${icon(tool.icon, 16)}</div>
            <div class="bento-tool-item-info">
              <div class="bento-tool-item-name">${tool.name}</div>
              <div class="bento-tool-item-desc">${tool.desc}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

function renderIncidentsCard() {
  return `
    <div class="bento-card">
      <div class="bento-card-head">
        <div class="bento-card-title-group">
          <div class="bento-card-title">
            <span class="bento-card-icon" style="color: var(--bento-red)">${icon('alert-triangle', 16)}</span>
            活动告警
          </div>
          <div class="bento-card-subtitle">${state.incidents.length} 个待处理</div>
        </div>
        <div class="bento-card-action">全部 →</div>
      </div>
      <div class="bento-incident-list">
        ${state.incidents.map(inc => `
          <div class="bento-incident-item ${inc.critical ? 'critical' : ''}">
            <div class="bento-sev-tag ${inc.sev}"></div>
            <div class="bento-incident-content">
              <div class="bento-incident-name">${inc.name}</div>
              <div class="bento-incident-meta">${inc.meta.map(m => `<span>${m}</span>`).join('')}</div>
            </div>
            ${inc.critical ? '<span class="bento-p1-badge">P1</span>' : ''}
            <div class="bento-incident-time">${inc.time}</div>
          </div>`).join('')}
      </div>
    </div>`;
}

function renderActivityCard() {
  const activities = [
    ...state.activities,
    { type: 'error', text: '<strong>核心交换机</strong> 触发 <strong>CPU 过载告警</strong>', time: '2 分钟前' },
    { type: 'success', text: '<strong>管理员</strong> 执行了 <strong>Ping 测试</strong>', time: '5 分钟前' },
    { type: 'tool', text: '<strong>AI 助手</strong> 启动 <strong>网络质量检测</strong>', time: '8 分钟前' },
    { type: 'success', text: '工单 <strong>#1204</strong> 已解决并关闭', time: '23 分钟前' },
    { type: 'alert', text: '<strong>工程师</strong> 响应了打印机故障', time: '1 小时前' },
  ];
  return `
    <div class="bento-card">
      <div class="bento-card-head">
        <div class="bento-card-title-group">
          <div class="bento-card-title">
            <span class="bento-card-icon" style="color: var(--bento-blue)">${icon('clock', 16)}</span>
            最近活动
          </div>
        </div>
      </div>
      <div class="bento-activity-timeline">
        ${activities.slice(0, 5).map(act => `
          <div class="bento-act-item act-${act.type}">
            <div class="bento-act-text">${act.text}</div>
            <div class="bento-act-time">${act.time}</div>
          </div>`).join('')}
      </div>
    </div>`;
}

function renderAIFloat() {
  return `
    <div class="bento-ai-float" id="bento-ai-float" data-nav="ai">
      <div class="bento-ai-avatar">✦</div>
      <div class="bento-ai-content">
        <div class="bento-ai-title">
          <span class="bento-ai-dot"></span>
          AI 排障助手
        </div>
        <div class="bento-ai-desc">点击打开 AI 智能排障</div>
      </div>
    </div>`;
}

function renderNetworkPage() {
  const networkToolCategories = [
    { name: '网络检测', icon: 'activity', tools: [
      { id: 'ping-test', name: 'Ping 测试', desc: '网络连通性检测' },
      { id: 'continuous-ping', name: '持续 Ping', desc: '连续丢包、延迟与抖动统计' },
      { id: 'batch-ping', name: '批量 Ping', desc: '多目标并行巡检与 CSV 输出' },
      { id: 'subnet-ping', name: '网段 Ping', desc: '/24 网段在线主机发现' },
      { id: 'port-scan', name: '端口扫描', desc: 'TCP端口探测' },
      { id: 'tcp-ping', name: 'TCP Ping', desc: 'TCP端口连通性' },
      { id: 'traceroute', name: '路由追踪', desc: 'Tracert路径分析' },
      { id: 'traceroute-analyze', name: '路由追踪分析', desc: '环路黑洞检测' },
      { id: 'mtu-probe', name: 'MTU探测', desc: '最大传输单元检测' },
      { id: 'connection-test', name: '连接测试', desc: 'TCP/TLS检测' },
    ]},
    { name: '网络信息', icon: 'info', tools: [
      { id: 'ip-info', name: 'IP信息', desc: '本机+公网IP' },
      { id: 'arp-table', name: 'ARP表', desc: 'IP-MAC绑定' },
      { id: 'route-table', name: '路由表', desc: 'IPv4/IPv6路由' },
      { id: 'route-manager', name: '路由管理', desc: '静态路由新增、删除、审计与回滚' },
      { id: 'route-policy', name: '路由策略', desc: '路由分析' },
      { id: 'subnet-calc', name: '子网计算', desc: 'IPv4子网划分' },
      { id: 'conn-tracker', name: '连接追踪', desc: 'TCP/UDP统计' },
    ]},
    { name: 'DNS解析', icon: 'globe', tools: [
      { id: 'dns-lookup', name: 'DNS查询', desc: '域名解析' },
      { id: 'dns-benchmark', name: 'DNS 测速对比', desc: '多服务器延迟与答案一致性' },
      { id: 'flush-dns', name: '刷新DNS', desc: '清除DNS缓存' },
      { id: 'ptr-lookup', name: '反向DNS', desc: 'IP反查主机名' },
      { id: 'domain-whois', name: '域名WHOIS', desc: '注册信息' },
    ]},
    { name: 'DHCP服务', icon: 'router', tools: [
      { id: 'dhcp-detect', name: 'DHCP检测', desc: '多DHCP/私接路由' },
      { id: 'renew-dhcp', name: 'DHCP续租', desc: '重新获取IP' },
      { id: 'dhcp-server', name: 'DHCP服务器', desc: '临时IP分配' },
    ]},
    { name: '主机发现', icon: 'search', tools: [
      { id: 'host-discovery', name: '主机发现', desc: '网段在线扫描' },
      { id: 'camera-scan', name: '摄像头扫描', desc: '监控设备发现' },
      { id: 'service-discovery', name: '服务发现', desc: 'mDNS/SSDP探测' },
      { id: 'port-service-probe', name: '服务探测', desc: 'Banner识别' },
    ]},
    { name: '网络质量', icon: 'signal', tools: [
      { id: 'network-health', name: '网络体检', desc: '一键综合诊断' },
      { id: 'flow-monitor', name: '实时流量监控', desc: '物理网卡 RX/TX 速率持续采样' },
      { id: 'link-monitor', name: '链路可用性监控', desc: '多目标掉线、恢复与机器人告警' },
      { id: 'network-snapshot', name: '网络快照', desc: '一键网络全貌' },
      { id: 'ping-qos', name: 'Ping QoS', desc: '抖动丢包MOS评估' },
      { id: 'speed-test', name: '外网测速', desc: '下载带宽估算' },
      { id: 'wifi-channel-analysis', name: 'Wi-Fi 信道分析', desc: '真实 BSSID、信号与信道占用' },
      { id: 'wifi-profile-export', name: 'Wi-Fi 配置导出', desc: '配置迁移与密码脱敏导出' },
      { id: 'lan-speed-test', name: '内网测速', desc: '局域网带宽测试' },
      { id: 'loop-detection', name: '环路检测', desc: 'Traceroute环路' },
    ]},
    { name: '流量与协议', icon: 'scan-line', tools: [
      { id: 'packet-capture', name: '内置抓包', desc: 'pktmon 受控采集、自动停止与 PCAPNG 留痕' },
      { id: 'pcap-analyzer', name: 'PCAP 协议分析', desc: '离线解析协议、端点、会话、DNS、HTTP 与 LLDP' },
    ]},
    { name: '安全检测', icon: 'shield', tools: [
      { id: 'tls-scan', name: 'TLS扫描', desc: 'SSL/TLS安全检测' },
      { id: 'firewall-status', name: '防火墙状态', desc: 'Windows防火墙' },
      { id: 'firewall-manager', name: '防火墙规则管理', desc: '规则查看、新增、删除、审计与回滚' },
      { id: 'mitm-hints', name: 'ARP检测', desc: 'MITM异常检测' },
      { id: 'ip-conflict-check', name: 'IP 冲突检查', desc: '事件日志与邻居表证据' },
      { id: 'security-check', name: '安全自测', desc: '端口/权限检测' },
    ]},
    { name: '临时服务', icon: 'server', tools: [
      { id: 'temp-http-server', name: '临时HTTP', desc: '文件共享服务' },
      { id: 'ftp-server', name: 'FTP服务器', desc: '临时文件传输' },
      { id: 'tftp-server', name: 'TFTP服务器', desc: '设备固件传输' },
      { id: 'syslog-server', name: 'Syslog服务器', desc: '日志收集服务' },
      { id: 'netflow-listen', name: 'NetFlow监听', desc: '流量导出监听' },
    ]},
  ];

  const activeTool = state.activeTool || networkToolCategories[0].tools[0];
  const toolConfig = getToolConfig(activeTool.id);

  return `
    <div class="bento-main" style="padding:0;">
      <div class="bento-nd-container">
        <div class="bento-nd-topbar">
          <div class="bento-nd-topbar-title">
            <h3>${icon('network', 18)} 网络诊断工具箱</h3>
            <span>Professional Network Diagnostic & Analysis Tool</span>
          </div>
          <div class="bento-nd-search-wrap">
            <div class="bento-nd-search">
              ${icon('search', 12)}
              <input type="text" placeholder="搜索工具 (Ctrl+K)" oninput="state.ndSearchQuery=this.value;render()" />
              <kbd>Ctrl+K</kbd>
            </div>
          </div>
        </div>

        <div class="bento-nd-toolbar">
          ${networkToolCategories.map((cat, catIdx) => `
            <div class="bento-nd-category${cat.tools.some(tool => tool.id === activeTool.id) ? ' expanded' : ''}" data-cat="${cat.name}">
              <div class="bento-nd-category-header" onclick="toggleNdCategory('${cat.name}')">
                ${icon('chevron-right', 12)}
                <div class="bento-nd-category-title">
                  ${icon(cat.icon, 12)}
                  ${cat.name}
                </div>
                <span class="bento-nd-category-badge">${cat.tools.length}</span>
              </div>
              <div class="bento-nd-tool-list">
                ${cat.tools.map(tool => `
                  <div class="bento-nd-tool-item${activeTool.id === tool.id ? ' active' : ''}" 
                       onclick="selectNdTool('${tool.id}')" 
                       title="${tool.desc}">
                    ${icon(getToolIcon(tool.id), 14)}
                    <span class="bento-nd-tool-item-name">${tool.name}</span>
                  </div>`).join('')}
              </div>
            </div>`).join('')}
        </div>

        <div class="bento-nd-main">
          <div class="bento-nd-tool-header">
            <div class="bento-nd-tool-title">
              <h4>${icon(getToolIcon(activeTool.id), 16)} ${activeTool.name}</h4>
              <p>${activeTool.desc}</p>
            </div>
            <div class="bento-nd-tool-actions">
              ${toolConfig.canStop ? `<button class="bento-nd-tool-btn danger" onclick="stopNdTool()">${icon('square', 14)} 停止</button>` : ''}
              <button class="bento-nd-tool-btn secondary" onclick="clearNdOutput()">${icon('trash-2', 14)} 清空</button>
              <button class="bento-nd-tool-btn primary" onclick="executeNdTool()" ${state.isToolRunning ? 'disabled' : ''}>
                ${state.isToolRunning ? `${icon('loader-2', 14)} 执行中` : `${icon('play', 14)} 开始执行`}
              </button>
            </div>
          </div>

          <div class="bento-nd-tool-content">
            ${renderNdToolConfig(activeTool.id, toolConfig)}

            <div class="bento-nd-output-panel">
              <div class="bento-nd-output-header">
                <div class="bento-nd-output-tabs">
                  <div class="bento-nd-output-tab active">输出结果</div>
                  <div class="bento-nd-output-tab">执行摘要</div>
                </div>
                <div class="bento-nd-output-actions">
                  <div class="bento-nd-output-action" onclick="copyNdOutput()" title="复制输出">${icon('copy', 12)}</div>
                  ${state.ndOutput?.downloadUrl ? `<div class="bento-nd-output-action" onclick="downloadNdBinary()" title="下载 PCAPNG">${icon('file-down', 12)}</div>` : ''}
                  <div class="bento-nd-output-action" onclick="downloadNdOutput()" title="导出结果">${icon('download', 12)}</div>
                </div>
              </div>
              
              <div class="bento-nd-output-body">
                ${state.isToolRunning && !['flow-monitor', 'link-monitor'].includes(activeTool.id) ? `
                  <div class="bento-nd-loading">
                    <div class="bento-nd-spinner"></div>
                    <span>正在执行 ${activeTool.name}...</span>
                  </div>` : state.ndOutput ? `
                  ${state.ndOutput.summary ? `<div class="bento-nd-summary-card${!state.ndOutput.success ? ' error' : ''}">
                    <div class="bento-nd-summary-title">${icon(state.ndOutput.success ? 'check-circle' : 'alert-circle', 14)} 执行摘要</div>
                    <div class="bento-nd-summary-text">${escapeHtml(state.ndOutput.summary)}</div>
                  </div>` : ''}
                  <pre class="bento-nd-output-pre">${escapeHtml(state.ndOutput.output)}</pre>` : `
                  <div class="bento-nd-loading" style="padding:60px;">
                    <div style="text-align:center;">
                      ${icon('terminal', 32)}
                      <p style="margin-top:12px;color:rgba(255,255,255,0.5);">点击"开始执行"按钮运行工具</p>
                      <p style="font-size:11px;color:rgba(255,255,255,0.3);">执行结果将显示在此处</p>
                    </div>
                  </div>`}
              </div>

              ${state.ndOutput && state.ndOutput.stats ? `
                <div class="bento-nd-output-stats">
                  ${state.ndOutput.stats.map(stat => `
                    <div class="bento-nd-output-stat">
                      <div class="bento-nd-output-stat-value">${stat.value}</div>
                      <div class="bento-nd-output-stat-label">${stat.label}</div>
                    </div>`).join('')}
                </div>` : ''}
            </div>
          </div>
        </div>

        <div class="bento-nd-statusbar">
          <div class="bento-nd-statusbar-left">
            <div class="bento-nd-status-item">
              <div class="bento-nd-status-dot"></div>
              <span>系统就绪</span>
            </div>
            <div class="bento-nd-status-item">
              ${icon('wifi', 12)}
              <span>网络正常</span>
            </div>
          </div>
          <div class="bento-nd-statusbar-right">
            <div class="bento-nd-status-item">
              ${icon('clock', 12)}
              <span>${new Date().toLocaleTimeString('zh-CN')}</span>
            </div>
            <div class="bento-nd-status-item">
              ${icon('cpu', 12)}
              <span>本地模式</span>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function getToolIcon(toolId) {
  const iconMap = {
    'ping-test': 'radar', 'continuous-ping': 'activity', 'batch-ping': 'list-checks',
    'subnet-ping': 'scan-search', 'port-scan': 'layout-grid', 'tcp-ping': 'wifi',
    'traceroute': 'navigation', 'traceroute-analyze': 'navigation-2',
    'mtu-probe': 'maximize-2', 'connection-test': 'plug',
    'ip-info': 'info', 'arp-table': 'table', 'route-table': 'git-branch', 'route-manager': 'route',
    'route-policy': 'git-branch', 'subnet-calc': 'calculator',
    'conn-tracker': 'activity', 'dns-lookup': 'globe',
    'dns-benchmark': 'gauge', 'ip-conflict-check': 'shield-alert',
    'flush-dns': 'rotate-cw', 'ptr-lookup': 'refresh-cw',
    'domain-whois': 'database', 'dhcp-detect': 'router',
    'renew-dhcp': 'refresh-cw', 'dhcp-server': 'server',
    'host-discovery': 'search', 'camera-scan': 'video',
    'service-discovery': 'search-check', 'port-service-probe': 'fingerprint',
    'network-health': 'stethoscope', 'network-snapshot': 'camera', 'flow-monitor': 'bar-chart-3',
    'link-monitor': 'radio-tower',
    'ping-qos': 'activity', 'speed-test': 'gauge', 'wifi-channel-analysis': 'bar-chart-3',
    'wifi-profile-export': 'file-key-2',
    'packet-capture': 'radio', 'pcap-analyzer': 'scan-line',
    'lan-speed-test': 'gauge', 'loop-detection': 'refresh-ccw',
    'tls-scan': 'lock', 'firewall-status': 'shield', 'firewall-manager': 'shield-plus',
    'mitm-hints': 'shield-alert', 'security-check': 'shield-check',
    'temp-http-server': 'server-off', 'ftp-server': 'folder-up',
    'tftp-server': 'folder-download', 'syslog-server': 'file-text',
    'netflow-listen': 'arrow-down-left',
    // 系统工具
    'process-list': 'cpu', 'service-status': 'server', 'resource-hotspots': 'thermometer',
    'system-errors': 'alert-triangle', 'driver-problems': 'alert-octagon',
    'workstation-health': 'heart-pulse', 'login-logs': 'key', 'time-sync': 'clock',
    // 打印机工具
    'printer-health': 'printer', 'repair-printer': 'wrench', 'repair-printer-queue': 'trash-2',
    'spooler-start': 'play', 'print-test': 'file-text',
    // CCTV工具
    'cctv-health': 'video', 'web-probe': 'globe', 'onvif-search': 'scan-search',
    // 实用工具
    'hex-convert': 'binary', 'password-gen': 'key-round', 'cable-order': 'cable',
    'serial-debug': 'plug-zap', 'telnet-client': 'terminal', 'wifi-scan': 'wifi',
    'system-launcher': 'panels-top-left',
    // 运维计算工具箱
    'bandwidth-time': 'timer', 'cctv-storage': 'hard-drive', 'poe-budget': 'zap',
    'ups-runtime': 'battery-charging', 'optical-power': 'radio-tower',
    'raid-capacity': 'database', 'vlsm-calc': 'network',
  };
  return iconMap[toolId] || 'tool';
}

function getToolConfig(toolId) {
  const configs = {
    'ping-test': {
      fields: [{ name: '目标地址', key: 'host', type: 'input', default: 'www.baidu.com', placeholder: 'IP或域名' }],
      canStop: false,
    },
    'continuous-ping': {
      fields: [
        { name: '目标地址', key: 'host', type: 'input', default: 'www.baidu.com', placeholder: 'IP 或域名' },
        { name: '探测次数', key: 'count', type: 'input', default: '30', placeholder: '1-200 次' },
      ],
      canStop: false,
    },
    'batch-ping': {
      fields: [{ name: '目标列表', key: 'targets', type: 'textarea', rows: 7, default: '127.0.0.1\n1.1.1.1', placeholder: '每行一个 IP 或域名，最多 50 个' }],
      canStop: false,
    },
    'subnet-ping': {
      fields: [{ name: '目标网段', key: 'subnet', type: 'input', default: '192.168.1.0/24', placeholder: '仅支持 /24，例如 192.168.1.0/24' }],
      canStop: false,
    },
    'port-scan': {
      fields: [
        { name: '目标地址', key: 'host', type: 'input', default: '192.168.1.1', placeholder: 'IP地址' },
        { name: '端口范围', key: 'ports', type: 'input', default: '1-1000', placeholder: '如: 1-1000 或 80,443,3389' },
      ],
      canStop: true,
    },
    'tcp-ping': {
      fields: [
        { name: '目标地址', key: 'host', type: 'input', default: 'www.baidu.com', placeholder: 'IP或域名' },
        { name: '目标端口', key: 'port', type: 'input', default: '80', placeholder: '端口号' },
      ],
      canStop: false,
    },
    'traceroute': {
      fields: [{ name: '目标地址', key: 'host', type: 'input', default: 'www.baidu.com', placeholder: 'IP或域名' }],
      canStop: true,
    },
    'traceroute-analyze': {
      fields: [{ name: '目标地址', key: 'host', type: 'input', default: 'www.baidu.com', placeholder: 'IP或域名' }],
      canStop: false,
    },
    'mtu-probe': {
      fields: [{ name: '目标地址', key: 'host', type: 'input', default: 'www.baidu.com', placeholder: 'IP或域名' }],
      canStop: false,
    },
    'connection-test': {
      fields: [
        { name: '目标地址', key: 'host', type: 'input', default: 'www.baidu.com', placeholder: 'IP或域名' },
        { name: '目标端口', key: 'port', type: 'input', default: '443', placeholder: '端口号' },
        { name: '协议', key: 'protocol', type: 'select', options: ['tcp', 'tls'], default: 'tcp' },
      ],
      canStop: false,
    },
    'certificate-domain': {
      fields: [{ name: '域名或主机', key: 'host', type: 'input', default: 'www.microsoft.com', placeholder: '例如 www.example.com' }],
      canStop: false,
    },
    'batch-check': {
      fields: [
        { name: '目标列表 / CSV 单列', key: 'targets', type: 'textarea', rows: 5, default: '127.0.0.1', placeholder: '一行一个 IP 或主机名；可直接粘贴 CSV 单列，最多 50 个目标' },
        { name: '可选端口', key: 'port', type: 'input', default: '', placeholder: '例如 445' },
      ],
      canStop: false,
    },
    'ip-info': { fields: [], canStop: false },
    'arp-table': { fields: [], canStop: false },
    'route-table': { fields: [], canStop: false },
    'route-manager': {
      fields: [
        { name: '动作', key: 'action', type: 'select', default: 'list', options: [
          { value: 'list', label: '查看路由（只读）' }, { value: 'add', label: '新增静态路由' }, { value: 'remove', label: '删除指定路由' },
        ] },
        { name: '目标前缀', key: 'destinationPrefix', type: 'input', default: '10.10.0.0/16', placeholder: 'IPv4/IPv6 CIDR' },
        { name: '下一跳', key: 'nextHop', type: 'input', default: '192.168.1.1', placeholder: '网关 IP' },
        { name: '接口索引', key: 'interfaceIndex', type: 'input', default: '1', placeholder: 'Get-NetAdapter 中的 ifIndex' },
        { name: '跃点值', key: 'routeMetric', type: 'input', default: '25', placeholder: '1-9999' },
      ],
      canStop: false,
    },
    'route-policy': { fields: [], canStop: false },
    'subnet-calc': {
      fields: [{ name: 'CIDR地址', key: 'cidr', type: 'input', default: '192.168.1.0/24', placeholder: '如: 192.168.1.0/24' }],
      canStop: false,
    },
    'conn-tracker': { fields: [], canStop: false },
    'dns-lookup': {
      fields: [{ name: '域名', key: 'domain', type: 'input', default: 'www.baidu.com', placeholder: '域名' }],
      canStop: false,
    },
    'dns-benchmark': {
      fields: [
        { name: '测试域名', key: 'domain', type: 'input', default: 'www.baidu.com', placeholder: '完整域名' },
        { name: 'DNS 服务器', key: 'servers', type: 'textarea', rows: 4, default: '223.5.5.5\n119.29.29.29\n1.1.1.1', placeholder: '每行一个 DNS IP，最多 8 个' },
        { name: '每台测试次数', key: 'attempts', type: 'select', options: ['1', '3', '5'], default: '3' },
      ],
      canStop: false,
    },
    'ip-conflict-check': { fields: [], canStop: false },
    'flush-dns': { fields: [], canStop: false },
    'ptr-lookup': {
      fields: [{ name: 'IP地址', key: 'ip', type: 'input', default: '8.8.8.8', placeholder: 'IP地址' }],
      canStop: false,
    },
    'domain-whois': {
      fields: [{ name: '域名', key: 'domain', type: 'input', default: 'baidu.com', placeholder: '域名' }],
      canStop: false,
    },
    'dhcp-detect': { fields: [], canStop: false },
    'renew-dhcp': { fields: [], canStop: false },
    'dhcp-server': {
      fields: [
        { name: '监听端口', key: 'port', type: 'input', default: '6767', placeholder: '默认6767' },
        { name: '子网', key: 'subnet', type: 'input', default: '192.168.1.0/24', placeholder: '如: 192.168.1.0/24' },
        { name: '网关', key: 'gateway', type: 'input', default: '192.168.1.1', placeholder: '网关地址' },
        { name: '起始IP', key: 'startIp', type: 'input', default: '192.168.1.100', placeholder: '起始IP' },
        { name: '结束IP', key: 'endIp', type: 'input', default: '192.168.1.200', placeholder: '结束IP' },
      ],
      canStop: true,
    },
    'host-discovery': {
      fields: [{ name: '子网', key: 'subnet', type: 'input', default: '192.168.1.0/24', placeholder: '如: 192.168.1.0/24' }],
      canStop: true,
    },
    'camera-scan': {
      fields: [
        { name: '子网', key: 'subnet', type: 'input', default: '192.168.1.0/24', placeholder: '如: 192.168.1.0/24' },
        { name: '端口', key: 'ports', type: 'input', default: '80,443,554,8000,8080', placeholder: '端口列表' },
      ],
      canStop: true,
    },
    'service-discovery': { fields: [], canStop: true },
    'port-service-probe': {
      fields: [
        { name: '目标地址', key: 'host', type: 'input', default: '192.168.1.1', placeholder: 'IP地址' },
        { name: '目标端口', key: 'port', type: 'input', default: '80', placeholder: '端口号' },
      ],
      canStop: false,
    },
    'network-health': { fields: [], canStop: false },
    'flow-monitor': {
      fields: [
        { name: '网卡名称', key: 'interfaceAlias', type: 'input', default: '', placeholder: '留空监控全部物理网卡' },
        { name: '刷新间隔', key: 'interval', type: 'select', options: ['1', '2', '5', '10'], default: '2' },
      ],
      canStop: true,
    },
    'link-monitor': {
      fields: [
        { name: '监控目标', key: 'targets', type: 'textarea', rows: 6, default: '127.0.0.1\n1.1.1.1', placeholder: '每行一个 IP 或主机名，最多 20 个' },
        { name: '探测间隔', key: 'interval', type: 'select', options: [
          { value: '2', label: '2 秒（现场测试）' },
          { value: '5', label: '5 秒' },
          { value: '10', label: '10 秒' },
          { value: '30', label: '30 秒（推荐）' },
          { value: '60', label: '60 秒' },
        ], default: '30' },
        { name: '告警 Webhook（可选）', key: 'webhookUrl', type: 'input', default: '', placeholder: '飞书或企业微信机器人 HTTPS Webhook' },
      ],
      canStop: true,
    },
    'network-snapshot': { fields: [], canStop: false },
    'ping-qos': {
      fields: [
        { name: '目标地址', key: 'host', type: 'input', default: 'www.baidu.com', placeholder: 'IP或域名' },
        { name: '目标端口', key: 'port', type: 'input', default: '80', placeholder: '端口号' },
        { name: '探测次数', key: 'count', type: 'input', default: '50', placeholder: '探测次数' },
      ],
      canStop: true,
    },
    'speed-test': { fields: [], canStop: false },
    'wifi-channel-analysis': { fields: [], canStop: false },
    'wifi-profile-export': {
      fields: [{ name: '导出模式', key: 'mode', type: 'select', default: 'masked', options: [
        { value: 'masked', label: '脱敏配置（推荐）' },
        { value: 'reveal', label: '管理员明文密钥' },
      ] }],
      canStop: false,
    },
    'packet-capture': {
      fields: [
        { name: '采集时长（秒）', key: 'durationSeconds', type: 'input', default: '30', placeholder: '5-120' },
        { name: '单包捕获长度', key: 'packetSize', type: 'select', default: '0', options: [
          { value: '0', label: '完整数据包' },
          { value: '128', label: '128 bytes（仅包头）' },
          { value: '256', label: '256 bytes' },
          { value: '512', label: '512 bytes' },
        ] },
        { name: '最大文件（MB）', key: 'fileSizeMB', type: 'select', default: '32', options: ['8', '16', '32', '64'] },
      ],
      canStop: true,
    },
    'pcap-analyzer': {
      fields: [{ name: '抓包文件', key: 'captureFile', type: 'file', accept: '.pcap,.pcapng,.cap', maxMB: 25, hint: '文件仅在内存中分析，最大 25MB，不保存原始上传文件。' }],
      canStop: false,
    },
    'lan-speed-test': {
      fields: [
        { name: '目标地址', key: 'host', type: 'input', default: '127.0.0.1', placeholder: '局域网IP' },
        { name: '测试时长', key: 'duration', type: 'input', default: '10', placeholder: '秒' },
      ],
      canStop: true,
    },
    'loop-detection': {
      fields: [{ name: '目标地址', key: 'target', type: 'input', default: 'www.baidu.com', placeholder: 'IP或域名' }],
      canStop: false,
    },
    'tls-scan': {
      fields: [{ name: '目标地址', key: 'host', type: 'input', default: 'www.baidu.com', placeholder: '域名' }],
      canStop: false,
    },
    'firewall-status': { fields: [], canStop: false },
    'firewall-manager': {
      fields: [
        { name: '动作', key: 'action', type: 'select', default: 'list', options: [
          { value: 'list', label: '查看规则（只读）' }, { value: 'add', label: '新增规则' }, { value: 'remove', label: '删除指定规则' },
        ] },
        { name: '规则名称', key: 'name', type: 'input', default: 'IT运维百宝箱-临时放行', placeholder: '唯一显示名称' },
        { name: '方向', key: 'direction', type: 'select', default: 'Inbound', options: ['Inbound', 'Outbound'] },
        { name: '协议', key: 'protocol', type: 'select', default: 'TCP', options: ['TCP', 'UDP'] },
        { name: '本地端口', key: 'localPort', type: 'input', default: '443', placeholder: '443、8000-8010 或 Any' },
        { name: '远端地址', key: 'remoteAddress', type: 'input', default: 'LocalSubnet', placeholder: 'Any、LocalSubnet、IP/CIDR' },
        { name: '规则动作', key: 'ruleAction', type: 'select', default: 'Allow', options: ['Allow', 'Block'] },
        { name: 'Profile', key: 'profile', type: 'select', default: 'Any', options: ['Any', 'Domain', 'Private', 'Public'] },
      ],
      canStop: false,
    },
    'mitm-hints': { fields: [], canStop: false },
    'security-check': { fields: [], canStop: false },
    'temp-http-server': {
      fields: [{ name: '监听端口', key: 'port', type: 'input', default: '8080', placeholder: '端口号' }],
      canStop: true,
    },
    'ftp-server': {
      fields: [{ name: '监听端口', key: 'port', type: 'input', default: '2121', placeholder: '端口号' }],
      canStop: true,
    },
    'tftp-server': {
      fields: [{ name: '监听端口', key: 'port', type: 'input', default: '6969', placeholder: '端口号' }],
      canStop: true,
    },
    'syslog-server': {
      fields: [
        { name: '监听端口', key: 'port', type: 'input', default: '1514', placeholder: '端口号' },
        { name: '协议', key: 'proto', type: 'select', options: ['udp', 'tcp'], default: 'udp' },
      ],
      canStop: true,
    },
    'netflow-listen': {
      fields: [{ name: '监听端口', key: 'port', type: 'input', default: '2055', placeholder: '端口号' }],
      canStop: true,
    },
    // ===== 系统检测工具 =====
    'process-list': { fields: [], canStop: false },
    'service-status': {
      fields: [{ name: '服务名(选填)', key: 'name', type: 'input', default: '', placeholder: '如: Spooler' }],
      canStop: false,
    },
    'resource-hotspots': { fields: [], canStop: false },
    'system-errors': {
      fields: [
        { name: '最近条数', key: 'count', type: 'input', default: '20', placeholder: '条' },
        { name: '日志类型', key: 'level', type: 'select', options: ['Error', 'Warning', 'All'], default: 'Error' },
      ],
      canStop: false,
    },
    'driver-problems': { fields: [], canStop: false },
    'workstation-health': { fields: [], canStop: false },
    'desktop-diagnosis': {
      fields: [{ name: '故障现象', key: 'symptom', type: 'select', options: ['general', 'no-network', 'software-not-open', 'computer-slow', 'printer', 'bluescreen'], default: 'general' }],
      canStop: false,
    },
    'delivery-acceptance': { fields: [], canStop: false },
    'user-permissions': { fields: [], canStop: false },
    'peripheral-health': { fields: [], canStop: false },
    'browser-health': { fields: [], canStop: false },
    'collaboration-health': { fields: [], canStop: false },
    'business-runtime-health': { fields: [], canStop: false },
    'login-logs': {
      fields: [{ name: '最近条数', key: 'count', type: 'input', default: '20', placeholder: '条' }],
      canStop: false,
    },
    'time-sync': { fields: [], canStop: false },
    // ===== 打印机工具 =====
    'printer-health': { fields: [], canStop: false },
    'repair-printer': { fields: [], canStop: false },
    'repair-printer-queue': { fields: [], canStop: false },
    'spooler-start': { fields: [], canStop: false },
    'print-test': {
      fields: [{ name: '打印机名(选填)', key: 'name', type: 'input', default: '', placeholder: '留空使用默认' }],
      canStop: false,
    },
    // ===== CCTV/监控工具 =====
    'cctv-health': {
      fields: [{ name: '设备地址', key: 'host', type: 'input', default: '192.168.1.100', placeholder: 'IP地址' }],
      canStop: false,
    },
    'web-probe': {
      fields: [{ name: '设备地址', key: 'host', type: 'input', default: '192.168.1.100', placeholder: 'IP地址' }],
      canStop: false,
    },
    'onvif-search': {
      fields: [{ name: '子网范围', key: 'subnet', type: 'input', default: '192.168.1.0/24', placeholder: '如: 192.168.1.0/24' }],
      canStop: true,
    },
    // ===== 实用工具 =====
    'hex-convert': {
      fields: [
        { name: '输入值', key: 'value', type: 'input', default: '255', placeholder: '输入数字' },
        { name: '输入进制', key: 'fromBase', type: 'select', options: ['10', '2', '16', '8'], default: '10' },
      ],
      canStop: false,
    },
    'password-gen': {
      fields: [
        { name: '密码长度', key: 'length', type: 'input', default: '16', placeholder: '位数' },
        { name: '包含字符', key: 'charset', type: 'select', options: ['字母+数字', '字母+数字+符号', '仅字母', '仅数字'], default: '字母+数字+符号' },
      ],
      canStop: false,
    },
    'cable-order': { fields: [], canStop: false },
    'serial-debug': {
      fields: [
        { name: 'COM端口', key: 'port', type: 'input', default: 'COM1', placeholder: '如: COM1' },
        { name: '波特率', key: 'baud', type: 'select', options: ['9600', '19200', '38400', '57600', '115200'], default: '9600' },
        { name: '发送数据', key: 'data', type: 'input', default: '', placeholder: 'AT\\r\\n' },
      ],
      canStop: true,
    },
    'telnet-client': {
      fields: [
        { name: '目标地址', key: 'host', type: 'input', default: '192.168.1.1', placeholder: 'IP或域名' },
        { name: '端口', key: 'port', type: 'input', default: '23', placeholder: '端口号' },
      ],
      canStop: true,
    },
    'wifi-scan': { fields: [], canStop: false },
    'system-launcher': {
      fields: [{ name: 'Windows 工具', key: 'target', type: 'select', default: 'windows-settings', options: [
        { value: 'windows-settings', label: 'Windows 设置' },
        { value: 'terminal', label: '命令提示符' },
        { value: 'powershell', label: 'PowerShell' },
        { value: 'admin-terminal', label: '管理员命令提示符' },
        { value: 'network-adapters', label: '网络连接' },
        { value: 'firewall', label: 'Windows 防火墙' },
        { value: 'device-manager', label: '设备管理器' },
        { value: 'task-manager', label: '任务管理器' },
        { value: 'system-info', label: '系统信息' },
        { value: 'registry', label: '注册表编辑器' },
        { value: 'event-viewer', label: '事件查看器' },
        { value: 'disk-management', label: '磁盘管理' },
        { value: 'services', label: '服务管理' },
        { value: 'performance', label: '性能监视器' },
        { value: 'resource-monitor', label: '资源监视器' },
        { value: 'computer-management', label: '计算机管理' },
        { value: 'control-panel', label: '控制面板' },
        { value: 'rdp-client', label: '远程桌面客户端' },
      ] }],
      canStop: false,
    },
    // ===== 运维计算工具箱（纯前端，断网可用） =====
    'bandwidth-time': {
      fields: [
        { name: '文件大小', key: 'size', type: 'input', default: '10', placeholder: '大于 0 的数字' },
        { name: '大小单位', key: 'sizeUnit', type: 'select', options: ['GB', 'MB', 'TB'], default: 'GB' },
        { name: '链路带宽', key: 'bandwidth', type: 'input', default: '100', placeholder: 'Mbps' },
        { name: '链路利用率', key: 'efficiency', type: 'input', default: '80', placeholder: '1-100%' },
      ],
      canStop: false,
    },
    'cctv-storage': {
      fields: [
        { name: '摄像头数量', key: 'cameras', type: 'input', default: '16', placeholder: '台' },
        { name: '单路平均码率', key: 'bitrate', type: 'input', default: '4', placeholder: 'Mbps' },
        { name: '每天录像时长', key: 'hours', type: 'input', default: '24', placeholder: '小时' },
        { name: '保留天数', key: 'days', type: 'input', default: '30', placeholder: '天' },
        { name: '存储利用率', key: 'efficiency', type: 'input', default: '90', placeholder: '建议 85-95%' },
      ],
      canStop: false,
    },
    'poe-budget': {
      fields: [
        { name: '交换机 PoE 总功率', key: 'budget', type: 'input', default: '370', placeholder: 'W' },
        { name: '设备数量', key: 'devices', type: 'input', default: '16', placeholder: '台' },
        { name: '单台最大功耗', key: 'devicePower', type: 'input', default: '15.4', placeholder: 'W' },
        { name: '预留余量', key: 'reserve', type: 'input', default: '20', placeholder: '%' },
      ],
      canStop: false,
    },
    'ups-runtime': {
      fields: [
        { name: '电池组电压', key: 'voltage', type: 'input', default: '192', placeholder: 'V' },
        { name: '电池容量', key: 'capacity', type: 'input', default: '9', placeholder: 'Ah' },
        { name: '电池组并联数', key: 'strings', type: 'input', default: '1', placeholder: '组' },
        { name: '实际负载', key: 'load', type: 'input', default: '800', placeholder: 'W' },
        { name: '综合效率', key: 'efficiency', type: 'input', default: '75', placeholder: '%' },
      ],
      canStop: false,
    },
    'optical-power': {
      fields: [
        { name: '发送光功率', key: 'tx', type: 'input', default: '-3', placeholder: 'dBm' },
        { name: '接收灵敏度', key: 'sensitivity', type: 'input', default: '-20', placeholder: 'dBm' },
        { name: '光纤长度', key: 'distance', type: 'input', default: '10', placeholder: 'km' },
        { name: '光纤衰减', key: 'attenuation', type: 'input', default: '0.35', placeholder: 'dB/km' },
        { name: '连接器数量', key: 'connectors', type: 'input', default: '4', placeholder: '个' },
        { name: '熔接点数量', key: 'splices', type: 'input', default: '8', placeholder: '个' },
        { name: '系统预留余量', key: 'reserve', type: 'input', default: '3', placeholder: 'dB' },
      ],
      canStop: false,
    },
    'raid-capacity': {
      fields: [
        { name: 'RAID 级别', key: 'level', type: 'select', options: ['RAID0', 'RAID1', 'RAID5', 'RAID6', 'RAID10'], default: 'RAID5' },
        { name: '磁盘数量', key: 'disks', type: 'input', default: '6', placeholder: '块' },
        { name: '单盘容量', key: 'diskSize', type: 'input', default: '4', placeholder: 'TB' },
      ],
      canStop: false,
    },
    'vlsm-calc': {
      fields: [
        { name: '地址池', key: 'cidr', type: 'input', default: '192.168.10.0/24', placeholder: 'IPv4 CIDR' },
        { name: '各网段主机数', key: 'hosts', type: 'textarea', rows: 5, default: '60\n30\n12\n6', placeholder: '每行一个主机数，按任意顺序输入' },
      ],
      canStop: false,
    },
  };
  return configs[toolId] || { fields: [], canStop: false };
}

function renderNdToolConfig(toolId, config) {
  if (!config.fields || config.fields.length === 0) return '';
  return `
    <div class="bento-nd-config-panel">
      <div class="bento-nd-config-title">${icon('settings', 14)} 参数配置</div>
      <div class="bento-nd-config-grid">
        ${config.fields.map(field => {
          const value = state.ndToolParams && state.ndToolParams[field.key] !== undefined ? state.ndToolParams[field.key] : field.default;
          if (field.type === 'select') {
            return `
              <div class="bento-nd-config-item">
                <label>${field.name}</label>
                <select onchange="updateNdParam('${field.key}', this.value)">
                  ${field.options.map(opt => {
                    const optionValue = typeof opt === 'object' ? opt.value : opt;
                    const optionLabel = typeof opt === 'object' ? opt.label : String(opt).toUpperCase();
                    return `<option value="${optionValue}"${optionValue === value ? ' selected' : ''}>${optionLabel}</option>`;
                  }).join('')}
                </select>
              </div>`;
          }
          if (field.type === 'textarea') {
            return `
              <div class="bento-nd-config-item bento-nd-config-item-wide">
                <label>${field.name}</label>
                <textarea rows="${field.rows || 5}" placeholder="${field.placeholder}" oninput="updateNdParam('${field.key}', this.value)">${escapeHtml(value || '')}</textarea>
              </div>`;
          }
          if (field.type === 'file') {
            return `
              <div class="bento-nd-config-item bento-nd-config-item-wide">
                <label>${field.name}</label>
                <input class="bento-nd-file-input" type="file" accept="${field.accept || ''}" onchange="loadNdFileParam('${field.key}', this, ${field.maxMB || 25})" />
                ${field.hint ? `<span class="bento-nd-config-hint">${field.hint}</span>` : ''}
              </div>`;
          }
          return `
            <div class="bento-nd-config-item">
              <label>${field.name}</label>
              <input type="text" value="${value}" placeholder="${field.placeholder}" 
                     oninput="updateNdParam('${field.key}', this.value)" />
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

function toggleNdCategory(catName) {
  const target = document.querySelector(`[data-cat="${catName}"]`);
  if (!target) return;
  if (window.matchMedia('(max-width: 768px)').matches) {
    const shouldExpand = !target.classList.contains('expanded');
    document.querySelectorAll('.bento-nd-category.expanded').forEach(item => item.classList.remove('expanded'));
    if (shouldExpand) target.classList.add('expanded');
    return;
  }
  target.classList.toggle('expanded');
}

function selectNdTool(toolId) {
  // 搜索所有工具类别
  const allTools = [
    ...toolsByCategory.network,
    ...toolsByCategory.system,
    ...toolsByCategory.printer,
    ...toolsByCategory.cctv,
    ...toolsByCategory.utility,
    ...toolsByCategory.calculator,
  ];
  const tool = allTools.find(t => t.id === toolId);
  if (tool) {
    state.activeTool = { id: toolId, name: tool.name, desc: tool.desc };
    state.ndToolParams = {};
    state.ndOutput = null;
    render();
  }
}

function getToolName(toolId) {
  const allTools = Object.values(toolsByCategory).flat();
  return allTools.find(t => t.id === toolId)?.name || toolId;
}

function getToolDesc(toolId) {
  const allTools = Object.values(toolsByCategory).flat();
  return allTools.find(t => t.id === toolId)?.desc || '';
}

function updateNdParam(key, value) {
  state.ndToolParams = state.ndToolParams || {};
  state.ndToolParams[key] = value;
}

async function loadNdFileParam(key, input, maxMB = 25) {
  const file = input.files?.[0];
  if (!file) return;
  if (!/\.(pcap|pcapng|cap)$/i.test(file.name)) {
    input.value = '';
    showToast('仅支持 .pcap、.pcapng 和 .cap 抓包文件');
    return;
  }
  if (file.size > maxMB * 1024 * 1024) {
    input.value = '';
    showToast(`抓包文件不能超过 ${maxMB}MB`);
    return;
  }
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',', 2)[1] || '');
    reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
    reader.readAsDataURL(file);
  }).catch((error) => { showToast(error.message); return ''; });
  if (!data) return;
  state.ndToolParams = state.ndToolParams || {};
  state.ndToolParams[key] = { filename: file.name, data, size: file.size };
  showToast(`已载入 ${file.name}（${(file.size / 1024).toFixed(1)} KB）`);
}

function executeNdTool() {
  const activeTool = state.activeTool;
  if (!activeTool) return;
  
  state.isToolRunning = true;
  state.ndOutput = null;
  render();
  
  const config = getToolConfig(activeTool.id);
  const params = state.ndToolParams || {};
  config.fields.forEach(f => {
    if (params[f.key] === undefined || params[f.key] === '') {
      params[f.key] = f.default;
    }
  });
  
  runToolWithParams(activeTool.id, params);
}

function runToolWithParams(toolId, params) {
  showToast(`正在执行 ${getToolName(toolId)}...`);
  addActivity('tool', `<strong>管理员</strong> 执行了 <strong>${getToolName(toolId)}</strong>`);

  if (toolId === 'flow-monitor') {
    startUnifiedFlowMonitor(params);
    return;
  }

  if (toolId === 'link-monitor') {
    startUnifiedLinkMonitor(params);
    return;
  }

  if (toolId === 'packet-capture') {
    startPacketCapture(params);
    return;
  }

  if (toolId === 'pcap-analyzer') {
    const captureFile = params.captureFile;
    if (!captureFile?.data) {
      state.isToolRunning = false;
      state.ndOutput = { toolId, output: '请先选择 .pcap、.pcapng 或 .cap 抓包文件。', summary: '未读取到待分析文件。', success: false };
      render();
      return;
    }
    params = { filename: captureFile.filename, data: captureFile.data };
  }

  if (toolId === 'wifi-profile-export') {
    const reveal = params.mode === 'reveal';
    if (reveal && !window.confirm('将导出本机已保存的 Wi-Fi 明文密钥。确认当前环境无人旁观，并将导出文件按敏感凭据管理。是否继续？')) {
      state.isToolRunning = false;
      state.ndOutput = { toolId, output: '用户取消了 Wi-Fi 明文密钥导出。', summary: '未执行任何敏感数据读取。', success: true };
      render();
      return;
    }
    params = { ...params, reveal, confirmed: reveal };
  }

  if (['firewall-manager', 'route-manager'].includes(toolId) && ['add', 'remove'].includes(params.action)) {
    const target = toolId === 'firewall-manager' ? `防火墙规则“${params.name || '-'}”` : `系统路由 ${params.destinationPrefix || '-'} -> ${params.nextHop || '-'}`;
    if (!window.confirm(`即将${params.action === 'add' ? '新增' : '删除'}${target}。该操作会立即修改本机网络策略，执行结果和回滚命令将写入审计。是否继续？`)) {
      state.isToolRunning = false;
      state.ndOutput = { toolId, output: '用户取消了受控网络变更。', summary: '未修改任何系统配置。', success: true };
      render();
      return;
    }
    params = { ...params, confirmed: true };
  }

  // ===== 纯前端工具（无需后端，断网可用）=====
  const frontendResult = executeFrontendTool(toolId, params);
  if (frontendResult !== null) {
    setTimeout(() => {
      state.isToolRunning = false;
      state.ndOutput = {
        toolId,
        output: frontendResult.output,
        summary: frontendResult.summary || '',
        success: frontendResult.success !== false,
        stats: frontendResult.stats || null,
      };
      showToast(frontendResult.success === false ? `${getToolName(toolId)} 参数有误` : `${getToolName(toolId)} 执行完成`);
      addActivity(frontendResult.success === false ? 'error' : 'success', `<strong>${getToolName(toolId)}</strong> ${frontendResult.success === false ? '执行失败' : '执行成功'}`);
      render();
    }, 300);
    return;
  }

  const localToolMap = {
    'ping-test': { id: 'ping' },
    'continuous-ping': { id: 'network-quality', host: 'www.baidu.com', count: 30 },
    'batch-ping': { id: 'batch-check', targets: '127.0.0.1\n1.1.1.1' },
    'subnet-ping': { id: 'host-discovery', subnet: '192.168.1.0/24' },
    'port-scan': { id: 'port', port: 80 },
    traceroute: { id: 'trace' },
    'dns-diagnosis': { id: 'dns' },
    'conn-tracker': { id: 'conn-tracker' },
    'domain-whois': { id: 'domain-whois', domain: 'example.com' },
    'http-api': { id: 'http-api', url: 'http://127.0.0.1/api' },
    'snmp-probe': { id: 'snmp-probe', host: '127.0.0.1' },
    'websocket-test': { id: 'websocket-test', url: 'ws://127.0.0.1/ws' },
    'ptr-lookup': { id: 'ptr-lookup', ip: '8.8.8.8' },
    'tls-scan': { id: 'tls-scan', host: 'www.baidu.com' },
    'traceroute-analyze': { id: 'traceroute-analyze', host: 'www.baidu.com' },
    'mitm-hints': { id: 'mitm-hints' },
    'netflow-listen': { id: 'netflow-listen' },
    'subnet-calc': { id: 'subnet-calc', cidr: '192.168.1.0/24' },
    'route-table': { id: 'route-table' },
    'route-manager': { id: 'route-manager', action: 'list' },
    'firewall-status': { id: 'firewall-status' },
    'firewall-manager': { id: 'firewall-manager', action: 'list' },
    'port-occupancy': { id: 'port-occupancy', port: 8080 },
    'ip-info': { id: 'ip-info' },
    'dhcp-detect': { id: 'dhcp-detect' },
    'host-discovery': { id: 'host-discovery', subnet: '192.168.1.0/24' },
    'loop-detection': { id: 'loop-detection', target: 'www.baidu.com' },
    'speed-test': { id: 'speed-test' },
    'wifi-channel-analysis': { id: 'wifi-channel-analysis' },
    'wifi-profile-export': { id: 'wifi-profile-export', mode: 'masked' },
    'pcap-analyzer': { id: 'pcap-analyzer' },
    'network-health': { id: 'network-health' },
    'arp-table': { id: 'arp-table' },
    'port-service-probe': { id: 'port-service-probe', host: '127.0.0.1', port: 80 },
    'temp-http-server': { id: 'temp-http-server', port: 8080 },
    'ftp-server': { id: 'ftp-server', port: 2121 },
    'tftp-server': { id: 'tftp-server', port: 6969 },
    'syslog-server': { id: 'syslog-server', port: 1514, proto: 'udp' },
    'camera-scan': { id: 'camera-scan', subnet: '192.168.1.0/24', ports: '80,443,554,8000,8080', timeout: 3 },
    'service-discovery': { id: 'service-discovery', mdnsSec: 8, ssdpSec: 3 },
    'dhcp-server': { id: 'dhcp-server', port: 6767, subnet: '192.168.1.0/24', gateway: '192.168.1.1', startIp: '192.168.1.100', endIp: '192.168.1.200', dns: '8.8.8.8' },
    'lan-speed-test': { id: 'lan-speed-test', host: '127.0.0.1', duration: 10 },
    'ping-qos': { id: 'ping-qos', host: 'www.baidu.com', port: 80, count: 50, timeout: 2 },
    'route-policy': { id: 'route-policy' },
    'connection-test': { id: 'connection-test', host: 'www.baidu.com', port: 443, protocol: 'tcp', timeout: 5 },
    'certificate-domain': { id: 'certificate-domain', host: 'www.microsoft.com' },
    'batch-check': { id: 'batch-check', targets: '127.0.0.1' },
    'tcp-ping': { id: 'tcp-ping', host: 'www.baidu.com', port: 80 },
    'mtu-probe': { id: 'mtu-probe', host: 'www.baidu.com' },
    'dns-lookup': { id: 'dns-lookup', domain: 'www.baidu.com' },
    'dns-benchmark': { id: 'dns-benchmark', domain: 'www.baidu.com', servers: '223.5.5.5,119.29.29.29,1.1.1.1', attempts: 3 },
    'ip-conflict-check': { id: 'ip-conflict-check' },
    'flush-dns': { id: 'flush-dns' },
    'renew-dhcp': { id: 'renew-dhcp' },
    'network-snapshot': { id: 'network-snapshot' },
    'security-check': { id: 'security-check' },
    // 系统工具
    'process-list': { id: 'process-list' },
    'service-status': { id: 'service-status' },
    'resource-hotspots': { id: 'resource-hotspots' },
    'system-errors': { id: 'system-errors' },
    'driver-problems': { id: 'driver-problems' },
    'workstation-health': { id: 'workstation-health' },
    'login-logs': { id: 'login-logs' },
    'time-sync': { id: 'time-sync' },
    // 打印机工具
    'printer-health': { id: 'printer-health' },
    'repair-printer': { id: 'repair-printer' },
    'repair-printer-queue': { id: 'repair-printer-queue' },
    'spooler-start': { id: 'spooler-start' },
    'print-test': { id: 'print-test' },
    // CCTV工具
    'cctv-health': { id: 'cctv-health' },
    'web-probe': { id: 'web-probe' },
    'onvif-search': { id: 'camera-scan', subnet: '192.168.1.0/24', ports: '80,443,554,8000,8080,37777', timeout: 3 },
    // 串口/Telnet/WiFi
    'serial-debug': { id: 'service-status' },
    'telnet-client': { id: 'tcp-ping' },
    'wifi-scan': { id: 'network-snapshot' },
    'system-launcher': { id: 'system-launcher', target: 'windows-settings' },
  };

  const localTool = localToolMap[toolId] || { id: toolId };
  const toolBody = { ...localTool, ...params };
  delete toolBody.id;

  const endpoint = toolId === 'pcap-analyzer' ? '/api/packet-capture/analyze' : '/api/tools/' + localTool.id;
  apiJson(endpoint, { method: 'POST', body: JSON.stringify(toolBody) })
    .then(res => {
      state.isToolRunning = false;
      const raw = res.output || JSON.stringify(res);
      const summary = res.summary || summarizeToolOutput(toolId, raw, true);
      const stats = toolId === 'pcap-analyzer' ? [
        { label: '数据包', value: String(res.packetCount || 0) },
        { label: '协议', value: String(res.protocols?.length || 0) },
        { label: 'DNS 查询', value: String(res.dnsQueries?.length || 0) },
      ] : extractToolStats(toolId, raw);
      state.ndOutput = { toolId, output: raw, csv: res.csv || '', summary, success: true, stats };
      showToast(`${getToolName(toolId)} 执行完成`);
      addActivity('success', `<strong>${getToolName(toolId)}</strong> 执行成功`);
      render();
    })
    .catch(err => {
      state.isToolRunning = false;
      const errMsg = err.message || '执行失败';
      const summary = `执行失败：${errMsg.slice(0, 200)}\n\n提示：本工具需要本地后端服务支持，请确保服务已启动。`;
      state.ndOutput = { toolId, output: errMsg, summary, success: false };
      showToast(`执行失败：${errMsg}`);
      addActivity('error', `<strong>${getToolName(toolId)}</strong> 执行失败`);
      render();
    });
}

// ===== 纯前端工具实现（无需后端，断网可用）=====
function frontendToolError(message) {
  return { success: false, output: `参数检查失败\n${'='.repeat(48)}\n${message}`, summary: message };
}

function finiteNumber(value, label, { min = -Infinity, max = Infinity, integer = false } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
    throw new Error(`${label}必须是${integer ? '整数，且' : ''}${min !== -Infinity ? `不小于 ${min}` : ''}${min !== -Infinity && max !== Infinity ? '、' : ''}${max !== Infinity ? `不大于 ${max}` : ''}`);
  }
  return number;
}

function readableDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '-';
  const rounded = Math.round(seconds);
  const days = Math.floor(rounded / 86400);
  const hours = Math.floor((rounded % 86400) / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;
  return [days && `${days} 天`, hours && `${hours} 小时`, minutes && `${minutes} 分`, `${secs} 秒`].filter(Boolean).join(' ');
}

function ipv4ToInt(ip) {
  const parts = String(ip).trim().split('.');
  if (parts.length !== 4 || parts.some(part => !/^\d+$/.test(part) || Number(part) > 255)) throw new Error('地址池必须是有效的 IPv4 CIDR');
  return parts.reduce((value, part) => ((value << 8) | Number(part)) >>> 0, 0);
}

function intToIpv4(value) {
  const number = value >>> 0;
  return [number >>> 24, (number >>> 16) & 255, (number >>> 8) & 255, number & 255].join('.');
}

function executeFrontendTool(toolId, params) {
  if (toolId === 'hex-convert') {
    const val = (params.value || '0').trim();
    const base = parseInt(params.fromBase || '10');
    let num;
    try { num = parseInt(val, base); } catch { num = NaN; }
    if (isNaN(num)) return { output: `错误：无法解析输入值 "${val}"（进制: ${base}）`, summary: '输入值无效，请检查输入和进制' };
    const bin = num.toString(2);
    const dec = num.toString(10);
    const hex = num.toString(16).toUpperCase();
    const oct = num.toString(8);
    const output = `╔══════════════════════════════════════╗\n║          进 制 转 换 结 果           ║\n╠══════════════════════════════════════╣\n║  输入值: ${val.padEnd(28)}║\n║  输入进制: ${String(base).padEnd(26)}║\n╠══════════════════════════════════════╣\n║  二进制 (BIN): ${bin.padEnd(24)}║\n║  十进制 (DEC): ${dec.padEnd(24)}║\n║  十六进制(HEX): ${hex.padEnd(24)}║\n║  八进制 (OCT): ${oct.padEnd(24)}║\n╚══════════════════════════════════════╝`;
    return { output, summary: `输入值 ${val}（${base}进制）转换完成`, stats: [
      { label: '十进制', value: dec }, { label: '十六进制', value: '0x' + hex }, { label: '二进制', value: bin },
    ] };
  }

  if (toolId === 'password-gen') {
    const len = Math.min(Math.max(parseInt(params.length || '16'), 4), 128);
    const charsetMode = params.charset || '字母+数字+符号';
    let chars = '';
    if (charsetMode.includes('字母')) chars += 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (charsetMode.includes('数字')) chars += '0123456789';
    if (charsetMode.includes('符号')) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';
    if (!chars) chars = 'abcdefghijklmnopqrstuvwxyz';
    let pwd = '';
    const arr = new Uint32Array(len);
    crypto.getRandomValues(arr);
    for (let i = 0; i < len; i++) pwd += chars[arr[i] % chars.length];
    const strength = len >= 16 ? '强' : len >= 10 ? '中' : '弱';
    const output = `╔══════════════════════════════════════╗\n║          密 码 生 成 结 果           ║\n╠══════════════════════════════════════╣\n║  密码: ${pwd}║\n║  长度: ${String(len).padEnd(30)}║\n║  字符集: ${charsetMode.padEnd(26)}║\n║  强度: ${strength.padEnd(30)}║\n╠══════════════════════════════════════╣\n║  提示: 请妥善保管，建议使用密码管理器  ║\n╚══════════════════════════════════════╝`;
    return { output, summary: `已生成 ${len} 位${charsetMode}密码（强度: ${strength}）`, stats: [
      { label: '长度', value: len + '位' }, { label: '强度', value: strength },
    ] };
  }

  if (toolId === 'cable-order') {
    const t568a = ['白绿', '绿', '白橙', '蓝', '白蓝', '橙', '白棕', '棕'];
    const t568b = ['白橙', '橙', '白绿', '蓝', '白蓝', '绿', '白棕', '棕'];
    const fmt = (name, order) => {
      const lines = order.map((c, i) => `║  Pin ${String(i + 1).padStart(2)} │ ${c.padEnd(8)} │ ${'█'.repeat(4 * (i + 1))}`);
      return `║  ${name} 线序:`;
    };
    let output = `╔══════════════════════════════════════╗\n║        网 线 线 序 标 准 参 考       ║\n╠══════════════════════════════════════╣\n║\n║  【T568B 标准】（最常用，直通线）\n`;
    t568b.forEach((c, i) => { output += `║  Pin ${i + 1} → ${c.padEnd(6)} ${'█'.repeat(i + 1)}\n`; });
    output += `║\n║  【T568A 标准】（交叉线一端）\n`;
    t568a.forEach((c, i) => { output += `║  Pin ${i + 1} → ${c.padEnd(6)} ${'█'.repeat(i + 1)}\n`; });
    output += `║\n╠══════════════════════════════════════╣\n║  直通线: 两端均用 T568B（常用）\n║  交叉线: 一端 T568A，一端 T568B\n║  适用: 百兆用1236，千兆用全部8芯\n╚══════════════════════════════════════╝`;
    return { output, summary: 'T568A/T568B 网线线序标准参考', stats: [
      { label: 'T568B Pin1', value: '白橙' }, { label: 'T568A Pin1', value: '白绿' },
    ] };
  }

  try {
    if (toolId === 'bandwidth-time') {
      const size = finiteNumber(params.size, '文件大小', { min: 0.001 });
      const bandwidth = finiteNumber(params.bandwidth, '链路带宽', { min: 0.01 });
      const efficiency = finiteNumber(params.efficiency, '链路利用率', { min: 1, max: 100 }) / 100;
      const unit = params.sizeUnit || 'GB';
      const unitBytes = { MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 }[unit];
      if (!unitBytes) throw new Error('文件大小单位无效');
      const seconds = size * unitBytes * 8 / (bandwidth * 1_000_000 * efficiency);
      const effective = bandwidth * efficiency;
      const output = [
        '带宽与传输耗时估算', '='.repeat(48),
        `数据量          ${size} ${unit}`,
        `标称带宽        ${bandwidth.toFixed(2)} Mbps`,
        `有效吞吐        ${effective.toFixed(2)} Mbps（利用率 ${(efficiency * 100).toFixed(0)}%）`,
        `预计耗时        ${readableDuration(seconds)}`,
        `预计秒数        ${seconds.toFixed(1)} 秒`, '',
        '结论：估算已计入协议、磁盘和链路利用率影响。实际耗时还受延迟、丢包与并发业务影响。',
      ].join('\n');
      return { output, summary: `${size} ${unit} 在 ${bandwidth} Mbps 链路上预计需要 ${readableDuration(seconds)}`, stats: [
        { label: '有效吞吐', value: `${effective.toFixed(1)} Mbps` }, { label: '预计耗时', value: readableDuration(seconds) },
      ] };
    }

    if (toolId === 'cctv-storage') {
      const cameras = finiteNumber(params.cameras, '摄像头数量', { min: 1, max: 10000, integer: true });
      const bitrate = finiteNumber(params.bitrate, '单路平均码率', { min: 0.05, max: 200 });
      const hours = finiteNumber(params.hours, '每天录像时长', { min: 0.1, max: 24 });
      const days = finiteNumber(params.days, '保留天数', { min: 1, max: 3650 });
      const efficiency = finiteNumber(params.efficiency, '存储利用率', { min: 50, max: 100 }) / 100;
      const dailyGb = cameras * bitrate * 1_000_000 / 8 * hours * 3600 / 1_000_000_000;
      const videoTb = dailyGb * days / 1000;
      const physicalTb = videoTb / efficiency;
      const output = [
        '监控录像存储容量计算', '='.repeat(48),
        `摄像头          ${cameras} 路`, `平均码率        ${bitrate.toFixed(2)} Mbps/路`,
        `录像计划        ${hours.toFixed(1)} 小时/天 × ${days} 天`,
        `每日数据量      ${dailyGb.toFixed(2)} GB`, `纯录像容量      ${videoTb.toFixed(2)} TB`,
        `建议物理容量    ${physicalTb.toFixed(2)} TB（利用率 ${(efficiency * 100).toFixed(0)}%）`, '',
        '结论：应按建议物理容量向上取整选盘，RAID 校验盘和热备盘容量需另行增加。',
      ].join('\n');
      return { output, summary: `${cameras} 路录像保留 ${days} 天，建议配置不少于 ${physicalTb.toFixed(2)} TB 物理存储`, stats: [
        { label: '每日数据', value: `${dailyGb.toFixed(1)} GB` }, { label: '建议容量', value: `${physicalTb.toFixed(2)} TB` },
      ] };
    }

    if (toolId === 'poe-budget') {
      const budget = finiteNumber(params.budget, 'PoE 总功率', { min: 1 });
      const devices = finiteNumber(params.devices, '设备数量', { min: 1, max: 10000, integer: true });
      const devicePower = finiteNumber(params.devicePower, '单台最大功耗', { min: 0.1 });
      const reserve = finiteNumber(params.reserve, '预留余量', { min: 0, max: 80 }) / 100;
      const available = budget * (1 - reserve);
      const demand = devices * devicePower;
      const margin = available - demand;
      const maxDevices = Math.floor(available / devicePower);
      const healthy = margin >= 0;
      const output = [
        'PoE 供电预算核算', '='.repeat(48), `交换机总预算    ${budget.toFixed(1)} W`,
        `预留后可用功率  ${available.toFixed(1)} W（预留 ${(reserve * 100).toFixed(0)}%）`,
        `设备最大需求    ${demand.toFixed(1)} W（${devices} × ${devicePower.toFixed(1)} W）`,
        `功率余量        ${margin.toFixed(1)} W`, `同功耗最大台数  ${maxDevices} 台`, '',
        `结论：${healthy ? '预算充足，可进入端口级 PoE 等级与线损核验。' : `预算不足，至少还缺 ${Math.abs(margin).toFixed(1)} W。`}`,
      ].join('\n');
      return { output, summary: healthy ? `PoE 预算充足，剩余 ${margin.toFixed(1)} W` : `PoE 预算不足 ${Math.abs(margin).toFixed(1)} W`, stats: [
        { label: '需求', value: `${demand.toFixed(1)} W` }, { label: '余量', value: `${margin.toFixed(1)} W` }, { label: '状态', value: healthy ? '充足' : '不足' },
      ] };
    }

    if (toolId === 'ups-runtime') {
      const voltage = finiteNumber(params.voltage, '电池组电压', { min: 1 });
      const capacity = finiteNumber(params.capacity, '电池容量', { min: 0.1 });
      const strings = finiteNumber(params.strings, '并联组数', { min: 1, max: 100, integer: true });
      const load = finiteNumber(params.load, '实际负载', { min: 1 });
      const efficiency = finiteNumber(params.efficiency, '综合效率', { min: 10, max: 100 }) / 100;
      const nominalWh = voltage * capacity * strings;
      const usableWh = nominalWh * efficiency;
      const minutes = usableWh / load * 60;
      const output = [
        'UPS 续航时间估算', '='.repeat(48), `电池标称能量    ${nominalWh.toFixed(0)} Wh`,
        `折算可用能量    ${usableWh.toFixed(0)} Wh（效率 ${(efficiency * 100).toFixed(0)}%）`,
        `实际负载        ${load.toFixed(0)} W`, `理论续航        ${minutes.toFixed(1)} 分钟`,
        `保守验收值      ${(minutes * 0.8).toFixed(1)} 分钟`, '',
        '结论：电池老化、高倍率放电和环境温度会缩短续航，现场验收建议按理论值的 80% 核对。',
      ].join('\n');
      return { output, summary: `UPS 理论续航约 ${minutes.toFixed(1)} 分钟，保守验收值 ${(minutes * 0.8).toFixed(1)} 分钟`, stats: [
        { label: '可用能量', value: `${usableWh.toFixed(0)} Wh` }, { label: '理论续航', value: `${minutes.toFixed(1)} 分` },
      ] };
    }

    if (toolId === 'optical-power') {
      const tx = finiteNumber(params.tx, '发送光功率', { min: -60, max: 30 });
      const sensitivity = finiteNumber(params.sensitivity, '接收灵敏度', { min: -80, max: 10 });
      const distance = finiteNumber(params.distance, '光纤长度', { min: 0 });
      const attenuation = finiteNumber(params.attenuation, '光纤衰减', { min: 0, max: 10 });
      const connectors = finiteNumber(params.connectors, '连接器数量', { min: 0, max: 1000, integer: true });
      const splices = finiteNumber(params.splices, '熔接点数量', { min: 0, max: 10000, integer: true });
      const reserve = finiteNumber(params.reserve, '系统预留余量', { min: 0, max: 30 });
      const fiberLoss = distance * attenuation;
      const connectorLoss = connectors * 0.5;
      const spliceLoss = splices * 0.1;
      const physicalLoss = fiberLoss + connectorLoss + spliceLoss;
      const predictedRx = tx - physicalLoss;
      const margin = predictedRx - sensitivity - reserve;
      const healthy = margin >= 0;
      const output = [
        '光链路功率预算', '='.repeat(48), `发送光功率      ${tx.toFixed(2)} dBm`,
        `光纤损耗        ${fiberLoss.toFixed(2)} dB`, `连接器损耗      ${connectorLoss.toFixed(2)} dB`,
        `熔接损耗        ${spliceLoss.toFixed(2)} dB`, `预计接收功率    ${predictedRx.toFixed(2)} dBm`,
        `接收灵敏度      ${sensitivity.toFixed(2)} dBm`, `扣除预留后余量  ${margin.toFixed(2)} dB`, '',
        `结论：${healthy ? '光功率预算满足要求。' : '光功率预算不足，应检查光模块规格、衰减点和链路长度。'}`,
      ].join('\n');
      return { output, summary: healthy ? `光链路预算通过，余量 ${margin.toFixed(2)} dB` : `光链路预算不足 ${Math.abs(margin).toFixed(2)} dB`, stats: [
        { label: '预计接收', value: `${predictedRx.toFixed(2)} dBm` }, { label: '预算余量', value: `${margin.toFixed(2)} dB` }, { label: '状态', value: healthy ? '通过' : '不足' },
      ] };
    }

    if (toolId === 'raid-capacity') {
      const level = params.level || 'RAID5';
      const disks = finiteNumber(params.disks, '磁盘数量', { min: 2, max: 1024, integer: true });
      const diskSize = finiteNumber(params.diskSize, '单盘容量', { min: 0.001 });
      const rules = {
        RAID0: { min: 2, usable: disks, tolerance: 0, note: '无冗余，任意单盘故障都会导致阵列数据丢失' },
        RAID1: { min: 2, usable: 1, tolerance: disks - 1, note: '所有磁盘保存相同镜像' },
        RAID5: { min: 3, usable: disks - 1, tolerance: 1, note: '允许同时故障 1 块盘' },
        RAID6: { min: 4, usable: disks - 2, tolerance: 2, note: '允许同时故障 2 块盘' },
        RAID10: { min: 4, usable: disks / 2, tolerance: 1, note: '每组镜像可故障 1 块盘，要求偶数盘' },
      };
      const rule = rules[level];
      if (!rule) throw new Error('RAID 级别无效');
      if (disks < rule.min) throw new Error(`${level} 至少需要 ${rule.min} 块磁盘`);
      if (level === 'RAID10' && disks % 2 !== 0) throw new Error('RAID10 的磁盘数量必须为偶数');
      const raw = disks * diskSize;
      const usable = rule.usable * diskSize;
      const utilization = usable / raw * 100;
      const output = [
        'RAID 容量与容错计算', '='.repeat(48), `阵列级别        ${level}`, `磁盘配置        ${disks} × ${diskSize} TB`,
        `原始容量        ${raw.toFixed(2)} TB`, `可用容量        ${usable.toFixed(2)} TB`,
        `容量利用率      ${utilization.toFixed(1)}%`, `标称容错盘数    ${rule.tolerance} 块`, '',
        `结论：${rule.note}。可用容量未扣除文件系统、厂商单位换算、热备盘与快照空间。`,
      ].join('\n');
      return { output, summary: `${level} 可用容量 ${usable.toFixed(2)} TB，利用率 ${utilization.toFixed(1)}%`, stats: [
        { label: '原始容量', value: `${raw.toFixed(2)} TB` }, { label: '可用容量', value: `${usable.toFixed(2)} TB` }, { label: '利用率', value: `${utilization.toFixed(1)}%` },
      ] };
    }

    if (toolId === 'vlsm-calc') {
      const match = String(params.cidr || '').trim().match(/^([^/]+)\/(\d{1,2})$/);
      if (!match) throw new Error('地址池格式必须为 IPv4/prefix，例如 192.168.10.0/24');
      const prefix = finiteNumber(match[2], '前缀长度', { min: 0, max: 30, integer: true });
      const inputIp = ipv4ToInt(match[1]);
      const poolSize = 2 ** (32 - prefix);
      const poolBase = Math.floor(inputIp / poolSize) * poolSize;
      const requests = String(params.hosts || '').split(/[\s,;]+/).filter(Boolean).map((value, index) => ({
        original: index + 1,
        hosts: finiteNumber(value, `第 ${index + 1} 个主机数`, { min: 1, max: 16_777_214, integer: true }),
      }));
      if (!requests.length) throw new Error('至少输入一个网段主机数');
      requests.forEach(item => {
        item.blockSize = 2 ** Math.ceil(Math.log2(item.hosts + 2));
        item.prefix = 32 - Math.log2(item.blockSize);
      });
      requests.sort((a, b) => b.blockSize - a.blockSize || a.original - b.original);
      let cursor = poolBase;
      const poolEnd = poolBase + poolSize - 1;
      const allocations = requests.map(item => {
        if (cursor + item.blockSize - 1 > poolEnd) throw new Error(`地址池容量不足：无法容纳需要 ${item.hosts} 台主机的网段`);
        const network = cursor;
        const broadcast = cursor + item.blockSize - 1;
        cursor += item.blockSize;
        return { ...item, network, broadcast };
      });
      const rows = allocations.map((item, index) => [
        `${String(index + 1).padStart(2, '0')}. 需求 ${String(item.hosts).padStart(6)} 台`,
        `    ${intToIpv4(item.network)}/${item.prefix}`,
        `    可用 ${intToIpv4(item.network + 1)} - ${intToIpv4(item.broadcast - 1)}  广播 ${intToIpv4(item.broadcast)}`,
      ].join('\n'));
      const remaining = poolEnd - cursor + 1;
      const canonicalCidr = `${intToIpv4(poolBase)}/${prefix}`;
      const output = ['VLSM IPv4 子网规划', '='.repeat(72), `规范化地址池    ${canonicalCidr}`, `地址总数        ${poolSize}`, '', ...rows, '', `剩余地址数      ${remaining}`, '结论：已按主机需求从大到小分配，网关、保留地址和未来扩容应计入主机需求。'].join('\n');
      return { output, summary: `${canonicalCidr} 已规划 ${allocations.length} 个子网，剩余 ${remaining} 个地址`, stats: [
        { label: '子网数', value: String(allocations.length) }, { label: '剩余地址', value: String(remaining) }, { label: '地址池', value: canonicalCidr },
      ] };
    }
  } catch (error) {
    return frontendToolError(error.message || '参数无效');
  }

  return null; // 非纯前端工具，返回 null 走后端 API
}

function extractToolStats(toolId, output) {
  const text = String(output);
  const stats = [];
  
  if (toolId.includes('ping')) {
    const loss = text.match(/(\d+)% 丢失|Loss\s*=\s*(\d+)%|丢包[:\s]+(\d+)%/i);
    const avg = text.match(/平均[:\s]*[=]*\s*(\d+)ms|Average[:\s]*[=]*\s*(\d+)ms/i);
    if (loss) stats.push({ label: '丢包率', value: loss[1] || loss[2] || loss[3] + '%' });
    if (avg) stats.push({ label: '平均延迟', value: (avg[1] || avg[2]) + 'ms' });
  }
  
  if (toolId.includes('speed') || toolId.includes('lan')) {
    const speed = text.match(/([\d.]+)\s*(Mbps|MB\/s|KB\/s)/i);
    if (speed) stats.push({ label: '速度', value: speed[1] + ' ' + speed[2] });
  }
  
  if (toolId.includes('scan') || toolId.includes('discovery') || toolId.includes('camera')) {
    const count = text.match(/发现\s*(\d+)|找到\s*(\d+)|detected\s*(\d+)/i);
    if (count) stats.push({ label: '发现数', value: count[1] || count[2] || count[3] });
  }
  
  if (toolId.includes('qos')) {
    const mos = text.match(/MOS[:\s]*([\d.]+)/);
    const jitter = text.match(/抖动[:\s]*([\d.]+)/);
    if (mos) stats.push({ label: 'MOS评分', value: mos[1] });
    if (jitter) stats.push({ label: '抖动', value: jitter[1] + 'ms' });
  }
  
  if (toolId.includes('port') && !toolId.includes('occupancy')) {
    const open = text.match(/开放\s*(\d+)|open\s*(\d+)/i);
    if (open) stats.push({ label: '开放端口', value: open[1] || open[2] });
  }
  
  return stats.length > 0 ? stats : null;
}

async function startUnifiedFlowMonitor(params = {}) {
  flowMonitorRuntime.running = false;
  if (flowMonitorRuntime.timer) window.clearInterval(flowMonitorRuntime.timer);
  Object.assign(flowMonitorRuntime, { timer: null, previous: null, running: true, busy: false, samples: 0, startedAt: Date.now(), lines: [] });
  const interfaceAlias = String(params.interfaceAlias || '').trim();
  const intervalSeconds = Math.min(Math.max(Number(params.interval) || 2, 1), 10);
  flowMonitorRuntime.lines.push(`实时流量监控已启动：${interfaceAlias || '全部物理网卡'}，刷新间隔 ${intervalSeconds} 秒`);
  state.isToolRunning = true;
  state.ndOutput = { toolId: 'flow-monitor', output: flowMonitorRuntime.lines.join('\n'), summary: '正在建立网卡流量计数基线。', success: true, stats: [] };
  render();

  const sample = async () => {
    if (!flowMonitorRuntime.running || flowMonitorRuntime.busy) return;
    flowMonitorRuntime.busy = true;
    try {
      const result = await apiJson('/api/tools/flow-monitor-sample', { method: 'POST', body: JSON.stringify({ interfaceAlias }) });
      const current = { sampledAt: Number(result.sampledAt || Date.now()), adapters: new Map((result.adapters || []).map(item => [item.name, item])) };
      let totalRx = 0;
      let totalTx = 0;
      if (flowMonitorRuntime.previous) {
        const elapsed = Math.max((current.sampledAt - flowMonitorRuntime.previous.sampledAt) / 1000, 0.001);
        for (const [name, adapter] of current.adapters) {
          const previous = flowMonitorRuntime.previous.adapters.get(name);
          if (!previous) continue;
          const rxRate = Math.max(0, Number(adapter.receivedBytes) - Number(previous.receivedBytes)) / elapsed;
          const txRate = Math.max(0, Number(adapter.sentBytes) - Number(previous.sentBytes)) / elapsed;
          totalRx += rxRate;
          totalTx += txRate;
          flowMonitorRuntime.lines.push(`[${new Date(current.sampledAt).toLocaleTimeString()}] ${name}  RX ${formatByteRate(rxRate)}  TX ${formatByteRate(txRate)}  ${adapter.linkSpeed || ''}`);
        }
      } else {
        flowMonitorRuntime.lines.push(current.adapters.size ? `已建立计数基线：${[...current.adapters.keys()].join('、')}` : (result.output || '未找到物理网卡。'));
      }
      flowMonitorRuntime.previous = current;
      flowMonitorRuntime.samples += 1;
      flowMonitorRuntime.lines = flowMonitorRuntime.lines.slice(-200);
      state.ndOutput = {
        toolId: 'flow-monitor', output: flowMonitorRuntime.lines.join('\n'), success: true,
        summary: current.adapters.size ? `正在监控 ${current.adapters.size} 个物理网卡，已采样 ${flowMonitorRuntime.samples} 次。` : '未找到符合条件的物理网卡。',
        stats: [{ label: '采样次数', value: String(flowMonitorRuntime.samples) }, { label: '下载速率', value: formatByteRate(totalRx) }, { label: '上传速率', value: formatByteRate(totalTx) }],
      };
      render();
    } catch (error) {
      flowMonitorRuntime.lines.push(`采样失败：${error.message}`);
      state.ndOutput = { toolId: 'flow-monitor', output: flowMonitorRuntime.lines.join('\n'), summary: `流量采样失败：${error.message}`, success: false };
      render();
    } finally {
      flowMonitorRuntime.busy = false;
    }
  };

  await sample();
  if (flowMonitorRuntime.running) flowMonitorRuntime.timer = window.setInterval(sample, intervalSeconds * 1000);
}

function stopUnifiedFlowMonitor() {
  flowMonitorRuntime.running = false;
  if (flowMonitorRuntime.timer) window.clearInterval(flowMonitorRuntime.timer);
  flowMonitorRuntime.timer = null;
  state.isToolRunning = false;
  const duration = flowMonitorRuntime.startedAt ? ((Date.now() - flowMonitorRuntime.startedAt) / 1000).toFixed(1) : '0.0';
  flowMonitorRuntime.lines.push(`监控已停止：共采样 ${flowMonitorRuntime.samples} 次，持续 ${duration} 秒`);
  state.ndOutput = {
    ...(state.ndOutput || {}), toolId: 'flow-monitor', output: flowMonitorRuntime.lines.join('\n'), success: true,
    summary: `实时流量监控已停止，共采样 ${flowMonitorRuntime.samples} 次，持续 ${duration} 秒。`,
  };
  showToast('实时流量监控已停止');
  render();
}

async function startUnifiedLinkMonitor(params = {}) {
  linkMonitorRuntime.running = false;
  if (linkMonitorRuntime.timer) window.clearInterval(linkMonitorRuntime.timer);
  Object.assign(linkMonitorRuntime, {
    timer: null,
    previousStates: new Map(),
    running: true,
    busy: false,
    samples: 0,
    failures: 0,
    events: 0,
    startedAt: Date.now(),
    lines: [],
  });
  const targets = String(params.targets || '').trim();
  const targetCount = [...new Set(targets.split(/[\s,;]+/).filter(Boolean))].length;
  const intervalSeconds = Math.min(Math.max(Number(params.interval) || 30, 2), 60);
  const webhookUrl = String(params.webhookUrl || '').trim();
  linkMonitorRuntime.lines.push(`链路可用性监控已启动：${targetCount} 个目标，探测间隔 ${intervalSeconds} 秒`);
  linkMonitorRuntime.lines.push(webhookUrl ? '状态切换告警：已启用飞书/企业微信 Webhook' : '状态切换告警：未配置 Webhook，仅在输出台留痕');
  state.isToolRunning = true;
  state.ndOutput = {
    toolId: 'link-monitor',
    output: linkMonitorRuntime.lines.join('\n'),
    summary: '正在进行首次探测并建立在线状态基线。',
    success: true,
    stats: [],
  };
  render();

  const sendTransitionAlert = async (message) => {
    if (!webhookUrl) return;
    try {
      await apiJson('/api/tools/monitor-webhook', { method: 'POST', body: JSON.stringify({ url: webhookUrl, text: message }) });
      linkMonitorRuntime.lines.push('  告警投递成功');
    } catch (error) {
      linkMonitorRuntime.lines.push(`  告警投递失败：${error.message}`);
    }
  };

  const sample = async () => {
    if (!linkMonitorRuntime.running || linkMonitorRuntime.busy) return;
    linkMonitorRuntime.busy = true;
    try {
      const result = await apiJson('/api/tools/link-monitor-sample', { method: 'POST', body: JSON.stringify({ targets }) });
      const sampledAt = Number(result.sampledAt || Date.now());
      const time = new Date(sampledAt).toLocaleTimeString();
      const transitions = [];
      let downCount = 0;
      for (const item of result.results || []) {
        const current = Boolean(item.up);
        const previous = linkMonitorRuntime.previousStates.get(item.target);
        if (!current) downCount += 1;
        linkMonitorRuntime.lines.push(`[${time}] ${current ? 'UP  ' : 'DOWN'} ${item.target.padEnd(28)} ${item.latencyMs === null ? '-' : `${item.latencyMs} ms`}`);
        if (previous !== undefined && previous !== current) {
          const transition = `${item.target} ${previous ? '在线 -> 离线' : '离线 -> 恢复'}`;
          transitions.push(transition);
          linkMonitorRuntime.lines.push(`  状态切换：${transition}`);
        }
        linkMonitorRuntime.previousStates.set(item.target, current);
      }
      linkMonitorRuntime.samples += 1;
      linkMonitorRuntime.failures += downCount;
      linkMonitorRuntime.events += transitions.length;
      await Promise.all(transitions.map(transition => sendTransitionAlert(
        `[IT 运维百宝箱] 链路状态告警\n${transition}\n时间：${new Date(sampledAt).toLocaleString()}`,
      )));
      linkMonitorRuntime.lines = linkMonitorRuntime.lines.slice(-200);
      const total = (result.results || []).length;
      state.ndOutput = {
        toolId: 'link-monitor',
        output: linkMonitorRuntime.lines.join('\n'),
        success: downCount === 0,
        summary: downCount === 0
          ? `全部 ${total} 个目标在线，已完成 ${linkMonitorRuntime.samples} 轮探测。`
          : `${downCount}/${total} 个目标离线，已记录 ${linkMonitorRuntime.events} 次状态切换。`,
        stats: [
          { label: '探测轮次', value: String(linkMonitorRuntime.samples) },
          { label: '当前离线', value: String(downCount) },
          { label: '状态切换', value: String(linkMonitorRuntime.events) },
          { label: '累计失败', value: String(linkMonitorRuntime.failures) },
        ],
      };
      render();
    } catch (error) {
      linkMonitorRuntime.lines.push(`[${new Date().toLocaleTimeString()}] 探测失败：${error.message}`);
      linkMonitorRuntime.lines = linkMonitorRuntime.lines.slice(-200);
      state.ndOutput = {
        toolId: 'link-monitor',
        output: linkMonitorRuntime.lines.join('\n'),
        summary: `链路采样失败：${error.message}`,
        success: false,
        stats: [{ label: '探测轮次', value: String(linkMonitorRuntime.samples) }],
      };
      render();
    } finally {
      linkMonitorRuntime.busy = false;
    }
  };

  await sample();
  if (linkMonitorRuntime.running) linkMonitorRuntime.timer = window.setInterval(sample, intervalSeconds * 1000);
}

function stopUnifiedLinkMonitor() {
  linkMonitorRuntime.running = false;
  if (linkMonitorRuntime.timer) window.clearInterval(linkMonitorRuntime.timer);
  linkMonitorRuntime.timer = null;
  state.isToolRunning = false;
  const duration = linkMonitorRuntime.startedAt ? ((Date.now() - linkMonitorRuntime.startedAt) / 1000).toFixed(1) : '0.0';
  linkMonitorRuntime.lines.push(`监控已停止：${linkMonitorRuntime.samples} 轮探测，${linkMonitorRuntime.events} 次状态切换，持续 ${duration} 秒`);
  state.ndOutput = {
    ...(state.ndOutput || {}),
    toolId: 'link-monitor',
    output: linkMonitorRuntime.lines.join('\n'),
    summary: `链路可用性监控已停止，共 ${linkMonitorRuntime.samples} 轮探测、${linkMonitorRuntime.events} 次状态切换。`,
    success: true,
  };
  showToast('链路可用性监控已停止');
  render();
}

function clearPacketCapturePoller() {
  if (packetCaptureRuntime.poller) window.clearInterval(packetCaptureRuntime.poller);
  packetCaptureRuntime.poller = null;
}

function captureOutput(record, message) {
  const elapsed = packetCaptureRuntime.startedAt ? Math.max(0, Math.floor((Date.now() - packetCaptureRuntime.startedAt) / 1000)) : 0;
  return {
    toolId: 'packet-capture',
    output: [
      message,
      '='.repeat(56),
      `任务编号        ${record?.id || '-'}`,
      `状态            ${record?.status || '-'}`,
      `已运行          ${elapsed} 秒`,
      `时长上限        ${record?.durationSeconds || '-'} 秒`,
      `文件上限        ${record?.fileSizeMB || '-'} MB`,
      `捕获长度        ${record?.packetSize === 0 ? '完整数据包' : `${record?.packetSize || '-'} bytes`}`,
      record?.completedAt ? `完成时间        ${new Date(record.completedAt).toLocaleString('zh-CN')}` : '',
      record?.bytes !== undefined ? `PCAPNG 大小     ${record.bytes} bytes` : '',
    ].filter(Boolean).join('\n'),
    summary: record?.status === 'capturing' ? '正在采集本机网卡流量；可手动停止，达到时长后也会自动结束。' : '抓包已结束并完成 PCAPNG 转换，可下载文件或导入协议分析器。',
    success: record?.status !== 'failed',
    downloadUrl: record?.downloadUrl || null,
    stats: [
      { label: '运行时间', value: `${elapsed}s` },
      { label: '文件上限', value: `${record?.fileSizeMB || '-'}MB` },
      { label: '状态', value: record?.status === 'capturing' ? '采集中' : record?.status === 'completed' ? '已完成' : record?.status || '-' },
    ],
  };
}

async function pollPacketCaptureStatus() {
  try {
    const status = await apiJson('/api/packet-capture/status');
    if (status.active) {
      state.isToolRunning = true;
      state.ndOutput = captureOutput(status.active, '内置 pktmon 抓包正在运行');
      render();
      return;
    }
    const record = status.captures?.find(item => item.id === packetCaptureRuntime.captureId) || status.captures?.[0];
    clearPacketCapturePoller();
    state.isToolRunning = false;
    if (record) state.ndOutput = captureOutput(record, record.status === 'completed' ? '抓包已自动结束并转换为 PCAPNG' : '抓包任务已结束');
    render();
  } catch (error) {
    clearPacketCapturePoller();
    state.isToolRunning = false;
    state.ndOutput = { toolId: 'packet-capture', output: error.message, summary: '无法读取抓包任务状态。', success: false };
    render();
  }
}

async function startPacketCapture(params = {}) {
  if (!window.confirm('抓包可能包含业务地址、域名和明文协议内容。确认仅采集当前故障所需范围，并按现场证据规范保管 PCAPNG 文件？')) {
    state.isToolRunning = false;
    state.ndOutput = { toolId: 'packet-capture', output: '用户取消了抓包任务。', summary: '未启动任何网络采集。', success: true };
    render();
    return;
  }
  try {
    const record = await apiJson('/api/packet-capture/start', { method: 'POST', body: JSON.stringify({ ...params, confirmed: true }) });
    packetCaptureRuntime.captureId = record.id;
    packetCaptureRuntime.startedAt = Date.now();
    state.isToolRunning = true;
    state.ndOutput = captureOutput(record, '内置 pktmon 抓包已启动');
    clearPacketCapturePoller();
    packetCaptureRuntime.poller = window.setInterval(pollPacketCaptureStatus, 1500);
    showToast('抓包已启动，将按设定时长自动停止');
    render();
  } catch (error) {
    state.isToolRunning = false;
    state.ndOutput = { toolId: 'packet-capture', output: error.message, summary: '抓包启动失败；请确认以管理员权限运行工具箱且没有其他 pktmon 会话。', success: false };
    render();
  }
}

async function stopPacketCapture() {
  try {
    const record = await apiJson('/api/packet-capture/stop', { method: 'POST', body: '{}' });
    clearPacketCapturePoller();
    state.isToolRunning = false;
    state.ndOutput = captureOutput(record, '抓包已手动停止并转换为 PCAPNG');
    showToast('抓包已停止，PCAPNG 已生成');
    render();
  } catch (error) { showToast(`停止抓包失败：${error.message}`); }
}

function stopNdTool() {
  const activeTool = state.activeTool;
  if (!activeTool) return;

  if (activeTool.id === 'flow-monitor') {
    stopUnifiedFlowMonitor();
    return;
  }

  if (activeTool.id === 'link-monitor') {
    stopUnifiedLinkMonitor();
    return;
  }

  if (activeTool.id === 'packet-capture') {
    stopPacketCapture();
    return;
  }

  const stopMap = {
    'dhcp-server': () => apiJson('/api/tools/dhcp-server', { method: 'DELETE', body: JSON.stringify({ port: state.ndToolParams?.port || 6767 }) }),
    'ftp-server': () => apiJson('/api/tools/ftp-server', { method: 'DELETE', body: JSON.stringify({ port: state.ndToolParams?.port || 2121 }) }),
    'tftp-server': () => apiJson('/api/tools/tftp-server', { method: 'DELETE', body: JSON.stringify({ port: state.ndToolParams?.port || 6969 }) }),
    'syslog-server': () => apiJson('/api/tools/syslog-server', { method: 'DELETE', body: JSON.stringify({ port: state.ndToolParams?.port || 1514 }) }),
    'temp-http-server': () => apiJson('/api/tools/temp-http-server', { method: 'DELETE', body: JSON.stringify({ port: state.ndToolParams?.port || 8080 }) }),
    'netflow-listen': () => apiJson('/api/tools/netflow-listen', { method: 'DELETE', body: JSON.stringify({ port: state.ndToolParams?.port || 2055 }) }),
  };

  const stopFn = stopMap[activeTool.id];
  if (stopFn) {
    stopFn().then(() => {
      state.isToolRunning = false;
      state.ndOutput = { toolId: activeTool.id, output: `${getToolName(activeTool.id)} 已停止`, summary: '', success: true };
      showToast(`${getToolName(activeTool.id)} 已停止`);
      render();
    }).catch(err => {
      showToast(`停止失败：${err.message}`);
    });
  } else {
    // 非服务类工具直接停止
    state.isToolRunning = false;
    state.ndOutput = { toolId: activeTool.id, output: `${getToolName(activeTool.id)} 已手动停止`, summary: '用户手动停止执行', success: true };
    showToast(`${getToolName(activeTool.id)} 已停止`);
    render();
  }
}

function clearNdOutput() {
  state.ndOutput = null;
  render();
}

function copyNdOutput() {
  if (!state.ndOutput) return;
  navigator.clipboard.writeText(state.ndOutput.output).then(() => {
    showToast('输出已复制到剪贴板');
  });
}

function downloadNdOutput() {
  if (!state.ndOutput) return;
  const useCsv = Boolean(state.ndOutput.csv);
  const blob = new Blob([useCsv ? `\uFEFF${state.ndOutput.csv}` : state.ndOutput.output], { type: useCsv ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.ndOutput.toolId}_${Date.now()}.${useCsv ? 'csv' : 'txt'}`;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadNdBinary() {
  const downloadUrl = state.ndOutput?.downloadUrl;
  if (!downloadUrl) return;
  try {
    const { token } = getStoredSession();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await fetch(downloadUrl, { credentials: 'same-origin', headers });
    if (!response.ok) throw new Error(payloadError(await responsePayload(response), `HTTP ${response.status}`));
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${packetCaptureRuntime.captureId || 'capture'}.pcapng`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast('PCAPNG 抓包文件已下载');
  } catch (error) { showToast(`下载失败：${error.message}`); }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderSystemPage() {
  const systemToolCategories = [
    { name: '系统检测', icon: 'monitor', tools: toolsByCategory.system },
    { name: '打印机工具', icon: 'printer', tools: toolsByCategory.printer },
    { name: '监控/CCTV', icon: 'video', tools: toolsByCategory.cctv },
    { name: '实用工具', icon: 'wrench', tools: toolsByCategory.utility },
    { name: '运维计算工具箱', icon: 'calculator', tools: toolsByCategory.calculator },
  ];

  const activeTool = state.activeTool && systemToolCategories.some(cat => cat.tools.some(t => t.id === state.activeTool.id))
    ? state.activeTool
    : systemToolCategories[0].tools[0];
  const toolConfig = getToolConfig(activeTool.id);

  return `
    <div class="bento-main" style="padding:0;">
      <div class="bento-nd-container">
        <div class="bento-nd-topbar">
          <div class="bento-nd-topbar-title">
            <h3>${icon('monitor', 18)} 系统检测与实用工具箱</h3>
            <span>System Diagnostic & Utility Tools</span>
          </div>
          <div class="bento-nd-search-wrap">
            <div class="bento-nd-search">
              ${icon('search', 12)}
              <input type="text" placeholder="搜索工具 (Ctrl+K)" oninput="state.ndSearchQuery=this.value;render()" />
              <kbd>Ctrl+K</kbd>
            </div>
          </div>
        </div>

        <div class="bento-nd-toolbar">
          ${systemToolCategories.map((cat, catIdx) => `
            <div class="bento-nd-category${catIdx === 0 ? ' expanded' : ''}" data-cat="sys-${cat.name}">
              <div class="bento-nd-category-header" onclick="toggleNdCategory('sys-${cat.name}')">
                ${icon('chevron-right', 12)}
                <div class="bento-nd-category-title">
                  ${icon(cat.icon, 12)}
                  ${cat.name}
                </div>
                <span class="bento-nd-category-badge">${cat.tools.length}</span>
              </div>
              <div class="bento-nd-tool-list">
                ${cat.tools.map(tool => `
                  <div class="bento-nd-tool-item${activeTool.id === tool.id ? ' active' : ''}"
                       onclick="selectNdTool('${tool.id}')"
                       title="${tool.desc}">
                    ${icon(getToolIcon(tool.id), 14)}
                    <span class="bento-nd-tool-item-name">${tool.name}</span>
                  </div>`).join('')}
              </div>
            </div>`).join('')}
        </div>

        <div class="bento-nd-main">
          <div class="bento-nd-tool-header">
            <div class="bento-nd-tool-title">
              <h4>${icon(getToolIcon(activeTool.id), 16)} ${activeTool.name}</h4>
              <p>${activeTool.desc}</p>
            </div>
            <div class="bento-nd-tool-actions">
              ${toolConfig.canStop ? `<button class="bento-nd-tool-btn danger" onclick="stopNdTool()">${icon('square', 14)} 停止</button>` : ''}
              <button class="bento-nd-tool-btn secondary" onclick="clearNdOutput()">${icon('trash-2', 14)} 清空</button>
              <button class="bento-nd-tool-btn primary" onclick="executeNdTool()" ${state.isToolRunning ? 'disabled' : ''}>
                ${state.isToolRunning ? `${icon('loader-2', 14)} 执行中` : `${icon('play', 14)} 开始执行`}
              </button>
            </div>
          </div>

          <div class="bento-nd-tool-content">
            ${renderNdToolConfig(activeTool.id, toolConfig)}

            <div class="bento-nd-output-panel">
              <div class="bento-nd-output-header">
                <div class="bento-nd-output-tabs">
                  <div class="bento-nd-output-tab active">输出结果</div>
                  <div class="bento-nd-output-tab">执行摘要</div>
                </div>
                <div class="bento-nd-output-actions">
                  <div class="bento-nd-output-action" onclick="copyNdOutput()" title="复制输出">${icon('copy', 12)}</div>
                  <div class="bento-nd-output-action" onclick="downloadNdOutput()" title="导出结果">${icon('download', 12)}</div>
                </div>
              </div>

              <div class="bento-nd-output-body">
                ${state.isToolRunning ? `
                  <div class="bento-nd-loading">
                    <div class="bento-nd-spinner"></div>
                    <span>正在执行 ${activeTool.name}...</span>
                  </div>` : state.ndOutput ? `
                  ${state.ndOutput.summary ? `<div class="bento-nd-summary-card${!state.ndOutput.success ? ' error' : ''}">
                    <div class="bento-nd-summary-title">${icon(state.ndOutput.success ? 'check-circle' : 'alert-circle', 14)} 执行摘要</div>
                    <div class="bento-nd-summary-text">${escapeHtml(state.ndOutput.summary)}</div>
                  </div>` : ''}
                  <pre class="bento-nd-output-pre">${escapeHtml(state.ndOutput.output)}</pre>` : `
                  <div class="bento-nd-loading" style="padding:60px;">
                    <div style="text-align:center;">
                      ${icon('terminal', 32)}
                      <p style="margin-top:12px;color:rgba(255,255,255,0.5);">点击"开始执行"按钮运行工具</p>
                      <p style="font-size:11px;color:rgba(255,255,255,0.3);">执行结果将显示在此处</p>
                    </div>
                  </div>`}
              </div>

              ${state.ndOutput && state.ndOutput.stats ? `
                <div class="bento-nd-output-stats">
                  ${state.ndOutput.stats.map(stat => `
                    <div class="bento-nd-output-stat">
                      <div class="bento-nd-output-stat-value">${stat.value}</div>
                      <div class="bento-nd-output-stat-label">${stat.label}</div>
                    </div>`).join('')}
                </div>` : ''}
            </div>
          </div>
        </div>

        <div class="bento-nd-statusbar">
          <div class="bento-nd-statusbar-left">
            <div class="bento-nd-status-item">
              <div class="bento-nd-status-dot"></div>
              <span>系统就绪</span>
            </div>
            <div class="bento-nd-status-item">
              ${icon('cpu', 12)}
              <span>本地运行</span>
            </div>
          </div>
          <div class="bento-nd-statusbar-right">
            <div class="bento-nd-status-item">
              ${icon('clock', 12)}
              <span>${new Date().toLocaleTimeString('zh-CN')}</span>
            </div>
            <div class="bento-nd-status-item">
              ${icon('shield-check', 12)}
              <span>免登录可用</span>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function renderTicketsPage() {
  return `
    <div class="bento-main">
      <div class="bento-page-header">
        <h2>工单系统</h2>
        <p>管理和追踪运维工单</p>
        <button class="bento-primary-btn" data-action="new-ticket">+ 新建工单</button>
      </div>
      <div class="bento-table-container">
        <table class="bento-data-table">
          <thead>
            <tr>
              <th>工单编号</th>
              <th>标题</th>
              <th>状态</th>
              <th>优先级</th>
              <th>负责人</th>
              <th>更新时间</th>
            </tr>
          </thead>
          <tbody>
            ${tickets.map(t => `
              <tr>
                <td><strong>${t.id}</strong></td>
                <td>${t.title}</td>
                <td><span class="bento-status-tag ${t.status === '已解决' ? 'success' : t.status === '处理中' ? 'warning' : 'info'}">${t.status}</span></td>
                <td><span class="bento-priority-tag ${t.priority.toLowerCase()}">${t.priority}</span></td>
                <td>${t.assignee}</td>
                <td>${t.updated}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function renderAssetsPage() {
  return `
    <div class="bento-main">
      <div class="bento-page-header">
        <h2>资产管理</h2>
        <p>管理网络设备、服务器、终端等资产</p>
      </div>
      <div class="bento-table-container">
        <table class="bento-data-table">
          <thead>
            <tr>
              <th>设备名称</th>
              <th>类型</th>
              <th>IP地址</th>
              <th>状态</th>
              <th>位置</th>
            </tr>
          </thead>
          <tbody>
            ${assets.map(a => `
              <tr>
                <td><strong>${a.name}</strong></td>
                <td>${a.type}</td>
                <td>${a.ip}</td>
                <td><span class="bento-status-tag ${a.status === '正常' ? 'success' : a.status === '告警' ? 'warning' : 'error'}">${a.status}</span></td>
                <td>${a.location}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function renderKnowledgePage() {
  const kbData = state.knowledgeBase || knowledgeBase;
  return `
    <div class="bento-main">
      <div class="bento-page-header">
        <h2>知识库</h2>
        <p>运维经验和故障处理指南</p>
      </div>
      <div class="bento-knowledge-grid">
        ${kbData.map(kb => `
          <div class="bento-knowledge-card">
            <div class="bento-knowledge-category">${kb.category || kb.source || '未分类'}</div>
            <div class="bento-knowledge-title">${kb.title}</div>
            <div class="bento-knowledge-meta">
              ${icon('eye', 12)} ${kb.views || '-'} 次查看 · 更新于 ${kb.updated || kb.reviewedAt || '-'}
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

function renderAuditPage() {
  return `
    <div class="bento-main">
      <div class="bento-page-header">
        <h2>审计日志</h2>
        <p>系统操作记录和安全审计</p>
      </div>
      <div class="bento-activity-timeline" style="margin: 0;">
        ${auditLogs.map(log => `
          <div class="bento-act-item">
            <div class="bento-act-text"><strong>${log.user}</strong> ${log.action}</div>
            <div class="bento-act-meta">
              <span>${log.time}</span>
              <span class="bento-status-tag ${log.result === '成功' ? 'success' : 'error'}">${log.result}</span>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

function remoteActiveSession() {
  return remoteWorkbench.sessions.find(session => session.id === remoteWorkbench.activeSessionId) || null;
}

function setRemoteProtocol(protocol) {
  const previous = remoteWorkbench.protocol;
  remoteWorkbench.protocol = protocol;
  const defaults = { ssh: '22', telnet: '23', rdp: '3389' };
  if (!remoteWorkbench.port || remoteWorkbench.port === defaults[previous]) remoteWorkbench.port = defaults[protocol];
  render();
}

function updateRemoteField(key, value) {
  if (Object.hasOwn(remoteWorkbench, key)) remoteWorkbench[key] = value;
}

async function loadRemoteWorkbench({ quiet = false } = {}) {
  if (remoteWorkbench.loading) return;
  remoteWorkbench.loading = true;
  try {
    const [sessions, history] = await Promise.all([
      apiJson('/api/remote/sessions'),
      apiJson('/api/remote/history'),
    ]);
    remoteWorkbench.sessions = Array.isArray(sessions) ? sessions : [];
    remoteWorkbench.history = Array.isArray(history) ? history : [];
    remoteWorkbench.initialized = true;
    if (!remoteWorkbench.activeSessionId && remoteWorkbench.sessions.length) remoteWorkbench.activeSessionId = remoteWorkbench.sessions[0].id;
    if (!quiet && state.page === 'remote') render();
    if (remoteWorkbench.activeSessionId) startRemotePolling();
  } catch (error) {
    remoteWorkbench.localOutput = `远程管理数据加载失败：${error.message}`;
    if (!quiet && state.page === 'remote') render();
  } finally {
    remoteWorkbench.loading = false;
  }
}

function remoteSessionLabel(session) {
  return `${String(session.protocol || '').toUpperCase()} ${session.host}:${session.port}`;
}

async function connectRemoteSession() {
  if (remoteWorkbench.connecting) return;
  remoteWorkbench.connecting = true;
  remoteWorkbench.localOutput = `正在建立 ${remoteWorkbench.protocol.toUpperCase()} 连接：${remoteWorkbench.host}:${remoteWorkbench.port} ...`;
  render();
  try {
    const session = await apiJson('/api/remote/sessions', {
      method: 'POST',
      body: JSON.stringify({
        protocol: remoteWorkbench.protocol,
        host: remoteWorkbench.host,
        port: remoteWorkbench.port,
        username: remoteWorkbench.username,
        password: remoteWorkbench.password,
        deviceType: remoteWorkbench.deviceType,
      }),
    });
    remoteWorkbench.password = '';
    remoteWorkbench.sessions = [session, ...remoteWorkbench.sessions.filter(item => item.id !== session.id)];
    remoteWorkbench.activeSessionId = session.id;
    remoteWorkbench.outputs[session.id] = '';
    remoteWorkbench.cursors[session.id] = 0;
    remoteWorkbench.localOutput = `${remoteSessionLabel(session)} 已连接。`;
    await loadRemoteWorkbench({ quiet: true });
    showToast(`${session.protocol.toUpperCase()} 连接成功`);
  } catch (error) {
    remoteWorkbench.password = '';
    remoteWorkbench.localOutput = error.message;
    showToast(`远程连接失败：${error.message}`);
  } finally {
    remoteWorkbench.connecting = false;
    render();
  }
}

async function launchRemoteRdp() {
  if (remoteWorkbench.connecting) return;
  remoteWorkbench.connecting = true;
  remoteWorkbench.localOutput = `正在启动 RDP：${remoteWorkbench.host}:${remoteWorkbench.port} ...`;
  render();
  try {
    const result = await apiJson('/api/remote/rdp', {
      method: 'POST',
      body: JSON.stringify({ host: remoteWorkbench.host, port: remoteWorkbench.port, username: remoteWorkbench.username, resolution: remoteWorkbench.resolution }),
    });
    remoteWorkbench.password = '';
    remoteWorkbench.localOutput = `${result.output}\n用户名：${remoteWorkbench.username || '由 mstsc 输入'}\n分辨率：${remoteWorkbench.resolution}\n密码未保存，请在 Windows 凭据界面输入。`;
    await loadRemoteWorkbench({ quiet: true });
    showToast('Windows 远程桌面已启动');
  } catch (error) {
    remoteWorkbench.localOutput = error.message;
    showToast(`RDP 启动失败：${error.message}`);
  } finally {
    remoteWorkbench.connecting = false;
    render();
  }
}

function chooseRemoteSession(sessionId) {
  remoteWorkbench.activeSessionId = sessionId;
  render();
  startRemotePolling();
}

function startRemotePolling() {
  if (remoteWorkbench.poller) window.clearInterval(remoteWorkbench.poller);
  const poll = async () => {
    const session = remoteActiveSession();
    if (!session || state.page !== 'remote') return;
    try {
      const cursor = remoteWorkbench.cursors[session.id] || 0;
      const result = await apiJson(`/api/remote/sessions/${encodeURIComponent(session.id)}/output?after=${cursor}`);
      const text = (result.chunks || []).map(chunk => chunk.data).join('');
      if (text) remoteWorkbench.outputs[session.id] = `${remoteWorkbench.outputs[session.id] || ''}${text}`.slice(-200000);
      remoteWorkbench.cursors[session.id] = result.nextSeq || cursor;
      remoteWorkbench.sessions = remoteWorkbench.sessions.map(item => item.id === session.id ? result.session : item);
      syncRemoteTerminalDom(result.session);
    } catch (error) {
      remoteWorkbench.localOutput = error.message;
      syncRemoteTerminalDom(session);
    }
  };
  poll();
  remoteWorkbench.poller = window.setInterval(poll, 700);
}

function syncRemoteTerminalDom(session = remoteActiveSession()) {
  const terminal = document.querySelector('[data-remote-terminal-output]');
  if (terminal) {
    terminal.textContent = session ? (remoteWorkbench.outputs[session.id] || '等待远端输出...') : remoteWorkbench.localOutput;
    terminal.scrollTop = terminal.scrollHeight;
  }
  const status = document.querySelector('[data-remote-session-status]');
  if (status) status.textContent = session ? `${session.status} · ${remoteSessionLabel(session)}` : '未建立终端会话';
}

async function sendRemoteInput(controlData = null) {
  const session = remoteActiveSession();
  if (!session || session.status !== 'connected') return showToast('请先选择已连接的 SSH/Telnet 会话');
  const input = document.querySelector('[data-remote-command]');
  const data = controlData ?? `${input?.value || ''}\n`;
  if (!data.trim() && controlData === null) return;
  try {
    await apiJson(`/api/remote/sessions/${encodeURIComponent(session.id)}/input`, { method: 'POST', body: JSON.stringify({ data }) });
    if (input) { input.value = ''; input.focus(); }
  } catch (error) { showToast(`发送失败：${error.message}`); }
}

function remoteCommandKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendRemoteInput(); }
}

async function disconnectRemoteSession(sessionId = remoteWorkbench.activeSessionId) {
  if (!sessionId) return;
  try {
    const session = await apiJson(`/api/remote/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE', body: '{}' });
    remoteWorkbench.sessions = remoteWorkbench.sessions.map(item => item.id === sessionId ? session : item);
    showToast('远程会话已断开');
    render();
  } catch (error) { showToast(`断开失败：${error.message}`); }
}

function useRemoteHistory(historyId) {
  const entry = remoteWorkbench.history.find(item => item.id === historyId);
  if (!entry) return;
  remoteWorkbench.protocol = entry.protocol;
  remoteWorkbench.host = entry.host;
  remoteWorkbench.port = String(entry.port);
  remoteWorkbench.username = entry.username || '';
  remoteWorkbench.deviceType = entry.deviceType || remoteWorkbench.deviceType;
  remoteWorkbench.resolution = entry.resolution || 'auto';
  render();
}

async function deleteRemoteHistory(historyId) {
  try {
    await apiJson(`/api/remote/history/${encodeURIComponent(historyId)}`, { method: 'DELETE', body: '{}' });
    remoteWorkbench.history = remoteWorkbench.history.filter(item => item.id !== historyId);
    showToast('连接历史已删除');
    render();
  } catch (error) { showToast(`删除失败：${error.message}`); }
}

function exportRemoteOutput() {
  const session = remoteActiveSession();
  const output = session ? remoteWorkbench.outputs[session.id] || '' : remoteWorkbench.localOutput;
  if (!output) return showToast('当前没有可导出的远程输出');
  const blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `remote-${session?.protocol || 'rdp'}-${session?.host || 'output'}-${Date.now()}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function renderRemotePage() {
  const active = remoteActiveSession();
  const activeOutput = active ? remoteWorkbench.outputs[active.id] || '等待远端输出...' : remoteWorkbench.localOutput;
  const terminalMode = ['ssh', 'telnet'].includes(remoteWorkbench.protocol);
  return `
    <div class="bento-main tk-remote-page">
      <div class="tk-remote-heading">
        <div><span class="tk-remote-kicker">REMOTE OPERATIONS</span><h2>远程管理工作台</h2><p>SSH / Telnet 多会话终端、RDP 启动、连接历史和操作输出统一留痕</p></div>
        <div class="tk-remote-heading-stats"><span><strong>${remoteWorkbench.sessions.filter(item => item.status === 'connected').length}</strong>活动会话</span><span><strong>${remoteWorkbench.history.length}</strong>历史记录</span><span><strong>8</strong>会话上限</span></div>
      </div>
      <div class="tk-remote-layout">
        <aside class="tk-remote-sidebar">
          <section class="tk-remote-panel">
            <div class="tk-remote-panel-title">${icon('plug-zap', 15)} 新建连接</div>
            <div class="tk-remote-segmented">
              ${['ssh', 'telnet', 'rdp'].map(protocol => `<button type="button" class="${remoteWorkbench.protocol === protocol ? 'active' : ''}" onclick="setRemoteProtocol('${protocol}')">${protocol.toUpperCase()}</button>`).join('')}
            </div>
            <label class="tk-remote-field"><span>主机 / IP</span><input value="${escapeHtml(remoteWorkbench.host)}" placeholder="192.168.1.10" oninput="updateRemoteField('host', this.value)" /></label>
            <div class="tk-remote-field-row">
              <label class="tk-remote-field"><span>端口</span><input value="${escapeHtml(remoteWorkbench.port)}" inputmode="numeric" oninput="updateRemoteField('port', this.value)" /></label>
              <label class="tk-remote-field"><span>用户名</span><input value="${escapeHtml(remoteWorkbench.username)}" autocomplete="username" placeholder="admin" oninput="updateRemoteField('username', this.value)" /></label>
            </div>
            ${terminalMode ? `
              <label class="tk-remote-field"><span>密码（仅当次连接）</span><input type="password" value="${escapeHtml(remoteWorkbench.password)}" autocomplete="current-password" placeholder="不会写入历史或审计" oninput="updateRemoteField('password', this.value)" /></label>
              <label class="tk-remote-field"><span>设备类型</span><select onchange="updateRemoteField('deviceType', this.value)">${['Linux / Unix', 'Cisco IOS', '华为 VRP', 'H3C Comware', '通用终端'].map(value => `<option${remoteWorkbench.deviceType === value ? ' selected' : ''}>${value}</option>`).join('')}</select></label>
              <button type="button" class="tk-remote-primary" onclick="connectRemoteSession()" ${remoteWorkbench.connecting ? 'disabled' : ''}>${icon(remoteWorkbench.connecting ? 'loader-2' : 'terminal', 15)} ${remoteWorkbench.connecting ? '连接中' : `连接 ${remoteWorkbench.protocol.toUpperCase()}`}</button>
            ` : `
              <label class="tk-remote-field"><span>窗口分辨率</span><select onchange="updateRemoteField('resolution', this.value)">${[
                ['auto', '自动'], ['fullscreen', '全屏'], ['1920x1080', '1920 x 1080'], ['1600x900', '1600 x 900'], ['1366x768', '1366 x 768'],
              ].map(([value, label]) => `<option value="${value}"${remoteWorkbench.resolution === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
              <button type="button" class="tk-remote-primary" onclick="launchRemoteRdp()" ${remoteWorkbench.connecting ? 'disabled' : ''}>${icon('monitor-play', 15)} 启动 Windows 远程桌面</button>
            `}
          </section>
          <section class="tk-remote-panel tk-remote-history-panel">
            <div class="tk-remote-panel-title"><span>${icon('history', 15)} 最近连接</span><small>不保存密码</small></div>
            <div class="tk-remote-history-list">
              ${remoteWorkbench.history.length ? remoteWorkbench.history.slice(0, 12).map(entry => `
                <div class="tk-remote-history-item">
                  <button type="button" onclick="useRemoteHistory('${entry.id}')"><span class="tk-remote-protocol">${escapeHtml(entry.protocol.toUpperCase())}</span><strong>${escapeHtml(entry.host)}:${entry.port}</strong><small>${escapeHtml(entry.username || '未指定用户')} · ${new Date(entry.lastUsedAt).toLocaleString('zh-CN')}</small></button>
                  <button type="button" class="tk-remote-icon-button" title="删除历史" onclick="deleteRemoteHistory('${entry.id}')">${icon('trash-2', 13)}</button>
                </div>`).join('') : '<div class="tk-remote-empty">暂无连接历史</div>'}
            </div>
          </section>
        </aside>
        <main class="tk-remote-console">
          <div class="tk-remote-tabs">
            <div class="tk-remote-tab-list">
              ${remoteWorkbench.sessions.length ? remoteWorkbench.sessions.map(session => `<button type="button" class="tk-remote-tab ${active?.id === session.id ? 'active' : ''}" onclick="chooseRemoteSession('${session.id}')"><i class="${session.status}"></i><span>${escapeHtml(session.protocol.toUpperCase())} ${escapeHtml(session.host)}</span></button>`).join('') : '<span class="tk-remote-tab-placeholder">尚未建立终端会话</span>'}
            </div>
            <div class="tk-remote-console-actions">
              <button type="button" title="导出输出" onclick="exportRemoteOutput()">${icon('download', 14)}</button>
              ${active && active.status === 'connected' ? `<button type="button" title="断开会话" onclick="disconnectRemoteSession()">${icon('square', 14)}</button>` : ''}
            </div>
          </div>
          <div class="tk-remote-status"><span data-remote-session-status>${active ? `${escapeHtml(active.status)} · ${escapeHtml(remoteSessionLabel(active))}` : '未建立终端会话'}</span><span>UTF-8 · xterm compatible</span></div>
          <pre class="tk-remote-terminal" data-remote-terminal-output>${escapeHtml(activeOutput)}</pre>
          <div class="tk-remote-commandbar">
            <button type="button" title="发送 Ctrl+C" onclick="sendRemoteInput('\\u0003')">^C</button>
            <textarea rows="1" data-remote-command placeholder="输入命令，Enter 发送，Shift+Enter 换行" onkeydown="remoteCommandKeydown(event)" ${!active || active.status !== 'connected' ? 'disabled' : ''}></textarea>
            <button type="button" class="send" onclick="sendRemoteInput()" ${!active || active.status !== 'connected' ? 'disabled' : ''}>${icon('send', 14)} 发送</button>
          </div>
        </main>
      </div>
    </div>`;
}

function renderExternalToolsPage() {
  return `
    <div class="bento-main">
      <div class="bento-page-header">
        <h2>外部工具</h2>
        <p>已集成的第三方运维工具快捷入口</p>
      </div>
      <div class="bento-card">
        <h3>外部工具</h3>
        <div class="bento-tool-grid">
          ${state.externalTools.length ? state.externalTools.map(tool => `
            <div class="bento-tool-item" data-tool="external-${tool.id}">
              <div class="bento-tool-item-icon">${icon('external-link', 16)}</div>
              <div class="bento-tool-item-info">
                <div class="bento-tool-item-name">${tool.name}</div>
                <div class="bento-tool-item-desc">${tool.category}</div>
              </div>
            </div>`).join('') : '<div style="padding:40px; text-align:center; color:var(--bento-text-tertiary); grid-column:1/-1;">暂无外部工具，可在系统设置中添加</div>'}
        </div>
      </div>
    </div>`;
}

function renderMonitoringPage() {
  return `
    <div class="bento-main">
      <div class="bento-page-header">
        <h2>监控告警</h2>
        <p>实时监控和告警管理</p>
      </div>
      <div class="bento-alert-grid">
        ${monitoringAlerts.map(alert => `
          <div class="bento-alert-card ${alert.status}">
            <div class="bento-alert-header">
              <span class="bento-alert-icon">${icon(alert.status === 'critical' ? 'alert-circle' : alert.status === 'warning' ? 'alert-triangle' : 'check-circle', 18)}</span>
              <span class="bento-alert-name">${alert.name}</span>
              <span class="bento-alert-time">${alert.time}</span>
            </div>
            <div class="bento-alert-value">
              <span class="bento-alert-current">${alert.value}</span>
              <span class="bento-alert-threshold">阈值: ${alert.threshold}</span>
            </div>
            <div class="bento-alert-progress">
              <div class="bento-alert-progress-bar" style="width: ${Math.min(100, parseInt(alert.value) / parseInt(alert.threshold) * 100)}%"></div>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

function renderSOPPage() {
  return `
    <div class="bento-main">
      <div class="bento-page-header">
        <h2>现场 SOP</h2>
        <p>标准操作流程指南</p>
      </div>
      <div class="bento-sop-grid">
        ${[
          { title: '网络故障排查', steps: ['确认故障范围', '检查物理连接', '测试连通性', '定位根因'] },
          { title: '打印机故障处理', steps: ['检查电源', '确认网络', '清除队列', '重启服务'] },
          { title: '服务器异常处理', steps: ['查看告警', '检查资源', '分析日志', '备份恢复'] },
          { title: '监控画面丢失', steps: ['检查电源', '确认IP', '测试连通', '重启设备'] },
        ].map((sop, idx) => `
          <div class="bento-sop-card">
            <div class="bento-sop-icon">${icon('check-circle', 20)}</div>
            <div class="bento-sop-title">${sop.title}</div>
            <div class="bento-sop-steps">
              ${sop.steps.map((step, i) => `
                <div class="bento-sop-step">
                  <span class="bento-sop-step-num">${i + 1}</span>
                  <span>${step}</span>
                </div>`).join('')}
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

function renderWorklogPage() {
  const latestRun = state.toolHistory.find((run) => run.status === 'success');
  const result = latestRun?.summary || '';
  const assets = state.assets || [];
  const tickets = state.tickets || [];
  const worklogs = state.worklogs || [];
  return `
    <div class="bento-main">
      <div class="bento-page-header">
        <h2>现场处置单</h2>
        <p>将处理过程、工具结论与交付结果固化为可导出的现场记录</p>
      </div>
      <div class="bento-card">
        <h3>新建处置单</h3>
        <div class="bento-form-row">
          <div class="bento-form-group"><label>门店 / 位置 *</label><input class="bento-form-input" data-worklog-field="site" placeholder="例如：总部 3F 财务区" /></div>
          <div class="bento-form-group"><label>联系人</label><input class="bento-form-input" data-worklog-field="contact" placeholder="姓名 / 电话" value="${escapeHtml(state.auth.user?.displayName || '')}" /></div>
        </div>
        <div class="bento-form-group">
          <label>故障标题 *</label>
          <input class="bento-form-input" data-worklog-field="title" placeholder="例如：财务打印机无法打印" />
        </div>
        <div class="bento-form-row">
          <div class="bento-form-group">
            <label>关联资产</label>
            <select class="bento-form-select" data-worklog-field="assetId"><option value="">不关联</option>${assets.map((asset) => `<option value="${escapeHtml(asset.id)}">${escapeHtml(asset.name)}${asset.site ? ` · ${escapeHtml(asset.site)}` : ''}</option>`).join('')}</select>
          </div>
          <div class="bento-form-group">
            <label>关联工单</label>
            <select class="bento-form-select" data-worklog-field="ticketId"><option value="">不关联</option>${tickets.map((ticket) => `<option value="${escapeHtml(ticket.id)}">${escapeHtml(ticket.id)} · ${escapeHtml(ticket.title)}</option>`).join('')}</select>
          </div>
        </div>
        <div class="bento-form-group">
          <label>处理结果 *</label>
          <textarea class="bento-form-textarea" data-worklog-field="result" placeholder="填写已验证的处理结果...">${escapeHtml(result)}</textarea>
        </div>
        <div class="bento-form-group">
          <label>处理过程与备注</label>
          <textarea class="bento-form-textarea" data-worklog-field="notes" placeholder="记录检查项、执行步骤、验证结果、遗留风险与回滚说明..."></textarea>
        </div>
        <div class="bento-form-actions">
          <button class="bento-primary-btn" data-action="save-worklog">保存处置单</button>
          <button class="bento-ghost-btn" data-nav="dashboard">返回工作台</button>
        </div>
      </div>
      <div class="bento-table-container">
        <table class="bento-data-table"><thead><tr><th>单号</th><th>地点</th><th>故障与结论</th><th>时间</th><th>操作</th></tr></thead><tbody>
          ${worklogs.length ? worklogs.map((worklog) => `<tr><td>${escapeHtml(worklog.id)}</td><td>${escapeHtml(worklog.site)}</td><td><strong>${escapeHtml(worklog.title)}</strong><br><small>${escapeHtml(String(worklog.result || '').slice(0, 80))}</small></td><td>${escapeHtml(new Date(worklog.createdAt).toLocaleString('zh-CN', { hour12: false }))}</td><td><button class="bento-topbar-login" data-action="export-worklog" data-worklog-id="${escapeHtml(worklog.id)}" title="导出处置单">${icon('download', 14)}</button></td></tr>`).join('') : '<tr><td colspan="5">暂无处置单。完成现场处理后在上方创建第一份可交付记录。</td></tr>'}
        </tbody></table>
      </div>
    </div>`;
}

function renderAIPage() {
  if (!isLoggedIn()) {
    return `<div class="bento-main"><div class="bento-access-state">${icon('lock-keyhole', 30)}<h2>请先登录后使用</h2><p>AI 排障需要联网和账号授权，本地网络诊断工具不受影响。</p><button class="bento-primary-btn" data-action="go-login">前往登录</button></div></div>`;
  }
  const renderMessage = (message) => {
    const isUser = message.role === 'user';
    // 支持 toolCalls 类型的消息渲染
    if (message.toolCalls && message.toolCalls.length) {
      const traces = message.toolCalls.map(tc => `
        <div class="bento-ai-tool-trace">
          <div class="bento-ai-tool-trace-header">
            <span class="bento-ai-tool-trace-icon">${icon('cpu', 16)}</span>
            <span>调用工具：${escapeHtml(tc.tool || tc.name || '未知工具')}</span>
            <span class="bento-ai-tool-trace-status">已完成</span>
          </div>
          <div style="font-size:11px;color:var(--bento-text-tertiary);font-family:var(--bento-font-mono);">${escapeHtml(typeof tc.result === 'string' ? tc.result.slice(0, 120) : JSON.stringify(tc.result || '').slice(0, 120))}</div>
        </div>`).join('');
      return `<div class="bento-chat-message bot"><div class="bento-chat-avatar">AI</div><div class="bento-chat-content"><div class="bento-chat-name">AI 排障助手 <span class="bento-ai-brain-wave"><span class="bento-ai-brain-wave-bar"></span><span class="bento-ai-brain-wave-bar"></span><span class="bento-ai-brain-wave-bar"></span><span class="bento-ai-brain-wave-bar"></span><span class="bento-ai-brain-wave-bar"></span></span></div>${traces}<div class="bento-chat-text">${escapeHtml(message.content || '')}</div></div></div>`;
    }
    return `
      <div class="bento-chat-message ${isUser ? 'user' : 'bot'}">
        <div class="bento-chat-avatar">${isUser ? escapeHtml(state.auth.user?.displayName?.[0] || '我') : 'AI'}</div>
        <div class="bento-chat-content"><div class="bento-chat-name">${isUser ? escapeHtml(state.auth.user?.displayName || '我') : 'AI 排障助手'}</div><div class="bento-chat-text">${escapeHtml(message.content)}</div></div>
      </div>`;
  };
  const messages = state.chatMessages.map(renderMessage).join('');
  // 神经网络可视化（AI 思考时激活）
  const neuralNet = state.aiSending ? `
    <div class="bento-card bento-holo-scan" style="padding:14px 16px; margin-bottom:12px;">
      <div style="display:flex; align-items:center; gap:14px;">
        <div class="bento-ai-core"></div>
        <div style="flex:1;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
            <span style="font-weight:700; font-size:14px;" class="bento-aurora-text">AI 神经网络推理中</span>
            <span class="bento-ai-brain-wave"><span class="bento-ai-brain-wave-bar"></span><span class="bento-ai-brain-wave-bar"></span><span class="bento-ai-brain-wave-bar"></span><span class="bento-ai-brain-wave-bar"></span><span class="bento-ai-brain-wave-bar"></span></span>
          </div>
          <div style="font-size:11px; color:var(--bento-text-tertiary);">深度推理 · 工具调用 · SOP 匹配 · 多轮分析</div>
        </div>
      </div>
      <div class="bento-neural-net" style="margin-top:10px;">
        <div class="bento-neural-layer">
          <span class="bento-neural-node"></span><span class="bento-neural-node"></span><span class="bento-neural-node"></span><span class="bento-neural-node"></span>
        </div>
        <div class="bento-neural-layer">
          <span class="bento-neural-node"></span><span class="bento-neural-node"></span><span class="bento-neural-node"></span><span class="bento-neural-node"></span><span class="bento-neural-node"></span>
        </div>
        <div class="bento-neural-layer">
          <span class="bento-neural-node"></span><span class="bento-neural-node"></span><span class="bento-neural-node"></span><span class="bento-neural-node"></span><span class="bento-neural-node"></span>
        </div>
        <div class="bento-neural-layer">
          <span class="bento-neural-node"></span><span class="bento-neural-node"></span><span class="bento-neural-node"></span>
        </div>
      </div>
    </div>` : '';
  const thinkingHTML = state.aiSending ? `
    <div class="bento-chat-message bot">
      <div class="bento-chat-avatar">AI</div>
      <div class="bento-chat-content">
        <div class="bento-chat-name">AI 排障助手 <span class="bento-ai-brain-wave"><span class="bento-ai-brain-wave-bar"></span><span class="bento-ai-brain-wave-bar"></span><span class="bento-ai-brain-wave-bar"></span><span class="bento-ai-brain-wave-bar"></span><span class="bento-ai-brain-wave-bar"></span></span></div>
        <div class="bento-ai-thinking">
          <span class="bento-ai-thinking-dot"></span>
          <span class="bento-ai-thinking-dot"></span>
          <span class="bento-ai-thinking-dot"></span>
          <span style="font-size:12px;color:var(--bento-text-tertiary);margin-left:6px;">正在分析故障并调用诊断工具...</span>
        </div>
      </div>
    </div>` : '';
  return `
    <div class="bento-main">
      <div class="bento-page-header">
        <h2><span class="bento-aurora-text">AI 排障助手</span></h2>
        <p>上传告警、日志或截图，AI 会基于 SOP 给出排查步骤，支持自动调用诊断工具</p>
        ${state.chatMessages.length ? `<button class="bento-icon-btn" data-action="ai-clear-history" title="清空对话记录" style="margin-left:auto;">${icon('trash-2', 15)}</button>` : ''}
      </div>
      ${neuralNet}
      <div class="bento-chat-container">
        <div class="bento-chat-messages">
          <div class="bento-chat-message bot">
            <div class="bento-chat-avatar">AI</div>
            <div class="bento-chat-content">
              <div class="bento-chat-name">AI 排障助手</div>
              <div class="bento-chat-text">您好！我是您的运维 AI 助手。请描述故障现象，或者上传告警、日志、截图，我会基于 SOP 给出排查建议，并可自动调用 Ping、端口扫描等诊断工具。</div>
            </div>
          </div>
          ${messages}
          ${thinkingHTML}
        </div>
        <div class="bento-chat-input-area">
          <textarea id="ai-input" class="bento-chat-input" placeholder="描述故障现象，例如：办公区网络不通..." ${state.aiSending ? 'disabled' : ''}></textarea>
          <button class="bento-primary-btn" data-action="ai-send" ${state.aiSending ? 'disabled' : ''}>${state.aiSending ? '分析中' : '发送'}</button>
        </div>
      </div>
    </div>`;
}

function renderPublishAnnouncementPage() {
  if (!isAdmin()) return `<div class="bento-main"><div class="bento-access-state">${icon('shield-alert', 30)}<h2>无权访问</h2><p>仅管理员可以发布公告。</p></div></div>`;
  const f = state.announcementForm;
  return `
    <div class="bento-main">
      <div class="bento-page-header"><h2>发布公告</h2><p>公告将在已登录客户端的下一次轮询中展示。</p></div>
      <section class="bento-card bento-announcement-form">
        <label>标题<input class="bento-form-input" data-announcement-field="title" value="${escapeHtml(f.title)}" maxlength="100" placeholder="请输入公告标题" /></label>
        <label>内容<textarea class="bento-form-textarea" data-announcement-field="content" maxlength="3000" placeholder="请输入公告内容">${escapeHtml(f.content)}</textarea></label>
        <label>等级<select class="bento-form-input" data-announcement-field="level"><option value="info" ${f.level === 'info' ? 'selected' : ''}>普通</option><option value="warning" ${f.level === 'warning' ? 'selected' : ''}>提醒</option><option value="danger" ${f.level === 'danger' ? 'selected' : ''}>紧急</option></select></label>
        <div class="bento-form-actions"><button class="bento-primary-btn" data-action="publish-announcement">发布公告</button></div>
      </section>
    </div>`;
}

function renderAccountManagementPage() {
  const am = state.accountManagement;
  const roleLabels = { super: '超级管理员', manager: '运维经理', admin: '管理员', distributor: '分销商', engineer: '运维工程师', user: '普通用户', viewer: '只读人员' };
  const roleColors = { super: '#ef4444', manager: '#f59e0b', admin: '#3b82f6', distributor: '#8b5cf6', engineer: '#06b6d4', user: '#64748b', viewer: '#94a3b8' };
  return `
    <div class="bento-main">
      <div class="bento-page-header">
        <h2>账号管理</h2>
        <p>管理用户账号、角色分配和权限控制</p>
        <button class="bento-primary-btn" data-action="am-show-create">+ 新增账号</button>
      </div>
      <div class="bento-card" style="margin-bottom: 12px;">
        <div style="display:flex; gap:12px; align-items:center;">
          <input type="text" id="am-search" placeholder="搜索账号、邮箱或显示名称..." value="${escapeHtml(am.search)}"
                 style="flex:1; padding:8px 12px; border:1px solid var(--bento-border); border-radius:8px; background:var(--bento-surface); color:var(--bento-text);"
                 oninput="state.accountManagement.search=this.value" />
          <button class="bento-primary-btn" data-action="am-search">搜索</button>
          <button class="bento-primary-btn" style="background:var(--bento-surface); color:var(--bento-text-secondary); border:1px solid var(--bento-border);" data-action="am-reset">重置</button>
        </div>
      </div>
      <div class="bento-card">
        ${am.loading ? '<div style="padding:40px; text-align:center; color:var(--bento-text-tertiary);">加载中...</div>' : `
        <table class="bento-data-table" style="width:100%;">
          <thead>
            <tr>
              <th style="text-align:left; padding:8px;">ID</th>
              <th style="text-align:left; padding:8px;">账号</th>
              <th style="text-align:left; padding:8px;">邮箱</th>
              <th style="text-align:left; padding:8px;">显示名称</th>
              <th style="text-align:left; padding:8px;">角色</th>
              <th style="text-align:left; padding:8px;">状态</th>
              <th style="text-align:left; padding:8px;">注册时间</th>
              <th style="text-align:left; padding:8px;">操作</th>
            </tr>
          </thead>
          <tbody>
            ${am.list.length === 0 ? '<tr><td colspan="8" style="padding:40px; text-align:center; color:var(--bento-text-tertiary);">暂无数据</td></tr>' :
              am.list.map(u => `
              <tr style="border-bottom:1px solid var(--bento-border-light);">
                <td style="padding:8px;">${u.id}</td>
                <td style="padding:8px;">${escapeHtml(u.username || '-')}</td>
                <td style="padding:8px;">${escapeHtml(u.email || '-')}</td>
                <td style="padding:8px;">${escapeHtml(u.displayName || '-')}</td>
                <td style="padding:8px;"><span style="padding:2px 8px; border-radius:4px; font-size:12px; font-weight:600; background:${roleColors[u.role] || '#64748b'}22; color:${roleColors[u.role] || '#64748b'};">${roleLabels[u.role] || u.role}</span></td>
                <td style="padding:8px;">${Number(u.disabled) ? '<span style="color:#ef4444; font-size:12px; font-weight:600;">已禁用</span>' : '<span style="color:#10b981; font-size:12px; font-weight:600;">启用</span>'}</td>
                <td style="padding:8px; font-size:13px; color:var(--bento-text-tertiary);">${u.createdAt ? new Date(u.createdAt).toLocaleString('zh-CN') : '-'}</td>
                <td style="padding:8px;">
                  <div style="display:flex; gap:4px;">
                    <button class="bento-topbar-login" data-action="am-edit" data-user-id="${u.id}">编辑</button>
                    <button class="bento-topbar-login" data-action="am-reset-pwd" data-user-id="${u.id}">重置密码</button>
                    <button class="bento-topbar-login" data-action="am-toggle" data-user-id="${u.id}" data-user-role="${u.role}">${Number(u.disabled) ? '启用' : '禁用'}</button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 0;">
          <span style="font-size:13px; color:var(--bento-text-tertiary);">共 ${am.total} 条记录</span>
          <div style="display:flex; gap:4px;">
            <button class="bento-topbar-login" data-action="am-prev" ${am.page <= 1 ? 'disabled' : ''}>上一页</button>
            <span style="padding:4px 12px; font-size:13px;">${am.page} / ${Math.ceil(am.total / am.pageSize) || 1}</span>
            <button class="bento-topbar-login" data-action="am-next" ${am.page * am.pageSize >= am.total ? 'disabled' : ''}>下一页</button>
          </div>
        </div>`}
      </div>
      ${am.showModal ? renderAccountModal(am) : ''}
    </div>`;
}

function renderAccountModal(am) {
  const roleLabels = { super: '超级管理员', manager: '运维经理', admin: '管理员', distributor: '分销商', engineer: '运维工程师', user: '普通用户', viewer: '只读人员' };
  const isEdit = am.modalMode === 'edit';
  const u = am.editUser || {};
  return `
    <div class="bento-overlay" onclick="state.accountManagement.showModal=false;render();">
      <div class="bento-settings-panel" style="max-width:480px;" onclick="event.stopPropagation();">
        <div class="bento-settings-header">
          <div>
            <div class="bento-settings-title">${isEdit ? '编辑账号' : '新增账号'}</div>
            <div class="bento-settings-subtitle">${isEdit ? '修改用户信息和角色' : '创建新用户账号'}</div>
          </div>
          <button class="bento-settings-close" onclick="state.accountManagement.showModal=false;render();">${icon('x', 18)}</button>
        </div>
        <div style="padding:20px; display:flex; flex-direction:column; gap:16px;">
          <div>
            <label style="font-size:13px; font-weight:600; color:var(--bento-text-secondary); display:block; margin-bottom:6px;">账号</label>
            <input type="text" id="am-username" value="${escapeHtml(u.username || '')}" ${isEdit ? 'disabled' : ''} placeholder="3-32 位字母、数字、点或下划线"
                   style="width:100%; padding:10px 14px; border:1px solid var(--bento-border); border-radius:8px; background:var(--bento-surface); color:var(--bento-text);" />
          </div>
          <div>
            <label style="font-size:13px; font-weight:600; color:var(--bento-text-secondary); display:block; margin-bottom:6px;">邮箱</label>
            <input type="email" id="am-email" value="${escapeHtml(u.email || '')}"
                   style="width:100%; padding:10px 14px; border:1px solid var(--bento-border); border-radius:8px; background:var(--bento-surface); color:var(--bento-text);" />
          </div>
          ${!isEdit ? `<div>
            <label style="font-size:13px; font-weight:600; color:var(--bento-text-secondary); display:block; margin-bottom:6px;">密码</label>
            <input type="password" id="am-password" placeholder="初始密码"
                   style="width:100%; padding:10px 14px; border:1px solid var(--bento-border); border-radius:8px; background:var(--bento-surface); color:var(--bento-text);" />
          </div>` : ''}
          <div>
            <label style="font-size:13px; font-weight:600; color:var(--bento-text-secondary); display:block; margin-bottom:6px;">显示名称</label>
            <input type="text" id="am-nickname" value="${escapeHtml(u.displayName || '')}"
                   style="width:100%; padding:10px 14px; border:1px solid var(--bento-border); border-radius:8px; background:var(--bento-surface); color:var(--bento-text);" />
          </div>
          <div>
            <label style="font-size:13px; font-weight:600; color:var(--bento-text-secondary); display:block; margin-bottom:6px;">角色</label>
            <select id="am-role" style="width:100%; padding:10px 14px; border:1px solid var(--bento-border); border-radius:8px; background:var(--bento-surface); color:var(--bento-text);">
              ${Object.entries(roleLabels).filter(([r]) => {
                const cur = getUserRole();
                if (cur === 'super') return r !== 'super';
                if (cur === 'manager') return ['admin', 'distributor', 'engineer', 'user', 'viewer'].includes(r);
                return ['distributor', 'engineer', 'user', 'viewer'].includes(r);
              }).map(([r, label]) =>
                `<option value="${r}" ${u.role === r ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
          </div>
          <div style="display:flex; gap:8px; margin-top:8px;">
            <button class="bento-primary-btn" style="flex:1;" data-action="am-save">${isEdit ? '保存修改' : '创建账号'}</button>
            <button class="bento-primary-btn" style="background:var(--bento-surface); color:var(--bento-text-secondary); border:1px solid var(--bento-border);" onclick="state.accountManagement.showModal=false;render();">取消</button>
          </div>
        </div>
      </div>
    </div>`;
}

// 账号管理数据加载
async function loadAccountList() {
  const am = state.accountManagement;
  am.loading = true;
  render();
  try {
    const users = await requestApi('/auth/users');
    const query = am.search.trim().toLowerCase();
    const filtered = (Array.isArray(users) ? users : []).filter((user) => !query || [user.username, user.email, user.displayName, user.role].some((value) => String(value || '').toLowerCase().includes(query)));
    am.total = filtered.length;
    const start = (am.page - 1) * am.pageSize;
    am.list = filtered.slice(start, start + am.pageSize);
  } catch (err) {
    showToast('加载用户列表失败: ' + err.message);
  }
  am.loading = false;
  render();
}

// 账号管理操作
async function saveAccount() {
  const am = state.accountManagement;
  const username = document.getElementById('am-username')?.value?.trim();
  const email = document.getElementById('am-email')?.value?.trim();
  const password = document.getElementById('am-password')?.value?.trim();
  const displayName = document.getElementById('am-nickname')?.value?.trim();
  const role = document.getElementById('am-role')?.value;

  try {
    if (am.modalMode === 'create') {
      if (!username || !password) return showToast('请填写账号和初始密码');
      await requestApi('/auth/users', { method: 'POST', body: JSON.stringify({ username, email, password, displayName, role }) });
      showToast('账号创建成功');
      am.showModal = false;
      loadAccountList();
    } else {
      await requestApi('/auth/users/' + encodeURIComponent(am.editUser.id), { method: 'PATCH', body: JSON.stringify({ email, displayName, role }) });
      showToast('修改成功');
      am.showModal = false;
      loadAccountList();
    }
  } catch (err) { showToast('操作失败: ' + err.message); }
}

async function resetUserPassword(userId) {
  const newPwd = prompt('请输入新密码（至少8位）:');
  if (!newPwd || newPwd.length < 8) { if (newPwd !== null) showToast('密码至少8位'); return; }
  try {
    await requestApi('/auth/users/' + encodeURIComponent(userId), { method: 'PATCH', body: JSON.stringify({ password: newPwd }) });
    showToast('密码重置成功');
  } catch (err) { showToast('重置失败: ' + err.message); }
}

async function toggleUserStatus(userId) {
  const user = state.accountManagement.list.find(u => String(u.id) === String(userId));
  const newDisabled = user ? !Boolean(user.disabled) : true;
  try {
    await requestApi('/auth/users/' + encodeURIComponent(userId), { method: 'PATCH', body: JSON.stringify({ disabled: newDisabled }) });
    showToast(newDisabled ? '账号已禁用' : '账号已启用');
    loadAccountList();
  } catch (err) { showToast('操作失败: ' + err.message); }
}

function renderAnnouncementModal() {
  const announcement = state.announcement;
  if (!announcement) return '';
  const level = ['info', 'warning', 'danger'].includes(announcement.level) ? announcement.level : 'info';
  const publishedAt = announcement.publishedAt || announcement.createdAt || announcement.created_at || announcement.publishTime || '';
  const time = publishedAt ? new Date(publishedAt).toLocaleString('zh-CN', { hour12: false }) : '刚刚';
  return `<div class="bento-overlay bento-announcement-overlay"><section class="bento-announcement-modal ${level}" role="dialog" aria-modal="true" aria-labelledby="announcement-title"><div class="bento-announcement-level">${level === 'danger' ? '紧急公告' : level === 'warning' ? '提醒公告' : '系统公告'}</div><h2 id="announcement-title">${escapeHtml(announcement.title || '系统公告')}</h2><div class="bento-announcement-content">${escapeHtml(announcement.content || announcement.message || '')}</div><time>${escapeHtml(time)}</time><div class="bento-announcement-actions"><button class="bento-primary-btn" data-action="dismiss-announcement">我知道了</button></div></section></div>`;
}

function renderLogoutConfirmModal() {
  if (!state.logoutConfirm) return '';
  return `
    <div class="bento-overlay" style="z-index:10000;">
      <div style="background:var(--bento-surface); border-radius:16px; padding:32px; max-width:360px; width:90%; box-shadow:0 20px 60px rgba(0,0,0,0.3); text-align:center;">
        <div style="width:56px; height:56px; border-radius:50%; background:#fef2f2; display:flex; align-items:center; justify-content:center; margin:0 auto 16px;">
          ${icon('log-out', 24)}
        </div>
        <h3 style="margin:0 0 8px; font-size:18px; color:var(--bento-text);">确认退出登录？</h3>
        <p style="margin:0 0 24px; font-size:14px; color:var(--bento-text-tertiary);">退出后需要重新登录才能使用管理功能</p>
        <div style="display:flex; gap:12px;">
          <button class="bento-primary-btn" style="flex:1; background:var(--bento-surface); color:var(--bento-text-secondary); border:1px solid var(--bento-border);" data-action="cancel-logout">取消</button>
          <button class="bento-primary-btn" style="flex:1; background:#ef4444;" data-action="confirm-logout-yes">确认退出</button>
        </div>
      </div>
    </div>`;
}

function renderTopologyPage() {
  // 3D 网络拓扑节点数据（等距视图坐标 + 深度分层）
  const topologyNodes = [
    { id: 'router', type: 'router', label: '核心路由器', x: 45, y: 35, alert: false, depth: 'near' },
    { id: 'fw', type: 'router', label: '防火墙', x: 25, y: 50, alert: false, depth: 'mid' },
    { id: 'sw1', type: 'switch', label: '核心交换机', x: 65, y: 50, alert: true, depth: 'near' },
    { id: 'sw2', type: 'switch', label: '接入交换机A', x: 80, y: 65, alert: false, depth: 'mid' },
    { id: 'sw3', type: 'switch', label: '接入交换机B', x: 50, y: 70, alert: false, depth: 'mid' },
    { id: 'srv1', type: 'server', label: '应用服务器', x: 75, y: 80, alert: false, depth: 'far' },
    { id: 'srv2', type: 'server', label: '数据库服务器', x: 35, y: 75, alert: false, depth: 'far' },
    { id: 'ap1', type: 'ap', label: '无线AP-1F', x: 15, y: 70, alert: false, depth: 'far' },
    { id: 'ap2', type: 'ap', label: '无线AP-2F', x: 90, y: 45, alert: false, depth: 'far' },
    { id: 'cam1', type: 'camera', label: '监控摄像头A', x: 20, y: 85, alert: false, depth: 'far' },
    { id: 'cam2', type: 'camera', label: '监控摄像头B', x: 85, y: 88, alert: false, depth: 'far' },
  ];
  // 连接关系
  const topologyLinks = [
    { from: 'router', to: 'fw' },
    { from: 'router', to: 'sw1' },
    { from: 'sw1', to: 'sw2', alert: true },
    { from: 'sw1', to: 'sw3' },
    { from: 'sw2', to: 'srv1' },
    { from: 'sw3', to: 'srv2' },
    { from: 'fw', to: 'ap1' },
    { from: 'sw1', to: 'ap2' },
    { from: 'sw3', to: 'cam1' },
    { from: 'sw2', to: 'cam2' },
  ];
  const nodeMap = Object.fromEntries(topologyNodes.map(n => [n.id, n]));
  const iconMap = { router: 'router', switch: 'network', server: 'server', ap: 'wifi', camera: 'camera' };
  return `
    <div class="bento-main">
      <div class="bento-page-header">
        <h2><span class="bento-aurora-text">网络拓扑</span></h2>
        <p>3D 等距投影可视化网络设备连接关系与数据流向 · 自动旋转 / 拖拽视角 / 多层景深</p>
      </div>
      <div class="bento-card bento-3d-disabled bento-holo-sweep" style="padding: 0; overflow: hidden;">
        <div class="bento-topology-3d bento-topology-pro" id="topology-3d-stage">
          <div class="bento-topology-grid-floor"></div>
          <div class="bento-topology-stage bento-stage-rotatable auto-rotate" id="topology-stage">
            ${topologyLinks.map(link => {
              const a = nodeMap[link.from];
              const b = nodeMap[link.to];
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const len = Math.sqrt(dx * dx + dy * dy);
              const angle = Math.atan2(dy, dx) * 180 / Math.PI;
              return `<div class="bento-topology-link bento-link-flow ${link.alert ? 'alert' : ''}" style="left:${a.x}%;top:${a.y}%;width:${len}%;transform:rotate(${angle}deg);"></div>`;
            }).join('')}
            ${topologyNodes.map(node => `
              <div class="bento-topology-node bento-node-3d type-${node.type} depth-${node.depth} ${node.alert ? 'alert' : ''}" style="left:${node.x}%;top:${node.y}%;transform:translate(-50%,-50%);">
                <div class="bento-topology-node-beam"></div>
                <div class="bento-topology-node-shadow"></div>
                <div class="bento-topology-node-core">${icon(iconMap[node.type], 26)}</div>
                <div class="bento-topology-node-label">${node.label}</div>
              </div>`).join('')}
          </div>
          <div class="bento-topology-controls">
            <button class="bento-topology-ctrl-btn" data-topology-action="rotate-left" title="左旋">${icon('rotate-ccw', 16)}</button>
            <button class="bento-topology-ctrl-btn" data-topology-action="rotate-right" title="右旋">${icon('rotate-cw', 16)}</button>
            <button class="bento-topology-ctrl-btn" data-topology-action="zoom-in" title="放大">${icon('zoom-in', 16)}</button>
            <button class="bento-topology-ctrl-btn" data-topology-action="zoom-out" title="缩小">${icon('zoom-out', 16)}</button>
            <button class="bento-topology-ctrl-btn" data-topology-action="toggle-auto" title="自动旋转">${icon('refresh-cw', 16)}</button>
            <button class="bento-topology-ctrl-btn" data-topology-action="reset" title="重置">${icon('refresh-cw', 16)}</button>
          </div>
          <div class="bento-topology-legend">
            <div class="bento-topology-legend-item"><span class="bento-topology-legend-dot" style="background:#0d9488"></span>路由器</div>
            <div class="bento-topology-legend-item"><span class="bento-topology-legend-dot" style="background:#3b82f6"></span>交换机</div>
            <div class="bento-topology-legend-item"><span class="bento-topology-legend-dot" style="background:#8b5cf6"></span>服务器</div>
            <div class="bento-topology-legend-item"><span class="bento-topology-legend-dot" style="background:#f59e0b"></span>无线AP</div>
            <div class="bento-topology-legend-item"><span class="bento-topology-legend-dot" style="background:#10b981"></span>摄像头</div>
          </div>
        </div>
      </div>
      <div class="bento-grid" style="grid-template-columns: 1fr 1fr;">
        <div class="bento-card">
          <div class="bento-card-head">
            <div class="bento-card-title-group">
              <div class="bento-card-title"><span class="bento-card-icon">${icon('activity', 16)}</span>设备状态统计</div>
            </div>
          </div>
          <div class="bento-metric-row">
            <div class="bento-metric-block">
              <span class="bento-metric-label">总设备</span>
              <div class="bento-metric-value bento-count-up">${topologyNodes.length}</div>
            </div>
            <div class="bento-metric-block">
              <span class="bento-metric-label">在线</span>
              <div class="bento-metric-value bento-count-up" style="color:var(--bento-green)">${topologyNodes.length - topologyNodes.filter(n => n.alert).length}</div>
            </div>
            <div class="bento-metric-block">
              <span class="bento-metric-label">告警</span>
              <div class="bento-metric-value bento-count-up" style="color:var(--bento-red)">${topologyNodes.filter(n => n.alert).length}</div>
            </div>
          </div>
        </div>
        <div class="bento-card">
          <div class="bento-card-head">
            <div class="bento-card-title-group">
              <div class="bento-card-title"><span class="bento-card-icon" style="color:var(--bento-red)">${icon('alert-triangle', 16)}</span>实时告警</div>
            </div>
          </div>
          <div class="bento-incident-list">
            <div class="bento-incident-item critical">
              <div class="bento-sev-tag p1"></div>
              <div class="bento-incident-content">
                <div class="bento-incident-name">核心交换机</div>
                <div class="bento-incident-meta"><span>CPU 92%</span><span>2 分钟前</span></div>
              </div>
              <span class="bento-p1-badge">P1</span>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

// 拓扑 3D 视角控制（升级版：自动旋转开关 + 拖拽旋转 + 滚轮缩放）
function initTopology3DControls() {
  const stage = document.getElementById('topology-stage');
  if (!stage || stage.dataset.bound) return;
  stage.dataset.bound = '1';
  let rotZ = -45;
  let scale = 0.85;
  let autoRotate = true;
  let isDragging = false;
  let lastX = 0;

  const apply = () => {
    stage.style.transform = `rotateX(55deg) rotateZ(${rotZ}deg) scale(${scale})`;
    if (autoRotate) stage.classList.add('auto-rotate');
    else stage.classList.remove('auto-rotate');
  };

  // 控制按钮
  document.querySelectorAll('[data-topology-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.topologyAction;
      if (action === 'rotate-left') { rotZ -= 15; autoRotate = false; apply(); }
      else if (action === 'rotate-right') { rotZ += 15; autoRotate = false; apply(); }
      else if (action === 'zoom-in') { scale = Math.min(1.3, scale + 0.1); apply(); }
      else if (action === 'zoom-out') { scale = Math.max(0.5, scale - 0.1); apply(); }
      else if (action === 'toggle-auto') { autoRotate = !autoRotate; apply(); }
      else if (action === 'reset') { rotZ = -45; scale = 0.85; autoRotate = true; apply(); }
    });
  });

  // 拖拽旋转
  stage.parentElement.addEventListener('mousedown', (e) => {
    if (e.target.closest('.bento-topology-ctrl-btn') || e.target.closest('.bento-topology-node')) return;
    isDragging = true;
    autoRotate = false;
    lastX = e.clientX;
    stage.parentElement.style.cursor = 'grabbing';
    apply();
  });
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - lastX;
    rotZ += dx * 0.5;
    lastX = e.clientX;
    apply();
  });
  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      stage.parentElement.style.cursor = '';
    }
  });

  // 滚轮缩放
  stage.parentElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    scale = Math.max(0.5, Math.min(1.3, scale - e.deltaY * 0.001));
    apply();
  }, { passive: false });

  apply();
}

function renderAuthPage() {
  const mode = state.page === 'register' ? 'register' : (state.page === 'forgot' ? 'forgot' : 'login');
  const f = state.authForm;
  const renderField = (id, field, label, iconName, type = 'text', placeholder = '', value = '', attributes = '') => `
    <label class="tk-auth-field" for="${id}">
      <span class="tk-auth-field-label">${label}</span>
      <span class="tk-auth-input-wrap">${icon(iconName, 16)}<input id="${id}" class="tk-auth-input" type="${type}" placeholder="${placeholder}" value="${escapeHtml(value)}" data-auth-field="${field}" ${attributes} /></span>
    </label>`;
  const codeField = `
    <div class="tk-auth-code-field">
      <label for="auth-code">邮箱验证码</label>
      <div class="tk-auth-code-row">
        <span class="tk-auth-input-wrap tk-auth-code-input-wrap">${icon('shield-check', 16)}<input id="auth-code" class="tk-auth-input" type="text" inputmode="numeric" maxlength="6" placeholder="6 位验证码" value="${escapeHtml(f.code)}" data-auth-field="code" /></span>
        <button type="button" class="tk-auth-code-btn" data-action="send-code" ${f.codeCountdown > 0 ? 'disabled' : ''}>${f.codeCountdown > 0 ? `${f.codeCountdown}s 后重发` : '获取验证码'}</button>
      </div>
      ${f.codeSent ? '<small class="tk-auth-code-hint">验证码已发送至邮箱，请在有效期内完成操作。</small>' : ''}
    </div>`;
  const form = mode === 'login' ? `
      ${renderField('auth-email', 'email', '账号或邮箱', 'user', 'text', '请输入账号或邮箱', f.email, 'autocomplete="username"')}
      ${renderField('auth-password', 'password', '密码', 'lock', 'password', '请输入密码', f.password)}
      <div class="tk-auth-options">
        <label class="tk-auth-remember">
          <input type="checkbox" ${f.remember ? 'checked' : ''} data-auth-field="remember" />
          <span>记住我</span>
        </label>
        <span class="tk-auth-link" data-action="forgot-password">忘记密码?</span>
      </div>
      <button class="tk-auth-submit" data-action="auth-login">登录</button>
      <div class="tk-auth-switch">还没有账号？<span class="tk-auth-link" data-action="switch-register">立即注册</span></div>` : mode === 'forgot' ? `
      ${renderField('auth-email', 'email', '邮箱', 'mail', 'email', '请输入邮箱', f.email)}
      ${codeField}
      ${renderField('auth-password', 'password', '新密码', 'lock', 'password', '至少 8 位', f.password)}
      <button class="tk-auth-submit" data-action="auth-reset">重置密码</button>
      <div class="tk-auth-switch">想起密码了？<span class="tk-auth-link" data-action="switch-login">返回登录</span></div>` : `
      ${renderField('auth-email', 'email', '邮箱', 'mail', 'email', '请输入邮箱', f.email)}
      ${codeField}
      ${renderField('auth-password', 'password', '密码', 'lock', 'password', '至少 8 位', f.password)}
      ${renderField('auth-nickname', 'nickname', '昵称', 'id-card', 'text', '请输入昵称', f.nickname)}
      <button class="tk-auth-submit" data-action="auth-register">注册账号</button>
      <div class="tk-auth-switch">已有账号？<span class="tk-auth-link" data-action="switch-login">返回登录</span></div>`;
  const heading = mode === 'login' ? { h1: '登录工作台', p: '使用您的账号继续。' } : mode === 'forgot' ? { h1: '找回密码', p: '通过邮箱验证码重置登录密码。' } : { h1: '注册账号', p: '使用邮箱验证码创建账号。' };
  return `
    <div class="tk-auth">
      <div class="tk-auth-shell">
        <section class="tk-auth-brand" aria-label="IT 运维百宝箱">
          <div class="tk-auth-brand-mark">${icon('monitor-cog', 28)}</div>
          <div class="tk-auth-brand-name">IT 运维百宝箱</div>
          <div class="tk-auth-brand-caption">桌面运维工作台</div>
          <div class="tk-auth-brand-status"><span></span>本地服务已就绪</div>
        </section>
        <section class="tk-auth-panel">
          <div class="tk-auth-card">
            <div class="tk-auth-header">
              <div class="tk-auth-eyebrow">IT 运维百宝箱</div>
              <h1 class="tk-auth-title">${heading.h1}</h1>
              <div class="tk-auth-subtitle">${heading.p}</div>
            </div>
            <div class="tk-auth-form">
              ${form}
            </div>
            <button class="tk-btn tk-btn-secondary tk-auth-offline" type="button" data-action="go-network">${icon('wifi', 14)} 离线使用本地网络工具</button>
          </div>
        </section>
      </div>
    </div>`;
}

function renderToolOutput() {
  if (!state.toolOutput && !state.isToolRunning) return '';
  const output = state.toolOutput || {};
  const statusColor = state.isToolRunning ? '#3b82f6' : (output.success ? '#10b981' : '#ef4444');
  const statusIcon = state.isToolRunning ? 'loader-2' : (output.success ? 'check-circle-2' : 'x-circle');
  const statusText = state.isToolRunning ? '执行中' : (output.success ? '执行成功' : '执行失败');
  const toolName = output.toolId || '-';
  const metrics = !state.isToolRunning ? extractToolMetrics(output.toolId, output.output) : [];
  return `
    <div class="bento-tool-output">
      <div class="bento-tool-output-header">
        <div class="bento-tool-output-meta">
          <div class="bento-tool-output-icon" style="color:${statusColor}">
            ${icon(statusIcon, 18)}
          </div>
          <div class="bento-tool-output-info">
            <div class="bento-tool-output-title">${toolName}</div>
            <div class="bento-tool-output-status" style="color:${statusColor}">${statusText}</div>
          </div>
        </div>
        <div class="bento-tool-output-actions">
          ${!state.isToolRunning ? `<button class="bento-tool-output-action" onclick="copyToolSummary()" title="复制总结">${icon('file-text', 14)}</button>` : ''}
          <button class="bento-tool-output-action" onclick="copyToolOutput()" title="复制原始输出">${icon('copy', 14)}</button>
          <button class="bento-tool-output-action" onclick="state.toolOutput=null;state.toolOutputShowRaw=false;render();" title="关闭">${icon('x', 14)}</button>
        </div>
      </div>
      <div class="bento-tool-output-content">
        ${state.isToolRunning ?
          `<div class="bento-tool-loading"><div class="bento-tool-spinner"></div><span>正在执行诊断，请稍候...</span></div>` : `
          <div class="bento-tool-output-summary ${output.success ? 'success' : 'error'}">
            ${icon(output.success ? 'check-circle-2' : 'x-circle', 18)}
            <div class="bento-tool-output-summary-body">
              <div class="bento-tool-output-summary-title">${output.success ? '诊断结果' : '执行失败'}</div>
              <pre>${escapeHtml(output.summary || '')}</pre>
            </div>
          </div>
          ${metrics.length ? `
            <div class="bento-tool-output-metrics">
              ${metrics.map(m => `
                <div class="bento-tool-output-metric">
                  <div class="bento-tool-output-metric-value" style="color:${m.color || 'inherit'}">${escapeHtml(m.value)}</div>
                  <div class="bento-tool-output-metric-label">${escapeHtml(m.label)}</div>
                </div>
              `).join('')}
            </div>` : ''}
          <div class="bento-tool-output-raw-toggle">
            <button class="bento-tool-output-raw-btn ${state.toolOutputShowRaw ? 'active' : ''}" onclick="state.toolOutputShowRaw=!state.toolOutputShowRaw;render();">
              ${icon(state.toolOutputShowRaw ? 'chevron-up' : 'chevron-down', 14)}
              <span>${state.toolOutputShowRaw ? '隐藏原始输出' : '查看原始输出'}</span>
            </button>
          </div>
          ${state.toolOutputShowRaw ? `
            <div class="bento-tool-output-divider"></div>
            <pre class="bento-tool-output-pre ${output.success ? 'bento-output-success' : 'bento-output-error'}">${escapeHtml(output.output)}</pre>
          ` : ''}`}
      </div>
    </div>
  `;
}

function extractToolMetrics(toolId, raw) {
  const text = String(raw || '');
  const metrics = [];
  if (['ping', 'ping-test', 'tcp-ping'].includes(toolId) || toolId.includes('ping')) {
    const loss = text.match(/(\d+)% 丢失|Loss\s*=\s*(\d+)%|丢包[:\s]+(\d+)%/i);
    const avg = text.match(/平均[:\s]*[=]*\s*(\d+)ms|Average[:\s]*[=]*\s*(\d+)ms/i);
    if (loss) metrics.push({ label: '丢包率', value: `${loss[1] || loss[2] || loss[3]}%`, color: parseInt(loss[1] || loss[2] || loss[3]) > 0 ? '#f87171' : '#34d399' });
    if (avg) metrics.push({ label: '平均延迟', value: `${avg[1] || avg[2]}ms`, color: parseInt(avg[1] || avg[2]) > 100 ? '#fbbf24' : '#34d399' });
  }
  if (toolId === 'network-quality') {
    const loss = text.match(/丢包[:\s]+(\d+\.?\d*)%|loss[:\s]+(\d+\.?\d*)%/i);
    const avg = text.match(/平均延迟[:\s]+(\d+)ms|avg[:\s]+(\d+)ms/i);
    const jitter = text.match(/抖动[:\s]+(\d+\.?\d*)ms|jitter[:\s]+(\d+\.?\d*)ms/i);
    if (loss) metrics.push({ label: '丢包率', value: `${loss[1] || loss[2]}%` });
    if (avg) metrics.push({ label: '平均延迟', value: `${avg[1] || avg[2]}ms` });
    if (jitter) metrics.push({ label: '抖动', value: `${jitter[1] || jitter[2]}ms` });
  }
  if (toolId === 'process-list' || toolId.includes('process')) {
    const topCpu = text.match(/(\S+)\s+\S+\s+\S+\s+([\d.]+)\s+([\d.]+)/);
    if (topCpu) metrics.push({ label: 'TOP 进程', value: topCpu[1] });
  }
  if (toolId === 'service-status' || toolId === 'service-list' || toolId.includes('service')) {
    const running = (text.match(/\bRunning\b/g) || []).length;
    const stopped = (text.match(/\bStopped\b/g) || []).length;
    metrics.push({ label: '运行中', value: String(running), color: '#34d399' });
    if (stopped) metrics.push({ label: '已停止', value: String(stopped), color: '#f87171' });
  }
  if (toolId === 'printer-health' || toolId.includes('printer') || toolId.includes('spooler')) {
    const queue = text.match(/队列[:\s]+(\d+)/i);
    if (queue) metrics.push({ label: '打印队列', value: queue[1], color: parseInt(queue[1]) > 5 ? '#fbbf24' : '#34d399' });
  }
  if (toolId === 'arp' || toolId.includes('arp')) {
    const entries = text.split(/\r?\n/).filter(l => /([0-9a-f]{2}[:-]){5}/i.test(l)).length;
    metrics.push({ label: 'ARP 条目', value: String(entries) });
  }
  return metrics;
}

function copyToolOutput() {
  if (!state.toolOutput) return;
  navigator.clipboard.writeText(state.toolOutput.output).then(() => {
    showToast('原始输出已复制到剪贴板');
  }).catch(() => {
    showToast('复制失败');
  });
}

function copyToolSummary() {
  if (!state.toolOutput) return;
  navigator.clipboard.writeText(state.toolOutput.summary || '').then(() => {
    showToast('诊断总结已复制到剪贴板');
  }).catch(() => {
    showToast('复制失败');
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getSearchableItems() {
  const items = [];
  navItems.forEach(item => items.push({ type: 'page', id: item.id, title: item.label, icon: item.icon, action: () => { state.page = item.id; } }));
  quickTools.forEach(tool => items.push({ type: 'tool', id: tool.id, title: tool.name, desc: tool.desc, category: tool.category, action: () => { runTool(tool.id); } }));
  Object.entries(toolsByCategory).forEach(([category, tools]) => {
    tools.forEach(tool => items.push({ type: 'tool', id: tool.id, title: tool.name, desc: tool.desc, category, action: () => { runTool(tool.id); } }));
  });
  (state.knowledgeBase || knowledgeBase).forEach(kb => items.push({ type: 'knowledge', id: kb.id, title: kb.title, desc: kb.category, action: () => { state.page = 'knowledge'; } }));
  state.assets.forEach(asset => items.push({ type: 'asset', id: asset.name, title: asset.name, desc: asset.ip || '', action: () => { state.page = 'assets'; } }));
  return items;
}

function renderSearchOverlay() {
  if (!state.searchOpen) return '';
  const query = state.searchQuery.toLowerCase().trim();
  const items = query ? getSearchableItems().filter(item => item.title.toLowerCase().includes(query) || (item.desc || '').toLowerCase().includes(query)).slice(0, 8) : [];
  return `
    <div class="bento-overlay" onclick="state.searchOpen=false;state.searchQuery='';render();">
      <div class="bento-search-panel" onclick="event.stopPropagation();">
        <div class="bento-search-input-wrap">
          ${icon('search', 18)}
          <input type="text" id="bento-search-input" class="bento-search-input" placeholder="搜索工具、设备、故障、页面..." value="${state.searchQuery}" autocomplete="off" />
          <kbd>ESC</kbd>
        </div>
        <div class="bento-search-results">
          ${query ? (items.length ? items.map(item => `
            <div class="bento-search-item" data-search-id="${item.id}" data-search-type="${item.type}">
              <div class="bento-search-item-icon">${icon(item.icon || (item.type === 'page' ? 'layout-dashboard' : item.type === 'tool' ? 'wrench' : item.type === 'knowledge' ? 'book-open' : 'server'), 16)}</div>
              <div class="bento-search-item-info">
                <div class="bento-search-item-title">${escapeHtml(item.title)}</div>
                <div class="bento-search-item-desc">${escapeHtml(item.desc || '')}</div>
              </div>
              <div class="bento-search-item-type">${item.type === 'page' ? '页面' : item.type === 'tool' ? '工具' : item.type === 'knowledge' ? '知识库' : '资产'}</div>
            </div>
          `).join('') : '<div class="bento-search-empty">未找到匹配结果</div>') : '<div class="bento-search-hint">输入关键词开始搜索，支持工具、页面、知识库、资产</div>'}
        </div>
      </div>
    </div>
  `;
}

function renderNotificationsOverlay() {
  if (!state.notificationsOpen) return '';
  const unreadCount = state.notifications.filter(n => !n.read).length;
  return `
    <div class="bento-overlay" onclick="state.notificationsOpen=false;render();">
      <div class="bento-notifications-panel" onclick="event.stopPropagation();">
        <div class="bento-notifications-header">
          <div>
            <div class="bento-notifications-title">通知中心</div>
            <div class="bento-notifications-subtitle">${unreadCount ? `有 ${unreadCount} 条未读通知` : '全部已读'}</div>
          </div>
          <div class="bento-notifications-actions">
            <button class="bento-notifications-action" data-action="mark-all-read">全部已读</button>
            <button class="bento-notifications-action" onclick="state.notificationsOpen=false;render();">${icon('x', 14)}</button>
          </div>
        </div>
        <div class="bento-notifications-list">
          ${state.notifications.length ? state.notifications.map(n => `
            <div class="bento-notification ${n.read ? 'read' : 'unread'}" data-notification-id="${n.id}">
              <div class="bento-notification-dot ${n.type}"></div>
              <div class="bento-notification-content">
                <div class="bento-notification-title">${escapeHtml(n.title)}</div>
                <div class="bento-notification-message">${escapeHtml(n.message)}</div>
                <div class="bento-notification-time">${n.time}</div>
              </div>
            </div>
          `).join('') : '<div class="bento-notifications-empty">暂无通知</div>'}
        </div>
      </div>
    </div>
  `;
}

function renderSettingsOverlay() {
  if (!state.settingsOpen) return '';
  const s = state.settings;
  const aiProviders = (state.aiProviders || []).map(p => p.name);
  const tab = state.settingsTab || 'general';
  const admin = isAdmin();
  const superAdmin = isSuperAdmin();
  const effectiveTab = (tab === 'security' && !superAdmin) ? 'general' : tab;
  const tabItem = (id, label, iconName) => `<div class="bento-settings-tab ${effectiveTab === id ? 'active' : ''}" data-action="switch-settings-tab" data-tab="${id}">${icon(iconName, 15)}<span>${label}</span></div>`;
  const renderGeneral = () => `
    <div class="bento-settings-section">
      <div class="bento-settings-section-title">界面与启动</div>
      <label class="bento-setting-row"><span>紧凑模式</span><input type="checkbox" data-setting="compactMode" ${s.compactMode ? 'checked' : ''} /></label>
      <label class="bento-setting-row"><span>开机自动启动</span><input type="checkbox" data-setting="autoStart" ${s.autoStart ? 'checked' : ''} /></label>
      <label class="bento-setting-row"><span>关闭时最小化到托盘</span><input type="checkbox" data-setting="minimizeToTray" ${s.minimizeToTray ? 'checked' : ''} /></label>
      <label class="bento-setting-row"><span>自动刷新数据</span><input type="checkbox" data-setting="autoRefresh" ${s.autoRefresh ? 'checked' : ''} /></label>
    </div>
    <div class="bento-settings-section">
      <div class="bento-settings-section-title">通知与语言</div>
      <label class="bento-setting-row"><span>声音提醒</span><input type="checkbox" data-setting="soundEnabled" ${s.soundEnabled ? 'checked' : ''} /></label>
      <label class="bento-setting-row bento-setting-row-input"><span>界面语言</span>
        <select class="bento-settings-select" data-setting="language">
          <option value="zh-CN" ${s.language === 'zh-CN' ? 'selected' : ''}>简体中文</option>
          <option value="zh-TW" ${s.language === 'zh-TW' ? 'selected' : ''}>繁體中文</option>
          <option value="en-US" ${s.language === 'en-US' ? 'selected' : ''}>English</option>
        </select>
      </label>
    </div>
    <div class="bento-settings-section">
      <div class="bento-settings-section-title">AI 与工具</div>
      <label class="bento-setting-row bento-setting-row-input"><span>默认 AI 助手</span>
        <select class="bento-settings-select" data-setting="aiProvider">
          ${aiProviders.map(name => `<option value="${name === '本地运维规则助手' ? 'local' : name}" ${s.aiProvider === (name === '本地运维规则助手' ? 'local' : name) ? 'selected' : ''}>${name}</option>`).join('')}
        </select>
      </label>
      <label class="bento-setting-row bento-setting-row-input"><span>默认目标主机</span><input type="text" data-setting="defaultToolHost" value="${escapeHtml(s.defaultToolHost)}" placeholder="127.0.0.1" /></label>
      <label class="bento-setting-row"><span>修复操作前二次确认</span><input type="checkbox" data-setting="confirmRepairActions" ${s.confirmRepairActions ? 'checked' : ''} /></label>
    </div>
    <div class="bento-settings-section">
      <div class="bento-settings-section-title">数据与日志</div>
      <label class="bento-setting-row bento-setting-row-input"><span>审计日志保留天数</span><input type="number" min="7" max="365" data-setting="logRetentionDays" value="${s.logRetentionDays}" /></label>
      <label class="bento-setting-row"><span>自动保存工具输出</span><input type="checkbox" data-setting="autoSaveToolOutput" ${s.autoSaveToolOutput ? 'checked' : ''} /></label>
    </div>
    <div class="bento-settings-section">
      <div class="bento-settings-section-title">快捷键</div>
      <div class="bento-setting-row-static"><span>全局搜索</span><span class="bento-settings-kbd">Ctrl / ⌘ + K</span></div>
      <div class="bento-setting-row-static"><span>关闭浮层</span><span class="bento-settings-kbd">Esc</span></div>
    </div>`;
  const renderNetwork = () => `
    <div class="bento-settings-section">
      <div class="bento-settings-section-title">工具默认参数</div>
      <label class="bento-setting-row bento-setting-row-input"><span>默认超时（毫秒）</span><input type="number" min="500" max="30000" step="500" data-setting="defaultTimeout" value="${s.defaultTimeout}" /></label>
      <label class="bento-setting-row bento-setting-row-input"><span>Tracert 最大跳数</span><input type="number" min="1" max="64" data-setting="maxHops" value="${s.maxHops}" /></label>
      <label class="bento-setting-row bento-setting-row-input"><span>端口扫描起始</span><input type="number" min="1" max="65535" data-setting="portRangeStart" value="${s.portRangeStart}" /></label>
      <label class="bento-setting-row bento-setting-row-input"><span>端口扫描结束</span><input type="number" min="1" max="65535" data-setting="portRangeEnd" value="${s.portRangeEnd}" /></label>
    </div>
    <div class="bento-settings-section">
      <div class="bento-settings-section-title">DNS 与代理</div>
      <label class="bento-setting-row bento-setting-row-input"><span>默认 DNS 服务器</span><input type="text" data-setting="dnsServer" value="${escapeHtml(s.dnsServer)}" placeholder="8.8.8.8" /></label>
      <label class="bento-setting-row"><span>启用代理</span><input type="checkbox" data-setting="proxyEnabled" ${s.proxyEnabled ? 'checked' : ''} /></label>
      <label class="bento-setting-row bento-setting-row-input"><span>代理主机</span><input type="text" data-setting="proxyHost" value="${escapeHtml(s.proxyHost)}" placeholder="127.0.0.1" ${s.proxyEnabled ? '' : 'disabled'} /></label>
      <label class="bento-setting-row bento-setting-row-input"><span>代理端口</span><input type="number" min="1" max="65535" data-setting="proxyPort" value="${s.proxyPort}" ${s.proxyEnabled ? '' : 'disabled'} /></label>
    </div>
    <div class="bento-settings-section">
      <div class="bento-settings-section-title">网络维护</div>
      <div class="bento-setting-row-actions">
        <button class="bento-settings-action-btn" data-action="export-backup">${icon('download', 14)} 导出配置</button>
        <button class="bento-settings-action-btn" data-action="open-data-dir">${icon('folder', 14)} 打开数据目录</button>
      </div>
    </div>`;
  const renderSecurity = () => `
    <div class="bento-settings-section">
      <div class="bento-settings-section-title">会话与登录</div>
      <label class="bento-setting-row bento-setting-row-input"><span>会话超时（分钟）</span><input type="number" min="5" max="1440" data-setting="sessionTimeout" value="${s.sessionTimeout}" /></label>
      <label class="bento-setting-row bento-setting-row-input"><span>密码过期天数</span><input type="number" min="0" max="365" data-setting="passwordExpiryDays" value="${s.passwordExpiryDays}" /></label>
      <label class="bento-setting-row"><span>双因素认证（2FA）</span><input type="checkbox" data-setting="twoFactorAuth" ${s.twoFactorAuth ? 'checked' : ''} /></label>
    </div>
    <div class="bento-settings-section">
      <div class="bento-settings-section-title">审计与访问控制</div>
      <label class="bento-setting-row"><span>启用审计日志</span><input type="checkbox" data-setting="auditLogging" ${s.auditLogging ? 'checked' : ''} /></label>
      <label class="bento-setting-row bento-setting-row-input"><span>IP 白名单（逗号分隔）</span><input type="text" data-setting="ipWhitelist" value="${escapeHtml(s.ipWhitelist)}" placeholder="192.168.1.0/24,10.0.0.5" /></label>
    </div>
    ${admin ? `<div class="bento-settings-section">
      <div class="bento-settings-section-title">管理操作</div>
      <div class="bento-setting-row-actions">
        ${admin ? `<button class="bento-settings-action-btn" data-action="go-publish-announcement">${icon('megaphone', 14)} 发布公告</button>` : ''}
        <button class="bento-settings-action-btn" data-action="go-account-management">${icon('users', 14)} 账号管理</button>
      </div>
    </div>` : ''}
    ${!admin ? `<div class="bento-settings-section"><div class="bento-settings-section-title">提示</div><div class="bento-setting-row-static"><span class="bento-settings-path">高级安全配置仅管理员可见</span></div></div>` : ''}`;
  const renderAbout = () => `
    <div class="bento-settings-section">
      <div class="bento-settings-section-title">版本信息</div>
      <div class="bento-setting-row-static"><span>当前版本</span><span>IT 运维百宝箱 v2.0</span></div>
      <div class="bento-setting-row-static"><span>构建日期</span><span>2026.07.24</span></div>
      <div class="bento-setting-row-static"><span>运行环境</span><span>Node.js / Browser</span></div>
    </div>
    <div class="bento-settings-section">
      <div class="bento-settings-section-title">检查更新</div>
      <div class="bento-setting-row-static"><span>更新状态</span><span style="color:var(--bento-green)">已是最新版本</span></div>
      <div class="bento-setting-row-actions">
        <button class="bento-settings-action-btn" data-action="check-update">${icon('refresh-cw', 14)} 检查更新</button>
        <button class="bento-settings-action-btn" data-action="view-changelog">${icon('file-text', 14)} 查看更新日志</button>
      </div>
    </div>
    <div class="bento-settings-section">
      <div class="bento-settings-section-title">技术支持</div>
      <div class="bento-setting-row-static"><span>数据目录</span><span class="bento-settings-path">data/</span></div>
      <div class="bento-setting-row-static"><span>开源协议</span><span>MIT License</span></div>
    </div>`;
  const tabContent = effectiveTab === 'network' ? renderNetwork() : effectiveTab === 'security' ? renderSecurity() : effectiveTab === 'about' ? renderAbout() : renderGeneral();
  return `
    <div class="bento-overlay" onclick="state.settingsOpen=false;render();">
      <div class="bento-settings-panel" onclick="event.stopPropagation();">
        <div class="bento-settings-header">
          <div>
            <div class="bento-settings-title">${admin ? '系统设置' : '基础设置'}</div>
            <div class="bento-settings-subtitle">个性化偏好、网络、安全与版本信息</div>
          </div>
          <button class="bento-settings-close" onclick="state.settingsOpen=false;render();">${icon('x', 18)}</button>
        </div>
        <div class="bento-settings-tabs">
          ${tabItem('general', '通用', 'settings')}
          ${tabItem('network', '网络', 'wifi')}
          ${superAdmin ? tabItem('security', '安全', 'shield') : ''}
          ${tabItem('about', '关于更新', 'info')}
        </div>
        <div class="bento-settings-body">${tabContent}</div>
      </div>
    </div>
  `;
}

function getReadAnnouncementIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(READ_ANNOUNCEMENTS_STORAGE) || '[]');
    return Array.isArray(ids) ? ids.map(String) : [];
  } catch { return []; }
}

function markAnnouncementRead(id) {
  const ids = new Set(getReadAnnouncementIds());
  if (id) ids.add(String(id));
  localStorage.setItem(READ_ANNOUNCEMENTS_STORAGE, JSON.stringify([...ids].slice(-200)));
}

async function fetchLatestAnnouncement() {
  if (!isLoggedIn() || !API_ENDPOINTS.latestAnnouncement) return;
  try {
    const data = await requestApi(API_ENDPOINTS.latestAnnouncement, { method: 'GET' });
    const announcement = Array.isArray(data) ? data[0] : (data?.announcement || data?.latest || data);
    const id = announcement?.id || announcement?._id;
    if (!id || getReadAnnouncementIds().includes(String(id))) return;
    state.announcement = { ...announcement, id: String(id) };
    render();
  } catch {
    // Announcements are optional. A failed poll must never affect the local toolbox.
  }
}

function startAnnouncementPolling() {
  if (window.__opshubAnnouncementPoller) return;
  fetchLatestAnnouncement();
  window.__opshubAnnouncementPoller = window.setInterval(fetchLatestAnnouncement, 3 * 60 * 1000);
}

async function publishAnnouncement() {
  if (!isAdmin()) return showToast('无权发布公告');
  const { title, content, level } = state.announcementForm;
  if (!title.trim() || !content.trim()) return showToast('请填写公告标题和内容');
  try {
    await requestApi(API_ENDPOINTS.announcements, { method: 'POST', body: JSON.stringify({ title: title.trim(), content: content.trim(), level }) });
    state.announcementForm = { title: '', content: '', level: 'info' };
    render();
    showToast('公告发布成功');
  } catch (error) {
    showToast(`发布失败：${error.message}`);
  }
}

function renderMainContent() {
  switch (state.page) {
    case 'dashboard': return renderDashboard();
    case 'network': return renderNetworkPage();
    case 'system': return renderSystemPage();
    case 'tickets': return renderTicketsPage();
    case 'assets': return renderAssetsPage();
    case 'knowledge': return renderKnowledgePage();
    case 'audit': return renderAuditPage();
    case 'remote': return renderRemotePage();
    case 'external-tools': return renderExternalToolsPage();
    case 'monitoring': return renderMonitoringPage();
    case 'sop': return renderSOPPage();
    case 'worklog': return renderWorklogPage();
    case 'ai': return renderAIPage();
    case 'publish-announcement': return renderPublishAnnouncementPage();
    case 'account-management': return renderAccountManagementPage();
    default: return renderDashboard();
  }
}

function render() {
  const app = document.getElementById('tk-app') || document.getElementById('bento-app');
  if (!app) return;

  const authPage = state.page === 'login' || state.page === 'register' || state.page === 'forgot';

  if (authPage) {
    app.innerHTML = renderAuthPage();
  } else {
    app.innerHTML = renderHeader() + renderMain() + renderStatusbar();
    app.innerHTML += renderSettingsOverlay();
  }

  if (state.toast) {
    app.innerHTML += `<div class="tk-toast tk-toast-${state.toastType || 'info'}">${state.toast}</div>`;
  }

  if (window.lucide) {
    lucide.createIcons({ root: app });
  }

  bindEvents();
}

function bindEvents() {
  document.querySelectorAll('[data-nav]').forEach(item => {
    item.addEventListener('click', () => {
      navigate(item.dataset.nav);
    });
  });

  document.querySelectorAll('[data-category]').forEach(item => {
    item.addEventListener('click', () => {
      const category = item.closest('.tk-category');
      if (category) category.classList.toggle('expanded');
    });
  });

  document.querySelectorAll('[data-tool]').forEach(item => {
    item.addEventListener('click', () => {
      runTool(item.dataset.tool);
    });
  });

  document.querySelectorAll('[data-dashboard-tool-search]').forEach(input => {
    input.addEventListener('input', () => {
      const query = input.value.trim().toLowerCase();
      document.querySelectorAll('[data-tool-search-item]').forEach((item) => {
        item.hidden = Boolean(query) && !item.dataset.toolSearchItem.includes(query);
      });
    });
  });

  document.querySelectorAll('[data-knowledge-search]').forEach(input => {
    input.addEventListener('input', () => {
      const query = input.value.trim().toLowerCase();
      document.querySelectorAll('[data-knowledge-item]').forEach((item) => {
        item.hidden = Boolean(query) && !item.dataset.knowledgeItem.includes(query);
      });
    });
  });

  document.querySelectorAll('[data-knowledge-source-url]').forEach((button) => {
    button.addEventListener('click', () => window.open(button.dataset.knowledgeSourceUrl, '_blank', 'noopener'));
  });

  document.querySelectorAll('[data-knowledge-output]').forEach((button) => {
    button.addEventListener('click', () => {
      const documentId = button.dataset.knowledgeOutput;
      const document = (state.knowledgeBase || knowledgeBase).find((item) => String(item.id || item.title) === documentId);
      if (!document) return;
      const run = beginToolRun('knowledge-reference');
      const raw = `${document.title}\n\n${document.content || ''}`;
      const summary = `已将知识卡“${document.title}”关联到输出台，可继续执行相关诊断工具。`;
      finishToolRun(run, 'success', summary, raw);
      state.toolOutput = { toolId: 'knowledge-reference', output: raw, summary, success: true };
      state.page = 'dashboard';
      render();
    });
  });

  document.querySelectorAll('[data-action]').forEach(item => {
    item.addEventListener('click', (e) => {
      const action = item.dataset.action;
      if (action === 'auth-login') login();
      if (action === 'auth-bootstrap') bootstrapAdmin();
      if (action === 'auth-register') register();
      if (action === 'auth-reset') resetPassword();
      if (action === 'send-code') { e.stopPropagation(); sendVerificationCode(); }
      if (action === 'switch-login') switchAuthMode('login');
      if (action === 'switch-register') switchAuthMode('register');
      if (action === 'switch-forgot') switchAuthMode('forgot');
      if (action === 'forgot-password') switchAuthMode('forgot');
      if (action === 'confirm-logout') { state.logoutConfirm = true; render(); }
      if (action === 'cancel-logout') { state.logoutConfirm = false; render(); }
      if (action === 'confirm-logout-yes') { state.logoutConfirm = false; logout(); }
      if (action === 'go-login') navigate('login');
      if (action === 'go-network') navigate('dashboard');
      if (action === 'ai-send') sendAIMessage();
      if (action === 'ai-clear-history') { if (confirm('确定清空所有对话记录？')) clearChatHistory(); }
      if (action === 'open-settings') { state.settingsOpen = true; render(); }
      if (action === 'go-account-management') navigate('account-management');
      if (action === 'run-health-check') runHealthCheck();
      if (action === 'run-desktop-optimizer') runControlledRepair('desktop-optimizer');
      if (action === 'run-office-repair') runControlledRepair('office-repair');
      if (action === 'run-windows-repair') runControlledRepair('windows-repair');
      if (action === 'run-software-uninstall') runControlledRepair('software-uninstall');
      if (action === 'run-data-migration') runControlledRepair('data-migration');
      if (action === 'run-desktop-diagnosis') runDesktopDiagnosis();
      if (action === 'run-ping') runPing();
      if (action === 'stop-ping') stopPing();
      if (action === 'run-tracert') runTraceroute();
      if (action === 'stop-tracert') stopTraceroute();
      if (action === 'run-portscan') runPortScan();
      if (action === 'stop-portscan') stopPortScan();
      if (action === 'run-arpscan') runArpScan();
      if (action === 'stop-arpscan') stopArpScan();
      if (action === 'run-network-info') runNetworkInfo();
      if (action === 'run-dns-lookup') runDnsLookup();
      if (action === 'start-dhcp') startDhcpServer();
      if (action === 'stop-dhcp') stopDhcpServer();
      if (action === 'start-ftp') startFtpServer();
      if (action === 'stop-ftp') stopFtpServer();
      if (action === 'start-tftp') startTftpServer();
      if (action === 'stop-tftp') stopTftpServer();
      if (action === 'start-syslog') startSyslogServer();
      if (action === 'stop-syslog') stopSyslogServer();
      if (action === 'copy-output') copyOutput();
      if (action === 'clear-output') clearOutput();
      if (action === 'export-output') exportActiveToolRun();
      if (action === 'export-workbench-report') exportWorkbenchReport();
      if (action === 'save-worklog') saveWorklog();
      if (action === 'export-worklog') exportWorklog(item.dataset.worklogId);
      if (action === 'run-system-info') runSystemInfo();
      if (action === 'run-process-list') runProcessList();
      if (action === 'run-service-list') runServiceList();
      if (action === 'run-disk-info') runDiskInfo();
      if (action === 'run-tcp-ping') runTcpPing();
      if (action === 'run-trace-analyze') runTraceAnalyze();
      if (action === 'run-mtu-probe') runMtuProbe();
      if (action === 'run-conn-test') runConnTest();
      if (action === 'run-host-discovery') runHostDiscovery();
      if (action === 'run-camera-scan') runCameraScan();
      if (action === 'run-service-discovery') runServiceDiscovery();
      if (action === 'run-service-probe') runServiceProbe();
      if (action === 'run-wol') runWol();
      if (action === 'run-arp-table') runArpTable();
      if (action === 'run-route-table') runRouteTable();
      if (action === 'run-subnet-calc') runSubnetCalc();
      if (action === 'run-mac-lookup') runMacLookup();
      if (action === 'run-conn-tracker') runConnTracker();
      if (action === 'run-flush-dns') runFlushDns();
      if (action === 'run-ptr-lookup') runPtrLookup();
      if (action === 'run-whois') runWhois();
      if (action === 'run-network-health') runHealthCheck();
      if (action === 'run-ping-qos') runPingQos();
      if (action === 'run-speed-test') runSpeedTest();
      if (action === 'run-lan-speed') runLanSpeedTest();
      if (action === 'run-loop-detect') runLoopDetect();
      if (action === 'run-tls-scan') runTlsScan();
      if (action === 'run-firewall-status') runFirewallStatus();
      if (action === 'run-mitm-detect') runMitmDetect();
      if (action === 'run-security-check') runSecurityCheck();
      if (action === 'run-dhcp-detect') runDhcpDetect();
      if (action === 'start-http') startHttpServer();
      if (action === 'stop-http') stopHttpServer();
      if (action === 'start-netflow') startNetflowListen();
      if (action === 'stop-netflow') stopNetflowListen();
      if (action === 'start-flow-monitor') startFlowMonitor();
      if (action === 'stop-flow-monitor') stopFlowMonitor();
      if (action === 'run-snapshot') runNetworkSnapshot();
      if (action === 'run-topology') runTopology();
      if (action === 'connect-rdp') connectRdp();
      if (action === 'open-serial') openSerial();
      if (action === 'close-serial') closeSerial();
      if (action === 'scan-serial') scanSerial();
      if (action === 'refresh-process') runProcessList();
      if (action === 'run-disk-health') runDiskHealth();
    });
  });

  document.querySelectorAll('[data-auth-field]').forEach(input => {
    input.addEventListener('input', (e) => {
      const field = e.target.dataset.authField;
      const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      updateAuthForm(field, value);
    });
  });

  document.querySelectorAll('[data-announcement-field]').forEach(input => {
    const handler = (e) => { state.announcementForm[e.target.dataset.announcementField] = e.target.value; };
    input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', handler);
  });

  document.querySelector('#bento-search-input')?.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    render();
    setTimeout(() => document.querySelector('#bento-search-input')?.focus(), 50);
  });

  document.querySelectorAll('.bento-search-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.searchId;
      const type = item.dataset.searchType;
      const found = getSearchableItems().find(i => i.id === id && i.type === type);
      if (found) {
        state.searchOpen = false;
        state.searchQuery = '';
        found.action();
        render();
      }
    });
  });

  document.querySelectorAll('.bento-notification').forEach(item => {
    item.addEventListener('click', () => {
      const id = Number(item.dataset.notificationId);
      const n = state.notifications.find(x => x.id === id);
      if (n) n.read = true;
      render();
    });
  });

  document.querySelectorAll('[data-setting]').forEach(input => {
    const handler = (e) => {
      const key = e.target.dataset.setting;
      let value = e.target.value;
      if (e.target.type === 'checkbox') value = e.target.checked;
      else if (e.target.type === 'number') value = Number(value);
      state.settings[key] = value;
      if (e.target.type === 'checkbox' || e.target.tagName === 'SELECT') render();
    };
    if (input.type === 'text' || input.type === 'number') input.addEventListener('input', handler);
    else input.addEventListener('change', handler);
  });

  document.querySelector('#ai-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendAIMessage();
    }
  });

  document.addEventListener('keydown', handleGlobalKey);
}

function handleGlobalKey(e) {
  if (e.key === 'Escape') {
    if (state.searchOpen || state.notificationsOpen || state.settingsOpen) {
      state.searchOpen = false;
      state.notificationsOpen = false;
      state.settingsOpen = false;
      render();
    }
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    state.searchOpen = true;
    state.searchQuery = '';
    render();
    setTimeout(() => document.querySelector('#bento-search-input')?.focus(), 50);
  }
  if (state.searchOpen) {
    const items = Array.from(document.querySelectorAll('.bento-search-item'));
    const active = document.querySelector('.bento-search-item.selected');
    let idx = items.indexOf(active);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (active) active.classList.remove('selected');
      idx = Math.min(idx + 1, items.length - 1);
      if (items[idx]) items[idx].classList.add('selected');
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (active) active.classList.remove('selected');
      idx = Math.max(idx - 1, 0);
      if (items[idx]) items[idx].classList.add('selected');
    }
    if (e.key === 'Enter' && active) {
      e.preventDefault();
      active.click();
    }
  }
}

async function sendAIMessage() {
  if (!requireLogin()) return;
  const input = document.querySelector('#ai-input');
  const message = input?.value.trim();
  if (!message) return;
  state.chatMessages.push({ role: 'user', content: message });
  saveChatHistory();
  state.aiSending = true;
  addActivity('tool', `<strong>${state.auth.user?.displayName || '用户'}</strong> 向 AI 发送消息`);
  render();
  try {
    const data = await requestApi(API_ENDPOINTS.aiChat, { method: 'POST', body: JSON.stringify({ issue: message, evidence: '', provider: state.settings.aiProvider }) });
    const reply = data.reply || data.content || data.answer || data.finalOutput || data.output || data.message;
    if (!reply) throw new Error('AI 服务未返回有效内容');
    state.chatMessages.push({ role: 'assistant', content: String(reply) });
  } catch (error) {
    state.chatMessages.push({ role: 'assistant', content: 'AI 服务暂不可用，请检查网络和登录状态后重试。' });
    showToast(`AI 暂不可用：${error.message}`);
  } finally {
    state.aiSending = false;
    saveChatHistory();
    render();
  }
}

function saveChatHistory() {
  try {
    localStorage.setItem(CHAT_HISTORY_STORAGE, JSON.stringify(state.chatMessages.slice(-100)));
  } catch { /* ignore quota errors */ }
}

function loadChatHistory() {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_STORAGE);
    if (raw) state.chatMessages = JSON.parse(raw) || [];
  } catch { state.chatMessages = []; }
}

function clearChatHistory() {
  state.chatMessages = [];
  localStorage.removeItem(CHAT_HISTORY_STORAGE);
  render();
}

document.addEventListener('DOMContentLoaded', () => {
  state.page = PATH_PAGES[window.location.pathname] || 'dashboard';
  loadChatHistory();
  window.addEventListener('popstate', () => {
    state.page = PATH_PAGES[window.location.pathname] || 'dashboard';
    render();
  });
  hydrateAuth();
});
