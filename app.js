const state = {
  page: 'dashboard',
  toast: '',
  modal: null,
  auth: { checked: false, authenticated: false, bootstrapRequired: false, user: null, permissions: [], roles: {} },
  users: [],
  toolHistory: loadToolHistory(),
  aiProviders: [{ name: '本地运维规则助手', mode: 'local' }],
  chatMessages: loadChatHistory(),
  externalTools: [],
  agentMode: loadAgentMode(),
  activeScene: null,
  toolSnapshots: loadToolSnapshots(),
  deviceScanResults: null,
};
function loadAgentMode() { try { const value = localStorage.getItem('opshub-agent-mode'); return value !== null ? value === '1' : true; } catch { return true; } }
function saveAgentMode() { localStorage.setItem('opshub-agent-mode', state.agentMode ? '1' : '0'); }
function loadToolSnapshots() { try { return JSON.parse(localStorage.getItem('opshub-tool-snapshots') || '[]'); } catch { return []; } }
function saveToolSnapshots() { localStorage.setItem('opshub-tool-snapshots', JSON.stringify(state.toolSnapshots)); }
const SCENE_WIZARDS = {
  printer: { icon: '🖨️', title: '打印异常', subtitle: '小票机/打印机不打印、卡纸、脱机', steps: [{ id: 'scope', name: '确认故障范围', prompt: '是只有这一台有问题，还是整个区域都有问题？', auto: [] }, { id: 'connectivity', name: '连通性检查', prompt: '需要检查打印机网络是否可达。请确认上方已填入打印机 IP。', auto: ['printer-health'], requiresHost: true }, { id: 'local', name: '本机打印服务', prompt: '检查本机 Print Spooler 和队列。', auto: ['printer-service'] }, { id: 'conclusion', name: '结论与建议', prompt: '', auto: [], manual: true }] },
  cctv: { icon: '📹', title: '监控异常', subtitle: '摄像头/NVR 无画面、黑屏、录像异常', steps: [{ id: 'scope', name: '确认故障范围', prompt: '单路摄像头黑屏还是全店监控异常？', auto: [] }, { id: 'connectivity', name: '连通性检查', prompt: '检查设备是否可达。', auto: ['cctv-health'], requiresHost: true }, { id: 'arp', name: 'ARP/MAC 确认', prompt: '排除 IP 冲突和 MAC 异常。', auto: ['arp'], requiresHost: true }, { id: 'web', name: 'Web 管理页探测', prompt: '检查设备管理页面是否可访问。', auto: ['web-probe'], requiresHost: true }, { id: 'conclusion', name: '结论与建议', prompt: '', auto: [], manual: true }] },
  network: { icon: '🌐', title: '网络不通', subtitle: '全店断网、Wi-Fi 异常、VPN 失败、网速慢', steps: [{ id: 'snapshot', name: '一键网络快照', prompt: '立即采集本机网络全貌。', auto: ['network-snapshot'] }, { id: 'gateway', name: '默认网关检查', prompt: '', auto: ['gateway-health'] }, { id: 'internet', name: '外网连通检查', prompt: '', auto: ['internet-health'] }, { id: 'adapter', name: '网卡链路状态', prompt: '', auto: ['adapter-health'] }, { id: 'conclusion', name: '结论与建议', prompt: '', auto: [], manual: true }] },
  pc: { icon: '💻', title: '电脑异常', subtitle: '蓝屏、卡顿、软件崩溃、磁盘告警', steps: [{ id: 'health', name: '电脑健康检查', prompt: '采集系统、内存、磁盘综合状态。', auto: ['workstation-health'] }, { id: 'hotspots', name: 'CPU/内存占用', prompt: '', auto: ['resource-hotspots'] }, { id: 'errors', name: '系统错误日志', prompt: '', auto: ['system-errors'] }, { id: 'drivers', name: '驱动异常检查', prompt: '', auto: ['driver-problems'] }, { id: 'conclusion', name: '结论与建议', prompt: '', auto: [], manual: true }] }
};

const incidents = [];
const assets = [];
const savedAssets = [];
const savedTickets = [];
const savedWorklogs = [];

function icon(text) { return `<i>${text}</i>`; }
function can(permission) { return state.auth.permissions?.includes(permission); }
const frontendRepairTools = new Set(['flush-dns', 'renew-dhcp', 'repair-network', 'repair-printer', 'repair-printer-queue', 'spooler-start', 'print-test']);
const frontendLaunchTools = new Set(['rdp', 'open-web']);
function permissionForTool(tool) {
  if (frontendRepairTools.has(tool)) return 'repair_run';
  if (frontendLaunchTools.has(tool)) return 'launcher_run';
  return 'tool_run';
}

function nav() {
  const items = [
    ['dashboard', '▣', '今日概览'], ['toolbox', '⌘', '现场工具'], ['sop', '☑', '现场 SOP'], ['worklog', '▤', '现场处置单'], ['tickets', '▤', '工单'], ['assets', '▦', '资产管理'],
    ['monitoring', '◉', '监控告警'], ['topology', '⌁', '网络拓扑'], ['remote', '▣', '远程支持'], ['automation', '⚙', '自动化任务'],
  ];
  const kb = [['knowledge', '◫', '知识库'], ['ai', '✦', 'AI 排障助手'], ['audit', '◷', '审计日志'], ...(can('user_manage') ? [['permissions', '◎', '权限管理']] : [])];
  const renderItem = ([id, symbol, label]) => `<button class="nav-btn ${state.page === id ? 'active' : ''}" data-page="${id}">${icon(symbol)}${label}</button>`;
  return `<aside class="sidebar"><div class="side-title">工作台</div><div class="menu">${items.map(renderItem).join('')}</div><hr><div class="side-title">知识与审计</div><div class="menu">${kb.map(renderItem).join('')}</div><div class="sidebar-tip"><strong>需要排障？</strong>上传告警、日志或截图，AI 会基于 SOP 给出处理步骤。</div></aside>`;
}

function authPage() {
  const bootstrap = state.auth.bootstrapRequired;
  return `<div class="auth-shell"><section class="auth-card"><div class="auth-logo">运维百宝箱</div><h1>${bootstrap ? '初始化管理员' : '登录工作台'}</h1><p>${bootstrap ? '第一次使用先创建本机管理员。后续可在权限管理里创建工程师和只读账号。' : '请输入本机账号。权限由后端强制控制，不靠隐藏按钮糊弄。'}</p><label>账号<input id="auth-username" class="tool-input" autocomplete="username" value="${bootstrap ? 'admin' : ''}" placeholder="admin"/></label>${bootstrap ? '<label>显示名称<input id="auth-display" class="tool-input" value="系统管理员" placeholder="系统管理员"/></label>' : ''}<label>密码<input id="auth-password" class="tool-input" type="password" autocomplete="${bootstrap ? 'new-password' : 'current-password'}" placeholder="至少 8 位"/></label><button class="primary auth-submit" data-action="${bootstrap ? 'auth-bootstrap' : 'auth-login'}">${bootstrap ? '创建管理员并进入' : '登录'}</button><div class="auth-rbac"><strong>角色说明</strong><span>管理员：账号、备份、全部工具</span><span>运维工程师：现场处理、受控修复、AI</span><span>只读人员：查看数据、只读排查、AI 建议</span></div></section></div>`;
}

function dashboard() {
  return `<div class="page-head"><div><h1>今日概览</h1><p>门店、设备与故障实时状态</p></div><button class="primary" data-action="new-ticket">+ 新建工单</button></div>
  <section class="metrics"><div class="metric"><div class="metric-label">待处理工单</div><div class="metric-value">12 <span class="badge red">3 紧急</span></div></div><div class="metric"><div class="metric-label">紧急告警</div><div class="metric-value">3 <span class="metric-status">1 门店离线</span></div></div><div class="metric"><div class="metric-label">在线门店</div><div class="metric-value">48 / 50 <span class="badge green">96% 健康</span></div></div><div class="metric"><div class="metric-label">远程终端</div><div class="metric-value">326 <span class="metric-status">8 台需关注</span></div></div></section>
  <section class="grid two"><div class="card"><div class="card-head"><h2>高优先级故障</h2><button class="link" data-page="monitoring">查看全部</button></div>${incidents.length ? incidents.map((x, i) => `<div class="incident"><div><div class="incident-name">${x.name}</div><div class="incident-meta">${x.meta}</div></div><span class="level ${x.cls}">${x.level}</span><button class="ghost" data-action="diagnose" data-issue="${i}">一键排查</button></div>`).join('') : '<div class="incident-meta">暂无现场事件。资产巡检发现异常后可在“监控告警”中创建事件。</div>'}</div>
  <div class="card"><div class="card-head"><h2>快速排障</h2></div><p class="incident-meta">描述故障或选择常见分类，系统会生成排查步骤。</p><textarea id="diagnosis-input" class="diagnosis-box" placeholder="例如：万达店小票打印机无法打印"></textarea><div class="chips"><button class="chip" data-fill="电脑蓝屏或软件异常">电脑/软件</button><button class="chip" data-fill="办公室网络不通或 VPN 连接失败">网络异常</button><button class="chip" data-fill="门店打印机或摄像头离线">打印机/监控</button></div><button class="primary" data-action="diagnose-input">开始排查</button></div></section>
  <section class="grid bottom"><div class="card"><div class="card-head"><h2>门店健康度</h2></div><div class="health-row"><div class="health-top"><span>华东区</span><span>22 / 23</span></div><div class="bar"><span style="width:96%"></span></div></div><div class="health-row"><div class="health-top"><span>华南区</span><span>26 / 27</span></div><div class="bar"><span style="width:96%"></span></div></div></div><div class="card"><div class="card-head"><h2>AI 建议处理方案</h2><button class="link" data-page="ai">打开助手</button></div><div class="ai-box"><div class="ai-title">疑似摄像头供电或 PoE 链路异常</div><div>证据：NVR 在线，摄像头 Ping 超时，交换机 PoE 端口 12 无链路。</div><div>建议：先检查供电和网线；确认后可远程重置 PoE 端口；最后验证 RTSP 画面。</div><div class="ai-actions"><button class="ghost" data-action="show-sop">查看 SOP</button><button class="primary" data-action="new-ticket">生成现场工单</button></div></div></div></section>`;
}

