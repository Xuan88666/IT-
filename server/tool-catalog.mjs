export const TOOL_GROUPS = [
  { id: 'desktop', name: '桌面运维' },
  { id: 'office', name: '办公与业务软件' },
  { id: 'network', name: '网络与现场' },
  { id: 'infrastructure', name: '基础设施与安全' },
  { id: 'utility', name: '实用与远程' },
];

function createTools(group, ids, risk = 'read') {
  return ids.map((id) => ({ id, group, risk, legacy: true, keywords: [] }));
}

const legacyTools = [
  ...createTools('network', [
    'adapter-health', 'arp', 'arp-scan', 'arp-table', 'camera-scan', 'cctv-health',
    'connection-test', 'conn-tracker', 'dhcp-detect', 'dhcp-server', 'dns-diagnosis',
    'dns-lookup', 'domain-whois', 'firewall-status', 'flush-dns', 'ftp-server',
    'gateway-health', 'host-discovery', 'http-api', 'internet-health', 'ip-info',
    'lan-speed-test', 'loop-detection', 'mac-lookup', 'mitm-hints', 'mtu-probe',
    'netflow-listen', 'network-health', 'network-info', 'network-quality',
    'network-snapshot', 'onvif-search', 'ping-qos', 'ping-test', 'port-occupancy',
    'port-scan', 'port-service-probe', 'ptr-lookup', 'renew-dhcp', 'route-policy',
    'route-table', 'service-discovery', 'snmp-probe', 'speed-test', 'subnet-calc',
    'syslog-server', 'tcp-ping', 'temp-http-server', 'tftp-server', 'tls-scan',
    'traceroute', 'traceroute-analyze', 'web-probe', 'websocket-test', 'wifi-scan',
    'wol',
  ]),
  ...createTools('desktop', [
    'driver-problems', 'login-logs', 'printer-health', 'print-test', 'process-list',
    'repair-printer', 'repair-printer-queue', 'resource-hotspots', 'security-check',
    'service-status', 'spooler-start', 'system-errors', 'time-sync', 'workstation-health',
  ]),
  ...createTools('utility', [
    'cable-order', 'hex-convert', 'open-web', 'password-gen', 'rdp', 'serial-debug',
    'telnet-client',
  ]),
];

const newTools = [
  { id: 'desktop-inventory', group: 'desktop', risk: 'read', keywords: ['硬件', '资产', '序列号'] },
  { id: 'desktop-health', group: 'desktop', risk: 'read', keywords: ['电脑体检', '蓝屏', '驱动'] },
  { id: 'incident-evidence', group: 'desktop', risk: 'read', keywords: ['现场采集', '日志', '证据'] },
  { id: 'desktop-optimizer', group: 'desktop', risk: 'repair', keywords: ['电脑优化', '清理', '启动项'] },
  { id: 'windows-repair', group: 'desktop', risk: 'repair', keywords: ['系统修复', '更新', '文件关联'] },
  { id: 'software-inventory', group: 'desktop', risk: 'read', keywords: ['软件盘点', '版本', '运行库'] },
  { id: 'software-uninstall', group: 'desktop', risk: 'repair', keywords: ['静默卸载', '软件管理'] },
  { id: 'user-permissions', group: 'desktop', risk: 'read', keywords: ['本地账户', '管理员组', '域'] },
  { id: 'data-migration', group: 'desktop', risk: 'repair', keywords: ['数据迁移', '备份', 'PST'] },
  { id: 'peripheral-health', group: 'desktop', risk: 'read', keywords: ['扫描仪', '蓝牙', '投影', 'USB'] },
  { id: 'office-health', group: 'office', risk: 'read', keywords: ['Office', 'WPS', 'Word', 'Excel'] },
  { id: 'office-repair', group: 'office', risk: 'repair', keywords: ['Office修复', '加载项', '激活'] },
  { id: 'browser-health', group: 'office', risk: 'read', keywords: ['浏览器', '代理', '证书'] },
  { id: 'collaboration-health', group: 'office', risk: 'read', keywords: ['Outlook', '企业微信', '钉钉', 'Teams'] },
  { id: 'business-runtime-health', group: 'office', risk: 'read', keywords: ['Java', '.NET', 'VC++', '加密狗'] },
  { id: 'vpn-proxy-health', group: 'infrastructure', risk: 'read', keywords: ['VPN', '代理', 'DNS泄漏'] },
  { id: 'share-nas-health', group: 'infrastructure', risk: 'read', keywords: ['共享', 'SMB', 'NAS'] },
  { id: 'security-baseline', group: 'infrastructure', risk: 'read', keywords: ['Defender', 'BitLocker', '防火墙'] },
  { id: 'server-health', group: 'infrastructure', risk: 'read', keywords: ['服务器', 'Linux', '证书'] },
  { id: 'ad-health', group: 'infrastructure', risk: 'read', keywords: ['AD', '域控', 'GPO'] },
  { id: 'certificate-domain', group: 'infrastructure', risk: 'read', keywords: ['SSL', '证书', 'WHOIS'] },
  { id: 'batch-check', group: 'infrastructure', risk: 'read', keywords: ['批量Ping', 'CSV', '端口'] },
  { id: 'desktop-diagnosis', group: 'desktop', risk: 'read', keywords: ['智能诊断', '无法上网', '电脑卡顿'] },
  { id: 'delivery-acceptance', group: 'desktop', risk: 'read', keywords: ['验收', '交付', '报告'] },
  { id: 'bandwidth-time', group: 'utility', risk: 'read', keywords: ['带宽', '传输时间', '下载时间'] },
  { id: 'cctv-storage', group: 'utility', risk: 'read', keywords: ['监控存储', '录像容量', '保留天数'] },
  { id: 'poe-budget', group: 'utility', risk: 'read', keywords: ['PoE', '功率预算', '交换机'] },
  { id: 'ups-runtime', group: 'utility', risk: 'read', keywords: ['UPS', '续航', '电池容量'] },
  { id: 'optical-power', group: 'utility', risk: 'read', keywords: ['光功率', '链路损耗', '光纤'] },
  { id: 'raid-capacity', group: 'utility', risk: 'read', keywords: ['RAID', '磁盘阵列', '容量'] },
  { id: 'vlsm-calc', group: 'network', risk: 'read', keywords: ['VLSM', 'IPv4', '子网规划'] },
  { id: 'dns-benchmark', group: 'network', risk: 'read', keywords: ['DNS测速', 'DNS对比', '劫持检查'] },
  { id: 'ip-conflict-check', group: 'network', risk: 'read', keywords: ['IP冲突', '地址冲突', 'ARP证据'] },
  { id: 'continuous-ping', group: 'network', risk: 'read', keywords: ['持续Ping', '丢包', '延迟', '抖动'] },
  { id: 'batch-ping', group: 'network', risk: 'read', keywords: ['批量Ping', '多目标', 'CSV'] },
  { id: 'subnet-ping', group: 'network', risk: 'read', keywords: ['网段Ping', '在线主机', '扫描'] },
  { id: 'flow-monitor', group: 'network', risk: 'read', keywords: ['实时流量', '网卡速率', 'RX', 'TX'] },
  { id: 'link-monitor', group: 'network', risk: 'read', keywords: ['链路监控', '掉线告警', '恢复告警', 'Webhook'] },
  { id: 'wifi-channel-analysis', group: 'network', risk: 'read', keywords: ['WiFi信道', 'BSSID', '无线干扰'] },
  { id: 'wifi-profile-export', group: 'network', risk: 'repair', keywords: ['WiFi配置', '无线密码', '脱敏导出', '迁移'] },
  { id: 'packet-capture', group: 'network', risk: 'repair', keywords: ['pktmon', '抓包', 'PCAPNG', '流量采集'] },
  { id: 'pcap-analyzer', group: 'network', risk: 'read', keywords: ['PCAP', '协议分析', 'DNS', 'HTTP', 'LLDP'] },
  { id: 'route-manager', group: 'network', risk: 'repair', keywords: ['静态路由', '网关', 'InterfaceIndex', '回滚'] },
  { id: 'firewall-manager', group: 'network', risk: 'repair', keywords: ['防火墙规则', '端口放行', '入站', '出站', '回滚'] },
  { id: 'system-launcher', group: 'utility', risk: 'read', keywords: ['系统工具', '控制面板', '设备管理器'] },
  { id: 'remote-terminal', group: 'utility', risk: 'repair', keywords: ['SSH', 'Telnet', '远程终端', '多会话'] },
  { id: 'rdp-history', group: 'utility', risk: 'repair', keywords: ['RDP', '远程桌面', '连接历史'] },
];

export const TOOL_CATALOG = [...legacyTools, ...newTools];

export function getToolById(id) {
  return TOOL_CATALOG.find((tool) => tool.id === id);
}

export function getToolGroups() {
  return TOOL_CATALOG.reduce((groups, tool) => {
    (groups[tool.group] ||= []).push(tool);
    return groups;
  }, {});
}