function tablePage(title, subtitle, headers, rows) {
  return `<div class="page-head"><div><h1>${title}</h1><p>${subtitle}</p></div><button class="primary" data-action="new-ticket">+ 新建工单</button></div><table class="page-table"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}" class="incident-meta">暂无现场数据。</td></tr>`}</tbody></table>`;
}

function currentPage() {
  if (!state.auth.checked) return `<div class="card empty">正在检查登录状态…</div>`;
  if (!state.auth.authenticated) return authPage();
  if (state.page === 'dashboard') return dashboard();
  if (state.page === 'toolbox') return toolbox();
  if (state.page === 'sop') return sopPage();
  if (state.page === 'worklog') return worklogPage();
  if (state.page === 'tickets') return tablePage('工单中心', '按优先级追踪现场、桌面、网络与机房故障。', ['编号', '标题', '门店/位置', '优先级', '状态'], savedTickets.map((item) => [item.id, item.title, item.site, item.priority, item.status]));
  if (state.page === 'assets') { const assetRows = [...assets.map(x => ({ site:x[0], id:x[1], type:x[2], ip:x[3], status:x[4] })), ...savedAssets]; return `<div class="page-head"><div><h1>资产管理</h1><p>集中查看门店、机房和办公终端的归属与状态。</p></div><button class="primary" data-action="register-asset">+ 现场登记资产</button></div><table class="page-table"><thead><tr><th>位置</th><th>资产编号</th><th>类型</th><th>IP 地址</th><th>状态</th></tr></thead><tbody>${assetRows.length ? assetRows.map((item) => `<tr><td>${item.site}</td><td>${item.id}</td><td>${item.type}</td><td>${item.ip}</td><td><span class="status-dot ${item.status === '离线' ? 'offline' : 'online'}"></span>${item.status || '已登记'}</td></tr>`).join('') : '<tr><td colspan="5" class="incident-meta">暂无已登记资产。可现场登记、导入 CSV 或登记本机资产。</td></tr>'}</tbody></table>`; }
  if (state.page === 'monitoring') return tablePage('监控告警', '整合设备可用性、资源指标和网络告警。', ['时间', '对象', '告警内容', '级别', '状态'], []);
  if (state.page === 'ai') return chatPage();
  if (state.page === 'permissions') return permissionsPage();
  const labels = { topology: ['网络拓扑', '按现场登记的资产、上联设备、端口和 VLAN 展示链路关系。'], remote: ['远程支持', '统一启动本机已安装的 RDP、RustDesk 或 AnyDesk。'], automation: ['自动化任务', '预留白名单巡检脚本接入；当前不启用自动执行。'], knowledge: ['知识库', '沉淀门店、打印机、网络、监控和机房 SOP。'], audit: ['审计日志', '记录审批、脚本执行、远控与工单变更。'] };
  const [title, subtitle] = labels[state.page] || ['页面不存在', ''];
  return `<div class="page-head"><div><h1>${title}</h1><p>${subtitle}</p></div></div><div class="card empty">该模块的界面已预留，下一步接入实际服务与数据源。</div>`;
}

function chatPage() {
  const messages = state.chatMessages.length ? state.chatMessages : [{ role: 'assistant', content: '我是运维百宝箱助手。把门店、设备、报错或现场检测结果发给我；我会先判断范围，再给排查、修复、验证和回滚步骤。' }];
  return `<div class="chat-shell"><aside class="chat-settings"><div class="chat-brand">AI 排障助手</div><p>结合现场工具、SOP 和历史对话给处理建议。</p><label class="tool-label">AI Provider</label><select id="ai-provider" class="tool-input">${state.aiProviders.map((item) => `<option value="${item.name}">${item.name}${item.mode === 'local' ? '（离线）' : ''}</option>`).join('')}</select><label class="tool-label">排障模式</label><select id="ai-agent-mode" class="tool-input"><option value="agent" ${state.agentMode ? 'selected' : ''}>Agent 模式（AI 主动诊断）</option><option value="classic" ${state.agentMode ? '' : 'selected'}>经典模式（AI 建议，手动执行）</option></select><div class="chat-note"><strong>自动携带</strong><br>最近现场工具输出<br>当前对话上下文<br>运维 SOP 约束</div><button class="ghost chat-clear" data-action="clear-chat">清空当前会话</button></aside><section class="chat-panel"><header class="chat-header"><div><h1>运维对话</h1><span>复杂修复动作仍需人工确认</span></div><span class="chat-online">● 已连接</span></header><main id="chat-messages" class="chat-messages">${messages.map((item, index) => chatMessageMarkup(item, state.chatMessages.length ? index : -1)).join('')}</main><footer class="chat-composer"><textarea id="ai-input" placeholder="例如：万达店 3 号摄像头离线，NVR 能 Ping，摄像头不通，PoE 端口没有链路。"></textarea><div><span>Enter 发送 · Shift + Enter 换行</span><button class="primary" data-action="ai-run">发送</button></div></footer></section></div>`;
}

const aiToolAllowlist = new Set(['onsite-baseline', 'network-snapshot', 'gateway-health', 'adapter-health', 'internet-health', 'ping', 'port', 'web-probe', 'arp', 'printer-health', 'printer', 'printer-service', 'cctv-health', 'cctv', 'workstation-health', 'resource-hotspots', 'system-errors', 'driver-problems']);
function chatMessageMarkup(item, messageIndex = -1) {
  const isAgentTrace = Array.isArray(item.agentTrace) && item.agentTrace.length > 0;
  const isLoading = item.content === '正在分析现场信息…' || item.content === 'Agent 正在执行诊断，请稍候…';
  const tools = Array.isArray(item.suggestedTools) ? item.suggestedTools.filter((entry) => aiToolAllowlist.has(entry?.tool)).slice(0, 4) : [];
  const actions = tools.length ? `<div class="ai-suggested-tools"><span>建议继续检查</span><div>${tools.map((entry) => `<button class="ghost" data-action="run-ai-tool" data-tool-id="${escapeHtml(entry.tool)}" data-tool-host="${escapeHtml(entry.host || '')}">${escapeHtml(toolName(entry.tool))}</button>`).join('')}</div></div>` : '';
  const brief = aiOpsBriefMarkup(item.opsBrief);
  const recordActions = item.role === 'assistant' && messageIndex >= 0 && !isLoading && can('data_write') ? `<div class="ai-message-actions"><button class="ghost" data-action="ai-to-worklog" data-message-index="${messageIndex}">生成处置单草稿</button>${item.ticketId ? `<span class="ai-ticket-linked">已建工单 ${escapeHtml(item.ticketId)}</span>` : `<button class="ghost" data-action="ai-create-ticket" data-message-index="${messageIndex}">生成工单</button>`}</div>` : '';
  const agentTraceBlock = isAgentTrace ? renderAgentTrace(item.agentTrace) : '';
  return `<div class="chat-row ${item.role === 'user' ? 'user' : 'assistant'}"><div class="chat-avatar">${item.role === 'user' ? '你' : 'AI'}</div><div class="chat-message-body"><div class="chat-bubble">${escapeHtml(isAgentTrace ? (item.content || '') : item.content)}</div>${agentTraceBlock}${brief}${actions}${recordActions}</div></div>`;
}
function renderAgentTrace(trace) {
  if (!trace || !trace.length) return '';
  const steps = trace.map((step) => {
    if (step.type === 'think') return `<div class="agent-think"><span>💭</span><em>${escapeHtml(String(step.content || '').slice(0, 300))}</em></div>`;
    if (step.type === 'tool-start') return `<details class="agent-tool agent-tool-pending" open><summary><span>🔧</span><strong>${escapeHtml(String(step.displayName || step.tool))}</strong></summary></details>`;
    if (step.type === 'tool-end') return `<details class="agent-tool ${step.ok ? 'agent-tool-ok' : 'agent-tool-fail'}"><summary><span>${step.ok ? '✅' : '⚠️'}</span><strong>${escapeHtml(String(step.displayName || step.tool))}</strong><em>${step.ok ? '正常' : '异常'}</em></summary><pre>${escapeHtml(String(step.output || '').slice(0, 6000))}</pre></details>`;
    if (step.type === 'ask-user') return `<div class="agent-ask-user"><span>❓</span><div><strong>请求现场确认</strong><p>${escapeHtml(String(step.question || ''))}</p>${Array.isArray(step.options) && step.options.length ? `<div class="agent-ask-options">${step.options.map((opt) => `<span class="chip">${escapeHtml(String(opt))}</span>`).join('')}</div>` : ''}</div></div>`;
    if (step.type === 'error') return `<div class="agent-tool agent-tool-fail"><span>❌</span><strong>错误</strong><em>${escapeHtml(String(step.message || '').slice(0, 300))}</em></div>`;
    return '';
  }).filter(Boolean).join('');
  return `<div class="agent-trace">${steps}</div>`;
}

function aiOpsBriefMarkup(brief) {
  if (!brief || typeof brief !== 'object') return '';
  const fields = [['结论', brief.conclusion], ['根因候选', brief.rootCause], ['风险', brief.risk], ['验证', brief.verification], ['回滚', brief.rollback]];
  return `<section class="ai-ops-brief"><div class="ai-ops-brief-head">现场执行摘要 <span>需人工复核</span></div>${fields.map(([label, value]) => `<div><strong>${label}</strong><p>${escapeHtml(String(value || '待确认'))}</p></div>`).join('')}</section>`;
}

function aiOpsBriefText(brief) {
  if (!brief || typeof brief !== 'object') return '';
  const fields = [['判断结论', brief.conclusion], ['证据', brief.evidence], ['根因候选', brief.rootCause], ['风险', brief.risk], ['验证', brief.verification], ['回滚', brief.rollback]];
  return fields.map(([label, value]) => `【${label}】\n${String(value || '待确认')}`).join('\n\n');
}

function permissionsPage() {
  if (!can('user_manage')) return `<div class="card empty">当前账号没有权限管理权限。</div>`;
  const roleOptions = Object.entries(state.auth.roles || {}).map(([value, item]) => `<option value="${value}">${item.label}</option>`).join('');
  return `<div class="page-head"><div><h1>权限管理</h1><p>本机账号与角色分离。密码只保存哈希，不在审计和报告里输出。</p></div><button class="ghost" data-action="refresh-users">刷新账号</button></div><section class="grid two"><div class="card"><div class="card-head"><h2>新增账号</h2></div><div class="form-grid"><label>账号<input id="new-user-username" class="tool-input" placeholder="例如 zhangsan"/></label><label>显示名称<input id="new-user-display" class="tool-input" placeholder="例如 张工"/></label><label>角色<select id="new-user-role" class="tool-input">${roleOptions}</select></label><label>初始密码<input id="new-user-password" type="password" class="tool-input" placeholder="至少 8 位"/></label></div><div class="tool-actions"><button class="primary" data-action="create-user">创建账号</button></div></div><div class="card"><div class="card-head"><h2>权限矩阵</h2></div><div class="permission-matrix">${Object.entries(state.auth.roles || {}).map(([role, item]) => `<div><strong>${item.label}</strong><span>${(item.permissions || []).join('、')}</span></div>`).join('')}</div></div></section><section class="card" style="margin-top:18px"><div class="card-head"><h2>账号列表</h2><span class="incident-meta">${state.users.length} 个账号</span></div><div class="user-list">${state.users.map((user) => `<div class="user-item"><div><strong>${escapeHtml(user.displayName || user.username)}</strong><span>${escapeHtml(user.username)} · ${escapeHtml(user.roleLabel || user.role)} · ${user.disabled ? '已停用' : '启用'}</span></div><div class="user-actions"><select class="tool-input" data-user-role="${escapeHtml(user.id)}">${Object.entries(state.auth.roles || {}).map(([value, item]) => `<option value="${value}" ${user.role === value ? 'selected' : ''}>${item.label}</option>`).join('')}</select><button class="ghost" data-action="reset-user-password" data-user-id="${escapeHtml(user.id)}">改密</button><button class="ghost" data-action="toggle-user" data-user-id="${escapeHtml(user.id)}" data-disabled="${user.disabled ? '0' : '1'}">${user.disabled ? '启用' : '停用'}</button></div></div>`).join('') || '<div class="incident-meta">暂无账号。</div>'}</div></section>`;
}

function worklogPage() {
  return `<div class="page-head"><div><h1>现场处置单</h1><p>记录到店故障、现场处理、验证结果和工具证据，保存后可作为工单结案附件。</p></div></div><div class="grid two"><section class="card"><div class="form-grid"><label>门店 / 位置<input id="worklog-site" class="tool-input" placeholder="例如：万达店"/></label><label>现场联系人<input id="worklog-contact" class="tool-input" placeholder="姓名 / 电话（可选）"/></label><label class="form-full">故障标题<input id="worklog-title" class="tool-input" placeholder="例如：3 号摄像头离线"/></label><label class="form-full">处理结果<textarea id="worklog-result" class="diagnosis-box" placeholder="写明处理动作和恢复结果。"></textarea></label><label class="form-full">备注 / 备件 / 后续事项<textarea id="worklog-notes" class="diagnosis-box" placeholder="例如：更换网线；建议后续更换 PoE 交换机。"></textarea></label></div><div class="tool-actions"><button class="primary" data-action="save-worklog">保存现场处置单</button><button class="ghost" data-action="export-report">导出本次工具报告</button></div></section><section class="card"><div class="card-head"><h2>本次证据</h2><span class="incident-meta">${state.toolHistory.length} 项工具记录</span></div><div class="history-list">${state.toolHistory.length ? historyMarkup() : '<div class="incident-meta">先在现场工具中运行检查，结果会自动保存在这里并可导出。</div>'}</div></section></div><section class="card" style="margin-top:18px"><div class="card-head"><h2>最近现场处置单</h2></div><div class="history-list">${savedWorklogs.length ? savedWorklogs.slice(0, 8).map((item) => `<div class="history-item"><span>${new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false })}</span><strong>${item.site} · ${item.title}</strong><em class="history-ok">已保存</em></div>`).join('') : '<div class="incident-meta">暂无已保存的现场处置单。</div>'}</div></section>`;
}

function sopPage() {
  const cards = [
    ['打印机/小票机无法打印', '先分电源、纸张、USB/网络连接、队列、驱动五层排查。', 'Ping 打印机 IP → 网络打印机诊断 → 检查 Print Spooler 和队列 → 现场检查纸张与网线', 'printer'],
    ['摄像头/NVR 无画面', '先判断是单个摄像头、NVR，还是整店网络故障。', 'Ping NVR/摄像头 → NVR 端口检查 → ARP 核对 MAC → 现场检查 PoE、供电、网线和通道状态', 'cctv'],
    ['门店网络不通', '先确认故障范围：单设备、单网段、全店或仅外网。', '本机网络信息 → Ping 网关 → 扫描网段 → ARP/MAC 查询 → DNS、端口和路由追踪', 'network'],
    ['电脑卡顿/蓝屏/软件异常', '先保全报错、数据和硬件状态，避免直接重装掩盖问题。', '电脑健康检查 → 最近系统错误 → 磁盘健康 → 记录蓝屏代码与软件版本', 'pc'],
  ];
  return `<div class="page-head"><div><h1>现场 SOP</h1><p>把常见门店与桌面故障的经验固化为统一排查顺序，避免新人漏项。</p></div></div><div class="sop-grid">${cards.map(([title, summary, steps, key]) => `<article class="sop-card"><div class="sop-icon">${key === 'printer' ? 'PR' : key === 'cctv' ? 'CV' : key === 'network' ? 'NW' : 'PC'}</div><h2>${title}</h2><p>${summary}</p><div class="sop-steps">${steps}</div><button class="primary" data-action="open-sop" data-sop="${key}">打开处理清单</button></article>`).join('')}</div>`;
}

function toolButton(tool, label, cls = 'ghost', extra = '') {
  const permission = permissionForTool(tool);
  const locked = state.auth.authenticated && !can(permission);
  return `<button class="${cls}" data-tool="${tool}" ${locked ? 'disabled title="当前角色无权限执行此工具"' : ''} ${extra}>${label}${locked ? '（无权限）' : ''}</button>`;
}
function toolGroup(title, subtitle, buttons) {
  return `<section class="card tool-section"><div class="card-head"><div><h2>${title}</h2>${subtitle ? `<span class="incident-meta">${subtitle}</span>` : ''}</div></div><div class="tool-actions">${buttons.join('')}</div></section>`;
}
function toolbox() {
  const networkButtons = [
    toolButton('network-snapshot', '一键网络快照', 'primary'), toolButton('gateway-health', '默认网关检查'), toolButton('adapter-health', '网卡/网线链路'), toolButton('internet-health', '外网连通检查'),
    toolButton('ping', 'Ping 连通性'), toolButton('dns', 'DNS 查询'), toolButton('port', '端口测试'), toolButton('trace', '路由追踪'), toolButton('route-info', 'IPv4 路由表'), toolButton('wifi-info', 'Wi-Fi 状态'),
    toolButton('web-probe', '设备 Web 探测'), toolButton('open-web', '打开设备网页'), toolButton('certificate', 'HTTPS 证书检查'), toolButton('rdp', '打开远程桌面'),
    toolButton('flush-dns', '刷新 DNS 缓存', 'ghost', 'data-confirm="确认刷新本机 DNS 缓存？"'), toolButton('renew-dhcp', 'DHCP 续租', 'ghost', 'data-confirm="确认续租 DHCP？执行时当前网络可能短暂中断。"')
  ];
  const desktopButtons = [
    toolButton('workstation-health', '电脑健康检查', 'primary'), toolButton('system-info', '系统与内存信息'), toolButton('resource-hotspots', 'CPU/内存占用'), toolButton('disk-health', '磁盘与硬盘健康'),
    toolButton('identity-info', '登录/域信息'), toolButton('network-drives', '共享盘/网络驱动器'), toolButton('firewall-status', '防火墙/监听端口'), toolButton('system-errors', '系统错误日志'),
    toolButton('application-errors', '应用崩溃日志'), toolButton('driver-problems', '设备/驱动异常'), toolButton('software-inventory', '已安装软件清单'), toolButton('service-status', '检查指定服务')
  ];
  const printerButtons = [
    toolButton('printer-health', '目标打印机巡检', 'primary'), toolButton('printer', '网络打印机端口'), toolButton('printer-service', '本机打印服务与队列'), toolButton('print-test', '打印 Windows 测试页'),
    toolButton('spooler-start', '启动打印服务', 'ghost', 'data-confirm="确认启动本机 Print Spooler 服务？"'), toolButton('repair-printer', '修复本机打印服务', 'ghost', 'data-confirm="确认重启本机 Print Spooler？正在处理的打印任务可能短暂中断。"'),
    toolButton('repair-printer-queue', '清理卡死打印队列', 'ghost', 'data-confirm="确认清空本机所有待打印任务并重启 Print Spooler？此操作会丢弃未打印的文件，无法恢复。"')
  ];
  const cctvButtons = [toolButton('cctv-health', '目标监控巡检', 'primary'), toolButton('cctv', 'NVR/监控端口检查'), toolButton('arp', '查询目标 MAC / ARP'), toolButton('web-probe', '探测 NVR/摄像头 Web'), toolButton('open-web', '打开管理页')];
  const repairLocked = state.auth.authenticated && !can('repair_run');
  const repairDisabled = repairLocked ? 'disabled title="当前角色无权限执行受控修复"' : '';
  const sceneCards = Object.entries(SCENE_WIZARDS).map(([key, scene]) => `<article class="scene-card ${state.activeScene === key ? 'active' : ''}" data-action="activate-scene" data-scene="${key}"><span class="scene-icon">${scene.icon}</span><strong>${scene.title}</strong><small>${scene.subtitle}</small></article>`).join('');
  const wizardBlock = state.activeScene ? renderSceneWizard(state.activeScene) : '';
  const deviceScanBlock = state.deviceScanResults ? renderDeviceScanResults(state.deviceScanResults) : '';
  const compareBlock = state.toolSnapshots.length >= 2 ? renderCompareReport(state.toolSnapshots) : (state.toolSnapshots.length === 1 ? `<div class="card" style="margin-top:12px"><div class="card-head"><h2>📸 快照已保存</h2><span class="incident-meta">修复后再拍一个快照即可生成对比报告。</span></div></div>` : '');
  return `<div class="page-head"><div><h1>现场工具</h1><p>点击故障场景自动引导排查，或输入描述让 AI 诊断。</p></div><div class="tool-actions"><button class="ghost" data-action="download-offline-pack">⬇ 离线工具包</button><button class="primary" data-page="ai">交给 AI</button></div></div>
  <section class="scene-cards">${sceneCards}</section>
  ${wizardBlock}
  <section class="grid two"><div class="card"><div class="card-head"><h2>🔍 快速排查</h2></div><label class="tool-label">目标 IP 或域名</label><input id="tool-host" class="tool-input" value="127.0.0.1" placeholder="例如：192.168.1.10、打印机 IP、NVR IP"/><div class="tool-inline"><div><label class="tool-label">扫描网段（仅 /24）</label><input id="tool-subnet" class="tool-input" value="192.168.1.0/24" placeholder="例如：192.168.1.0/24"/></div><div class="tool-actions" style="margin:0"><button class="primary" data-action="run-device-scan">🔎 智能扫描</button><button class="ghost" data-tool="scan">旧版扫描</button></div></div>${deviceScanBlock}</div><div class="card"><div class="card-head"><h2>检测结果</h2><span id="tool-state" class="incident-meta">等待执行</span></div><pre id="tool-output" class="tool-output">选择故障场景卡片开始自动排查，或使用上方快速排查工具。\n\n💡 智能扫描会自动识别设备类型（打印机/摄像头/网络设备）。\n📸 点击"拍摄快照"可在修复前后对比。</pre><div class="tool-actions result-actions"><button class="ghost" data-action="copy-result">复制结果</button><button class="ghost" data-action="take-snapshot">📸 拍摄快照</button><button class="ghost" data-action="export-report">导出 TXT</button><button class="primary" data-action="export-html-report">导出 HTML 报告</button></div></div></section>
  ${compareBlock}
  <details class="card advanced-tools" style="margin-top:18px"><summary class="card-head" style="cursor:pointer;list-style:none;display:flex;align-items:center"><h2 style="margin:0">⚙ 高级工具</h2><span class="incident-meta">全部 40+ 诊断工具，按需使用</span></summary><div class="tool-quick-bar" style="margin-bottom:12px"><button class="chip" data-tool="onsite-baseline">现场基础体检</button><button class="chip" data-tool="workstation-health">电脑健康检查</button><button class="chip" data-tool="printer-health">目标打印机巡检</button><button class="chip" data-tool="cctv-health">目标监控巡检</button><button class="chip" data-tool="repair-network" data-confirm="确认刷新 DNS 并续租 DHCP？" ${repairDisabled}>修复基础网络${repairLocked ? '（无权限）' : ''}</button><button class="chip" data-tool="repair-printer" data-confirm="确认重启 Print Spooler？" ${repairDisabled}>修复打印服务${repairLocked ? '（无权限）' : ''}</button><button class="chip" data-tool="repair-printer-queue" data-confirm="确认清空打印队列？" ${repairDisabled}>清理打印队列${repairLocked ? '（无权限）' : ''}</button></div><section class="field-tool-grid">${toolGroup('网络与设备排查', '', networkButtons)}${toolGroup('桌面 / IT 技术支持', '', desktopButtons)}${toolGroup('打印机 / 小票机', '', printerButtons)}${toolGroup('监控 / NVR / 摄像头', '', cctvButtons)}</section></details>
  <section class="card" style="margin-top:18px"><div class="card-head"><h2>本次现场操作记录</h2><span id="history-count" class="incident-meta">${state.toolHistory.length} 项</span></div><div id="history-list" class="history-list">${historyMarkup()}</div></section>
  <section class="card" style="margin-top:18px"><div class="card-head"><h2>外部工具桥</h2><span class="incident-meta">自动检测本机已安装的行业工具；点击后在本机打开。</span></div><div class="external-tools">${state.externalTools.length ? state.externalTools.map((tool) => `<div class="external-tool"><div><strong>${tool.name}</strong><span>${tool.category}</span></div><button class="${tool.path ? 'primary' : 'ghost'}" ${tool.path ? `data-action="launch-external" data-external-id="${tool.id}"` : 'disabled'}>${tool.path ? '打开工具' : '未安装'}</button></div>`).join('') : '<div class="incident-meta">正在检测 Wireshark、Nmap、HWiNFO、CrystalDiskInfo、SADP 和远程支持工具…</div>'}</div></section>`;
}
function renderSceneWizard(sceneKey) {
  const scene = SCENE_WIZARDS[sceneKey];
  if (!scene) return '';
  const steps = scene.steps.map((step, index) => {
    const doneIcon = state.wizardResults?.[step.id] ? '✅' : (index === 0 ? '▶' : '○');
    const outputHtml = state.wizardResults?.[step.id] ? `<pre class="wizard-step-output">${escapeHtml(String(state.wizardResults[step.id].output || '').slice(0, 3000))}</pre>` : '';
    return `<div class="wizard-step"><div class="wizard-step-head"><span>${doneIcon}</span><strong>步骤 ${index + 1}/${scene.steps.length}：${step.name}</strong>${state.wizardResults?.[step.id] ? `<em class="${state.wizardResults[step.id].ok ? 'history-ok' : 'history-fail'}">${state.wizardResults[step.id].ok ? '正常' : '异常'}</em>` : ''}</div>${step.prompt ? `<p class="incident-meta">${step.prompt}</p>` : ''}${outputHtml}</div>`;
  }).join('');
  return `<section class="card wizard-panel" style="margin-top:12px"><div class="card-head"><div><h2>${scene.icon} ${scene.title} - 排查向导</h2><span class="incident-meta">自动依次执行诊断，结果实时展示</span></div><div class="tool-actions"><button class="ghost" data-action="close-wizard">关闭向导</button><button class="primary" data-action="run-wizard" data-scene="${sceneKey}">${state.wizardResults ? '继续执行' : '开始排查'}</button></div></div>${steps}</section>`;
}
function renderDeviceScanResults(devices) {
  if (!devices || !devices.length) return '<p class="incident-meta" style="margin-top:8px">未发现在线设备，部分设备可能禁用 ICMP。</p>';
  return `<div class="device-scan-results" style="margin-top:8px"><span class="incident-meta" style="margin-bottom:6px;display:block">发现 ${devices.length} 台设备：</span>${devices.map((device) => `<div class="device-scan-item"><span>${device.type === '打印机/小票机' ? '🖨️' : device.type === '摄像头/NVR' ? '📹' : device.type === '网络设备（Web）' ? '🌐' : '💻'}</span><div><strong>${escapeHtml(device.ip)}</strong><small>${escapeHtml(device.type)}${device.known ? ` · ⭐${escapeHtml(device.known.site)} ${escapeHtml(device.known.name)}` : ''}</small></div><div class="device-scan-actions">${device.known && device.known.type ? `<button class="ghost" data-action="diagnose-device" data-host="${escapeHtml(device.ip)}" data-type="${escapeHtml(device.known.type)}">诊断</button>` : `<button class="ghost" data-action="diagnose-device" data-host="${escapeHtml(device.ip)}" data-type="${escapeHtml(device.type)}">诊断</button>`}<button class="ghost" data-action="fill-host" data-host="${escapeHtml(device.ip)}">填入 IP</button></div></div>`).join('')}</div>`;
}
function renderCompareReport(snapshots) {
  if (snapshots.length < 2) return '';
  const [before, after] = snapshots;
  const beforeItems = before.items || [];
  const afterItems = after.items || [];
  const allNames = [...new Set([...beforeItems.map((item) => item.name), ...afterItems.map((item) => item.name)])];
  if (!allNames.length) return '';
  const rows = allNames.map((name) => {
    const b = beforeItems.find((item) => item.name === name);
    const a = afterItems.find((item) => item.name === name);
    const bOk = b ? b.ok : null; const aOk = a ? a.ok : null;
    const improved = (bOk === false && aOk === true) ? 'improved' : (bOk === true && aOk === false) ? 'worsened' : '';
    return `<div class="compare-row ${improved}"><strong>${escapeHtml(name)}</strong><span class="compare-before">${b ? (b.ok ? '✅ 正常' : '❌ 异常') : '—'}</span><span class="compare-arrow">→</span><span class="compare-after">${a ? (a.ok ? '✅ 正常' : '❌ 异常') : '—'}</span></div>`;
  }).join('');
  const improved = allNames.filter((name) => { const b = beforeItems.find((item) => item.name === name); const a = afterItems.find((item) => item.name === name); return b && !b.ok && a && a.ok; }).length;
  return `<section class="card compare-panel" style="margin-top:12px"><div class="card-head"><div><h2>📊 修复前后对比</h2><span class="incident-meta">${escapeHtml(before.label)} → ${escapeHtml(after.label)} · ${improved}/${allNames.length} 项改善</span></div></div>${rows}</section>`;
}
function modal() {
  if (!state.modal) return '';
  const issue = state.modal;
  return `<div class="modal-wrap"><div class="modal"><h2>AI 排查结果</h2><p><strong>故障：</strong>${issue}</p><div class="modal-result"><strong>初步结论：</strong>优先检查设备连通性与最近变更。<br><strong>排查顺序：</strong><br>1. 核实资产 IP、供电、指示灯和物理连接。<br>2. 执行 Ping、DNS、端口与服务状态检查。<br>3. 检索最近告警、日志和配置变更。<br>4. 明确根因后生成远程修复或现场工单。<br><strong>回滚：</strong>任何重启或配置变更前先备份当前配置。</div><div class="modal-footer"><button class="ghost" data-action="close-modal">关闭</button><button class="primary" data-action="new-ticket">生成工单</button></div></div></div>`;
}

function render() {
  const authed = state.auth.authenticated;
  const userLabel = authed ? `${escapeHtml(state.auth.user?.displayName || state.auth.user?.username)} · ${escapeHtml(state.auth.user?.roleLabel || '')}` : '未登录';
  document.querySelector('#app').innerHTML = `<div class="app"><header class="topbar"><div class="brand">运维百宝箱 <small>OpsHub IT Operations Toolbox</small></div>${authed ? '<input class="search" placeholder="搜索门店、设备、IP 或工单"/>' : ''}<div class="user-chip">${userLabel}</div>${authed ? '<button class="ghost top-logout" data-action="auth-logout">退出</button>' : ''}</header>${authed ? `<div class="layout">${nav()}<main class="content">${currentPage()}</main></div>` : `<main class="content">${currentPage()}</main>`}${modal()}${state.toast ? `<div class="toast">${state.toast}</div>` : ''}</div>`;
  const aiProvider = document.querySelector('#ai-provider');
  if (aiProvider?.querySelector('option[value="DeepSeek"]')) aiProvider.value = 'DeepSeek';
  const chatMessages = document.querySelector('#chat-messages');
  if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
  applyPendingAiWorklogDraft();
}

function toast(message) { state.toast = message; render(); setTimeout(() => { state.toast = ''; render(); }, 2200); }
function openDiagnosis(issue) { state.modal = issue; render(); }

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-page],[data-action],[data-fill],[data-tool]');
  if (!target) return;
  if (target.dataset.page) { state.page = target.dataset.page; render(); return; }
  if (target.dataset.fill) { const input = document.querySelector('#diagnosis-input'); if (input) input.value = target.dataset.fill; return; }
  if (target.dataset.tool) { if (target.dataset.confirm && !window.confirm(target.dataset.confirm)) return; runTool(target.dataset.tool); return; }
  const action = target.dataset.action;
  if (action === 'diagnose') openDiagnosis(incidents[Number(target.dataset.issue)].name);
  if (action === 'diagnose-input') openDiagnosis(document.querySelector('#diagnosis-input')?.value || '未填写故障描述');
  if (action === 'ai-run') { runAiAnalysis(); return; }
  if (action === 'run-ai-tool') { runAiSuggestedTool(target); return; }
  if (action === 'ai-to-worklog') { draftWorklogFromAi(Number(target.dataset.messageIndex)); return; }
  if (action === 'ai-create-ticket') { createTicketFromAi(Number(target.dataset.messageIndex)); return; }
  if (action === 'clear-chat') { state.chatMessages = []; saveChatHistory(); render(); return; }
  if (action === 'show-sop') toast('已打开：摄像头离线排障 SOP（演示数据）');
  if (action === 'new-ticket') { createTicket(); }
  if (action === 'register-asset') { registerAsset(); }
  if (action === 'save-worklog') { saveWorklog(); }
  if (action === 'launch-external') { launchExternalTool(target.dataset.externalId); }
  if (action === 'close-modal') { state.modal = null; render(); }
  if (action === 'copy-result') copyToolResult();
  if (action === 'export-report') exportToolReport();
  if (action === 'export-html-report') exportHtmlReport();
  if (action === 'open-sop') openSop(target.dataset.sop);
  if (action === 'activate-scene') { state.activeScene = target.dataset.scene; state.wizardResults = null; state.deviceScanResults = null; render(); }
  if (action === 'close-wizard') { state.activeScene = null; state.wizardResults = null; render(); }
  if (action === 'run-wizard') runSceneWizard(target.dataset.scene);
  if (action === 'run-device-scan') runDeviceScan();
  if (action === 'take-snapshot') takeSnapshot();
  if (action === 'download-offline-pack') { const link = document.createElement('a'); link.href = '/api/tools/offline-pack'; link.download = 'OpsHub离线应急诊断.html'; document.body.append(link); link.click(); link.remove(); toast('离线工具包已下载'); }
  if (action === 'diagnose-device') { const hostInput = document.querySelector('#tool-host'); if (hostInput) hostInput.value = target.dataset.host; const devType = (target.dataset.type || '').toLowerCase(); if (/打印|printer/.test(devType)) { state.activeScene = 'printer'; state.wizardResults = null; render(); setTimeout(() => runSceneWizard('printer'), 300); } else if (/摄像|监控|nvr|camera/.test(devType)) { state.activeScene = 'cctv'; state.wizardResults = null; render(); setTimeout(() => runSceneWizard('cctv'), 300); } else if (/电脑|终端/.test(devType)) { state.activeScene = 'pc'; state.wizardResults = null; render(); setTimeout(() => runSceneWizard('pc'), 300); } else { runTool('ping'); } }
  if (action === 'fill-host') { const hostInput = document.querySelector('#tool-host'); if (hostInput) hostInput.value = target.dataset.host; toast(`已填入 ${target.dataset.host}`); }
  if (action === 'auth-login') login();
  if (action === 'auth-bootstrap') bootstrapAdmin();
  if (action === 'auth-logout') logout();
  if (action === 'refresh-users') loadUsers();
  if (action === 'create-user') createUser();
  if (action === 'reset-user-password') resetUserPassword(target.dataset.userId);
  if (action === 'toggle-user') toggleUser(target.dataset.userId, target.dataset.disabled === '1');
});

document.addEventListener('change', (event) => {
  if (event.target.matches('[data-user-role]')) updateUserRole(event.target.dataset.userRole, event.target.value);
});

document.addEventListener('keydown', (event) => {
  if (event.target.id === 'ai-input' && event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); runAiAnalysis(); }
});

document.addEventListener('change', (event) => {
  if (event.target.id === 'ai-agent-mode') {
    state.agentMode = event.target.value === 'agent'; saveAgentMode();
    const chatNote = document.querySelector('.chat-note');
    if (chatNote) chatNote.innerHTML = state.agentMode ? '<strong>Agent 模式</strong><br>AI 主动调用工具诊断<br>结果自动回传分析<br>最多 8 轮推理</div>' : '<strong>经典模式</strong><br>AI 给出建议<br>手动执行工具<br>运维 SOP 约束';
  }
});

async function runSceneWizard(sceneKey) {
  const scene = SCENE_WIZARDS[sceneKey];
  if (!scene) return toast('未知排查场景');
  state.wizardResults = state.wizardResults || {};
  const host = document.querySelector('#tool-host')?.value.trim();
  const output = document.querySelector('#tool-output');
  const status = document.querySelector('#tool-state');
  for (const step of scene.steps) {
    if (state.wizardResults[step.id]) continue;
    if (step.requiresHost && (!host || host === '127.0.0.1')) { toast('请先在上方填写目标设备 IP 地址'); return; }
    if (step.manual) continue;
    if (!step.auto.length) continue;
    if (!output || !status) continue;
    status.textContent = `正在执行：${step.name}`;
    output.textContent = `正在执行 ${step.name}…`;
    render();
    const results = [];
    for (const toolId of step.auto) {
      try {
        const response = await fetch(`/api/tools/${toolId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: host || '127.0.0.1', port: '80', subnet: '192.168.1.0/24' }) });
        const data = await response.json();
        results.push({ tool: toolId, name: toolName(toolId), ok: data.ok, output: data.output });
      } catch (error) { results.push({ tool: toolId, name: toolName(toolId), ok: false, output: `执行失败：${error.message}` }); }
    }
    const allOk = results.every((r) => r.ok);
    const combinedOutput = results.map((r) => `=== ${r.name}：${r.ok ? '正常' : '发现异常'} ===\n${r.output}`).join('\n\n');
    state.wizardResults[step.id] = { ok: allOk, output: combinedOutput, tools: results };
    for (const r of results) {
      state.toolHistory.unshift({ time: new Date().toLocaleString('zh-CN', { hour12: false }), name: `向导：${r.name}`, ok: r.ok, status: classifyToolResult(r.ok, r.output), output: r.output });
    }
    state.toolHistory = state.toolHistory.slice(0, 30); saveToolHistory();
    status.textContent = allOk ? '正常' : '发现异常';
    output.textContent = combinedOutput;
    render();
    if (!allOk) break;
  }
}
async function runDeviceScan() {
  const subnet = document.querySelector('#tool-subnet')?.value.trim() || '192.168.1.0/24';
  const output = document.querySelector('#tool-output');
  const status = document.querySelector('#tool-state');
  if (output && status) { status.textContent = '正在扫描网段并识别设备…'; output.textContent = '正在扫描，请稍候（约 15-30 秒）…'; render(); }
  try {
    const response = await fetch('/api/tools/device-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subnet }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.output || '扫描失败');
    state.deviceScanResults = data.devices || [];
    if (output && status) { status.textContent = `发现 ${data.devices.length} 台设备`; output.textContent = data.devices.map((d) => `${d.type} | ${d.ip}${d.known ? ' | ' + d.known.site + ' · ' + d.known.name : ''}`).join('\n'); }
    render();
  } catch (error) { if (output && status) { status.textContent = '扫描失败'; output.textContent = `设备扫描失败：${error.message}`; } render(); }
}
function takeSnapshot() {
  if (!state.toolHistory.length) return toast('先执行至少一项诊断工具');
  const label = state.toolSnapshots.length === 0 ? '修复前' : '修复后';
  const items = state.toolHistory.slice(0, 15).map((item) => ({ name: item.name, ok: item.ok, output: item.output }));
  state.toolSnapshots.push({ label, time: new Date().toLocaleString('zh-CN', { hour12: false }), items });
  if (state.toolSnapshots.length > 2) state.toolSnapshots = state.toolSnapshots.slice(-2);
  saveToolSnapshots();
  render();
  toast(`已拍摄"${label}"快照（${items.length} 项）`);
}
async function runTool(tool) {
  const host = document.querySelector('#tool-host')?.value.trim();
  const port = document.querySelector('#tool-port')?.value.trim();
  const subnet = document.querySelector('#tool-subnet')?.value.trim();
  const printerName = tool === 'print-test' ? window.prompt('填写要打印测试页的打印机名称：') : '';
  const serviceName = tool === 'service-status' ? window.prompt('填写 Windows 服务名（例如 Spooler、WinRM、Dhcp）：', 'Spooler') : '';
  if (tool === 'print-test' && !printerName?.trim()) return;
  if (tool === 'service-status' && !serviceName?.trim()) return;
  const output = document.querySelector('#tool-output');
  const status = document.querySelector('#tool-state');
  if (!output || !status) return;
  status.textContent = '正在执行'; output.textContent = '正在执行本机诊断，请稍候…';
  try {
    const response = await fetch(`/api/tools/${tool}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host, port, subnet, printerName, serviceName }) });
    const data = await response.json(); const resultStatus = classifyToolResult(data.ok, data.output); status.textContent = resultStatus; output.textContent = data.output;
    state.toolHistory.unshift({ time: new Date().toLocaleString('zh-CN', { hour12: false }), name: toolName(tool), ok: data.ok, status: resultStatus, output: data.output }); state.toolHistory = state.toolHistory.slice(0, 30); saveToolHistory(); syncHistory();
  } catch (error) { status.textContent = '连接失败'; output.textContent = `工具服务不可用：${error.message}`; }
}
function runAiSuggestedTool(button) {
  const tool = button.dataset.toolId;
  if (!aiToolAllowlist.has(tool)) return toast('该工具不在 AI 只读执行白名单中');
  const host = button.dataset.toolHost || '';
  state.page = 'toolbox'; render();
  const hostInput = document.querySelector('#tool-host');
  if (host && hostInput) hostInput.value = host;
  runTool(tool);
}
function draftWorklogFromAi(messageIndex) {
  if (!can('data_write')) return toast('当前账号没有写入现场处置单的权限');
  const advice = state.chatMessages[messageIndex];
  if (!advice || advice.role !== 'assistant') return toast('未找到可写入的 AI 分析');
  const issue = [...state.chatMessages.slice(0, messageIndex)].reverse().find((item) => item.role === 'user')?.content || '现场故障待补充';
  const evidence = state.toolHistory.slice(0, 12).map((item, index) => `${index + 1}. ${item.name}（${historyStatus(item)}）\n${String(item.output || '').slice(0, 900)}`).join('\n\n');
  const ticketLink = advice.ticketId ? `\n[关联工单 ${advice.ticketId}]\n` : '\n';
  const draft = {
    site: '',
    title: issue.slice(0, 160),
    result: `【AI 排障结论，需现场复核】\n${aiOpsBriefText(advice.opsBrief) || String(advice.content || '').slice(0, 1800)}`,
    notes: `[AI 生成草稿]${ticketLink}请补充门店、实际修复动作、验证结果和后续事项后再保存。\n\n【现场工具证据】\n${evidence || '本次尚未执行现场工具。'}`.slice(0, 3800),
  };
  localStorage.setItem('opshub-ai-worklog-draft', JSON.stringify(draft));
  state.page = 'worklog'; render();
}
function guessSiteFromIssue(issue) {
  const match = String(issue || '').match(/([\u4e00-\u9fffA-Za-z0-9_-]{2,30}(?:门店|店|机房|办公室|仓库))/);
  return match?.[1] || '待分派';
}
function guessPriorityFromIssue(issue) {
  const text = String(issue || '');
  if (/全店|全网|无法营业|全部离线|核心|中断|瘫痪/.test(text)) return '紧急';
  if (/离线|无法|故障|异常|不通|无画面|无法打印/.test(text)) return '警告';
  return '普通';
}
async function createTicketFromAi(messageIndex) {
  if (!can('data_write')) return toast('当前账号没有创建工单的权限');
  const advice = state.chatMessages[messageIndex];
  if (!advice || advice.role !== 'assistant') return toast('未找到可生成工单的 AI 分析');
  const issue = [...state.chatMessages.slice(0, messageIndex)].reverse().find((item) => item.role === 'user')?.content || '现场故障待补充';
  const site = window.prompt('确认门店或位置：', guessSiteFromIssue(issue));
  if (!site?.trim()) return;
  const priority = window.prompt('确认优先级（普通 / 警告 / 紧急）：', guessPriorityFromIssue(issue));
  if (!priority?.trim()) return;
  try {
    const ticket = await apiJson('/api/tickets', { method: 'POST', body: JSON.stringify({ title: issue.slice(0, 160), site: site.trim(), priority: priority.trim() }) });
    advice.ticketId = ticket.id; saveChatHistory(); savedTickets.unshift(ticket); render(); toast(`工单已创建：${ticket.id}`);
  } catch (error) { toast(`工单创建失败：${error.message}`); }
}
function applyPendingAiWorklogDraft() {
  if (state.page !== 'worklog') return;
  try {
    const draft = JSON.parse(localStorage.getItem('opshub-ai-worklog-draft') || 'null');
    if (!draft) return;
    const fields = [['#worklog-site', draft.site], ['#worklog-title', draft.title], ['#worklog-result', draft.result], ['#worklog-notes', draft.notes]];
    fields.forEach(([selector, value]) => { const field = document.querySelector(selector); if (field) field.value = value || ''; });
    localStorage.removeItem('opshub-ai-worklog-draft');
    document.querySelector('#worklog-result')?.focus();
  } catch { localStorage.removeItem('opshub-ai-worklog-draft'); }
}

function toolName(tool) { return ({ 'network-snapshot': '一键网络快照', 'gateway-health': '默认网关连通性', 'adapter-health': '网卡/网线链路状态', 'internet-health': '外网连通检查', ping: 'Ping 连通性', dns: 'DNS 查询', port: '端口测试', trace: '路由追踪', rdp: '打开远程桌面', 'open-web': '打开设备网页', 'web-probe': '设备 Web 探测', certificate: 'HTTPS 证书检查', printer: '网络打印机诊断', cctv: 'NVR/监控端口检查', 'network-info': '本机网络信息', 'wifi-info': 'Wi-Fi 状态', 'route-info': 'IPv4 路由表', 'flush-dns': '刷新 DNS 缓存', 'renew-dhcp': 'DHCP 续租', 'repair-network': '修复基础网络', 'repair-printer': '修复本机打印服务', 'repair-printer-queue': '清理卡死打印队列', scan: '网段在线扫描', arp: 'ARP / MAC 查询', 'system-info': '系统与内存信息', 'resource-hotspots': 'CPU/内存占用进程', 'identity-info': '登录/域信息', 'network-drives': '共享盘/网络驱动器', 'firewall-status': '防火墙/监听端口', 'disk-health': '磁盘与硬盘健康', 'printer-service': '打印服务与队列', 'service-status': '检查指定 Windows 服务', 'print-test': '打印 Windows 测试页', 'spooler-start': '启动打印服务', 'system-errors': '最近系统错误', 'application-errors': '应用崩溃日志', 'driver-problems': '设备/驱动异常', 'software-inventory': '已安装软件清单', 'onsite-baseline': '现场基础体检', 'workstation-health': '电脑健康检查', 'printer-health': '目标打印机巡检', 'cctv-health': '目标监控巡检' })[tool] || tool; }
function loadToolHistory() { try { const history = JSON.parse(localStorage.getItem('opshub-tool-history') || '[]'); return Array.isArray(history) ? history.slice(0, 30) : []; } catch { return []; } }
function saveToolHistory() { localStorage.setItem('opshub-tool-history', JSON.stringify(state.toolHistory)); }
function loadChatHistory() { try { const messages = JSON.parse(localStorage.getItem('opshub-ai-chat') || '[]'); return Array.isArray(messages) ? messages.slice(-40) : []; } catch { return []; } }
function saveChatHistory() { localStorage.setItem('opshub-ai-chat', JSON.stringify(state.chatMessages.slice(-40))); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }
function classifyToolResult(ok, output) {
  const text = String(output || '').toLowerCase();
  if (!ok || /发现异常|不可达|连接失败|failed|error|超时|拒绝|offline|不可用|无链路|未找到|崩溃|蓝屏|disabled|stopped/.test(text)) return '异常';
  if (/警告|未知|需人工|需要现场|未验证|未确认|未检测到|无数据|pending/.test(text)) return '需人工确认';
  return '正常';
}
function historyStatus(item) { return item.status || classifyToolResult(item.ok, item.output); }
function historyMarkup() { return state.toolHistory.length ? state.toolHistory.map((item) => { const result = historyStatus(item); const cls = result === '正常' ? 'history-ok' : result === '异常' ? 'history-fail' : 'history-warn'; return `<div class="history-item"><span>${item.time}</span><strong>${item.name}</strong><em class="${cls}">${result}</em></div>`; }).join('') : '<div class="incident-meta">暂时没有工具执行记录。</div>'; }
function syncHistory() { const list = document.querySelector('#history-list'); const count = document.querySelector('#history-count'); if (list) list.innerHTML = historyMarkup(); if (count) count.textContent = `${state.toolHistory.length} 项`; }
function copyToolResult() { const content = document.querySelector('#tool-output')?.textContent; if (!content) return toast('暂无结果可复制'); navigator.clipboard?.writeText(content).then(() => toast('检测结果已复制')).catch(() => toast('复制失败，请手动选择结果')); }
function exportToolReport() {
  if (!state.toolHistory.length) return toast('先执行至少一项工具，再导出报告');
  const lines = ['IT 运维百宝箱 - 现场排障报告', `导出时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`, '', ...state.toolHistory.flatMap((item, index) => [`${index + 1}. ${item.name}`, `时间：${item.time}`, `判断：${historyStatus(item)}`, item.output, ''])];
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `现场排障报告-${new Date().toISOString().slice(0, 10)}.txt`; link.click(); URL.revokeObjectURL(url); toast('现场排障报告已导出');
}
function exportHtmlReport() {
  if (!state.toolHistory.length) return toast('先执行至少一项工具，再导出报告');
  const now = new Date().toLocaleString('zh-CN', { hour12: false }); const sections = state.toolHistory.map((item, index) => { const result = historyStatus(item); const cls = result === '正常' ? 'ok' : result === '异常' ? 'fail' : 'warn'; return `<section><h2>${index + 1}. ${escapeHtml(item.name)} <span class="${cls}">${result}</span></h2><p>执行时间：${escapeHtml(item.time)}</p><pre>${escapeHtml(item.output)}</pre></section>`; }).join('');
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>现场排障报告</title><style>body{max-width:960px;margin:36px auto;padding:0 24px;color:#1f2937;font:14px/1.7 Arial,"Microsoft YaHei",sans-serif}h1{color:#0d766c}section{border:1px solid #dbe4ea;border-radius:8px;margin:16px 0;padding:16px}h2{font-size:16px;margin:0 0 8px}.ok,.fail,.warn{font-size:12px;padding:3px 7px;border-radius:10px}.ok{background:#dcfce7;color:#14784f}.fail{background:#fee2e2;color:#b91c1c}.warn{background:#fff3d5;color:#9b6b0c}p{color:#64748b;margin:0 0 10px}pre{white-space:pre-wrap;background:#f8fafc;border-radius:6px;padding:12px;overflow:auto;font:12px/1.6 Consolas,"Microsoft YaHei",sans-serif}</style><body><h1>IT 运维百宝箱 · 现场排障报告</h1><p>导出时间：${escapeHtml(now)} · 工具记录：${state.toolHistory.length} 项</p>${sections}</body></html>`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `现场排障报告-${new Date().toISOString().slice(0, 10)}.html`; link.click(); URL.revokeObjectURL(url); toast('HTML 现场报告已导出');
}
function openSop(key) {
  const content = {
    printer: ['打印机/小票机无法打印', '1. 记录打印机型号、IP 和报错。\n2. 检查电源、纸张、卡纸、网线或 USB 线。\n3. 用现场工具 Ping 打印机，再执行网络打印机诊断。\n4. 检查 Print Spooler、默认打印机、队列与驱动。\n5. 测试页恢复后，导出报告并关闭工单。'],
    cctv: ['摄像头/NVR 无画面', '1. 确认是单个通道还是全店监控异常。\n2. Ping NVR 和目标摄像头，执行监控端口检查。\n3. 查询 ARP/MAC，排除 IP 被占用。\n4. 现场检查摄像头电源、PoE 端口、网线、交换机链路灯。\n5. 检查 NVR 通道配置、硬盘和录像状态。'],
    network: ['门店网络不通', '1. 先问清范围：一台、一个区域、全店或仅外网。\n2. 查看本机 IP、网关、DNS，Ping 网关。\n3. 扫描门店 /24 网段，核对关键设备是否在线。\n4. 用 ARP/MAC 检查冲突，用 DNS 和路由追踪判断出口问题。\n5. 记录端口号、指示灯和最近网络变更。'],
    pc: ['电脑卡顿/蓝屏/软件异常', '1. 保留截图、蓝屏 Stop Code、时间和操作步骤。\n2. 跑电脑健康检查，重点看内存、磁盘和打印服务。\n3. 查看最近系统错误，关联驱动、更新和应用日志。\n4. 先备份业务数据，再决定修复、驱动回滚或重装。'],
  }[key];
  state.modal = `${content[0]}\n\n${content[1]}`; render();
}

async function apiJson(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    state.auth = { ...state.auth, checked: true, authenticated: false, bootstrapRequired: Boolean(data.bootstrapRequired), user: null, permissions: [] };
    render();
  }
  if (!response.ok) throw new Error(data.output || `HTTP ${response.status}`);
  return data;
}
async function hydrateAuth() {
  try {
    state.auth = { checked: true, ...(await apiJson('/api/auth/me', { method: 'GET', headers: {} })) };
    if (state.auth.authenticated && can('user_manage')) await loadUsers(false);
  } catch (error) {
    state.auth = { checked: true, authenticated: false, bootstrapRequired: false, user: null, permissions: [], roles: {} };
  }
  render();
  if (state.auth.authenticated) hydrateData();
}
async function login() {
  const username = document.querySelector('#auth-username')?.value.trim();
  const password = document.querySelector('#auth-password')?.value;
  if (!username || !password) return toast('请填写账号和密码');
  try { state.auth = { checked: true, ...(await apiJson('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })) }; render(); await hydrateData(); if (can('user_manage')) await loadUsers(false); toast('已登录'); } catch (error) { toast(`登录失败：${error.message}`); }
}
async function bootstrapAdmin() {
  const username = document.querySelector('#auth-username')?.value.trim() || 'admin';
  const displayName = document.querySelector('#auth-display')?.value.trim() || '系统管理员';
  const password = document.querySelector('#auth-password')?.value;
  if (!password) return toast('请填写管理员密码');
  try { state.auth = { checked: true, ...(await apiJson('/api/auth/bootstrap', { method: 'POST', body: JSON.stringify({ username, displayName, password }) })) }; render(); await hydrateData(); await loadUsers(false); toast('管理员已创建'); } catch (error) { toast(`初始化失败：${error.message}`); }
}
async function logout() {
  try { await apiJson('/api/auth/logout', { method: 'POST', body: '{}' }); } catch { /* ignore */ }
  state.auth = { checked: true, authenticated: false, bootstrapRequired: false, user: null, permissions: [], roles: state.auth.roles || {} };
  state.page = 'dashboard'; render();
}
async function loadUsers(showToast = true) {
  if (!can('user_manage')) return;
  try { state.users = await apiJson('/api/auth/users', { method: 'GET', headers: {} }); render(); if (showToast) toast('账号列表已刷新'); } catch (error) { if (showToast) toast(`读取账号失败：${error.message}`); }
}
async function createUser() {
  const username = document.querySelector('#new-user-username')?.value.trim();
  const displayName = document.querySelector('#new-user-display')?.value.trim();
  const role = document.querySelector('#new-user-role')?.value;
  const password = document.querySelector('#new-user-password')?.value;
  if (!username || !password) return toast('请填写账号和初始密码');
  try { await apiJson('/api/auth/users', { method: 'POST', body: JSON.stringify({ username, displayName, role, password }) }); await loadUsers(false); toast('账号已创建'); } catch (error) { toast(`创建失败：${error.message}`); }
}
async function updateUserRole(userId, role) {
  try { await apiJson(`/api/auth/users/${encodeURIComponent(userId)}`, { method: 'PATCH', body: JSON.stringify({ role }) }); await loadUsers(false); toast('角色已更新'); } catch (error) { toast(`更新失败：${error.message}`); await loadUsers(false); }
}
async function resetUserPassword(userId) {
  const password = window.prompt('输入新密码（至少 8 位）：');
  if (!password) return;
  try { await apiJson(`/api/auth/users/${encodeURIComponent(userId)}`, { method: 'PATCH', body: JSON.stringify({ password }) }); toast('密码已更新'); } catch (error) { toast(`改密失败：${error.message}`); }
}
async function toggleUser(userId, disabled) {
  try { await apiJson(`/api/auth/users/${encodeURIComponent(userId)}`, { method: 'PATCH', body: JSON.stringify({ disabled }) }); await loadUsers(false); toast(disabled ? '账号已停用' : '账号已启用'); } catch (error) { toast(`状态更新失败：${error.message}`); }
}

async function hydrateData() {
  if (!state.auth.authenticated) return;
  try { const [assetData, ticketData, providerData, worklogData, toolData] = await Promise.all([apiJson('/api/assets', { method: 'GET', headers: {} }), apiJson('/api/tickets', { method: 'GET', headers: {} }), apiJson('/api/ai/providers', { method: 'GET', headers: {} }), apiJson('/api/worklogs', { method: 'GET', headers: {} }), apiJson('/api/tools/external', { method: 'GET', headers: {} })]); savedAssets.splice(0, savedAssets.length, ...assetData); savedTickets.splice(0, savedTickets.length, ...ticketData); savedWorklogs.splice(0, savedWorklogs.length, ...worklogData); state.aiProviders = providerData; state.externalTools = toolData; if (state.page === 'assets' || state.page === 'tickets' || state.page === 'ai' || state.page === 'worklog' || state.page === 'toolbox') render(); } catch { /* local UI remains usable when the data service is unavailable */ }
}
async function saveWorklog() {
  const site = document.querySelector('#worklog-site')?.value.trim(); const contact = document.querySelector('#worklog-contact')?.value.trim(); const title = document.querySelector('#worklog-title')?.value.trim(); const result = document.querySelector('#worklog-result')?.value.trim(); const notes = document.querySelector('#worklog-notes')?.value.trim();
  const assetId = document.querySelector('#worklog-asset-id')?.value || ''; const ticketId = document.querySelector('#worklog-ticket-id')?.value || ''; const incidentId = document.querySelector('#worklog-incident-id')?.value || '';
  let evidenceIds = []; try { evidenceIds = JSON.parse(document.querySelector('#worklog-evidence')?.dataset.evidenceIds || '[]'); } catch { evidenceIds = []; }
  if (!site || !title || !result) return toast('请填写门店/位置、故障标题和处理结果');
  try { const response = await fetch('/api/worklogs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ site, contact, title, result, notes, assetId, ticketId, incidentId, evidenceIds, toolCount: state.toolHistory.length }) }); const worklog = await response.json(); if (!response.ok) throw new Error(worklog.output); savedWorklogs.unshift(worklog); render(); toast(`现场处置单已保存：${worklog.id}`); } catch (error) { toast(`处置单保存失败：${error.message}`); }
}
async function launchExternalTool(id) {
  const tool = state.externalTools.find((item) => item.id === id); if (!tool?.path) return toast('工具未安装或路径不可用');
  try { const response = await fetch('/api/tools/external/launch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); const data = await response.json(); if (!response.ok) throw new Error(data.output); toast(data.output); } catch (error) { toast(`启动失败：${error.message}`); }
}
async function runAiAnalysis() {
  const issue = document.querySelector('#ai-input')?.value.trim();
  const provider = document.querySelector('#ai-provider')?.value;
  if (!issue) return toast('先填写故障现象或粘贴检测证据');
  const isAgentMode = state.agentMode && provider !== '本地运维规则助手';
  const evidence = [`现场工具记录：\n${state.toolHistory.map((item) => `${item.name}\n${item.output}`).join('\n\n')}`, `最近对话：\n${state.chatMessages.slice(-10, -1).map((item) => `${item.role === 'user' ? '用户' : '助手'}：${item.content}`).join('\n')}`].join('\n\n');
  state.chatMessages.push({ role: 'user', content: issue });
  const loadingMsg = isAgentMode ? 'Agent 正在执行诊断，请稍候…' : '正在分析现场信息…';
  state.chatMessages.push({ role: 'assistant', content: loadingMsg }); saveChatHistory(); render();
  const endpoint = isAgentMode ? '/api/ai/agent' : '/api/ai/analyze';
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ issue, evidence, provider }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.output || `HTTP ${response.status}`);
    if (isAgentMode && data.mode === 'agent') {
      const finalContent = data.finalOutput || 'Agent 诊断完成，详见执行记录。';
      const route = data.fallbackFrom ? `Agent 模式 · ${data.provider}（从 ${data.fallbackFrom} 切换）` : `Agent 模式 · ${data.provider} · ${data.turns || '?'} 轮`;
      state.chatMessages[state.chatMessages.length - 1] = { role: 'assistant', content: `${route}\n\n${finalContent}`, agentTrace: data.toolTrace, opsBrief: data.opsBrief };
      if (data.toolTrace) {
        for (const step of data.toolTrace) {
          if (step.type === 'tool-end' && step.ok !== undefined) {
            state.toolHistory.unshift({ time: new Date().toLocaleString('zh-CN', { hour12: false }), name: `AI Agent：${step.displayName || step.tool}`, ok: step.ok, status: step.ok ? '正常' : '异常', output: step.output || '' });
          }
        }
        state.toolHistory = state.toolHistory.slice(0, 30); saveToolHistory();
      }
    } else {
      const route = data.fallbackFrom ? `使用：${data.provider}（已从 ${data.fallbackFrom} 自动切换）` : `使用：${data.provider}`;
      const actionResult = data.action ? classifyToolResult(data.action.ok, data.action.output) : '';
      const actionNotice = data.action ? `\n已自动执行：${data.action.name}（${actionResult}）` : '';
      if (data.action) { state.toolHistory.unshift({ time: new Date().toLocaleString('zh-CN', { hour12: false }), name: `AI 自动执行：${data.action.name}`, ok: data.action.ok, status: actionResult, output: data.action.output }); state.toolHistory = state.toolHistory.slice(0, 30); saveToolHistory(); }
      state.chatMessages[state.chatMessages.length - 1] = { role: 'assistant', content: `${route}${actionNotice}\n\n${data.output}`, suggestedTools: data.suggestedTools, opsBrief: data.opsBrief };
    }
    saveChatHistory(); render();
  } catch (error) {
    if (isAgentMode) {
      state.chatMessages[state.chatMessages.length - 1] = { role: 'assistant', content: `Agent 诊断失败：${error.message}\n\n请切换到经典模式重试，或使用本地运维规则助手。` };
    } else {
      state.chatMessages[state.chatMessages.length - 1] = { role: 'assistant', content: `AI 分析失败：${error.message}` };
    }
    saveChatHistory(); render();
  }
}
async function createTicket() {
  const title = window.prompt('填写工单标题：', state.modal || '现场设备故障'); if (!title?.trim()) return;
  const site = window.prompt('填写门店或位置：', '待分派') || '待分派'; const priority = window.prompt('优先级（普通 / 警告 / 紧急）：', '普通') || '普通';
  try { const response = await fetch('/api/tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, site, priority }) }); const ticket = await response.json(); if (!response.ok) throw new Error(ticket.output); savedTickets.unshift(ticket); state.modal = null; render(); toast(`工单已保存：${ticket.id}`); } catch (error) { toast(`工单保存失败：${error.message}`); }
}
async function registerAsset() {
  const name = window.prompt('资产名称，例如：万达店 3 号摄像头'); if (!name?.trim()) return;
  const type = window.prompt('资产类型，例如：摄像头 / 打印机 / POS / 交换机'); if (!type?.trim()) return;
  const site = window.prompt('位置或门店：'); if (!site?.trim()) return;
  const ip = window.prompt('IP 地址（可留空）：', '') || '-';
  const model = window.prompt('厂商 / 型号（可留空）：', '') || ''; const serialNumber = window.prompt('序列号 SN（可留空）：', '') || ''; const macAddress = window.prompt('MAC 地址（可留空）：', '') || '';
  try { const response = await fetch('/api/assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, type, site, ip, model, serialNumber, macAddress }) }); const asset = await response.json(); if (!response.ok) throw new Error(asset.output); savedAssets.unshift({ ...asset, status: '已登记' }); render(); toast(`资产已登记：${asset.id}`); } catch (error) { toast(`资产登记失败：${error.message}`); }
}

render();
hydrateAuth();




