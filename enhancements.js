function installInternetHealthButton() {
  if (document.querySelector('[data-tool="internet-health"]')) return;
  const pingButton = document.querySelector('[data-tool="ping"]');
  if (!pingButton) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost';
  button.dataset.tool = 'internet-health';
  button.textContent = '外网连通检查';
  pingButton.before(button);
}

function installGatewayHealthButton() {
  if (document.querySelector('[data-tool="gateway-health"]')) return;
  const snapshotButton = document.querySelector('[data-tool="network-snapshot"]');
  if (!snapshotButton) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost';
  button.dataset.tool = 'gateway-health';
  button.textContent = '默认网关连通性';
  snapshotButton.after(button);
}

function installAdapterHealthButton() {
  if (document.querySelector('[data-tool="adapter-health"]')) return;
  const gatewayButton = document.querySelector('[data-tool="gateway-health"]');
  if (!gatewayButton) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost';
  button.dataset.tool = 'adapter-health';
  button.textContent = '网卡/网线链路状态';
  gatewayButton.after(button);
}

function installDriverCheckButton() {
  if (document.querySelector('[data-tool="driver-problems"]')) return;
  const systemErrorButton = document.querySelector('[data-tool="system-errors"]');
  if (!systemErrorButton) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost';
  button.dataset.tool = 'driver-problems';
  button.textContent = '设备/驱动异常';
  systemErrorButton.before(button);
}

function installSoftwareInventoryButton() {
  if (document.querySelector('[data-tool="software-inventory"]')) return;
  const driverButton = document.querySelector('[data-tool="driver-problems"]');
  if (!driverButton) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost';
  button.dataset.tool = 'software-inventory';
  button.textContent = '已安装软件清单';
  driverButton.before(button);
}

function installIdentityInfoButton() {
  if (document.querySelector('[data-tool="identity-info"]')) return;
  const systemInfoButton = document.querySelector('[data-tool="system-info"]');
  if (!systemInfoButton) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost';
  button.dataset.tool = 'identity-info';
  button.textContent = '当前登录/域信息';
  systemInfoButton.after(button);
}

function installNetworkDrivesButton() {
  if (document.querySelector('[data-tool="network-drives"]')) return;
  const identityButton = document.querySelector('[data-tool="identity-info"]');
  if (!identityButton) return;
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'ghost'; button.dataset.tool = 'network-drives'; button.textContent = '共享盘/网络驱动器';
  identityButton.after(button);
}

function installFirewallStatusButton() {
  if (document.querySelector('[data-tool="firewall-status"]')) return;
  const identityButton = document.querySelector('[data-tool="identity-info"]');
  if (!identityButton) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost';
  button.dataset.tool = 'firewall-status';
  button.textContent = '防火墙/监听端口';
  identityButton.after(button);
}

function installApplicationLogButton() {
  if (document.querySelector('[data-tool="application-errors"]')) return;
  const systemErrorButton = document.querySelector('[data-tool="system-errors"]');
  if (!systemErrorButton) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost';
  button.dataset.tool = 'application-errors';
  button.textContent = '应用崩溃日志';
  systemErrorButton.before(button);
}

function installResourceHotspotsButton() {
  if (document.querySelector('[data-tool="resource-hotspots"]')) return;
  const systemInfoButton = document.querySelector('[data-tool="system-info"]');
  if (!systemInfoButton) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost';
  button.dataset.tool = 'resource-hotspots';
  button.textContent = 'CPU/内存占用进程';
  systemInfoButton.after(button);
}

function installServiceStatusButton() {
  if (document.querySelector('[data-tool="service-status"]')) return;
  const printerServiceButton = document.querySelector('[data-tool="printer-service"]');
  if (!printerServiceButton) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost';
  button.dataset.tool = 'service-status';
  button.textContent = '检查指定 Windows 服务';
  printerServiceButton.after(button);
}

function installPrintTestButton() {
  if (document.querySelector('[data-tool="print-test"]')) return;
  const printerServiceButton = document.querySelector('[data-tool="printer-service"]');
  if (!printerServiceButton) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost';
  button.dataset.tool = 'print-test';
  button.textContent = '打印 Windows 测试页';
  printerServiceButton.after(button);
}

function installOpenWebButton() {
  if (document.querySelector('[data-tool="open-web"]')) return;
  const probeButton = document.querySelector('[data-tool="web-probe"]');
  if (!probeButton) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost';
  button.dataset.tool = 'open-web';
  button.textContent = '打开设备网页';
  probeButton.before(button);
}

function installCreateTicketFromResultButton() {
  if (document.querySelector('[data-action="create-ticket-from-result"]')) return;
  const reportButton = document.querySelector('.result-actions [data-action="export-html-report"]');
  if (!reportButton) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost';
  button.dataset.action = 'create-ticket-from-result';
  button.textContent = '由结果创建工单';
  reportButton.before(button);
}

function installStartNewFieldSessionButton() {
  if (document.querySelector('[data-action="start-new-field-session"]')) return;
  const historyHeading = [...document.querySelectorAll('.card-head h2')].find((node) => node.textContent.includes('本次现场操作记录'));
  if (!historyHeading) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost';
  button.dataset.action = 'start-new-field-session';
  button.textContent = '开始新现场记录';
  historyHeading.parentElement.append(button);
}

function fieldContext() {
  try { return JSON.parse(localStorage.getItem('opshub-field-context') || '{}'); }
  catch { return {}; }
}

function installFieldReportContext() {
  if (document.querySelector('#field-report-context')) return;
  const historyHeading = [...document.querySelectorAll('.card-head h2')].find((node) => node.textContent.includes('本次现场操作记录'));
  const historyCard = historyHeading?.closest('.card');
  if (!historyCard) return;
  const context = fieldContext();
  const card = document.createElement('section');
  card.id = 'field-report-context';
  card.className = 'card field-report-context';
  card.innerHTML = `<div class="card-head"><h2>本次现场信息</h2><span class="incident-meta">写入导出的现场报告</span></div><div class="field-report-grid"><label>门店 / 位置<input id="field-report-site" class="tool-input" value="${escapeText(context.site || '')}" placeholder="例如：万达店" /></label><label>联系人 / 工单编号<input id="field-report-reference" class="tool-input" value="${escapeText(context.reference || '')}" placeholder="例如：张工 · INC-20260721-001" /></label></div><div class="tool-actions"><button class="ghost" data-action="save-field-context">保存现场信息</button><button class="primary" data-action="export-context-report">导出带现场信息的 HTML 报告</button></div>`;
  historyCard.before(card);
}

function installAiQuickPrompts() {
  if (document.querySelector('#ai-quick-prompts')) return;
  const chatNote = document.querySelector('.chat-note');
  if (!chatNote) return;
  const prompts = [
    ['打印机', '请一键排查门店打印机无法打印：按网络、ARP/MAC、端口、队列、服务、驱动和物理状态给排查与修复步骤。'],
    ['监控', '请一键排查门店摄像头或 NVR 无画面：按故障范围、Ping、端口、ARP/MAC、PoE、通道和录像状态给排查步骤。'],
    ['网络', '请一键排查门店网络不通：按本机 IP、默认网关、网卡/网线、DNS、外网和交换机链路给排查与回滚步骤。'],
    ['电脑', '请一键排查门店电脑卡顿、蓝屏或软件异常：按数据保全、系统信息、资源占用、日志、磁盘、驱动和恢复验证给处理步骤。'],
  ];
  const wrapper = document.createElement('div');
  wrapper.id = 'ai-quick-prompts';
  wrapper.className = 'ai-quick-prompts';
  wrapper.innerHTML = prompts.map(([label, prompt]) => `<button type="button" class="chip" data-action="fill-ai-prompt" data-ai-prompt="${escapeText(prompt)}">${label}</button>`).join('');
  chatNote.after(wrapper);
}

function installAiLogImport() {
  if (document.querySelector('[data-action="import-ai-log"]')) return;
  const composer = document.querySelector('.chat-composer');
  const sendButton = composer?.querySelector('[data-action="ai-run"]');
  if (!composer || !sendButton) return;
  const fileInput = document.createElement('input');
  fileInput.id = 'ai-log-file';
  fileInput.type = 'file';
  fileInput.accept = '.log,.txt,.json,.csv,text/plain,application/json,text/csv';
  fileInput.hidden = true;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost';
  button.dataset.action = 'import-ai-log';
  button.textContent = '导入日志';
  sendButton.before(button);
  composer.append(fileInput);
}

async function installAuditPanel() {
  if (document.querySelector('#ai-audit-panel')) return;
  const auditHeading = [...document.querySelectorAll('h1')].find((node) => node.textContent.includes('审计日志'));
  const emptyCard = auditHeading?.closest('.content')?.querySelector('.empty');
  if (!auditHeading || !emptyCard) return;
  try {
    const response = await fetch('/api/audits'); const audits = await response.json();
    if (!response.ok || document.querySelector('#ai-audit-panel')) return;
    const panel = document.createElement('section'); panel.id = 'ai-audit-panel'; panel.className = 'card ai-audit-panel';
    panel.innerHTML = `<div class="card-head"><h2>AI 执行审计</h2><span class="incident-meta">仅记录受控只读诊断</span></div>${audits.length ? `<div class="audit-list">${audits.slice(0, 30).map((audit) => `<details class="audit-item"><summary><span>${new Date(audit.createdAt).toLocaleString('zh-CN', { hour12: false })}</span><strong>${escapeText(audit.action)}</strong><em class="${audit.ok ? 'history-ok' : 'history-fail'}">${audit.ok ? '完成' : '异常'}</em></summary><div><b>请求：</b>${escapeText(audit.issue)}<pre>${escapeText(audit.output)}</pre></div></details>`).join('')}</div>` : '<div class="incident-meta">尚未产生 AI 自动诊断记录。让 AI 执行 Ping、网络、打印机或电脑排查后，结果会显示在这里。</div>'}`;
    emptyCard.after(panel);
  } catch { /* audit page remains available when the local service is unavailable */ }
}

async function installKnowledgeBase() {
  if (document.querySelector('#knowledge-base')) return;
  const knowledgeHeading = [...document.querySelectorAll('h1')].find((node) => node.textContent.includes('知识库'));
  const emptyCard = knowledgeHeading?.closest('.content')?.querySelector('.empty');
  if (!knowledgeHeading || !emptyCard) return;
  try {
    const [knowledgeResponse, sourceResponse] = await Promise.all([fetch('/api/knowledge'), fetch('/api/knowledge/sources')]); const [documents, sources] = await Promise.all([knowledgeResponse.json(), sourceResponse.json()]);
    if (!knowledgeResponse.ok || !sourceResponse.ok || document.querySelector('#knowledge-base')) return;
    emptyCard.id = 'knowledge-base'; emptyCard.classList.remove('empty'); emptyCard.classList.add('knowledge-base');
    emptyCard.innerHTML = `<div class="card-head"><div><h2>运维知识库</h2><span class="incident-meta">AI 排障会自动引用相关知识</span></div><div class="tool-actions"><button class="ghost" data-action="import-official-knowledge">导入官方网页</button><button class="primary" data-action="add-knowledge">新增知识</button></div></div><div class="knowledge-sources">${sources.map((source) => `<div class="knowledge-source"><div><strong>${escapeText(source.name)}</strong><span>${escapeText(source.category)}</span></div><button class="ghost" data-action="open-knowledge-source" data-source-url="${escapeText(source.url)}">官网</button></div>`).join('')}</div><div class="knowledge-toolbar"><input id="knowledge-search" class="tool-input" placeholder="搜索打印、监控、网络、电脑或门店经验" /></div><div class="knowledge-list">${documents.map((document) => `<details class="knowledge-item" data-knowledge="${escapeText(`${document.title} ${document.category} ${document.content} ${(document.keywords || []).join(' ')}`).toLowerCase()}"><summary><span class="knowledge-category">${escapeText(document.category)}</span><strong>${escapeText(document.title)}</strong></summary><p>${escapeText(document.content)}</p></details>`).join('')}</div>`;
    emptyCard.querySelectorAll('.knowledge-item').forEach((item, index) => { const entry = documents[index]; if (!entry?.source) return; const source = globalThis.document.createElement('span'); source.className = entry.reviewStatus === '待验证' ? 'knowledge-review-pending' : 'knowledge-source-meta'; source.textContent = `${entry.source} · ${entry.reviewStatus || '已验证'}`; item.querySelector('summary')?.append(source); if (entry.createdAt) { const actions = globalThis.document.createElement('div'); actions.className = 'knowledge-review-actions'; actions.innerHTML = `<button class="ghost" data-action="review-knowledge" data-knowledge-id="${escapeText(entry.id)}" data-review-status="已验证">标记已验证</button><button class="ghost" data-action="review-knowledge" data-knowledge-id="${escapeText(entry.id)}" data-review-status="已淘汰">标记已淘汰</button>`; item.append(actions); } });
  } catch { /* knowledge page remains available when the local service is unavailable */ }
}

async function addKnowledge() {
  const title = window.prompt('知识标题，例如：某型号热敏打印机频繁断线'); if (!title?.trim()) return;
  const category = window.prompt('分类，例如：打印 / 监控 / 网络 / 桌面 / 门店经验', '门店经验'); if (!category?.trim()) return;
  const keywords = window.prompt('关键词，用逗号分隔，例如：打印,热敏,9100', '') || '';
  const content = window.prompt('填写已验证的排查经验、处理步骤、风险和回滚方式：'); if (!content?.trim()) return;
  try {
    const response = await fetch('/api/knowledge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, category, keywords: keywords.split(/[,，]/), content }) });
    const document = await response.json(); if (!response.ok) throw new Error(document.output || '保存失败'); window.location.reload();
  } catch (error) { window.alert(`知识保存失败：${error.message}`); }
}

async function importOfficialKnowledge() {
  const url = window.prompt('粘贴品牌官网的具体手册网页链接。仅支持已列品牌的 HTTPS 官方网页，PDF 手册后续可导入：'); if (!url?.trim()) return;
  const title = window.prompt('文档标题，例如：某型号 NVR 用户手册'); if (!title?.trim()) return;
  const category = window.prompt('分类，例如：监控 / 网络 / 打印 / Windows', '官方手册') || '官方手册';
  const keywords = window.prompt('关键词，用逗号分隔，例如：NVR,录像,硬盘', '') || '';
  try {
    const response = await fetch('/api/knowledge/import-official', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, title, category, keywords: keywords.split(/[,，]/) }) });
    const document = await response.json(); if (!response.ok) throw new Error(document.output || '导入失败'); window.alert(`已导入官方资料：${document.title}`); window.location.reload();
  } catch (error) { window.alert(`官方资料导入失败：${error.message}`); }
}

function openKnowledgeSource(button) {
  const url = button.dataset.sourceUrl;
  if (url) window.open(url, '_blank', 'noopener');
}

function installCommunityKnowledgeButton() {
  if (document.querySelector('[data-action="add-community-knowledge"]')) return;
  const addButton = document.querySelector('[data-action="add-knowledge"]');
  if (!addButton) return;
  const button = document.createElement('button'); button.type = 'button'; button.className = 'ghost'; button.dataset.action = 'add-community-knowledge'; button.textContent = '录入网上经验'; addButton.before(button);
}

function installPdfKnowledgeButton() {
  if (document.querySelector('[data-action="import-pdf-knowledge"]')) return;
  const officialButton = document.querySelector('[data-action="import-official-knowledge"]');
  if (!officialButton) return;
  const button = document.createElement('button'); button.type = 'button'; button.className = 'ghost'; button.dataset.action = 'import-pdf-knowledge'; button.textContent = '导入 PDF 手册'; officialButton.before(button);
}

function installImageOcrKnowledgeButton() {
  if (document.querySelector('[data-action="import-image-ocr-knowledge"]')) return;
  const pdfButton = document.querySelector('[data-action="import-pdf-knowledge"]'); if (!pdfButton) return;
  const button = document.createElement('button'); button.type = 'button'; button.className = 'ghost'; button.dataset.action = 'import-image-ocr-knowledge'; button.textContent = '图片 OCR 导入'; pdfButton.before(button);
}

function importImageOcrKnowledge() {
  const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp'; input.hidden = true; document.body.append(input);
  input.addEventListener('change', () => {
    const file = input.files?.[0]; input.remove(); if (!file) return; if (file.size > 8 * 1024 * 1024) return window.alert('OCR 图片不能超过 8MB。');
    const title = window.prompt('知识标题：', file.name.replace(/\.(png|jpe?g|webp)$/i, '')); if (!title?.trim()) return; const category = window.prompt('分类，例如：设备铭牌 / 报错截图 / 扫描手册', '图片 OCR') || '图片 OCR'; const keywords = window.prompt('关键词，用逗号分隔：', '') || '';
    const reader = new FileReader(); reader.onload = async () => {
      try {
        const data = String(reader.result || '').split(',').at(-1); window.alert('正在本机识别图片。首次加载中文语言包可能需要十几秒，请等待完成。');
        const ocrResponse = await fetch('/api/ocr/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name, mime: file.type, data }) }); const ocr = await ocrResponse.json(); if (!ocrResponse.ok) throw new Error(ocr.output || 'OCR 失败');
        if (!ocr.text || ocr.text.length < 8) throw new Error('没有识别到足够文字，请换用清晰、正向且对比度更高的图片。');
        if (!window.confirm(`OCR 完成，平均置信度 ${Number(ocr.confidence || 0).toFixed(1)}%。\n\n识别预览：\n${ocr.text.slice(0, 600)}\n\n确认以“待验证”状态加入知识库？`)) return;
        const response = await fetch('/api/knowledge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, category, keywords: keywords.split(/[,，]/), content: ocr.text, source: '本地图片 OCR', reviewStatus: '待验证' }) }); const document = await response.json(); if (!response.ok) throw new Error(document.output || '保存失败'); window.alert(`OCR 知识已导入：${document.title}`); window.location.reload();
      } catch (error) { window.alert(`图片 OCR 导入失败：${error.message}`); }
    }; reader.onerror = () => window.alert('读取 OCR 图片失败。'); reader.readAsDataURL(file);
  }, { once: true }); input.click();
}

function importPdfKnowledge() {
  const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/pdf,.pdf'; input.hidden = true; document.body.append(input);
  input.addEventListener('change', () => {
    const file = input.files?.[0]; input.remove(); if (!file) return;
    if (file.size > 10 * 1024 * 1024) return window.alert('PDF 不能超过 10 MB。请先下载对应型号的用户手册或拆分文档。');
    const title = window.prompt('手册标题：', file.name.replace(/\.pdf$/i, '')); if (!title?.trim()) return;
    const category = window.prompt('分类，例如：监控 / 网络 / 打印 / 服务器', 'PDF 手册') || 'PDF 手册';
    const keywords = window.prompt('关键词，用逗号分隔，例如：型号,NVR,录像', '') || '';
    const sourceUrl = window.prompt('官网手册来源链接（可选）：', '') || '';
    const reader = new FileReader();
    reader.onload = async () => {
      const data = String(reader.result || '').split(',').at(-1);
      try {
        const response = await fetch('/api/knowledge/import-pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name, title, category, keywords: keywords.split(/[,，]/), sourceUrl, source: '本地 PDF 手册', reviewStatus: sourceUrl ? '官方来源待验证' : '待验证', data }) });
        const document = await response.json(); if (!response.ok) throw new Error(document.output || '导入失败'); window.alert(`已导入 PDF 手册：${document.title}`); window.location.reload();
      } catch (error) { window.alert(`PDF 手册导入失败：${error.message}`); }
    };
    reader.onerror = () => window.alert('读取 PDF 失败。'); reader.readAsDataURL(file);
  }, { once: true });
  input.click();
}

async function addCommunityKnowledge() {
  const title = window.prompt('经验标题，例如：某型号 NVR 离线恢复经验'); if (!title?.trim()) return;
  const category = window.prompt('分类，例如：监控 / 网络 / 打印 / Windows', '社区经验') || '社区经验';
  const sourceUrl = window.prompt('原始分享链接（仅作溯源，不会自动抓取）：', '') || '';
  const keywords = window.prompt('关键词，用逗号分隔：', '') || '';
  const content = window.prompt('粘贴已筛选的经验摘要、步骤、风险和适用条件：'); if (!content?.trim()) return;
  try {
    const response = await fetch('/api/knowledge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, category, keywords: keywords.split(/[,，]/), content, source: '社区经验', sourceUrl, reviewStatus: '待验证' }) });
    const document = await response.json(); if (!response.ok) throw new Error(document.output || '保存失败'); window.location.reload();
  } catch (error) { window.alert(`社区经验保存失败：${error.message}`); }
}

function filterKnowledge(input) {
  const keyword = input.value.trim().toLowerCase();
  document.querySelectorAll('.knowledge-item').forEach((item) => { item.hidden = Boolean(keyword) && !item.dataset.knowledge.includes(keyword); });
}

function installMonitoringPanel() {
  if (document.querySelector('#asset-monitoring-panel')) return;
  const monitoringHeading = [...document.querySelectorAll('h1')].find((node) => node.textContent.includes('监控告警'));
  const table = monitoringHeading?.closest('.content')?.querySelector('.page-table');
  if (!monitoringHeading || !table) return;
  const panel = document.createElement('section'); panel.id = 'asset-monitoring-panel'; panel.className = 'card asset-monitoring-panel';
  panel.innerHTML = `<div class="card-head"><div><h2>已登记资产巡检</h2><span class="incident-meta">手动巡检仅 Ping 已登记且带 IP 的资产</span></div><div class="tool-actions"><button class="ghost" data-action="sync-monitoring-status" disabled>同步资产状态</button><button class="ghost" data-action="create-monitoring-incidents" disabled>从异常创建事件</button><button class="primary" data-action="run-asset-monitoring">立即巡检</button></div></div><pre id="asset-monitoring-output" class="tool-output compact-output">尚未执行巡检。</pre><div class="monitoring-history"><div class="card-head"><h3>最近巡检记录</h3></div><div id="monitoring-history-list" class="history-list"><span class="incident-meta">正在读取巡检历史…</span></div></div>`;
  table.after(panel);
  loadMonitoringHistory();
}

let latestAssetMonitoring = [];

async function installTopologyView() {
  if (document.querySelector('#topology-live')) return;
  const topologyHeading = [...document.querySelectorAll('h1')].find((node) => node.textContent.includes('网络拓扑'));
  const emptyCard = topologyHeading?.closest('.content')?.querySelector('.empty');
  if (!topologyHeading || !emptyCard) return;
  try {
    const response = await fetch('/api/assets'); const assets = await response.json();
    if (!response.ok || document.querySelector('#topology-live')) return;
    emptyCard.id = 'topology-live'; emptyCard.classList.remove('empty'); emptyCard.classList.add('topology-live');
    if (!assets.length) { emptyCard.innerHTML = '<div class="incident-command-empty">暂无已登记资产。先在“资产管理”录入或导入资产，系统会按门店展示网络资产视图。</div>'; return; }
    const sites = new Map(); assets.forEach((asset) => { const key = asset.site || '未分配位置'; if (!sites.has(key)) sites.set(key, []); sites.get(key).push(asset); });
    emptyCard.innerHTML = `<div class="card-head"><div><h2>门店网络资产视图</h2><span class="incident-meta">依据资产管理中维护的上联设备、端口和 VLAN 生成；未关联设备显示在根节点</span></div></div>${[...sites.entries()].map(([site, items]) => renderTopologySite(site, items)).join('')}`;
  } catch { /* topology page remains available when the local service is unavailable */ }
}

function renderTopologySite(site, items) {
  const byId = new Map(items.map((asset) => [asset.id, asset]));
  const children = new Map();
  items.forEach((asset) => { if (byId.has(asset.upstreamAssetId)) { const list = children.get(asset.upstreamAssetId) || []; list.push(asset); children.set(asset.upstreamAssetId, list); } });
  const roots = items.filter((asset) => !byId.has(asset.upstreamAssetId));
  const node = (asset, depth = 0) => `<div class="topology-node depth-${Math.min(depth, 3)}"><article class="topology-asset ${asset.status === '离线' ? 'offline' : ''}"><h4>${escapeText(asset.name)}</h4><p>${escapeText(asset.type)} · ${escapeText(asset.ip || '-')}</p><p>${escapeText(asset.status || '已登记')}${asset.switchPort ? ` · ${escapeText(asset.switchPort)}` : ''}${asset.vlan ? ` · VLAN ${escapeText(asset.vlan)}` : ''}</p>${asset.ip && asset.ip !== '-' ? `<button class="ghost topology-diagnose" data-action="diagnose-from-topology" data-host="${escapeText(asset.ip)}" data-type="${escapeText(asset.type)}" data-name="${escapeText(asset.name)}">🔍 排查</button>` : ''}</article>${(children.get(asset.id) || []).length ? `<div class="topology-children">${children.get(asset.id).map((child) => node(child, depth + 1)).join('')}</div>` : ''}</div>`;
  return `<section class="topology-site"><div class="topology-site-head"><h3>${escapeText(site)}</h3><span>${items.length} 台资产 · ${items.filter((asset) => asset.upstreamAssetId).length} 条已维护链路</span></div><div class="topology-tree">${roots.map((asset) => node(asset)).join('')}</div></section>`;
}

async function installTopologyDiscoveryPanel() {
  if (document.querySelector('#snmp-neighbor-panel')) return;
  const topologyHeading = [...document.querySelectorAll('h1')].find((node) => node.textContent.includes('网络拓扑'));
  const emptyCard = topologyHeading?.closest('.content')?.querySelector('.empty');
  if (!topologyHeading || !emptyCard) return;
  const panel = document.createElement('section'); panel.id = 'snmp-neighbor-panel'; panel.className = 'card snmp-neighbor-panel';
  panel.innerHTML = `<div class="card-head"><div><h2>SNMP 邻居发现</h2><span id="snmp-status" class="incident-meta">正在检测 Net-SNMP…</span></div></div><div class="snmp-form"><label>交换机 / 路由器 IP<input id="snmp-host" class="tool-input" placeholder="例如 192.168.10.2"></label><label>SNMP v2c 团体字串<input id="snmp-community" class="tool-input" type="password" autocomplete="off" placeholder="仅本次使用，不保存"></label><button class="primary" data-action="run-snmp-neighbors" disabled>读取 LLDP/CDP 邻居</button></div><pre id="snmp-neighbor-output" class="tool-output compact-output">本功能只读读取设备的 LLDP/CDP 邻居表，不会写入设备配置，也不会保存团体字串。</pre>`;
  emptyCard.before(panel); refreshSnmpNeighborStatus();
}

async function refreshSnmpNeighborStatus() {
  const status = document.querySelector('#snmp-status'); const button = document.querySelector('[data-action="run-snmp-neighbors"]');
  if (!status || !button) return;
  try { const response = await fetch('/api/network/snmp/status'); const result = await response.json(); if (!response.ok) throw new Error(result.output); status.textContent = result.output; button.disabled = !result.available; }
  catch (error) { status.textContent = `SNMP 工具不可用：${error.message}`; button.disabled = true; }
}

async function runSnmpNeighborDiscovery(button) {
  const host = document.querySelector('#snmp-host')?.value.trim(); const community = document.querySelector('#snmp-community')?.value || ''; const output = document.querySelector('#snmp-neighbor-output');
  if (!host || !community) return window.alert('请填写设备 IP 和本次使用的 SNMP v2c 团体字串。');
  if (!window.confirm(`将对 ${host} 发起只读 SNMP LLDP/CDP 查询。不会写入设备配置，也不会保存团体字串，确认继续？`)) return;
  button.disabled = true; output.textContent = '正在读取设备 LLDP/CDP 邻居表…';
  try {
    const response = await fetch('/api/network/snmp/neighbors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host, community }) }); const result = await response.json();
    if (!response.ok) throw new Error(result.output || '读取失败'); output.textContent = result.output;
  } catch (error) { output.textContent = `SNMP 邻居读取失败：${error.message}`; }
  finally { document.querySelector('#snmp-community').value = ''; await refreshSnmpNeighborStatus(); }
}

function installGlobalSearch() {
  const input = document.querySelector('.search');
  if (!input || input.dataset.globalSearchBound) return;
  input.dataset.globalSearchBound = 'true';
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); runGlobalSearch(input.value); } });
}

async function installRemoteSupportPanel() {
  if (document.querySelector('#remote-support-live')) return;
  const remoteHeading = [...document.querySelectorAll('h1')].find((node) => node.textContent.includes('远程支持'));
  const emptyCard = remoteHeading?.closest('.content')?.querySelector('.empty');
  if (!remoteHeading || !emptyCard) return;
  try {
    const response = await fetch('/api/tools/external'); const tools = await response.json(); if (!response.ok || document.querySelector('#remote-support-live')) return;
    const remoteTools = tools.filter((tool) => ['rustdesk', 'anydesk'].includes(tool.id));
    emptyCard.id = 'remote-support-live'; emptyCard.classList.remove('empty'); emptyCard.classList.add('remote-support-live');
    emptyCard.innerHTML = `<div class="card-head"><div><h2>远程支持控制台</h2><span class="incident-meta">远程软件仅在本机已安装时可启动</span></div></div><label class="tool-label">目标 IP 或主机名</label><div class="remote-connect-row"><input id="remote-host" class="tool-input" placeholder="例如：192.168.1.20 或 pc-01"/><button class="primary" data-action="open-remote-rdp">打开远程桌面</button></div><div class="remote-tool-list">${remoteTools.map((tool) => `<div class="remote-tool"><div><strong>${escapeText(tool.name)}</strong><span>${tool.path ? '本机已检测到' : '未安装或未加入 PATH'}</span></div><button class="${tool.path ? 'primary' : 'ghost'}" ${tool.path ? `data-action="launch-remote-tool" data-remote-tool="${escapeText(tool.id)}"` : 'disabled'}>${tool.path ? '打开' : '不可用'}</button></div>`).join('')}</div>`;
  } catch { /* remote page remains available when the local service is unavailable */ }
}

async function openRemoteRdp() {
  const host = document.querySelector('#remote-host')?.value.trim(); if (!host) return window.alert('请填写目标 IP 或主机名。');
  try {
    const response = await fetch('/api/tools/rdp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host }) }); const result = await response.json(); if (!response.ok) throw new Error(result.output || '启动失败');
  } catch (error) { window.alert(`远程桌面启动失败：${error.message}`); }
}

async function launchRemoteTool(button) {
  try {
    const response = await fetch('/api/tools/external/launch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: button.dataset.remoteTool }) }); const result = await response.json(); if (!response.ok) throw new Error(result.output || '启动失败');
  } catch (error) { window.alert(`远程工具启动失败：${error.message}`); }
}

function installBackupButton() {
  if (document.querySelector('[data-action="export-backup"]')) return;
  const auditHeading = [...document.querySelectorAll('h1')].find((node) => node.textContent.includes('审计日志'));
  const pageHead = auditHeading?.closest('.page-head');
  if (!pageHead) return;
  const importButton = document.createElement('button'); importButton.type = 'button'; importButton.className = 'ghost'; importButton.dataset.action = 'import-backup'; importButton.textContent = '导入数据备份';
  const button = document.createElement('button'); button.type = 'button'; button.className = 'ghost'; button.dataset.action = 'export-backup'; button.textContent = '导出数据备份'; pageHead.append(importButton, button);
}

async function exportBackup() {
  try {
    const response = await fetch('/api/backup/export'); const backup = await response.json(); if (!response.ok) throw new Error('备份服务不可用');
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `运维百宝箱备份-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
  } catch (error) { window.alert(`数据备份导出失败：${error.message}`); }
}

function importBackup() {
  const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/json,.json'; input.hidden = true; document.body.append(input);
  input.addEventListener('change', () => {
    const file = input.files?.[0]; input.remove(); if (!file) return;
    if (file.size > 70 * 1024 * 1024) return window.alert('便携备份文件不能超过 70MB。');
    const reader = new FileReader(); reader.onload = async () => {
      try {
        const backup = JSON.parse(String(reader.result || '')); if (!['OpsHubBackup/1', 'OpsHubBackup/2'].includes(backup.format)) throw new Error('不是运维百宝箱备份文件。');
        if (!window.confirm('将合并备份数据到本机：只新增缺失记录，不覆盖本机已有记录。确认继续？')) return;
        const response = await fetch('/api/backup/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(backup) }); const result = await response.json(); if (!response.ok) throw new Error(result.output || '导入失败'); window.alert(`${result.output}\n资产 ${result.counts.assets}｜工单 ${result.counts.tickets}｜事件 ${result.counts.incidents}`); window.location.reload();
      } catch (error) { window.alert(`数据备份导入失败：${error.message}`); }
    }; reader.onerror = () => window.alert('读取备份文件失败。'); reader.readAsText(file, 'utf-8');
  }, { once: true });
  input.click();
}

async function runGlobalSearch(query) {
  const value = String(query || '').trim(); if (value.length < 2) return;
  document.querySelector('.global-search-overlay')?.remove();
  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(value)}`); const results = await response.json(); if (!response.ok) throw new Error(results.output || '搜索失败');
    const overlay = document.createElement('div'); overlay.className = 'global-search-overlay';
    overlay.innerHTML = `<section class="global-search-panel"><div class="card-head"><h2>搜索：${escapeText(value)}</h2><button class="ghost" data-action="close-global-search">关闭</button></div>${results.length ? results.map((result) => `<button class="global-search-result" data-action="open-search-result" data-page="${escapeText(result.page)}"><span>${escapeText(result.type)}</span><div><strong>${escapeText(result.title)}</strong><small>${escapeText(result.meta)}</small></div></button>`).join('') : '<div class="incident-command-empty">没有找到匹配结果。</div>'}</section>`;
    document.body.append(overlay);
  } catch (error) { window.alert(`全局搜索失败：${error.message}`); }
}

async function installLiveOverview() {
  const dashboardHeading = [...document.querySelectorAll('h1')].find((node) => node.textContent.includes('今日概览'));
  const metrics = dashboardHeading?.closest('.content')?.querySelector('.metrics');
  if (!metrics || metrics.dataset.liveLoaded) return;
  metrics.dataset.liveLoaded = 'true';
  try {
    const [ticketsResponse, incidentsResponse, assetsResponse, auditsResponse] = await Promise.all([fetch('/api/tickets'), fetch('/api/incidents'), fetch('/api/assets'), fetch('/api/audits')]);
    const [tickets, incidents, assets, audits] = await Promise.all([ticketsResponse.json(), incidentsResponse.json(), assetsResponse.json(), auditsResponse.json()]);
    if (![ticketsResponse, incidentsResponse, assetsResponse, auditsResponse].every((response) => response.ok)) return;
    const openTickets = tickets.filter((ticket) => !['已解决', '已关闭'].includes(ticket.status)).length;
    const activeIncidents = incidents.filter((incident) => !['已解决', '已关闭'].includes(incident.status)).length;
    const offlineAssets = assets.filter((asset) => asset.status === '离线').length;
    const today = new Date().toDateString(); const todayAudits = audits.filter((audit) => new Date(audit.createdAt).toDateString() === today).length;
    const values = [
      ['待处理工单', String(openTickets), openTickets ? '需跟进' : '无待办'],
      ['进行中事件', String(activeIncidents), activeIncidents ? '正在处置' : '运行平稳'],
      ['已登记资产', String(assets.length), offlineAssets ? `${offlineAssets} 台离线` : '暂无离线'],
      ['今日执行记录', String(todayAudits), '含 AI 与受控修复'],
    ];
    [...metrics.querySelectorAll('.metric')].slice(0, 4).forEach((metric, index) => { const [label, value, note] = values[index]; const labelNode = metric.querySelector('.metric-label'); const valueNode = metric.querySelector('.metric-value'); if (labelNode) labelNode.textContent = label; if (valueNode) valueNode.innerHTML = `${escapeText(value)} <span class="metric-status">${escapeText(note)}</span>`; });
  } catch { /* dashboard retains its base layout when the data service is unavailable */ }
}

function installSystemHealthButton() {
  if (document.querySelector('[data-action="system-health-check"]')) return;
  const dashboardHeading = [...document.querySelectorAll('h1')].find((node) => node.textContent.includes('今日概览')); const pageHead = dashboardHeading?.closest('.page-head'); if (!pageHead) return;
  const button = document.createElement('button'); button.type = 'button'; button.className = 'ghost'; button.dataset.action = 'system-health-check'; button.textContent = '系统自检'; pageHead.append(button);
}

async function runSystemHealthCheck(button) {
  button.disabled = true;
  try {
    const response = await fetch('/api/health'); const health = await response.json(); if (!response.ok) throw new Error(health.output || '自检失败'); document.querySelector('.system-health-overlay')?.remove();
    const rows = [
      ['本地服务', health.service.status, health.service.address], ['数据目录', health.data.status, `资产 ${health.data.assets} · 工单 ${health.data.tickets} · 事件 ${health.data.incidents} · 处置单 ${health.data.worklogs}`],
      ['AI 排障', health.ai.status, health.ai.providers.join('、') || '本地规则助手'], ['离线 OCR', health.ocr.status, '中文/英文图片识别'], ['门店 Agent', health.agent.status, '一次性只读采集脚本'], ['SNMP 邻居发现', health.snmp.status, 'LLDP/CDP 只读采集'],
    ];
    const overlay = document.createElement('div'); overlay.className = 'global-search-overlay system-health-overlay'; overlay.innerHTML = `<section class="global-search-panel system-health-panel"><div class="card-head"><div><h2>运维百宝箱系统自检</h2><span class="incident-meta">${new Date(health.checkedAt).toLocaleString('zh-CN', { hour12: false })}</span></div><div class="tool-actions"><button class="ghost" data-action="test-ai-connection" ${health.ai.providers.length ? '' : 'disabled'}>测试 AI 回复</button><button class="ghost" data-action="close-system-health">关闭</button></div></div><div class="system-health-list">${rows.map(([name, status, detail]) => `<div class="system-health-row"><strong>${escapeText(name)}</strong><span class="${/正常|已配置|可用|可下载/.test(status) ? 'health-ready' : 'health-attention'}">${escapeText(status)}</span><small>${escapeText(detail)}</small></div>`).join('')}</div><div class="system-health-tools"><h3>外部工具</h3>${health.externalTools.map((tool) => `<span class="${tool.available ? 'health-ready' : 'health-attention'}">${escapeText(tool.name)}：${tool.available ? '可用' : '未安装'}</span>`).join('')}</div></section>`; document.body.append(overlay);
  } catch (error) { window.alert(`系统自检失败：${error.message}`); }
  finally { button.disabled = false; }
}

async function testAiConnection(button) {
  button.disabled = true;
  try { const response = await fetch('/api/ai/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }); const result = await response.json(); if (!response.ok) throw new Error(result.output || '测试失败'); window.alert(`${result.provider} 已正常回复：\n\n${result.output}`); }
  catch (error) { window.alert(`AI 连通性测试失败：${error.message}`); }
  finally { button.disabled = false; }
}

async function runAssetMonitoring(button) {
  const output = document.querySelector('#asset-monitoring-output'); if (!output) return;
  button.disabled = true; output.textContent = '正在巡检已登记资产…';
  try {
    const response = await fetch('/api/monitoring/check', { method: 'POST' }); const result = await response.json();
    if (!response.ok) throw new Error(result.output || '巡检失败');
    latestAssetMonitoring = result.results || []; const incidentButton = document.querySelector('[data-action="create-monitoring-incidents"]'); const syncButton = document.querySelector('[data-action="sync-monitoring-status"]'); if (incidentButton) incidentButton.disabled = !latestAssetMonitoring.some((item) => !item.online || item.serviceOk === false); if (syncButton) syncButton.disabled = !latestAssetMonitoring.length;
    output.textContent = `巡检时间：${new Date(result.checkedAt).toLocaleString('zh-CN', { hour12: false })}\n正常：${result.healthy} 台｜离线：${result.offline} 台｜服务异常：${result.serviceIssues} 台\n\n${result.output}`;
  } catch (error) { output.textContent = `资产巡检失败：${error.message}`; }
  finally { button.disabled = false; loadMonitoringHistory(); }
}

async function loadMonitoringHistory() {
  const list = document.querySelector('#monitoring-history-list'); if (!list) return;
  try {
    const response = await fetch('/api/audits'); const audits = await response.json(); if (!response.ok) throw new Error('读取失败');
    const monitoring = audits.filter((audit) => audit.type === '手动资产巡检').slice(0, 8);
    list.innerHTML = monitoring.length ? monitoring.map((audit) => `<details class="monitoring-history-item"><summary><span>${new Date(audit.createdAt).toLocaleString('zh-CN', { hour12: false })}</span><strong>${escapeText(audit.action)}</strong><em class="${audit.ok ? 'history-ok' : 'history-fail'}">${audit.ok ? '正常' : '发现异常'}</em></summary><pre>${escapeText(audit.output)}</pre></details>`).join('') : '<span class="incident-meta">暂无巡检记录。</span>';
  } catch { list.innerHTML = '<span class="incident-meta">巡检历史暂不可用。</span>'; }
}

async function createMonitoringIncidents(button) {
  const failures = latestAssetMonitoring.filter((item) => !item.online || item.serviceOk === false);
  if (!failures.length) return window.alert('当前没有可创建事件的异常资产。');
  if (!window.confirm(`将为 ${failures.length} 台异常资产创建或关联事件，确认继续？`)) return;
  button.disabled = true;
  try {
    const response = await fetch('/api/monitoring/incidents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assetIds: failures.map((item) => item.id) }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.output || '创建失败');
    window.alert(`已创建 ${result.created.length} 个事件，复用 ${result.existing.length} 个进行中事件。`);
  } catch (error) { window.alert(`监控事件创建失败：${error.message}`); }
  finally { button.disabled = false; }
}

async function syncMonitoringStatuses(button) {
  if (!latestAssetMonitoring.length) return window.alert('请先完成一次资产巡检。');
  const onlineIds = latestAssetMonitoring.filter((item) => item.online).map((item) => item.id);
  const offlineIds = latestAssetMonitoring.filter((item) => !item.online).map((item) => item.id);
  if (!window.confirm(`将本次巡检结果写入资产台账：在线 ${onlineIds.length} 台，离线 ${offlineIds.length} 台。\n维修中和已报废资产不会被覆盖，确认继续？`)) return;
  button.disabled = true;
  try {
    const response = await fetch('/api/monitoring/sync-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ onlineIds, offlineIds }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.output || '同步失败');
    window.alert(`${result.output}${result.changed.length ? `\n\n${result.changed.join('\n')}` : ''}`); loadMonitoringHistory();
  } catch (error) { window.alert(`资产状态同步失败：${error.message}`); }
  finally { button.disabled = false; }
}

async function reviewKnowledge(button) {
  try {
    const response = await fetch(`/api/knowledge/${encodeURIComponent(button.dataset.knowledgeId)}/review`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewStatus: button.dataset.reviewStatus }) });
    const document = await response.json(); if (!response.ok) throw new Error(document.output || '保存失败'); window.location.reload();
  } catch (error) { window.alert(`知识审核失败：${error.message}`); }
}

async function installIncidentCommandPanel() {
  if (document.querySelector('#incident-command-panel')) return;
  const dashboardHeading = [...document.querySelectorAll('h1')].find((node) => node.textContent.includes('今日概览'));
  const metrics = dashboardHeading?.closest('.content')?.querySelector('.metrics');
  if (!dashboardHeading || !metrics) return;
  try {
    const response = await fetch('/api/incidents'); const incidents = await response.json();
    if (!response.ok || document.querySelector('#incident-command-panel')) return;
    const panel = document.createElement('section'); panel.id = 'incident-command-panel'; panel.className = 'incident-command';
    const active = incidents.filter((item) => !['已解决', '已关闭'].includes(item.status));
    panel.innerHTML = `<div class="card-head"><div><h2>事件指挥台</h2><p class="incident-meta">统一追踪影响、排查与恢复状态</p></div><button class="primary" data-action="create-incident">新建事件</button></div>${active.length ? `<div class="incident-command-grid">${active.slice(0, 6).map((incident) => `<article class="incident-command-card"><div><span class="level ${incident.priority === '紧急' ? 'critical' : incident.priority === '警告' ? 'warning' : ''}">${escapeText(incident.priority)}</span><h3>${escapeText(incident.title)}</h3><p>${escapeText(incident.site)} · ${incident.id}</p>${incident.lastAction ? `<p class="incident-last-action">最近执行：${escapeText(incident.lastAction)}</p>` : ''}${incident.worklogId ? `<p class="incident-last-action">处置单：${escapeText(incident.worklogId)}</p>` : ''}${incident.reportExportedAt ? '<p class="incident-last-action">报告：已导出</p>' : ''}</div><div class="incident-command-actions incident-command-actions-three"><button class="ghost" data-action="investigate-incident" data-incident-id="${escapeText(incident.id)}" data-incident-title="${escapeText(incident.title)}" data-incident-site="${escapeText(incident.site)}">AI 排查</button><button class="ghost" data-action="worklog-incident" data-incident-id="${escapeText(incident.id)}" data-incident-title="${escapeText(incident.title)}" data-incident-site="${escapeText(incident.site)}">生成处置单</button><select class="tool-input incident-status-select" data-incident-id="${escapeText(incident.id)}">${['调查中', '处理中', '待验证', '已解决', '已关闭'].map((status) => `<option value="${status}" ${incident.status === status ? 'selected' : ''}>${status}</option>`).join('')}</select></div></article>`).join('')}</div>` : '<div class="incident-command-empty">当前没有进行中的事件。故障发生时先新建事件，再让 AI 执行排查。</div>'}`;
    metrics.after(panel);
  } catch { /* dashboard remains available when the local service is unavailable */ }
}

async function createIncident() {
  const title = window.prompt('事件标题，例如：3 号摄像头离线 / 收银台无法打印'); if (!title?.trim()) return;
  const site = window.prompt('门店或位置：'); if (!site?.trim()) return;
  const priority = window.prompt('优先级（普通 / 警告 / 紧急）：', '警告') || '警告';
  try {
    const response = await fetch('/api/incidents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, site, priority }) });
    const incident = await response.json(); if (!response.ok) throw new Error(incident.output || '创建失败');
    window.location.reload();
  } catch (error) { window.alert(`事件创建失败：${error.message}`); }
}

async function updateIncidentStatus(select) {
  const incidentId = select.dataset.incidentId; const status = select.value; select.disabled = true;
  try {
    const response = await fetch(`/api/incidents/${encodeURIComponent(incidentId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    const incident = await response.json(); if (!response.ok) throw new Error(incident.output || '保存失败');
  } catch (error) { window.alert(`事件状态更新失败：${error.message}`); }
  finally { select.disabled = false; }
}

function investigateIncident(button) {
  const incident = { id: button.dataset.incidentId, title: button.dataset.incidentTitle, site: button.dataset.incidentSite };
  localStorage.setItem('opshub-incident-investigation', JSON.stringify(incident));
  document.querySelector('[data-page="ai"]')?.click();
}

function startIncidentInvestigation() {
  const raw = localStorage.getItem('opshub-incident-investigation');
  if (!raw || !document.querySelector('#ai-input')) return;
  localStorage.removeItem('opshub-incident-investigation');
  try {
    const incident = JSON.parse(raw); const input = document.querySelector('#ai-input');
    input.value = `[事件 ${incident.id}] 门店/位置：${incident.site}\n一键排查：${incident.title}`;
    document.querySelector('[data-action="ai-run"]')?.click();
  } catch { /* invalid local incident context is discarded */ }
}

function createIncidentWorklog(button) {
  const incident = { id: button.dataset.incidentId, title: button.dataset.incidentTitle, site: button.dataset.incidentSite };
  localStorage.setItem('opshub-incident-worklog', JSON.stringify(incident));
  document.querySelector('[data-page="worklog"]')?.click();
}

function prefillIncidentWorklog() {
  const raw = localStorage.getItem('opshub-incident-worklog');
  const site = document.querySelector('#worklog-site'); const title = document.querySelector('#worklog-title'); const notes = document.querySelector('#worklog-notes');
  if (!raw || !site || !title || !notes) return;
  localStorage.removeItem('opshub-incident-worklog');
  try {
    const incident = JSON.parse(raw); site.value = incident.site; title.value = incident.title; notes.value = `[关联事件 ${incident.id}]\n`; localStorage.setItem('opshub-field-context', JSON.stringify({ site: incident.site, reference: `事件 ${incident.id}` })); document.querySelector('#worklog-result')?.focus();
  } catch { /* invalid local incident context is discarded */ }
}

function installIncidentTicketButtons() {
  document.querySelectorAll('.incident-command-actions').forEach((actions) => {
    if (actions.querySelector('[data-action="create-incident-ticket"]')) return;
    const incidentId = actions.querySelector('.incident-status-select')?.dataset.incidentId;
    if (!incidentId) return;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'ghost'; button.dataset.action = 'create-incident-ticket'; button.dataset.incidentId = incidentId; button.textContent = '生成工单';
    actions.classList.add('incident-command-actions-four'); actions.append(button);
  });
}

function installIncidentTimelineButtons() {
  document.querySelectorAll('.incident-command-actions').forEach((actions) => {
    if (actions.querySelector('[data-action="view-incident-timeline"]')) return;
    const incidentId = actions.querySelector('.incident-status-select')?.dataset.incidentId; if (!incidentId) return;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'ghost'; button.dataset.action = 'view-incident-timeline'; button.dataset.incidentId = incidentId; button.textContent = '查看时间线'; actions.append(button);
  });
}

async function viewIncidentTimeline(button) {
  document.querySelector('.incident-timeline-overlay')?.remove();
  try {
    const response = await fetch(`/api/incidents/${encodeURIComponent(button.dataset.incidentId)}/timeline`); const data = await response.json(); if (!response.ok) throw new Error(data.output || '读取失败');
    const overlay = document.createElement('div'); overlay.className = 'incident-timeline-overlay';
    overlay.innerHTML = `<section class="incident-timeline-panel"><div class="card-head"><div><h2>${escapeText(data.incident.title)}</h2><span class="incident-meta">${escapeText(data.incident.site)} · ${escapeText(data.incident.id)}</span></div><button class="ghost" data-action="close-incident-timeline">关闭</button></div>${data.entries.map((entry) => `<article class="incident-timeline-item"><strong>${escapeText(entry.type)} · ${escapeText(entry.title)}</strong><time>${new Date(entry.time).toLocaleString('zh-CN', { hour12: false })}</time><p>${escapeText(entry.detail)}</p></article>`).join('')}</section>`;
    document.body.append(overlay);
  } catch (error) { window.alert(`事件时间线读取失败：${error.message}`); }
}

async function createIncidentTicket(button) {
  button.disabled = true;
  try {
    const response = await fetch(`/api/incidents/${encodeURIComponent(button.dataset.incidentId)}/ticket`, { method: 'POST' });
    const ticket = await response.json(); if (!response.ok) throw new Error(ticket.output || '创建失败');
    window.alert(ticket.existing ? `该事件已关联工单：${ticket.id}` : `工单已创建：${ticket.id}`); window.location.reload();
  } catch (error) { window.alert(`事件工单创建失败：${error.message}`); button.disabled = false; }
}

const fieldChecklistItems = ['已保存关键检测证据', '已验证业务或设备恢复', '已完成测试页、画面或业务复测', '已记录备件、风险和后续事项', '已导出报告并更新工单'];

function loadFieldChecklist() {
  try { const saved = JSON.parse(localStorage.getItem('opshub-field-checklist') || '[]'); return Array.isArray(saved) ? saved : []; }
  catch { return []; }
}

function installFieldChecklist() {
  if (document.querySelector('#field-checklist')) return;
  const worklogHeading = [...document.querySelectorAll('h1')].find((node) => node.textContent.includes('现场处置单'));
  const grid = worklogHeading?.closest('.content')?.querySelector('.grid.two');
  if (!worklogHeading || !grid) return;
  const checked = loadFieldChecklist();
  const card = document.createElement('section');
  card.id = 'field-checklist';
  card.className = 'card field-checklist';
  card.innerHTML = `<div class="card-head"><h2>现场结案清单</h2><span id="field-checklist-count" class="incident-meta">${checked.filter(Boolean).length} / ${fieldChecklistItems.length}</span></div><div class="field-checklist-items">${fieldChecklistItems.map((item, index) => `<label><input type="checkbox" data-field-check="${index}" ${checked[index] ? 'checked' : ''}/><span>${item}</span></label>`).join('')}</div>`;
  grid.after(card);
}

function saveFieldChecklist() {
  const values = [...document.querySelectorAll('[data-field-check]')].map((input) => input.checked);
  localStorage.setItem('opshub-field-checklist', JSON.stringify(values));
  const count = document.querySelector('#field-checklist-count');
  if (count) count.textContent = `${values.filter(Boolean).length} / ${fieldChecklistItems.length}`;
}

function importAiLog() {
  document.querySelector('#ai-log-file')?.click();
}

function readAiLog(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 1024 * 1024) { window.alert('日志文件不能超过 1 MB，请先截取故障时间附近的内容。'); input.value = ''; return; }
  const reader = new FileReader();
  reader.onload = () => {
    const target = document.querySelector('#ai-input');
    if (!target) return;
    const content = String(reader.result || '').slice(0, 12000);
    target.value = `${target.value.trim()}${target.value.trim() ? '\n\n' : ''}[导入日志：${file.name}]\n${content}`;
    target.focus(); input.value = '';
  };
  reader.onerror = () => { window.alert('读取日志失败，请确认文件是文本格式。'); input.value = ''; };
  reader.readAsText(file);
}

function fillAiPrompt(button) {
  const input = document.querySelector('#ai-input');
  if (!input) return;
  input.value = button.dataset.aiPrompt || '';
  input.focus();
}

function saveFieldContext() {
  const site = document.querySelector('#field-report-site')?.value.trim() || '';
  const reference = document.querySelector('#field-report-reference')?.value.trim() || '';
  localStorage.setItem('opshub-field-context', JSON.stringify({ site, reference }));
  window.alert('现场信息已保存到本机浏览器。');
}

function exportContextReport() {
  const history = JSON.parse(localStorage.getItem('opshub-tool-history') || '[]');
  if (!history.length) return window.alert('请先运行至少一项现场工具，再导出报告。');
  saveFieldContext();
  const context = fieldContext();
  const now = new Date().toLocaleString('zh-CN', { hour12: false });
  const sections = history.map((item, index) => `<section><h2>${index + 1}. ${escapeText(item.name)} <span class="${item.ok ? 'ok' : 'fail'}">${item.ok ? '完成' : '异常'}</span></h2><p>执行时间：${escapeText(item.time)}</p><pre>${escapeText(item.output)}</pre></section>`).join('');
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>现场排障报告</title><style>body{max-width:960px;margin:36px auto;padding:0 24px;color:#1f2937;font:14px/1.7 Arial,"Microsoft YaHei",sans-serif}h1{color:#0d766c}section{border:1px solid #dbe4ea;border-radius:8px;margin:16px 0;padding:16px}h2{font-size:16px;margin:0 0 8px}.meta{background:#eef8f7;padding:14px;border-radius:8px}.ok,.fail{font-size:12px;padding:3px 7px;border-radius:10px}.ok{background:#dcfce7;color:#14784f}.fail{background:#fee2e2;color:#b91c1c}p{color:#64748b;margin:0 0 10px}pre{white-space:pre-wrap;background:#f8fafc;border-radius:6px;padding:12px;overflow:auto;font:12px/1.6 Consolas,"Microsoft YaHei",sans-serif}</style><body><h1>IT 运维百宝箱 · 现场排障报告</h1><div class="meta"><strong>门店 / 位置：</strong>${escapeText(context.site || '未填写')}<br><strong>联系人 / 工单：</strong>${escapeText(context.reference || '未填写')}<br><strong>导出时间：</strong>${escapeText(now)}<br><strong>工具记录：</strong>${history.length} 项</div>${sections}</body></html>`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `现场排障报告-${new Date().toISOString().slice(0, 10)}.html`; link.click(); URL.revokeObjectURL(url);
  const incidentId = String(context.reference || '').match(/EVT-\d+/)?.[0];
  if (incidentId) fetch(`/api/incidents/${encodeURIComponent(incidentId)}/report`, { method: 'POST' }).catch(() => {});
}

function startNewFieldSession() {
  const confirmed = window.confirm('确认开始新的现场记录？当前工具检测记录和现场信息将从本机浏览器清空，已导出的报告不受影响。');
  if (!confirmed) return;
  localStorage.removeItem('opshub-tool-history');
  localStorage.removeItem('opshub-field-context');
  localStorage.removeItem('opshub-field-checklist');
  window.location.reload();
}

async function createTicketFromResult() {
  const history = JSON.parse(localStorage.getItem('opshub-tool-history') || '[]');
  const latest = history[0];
  const title = window.prompt('工单标题：', latest ? `${latest.name}${latest.ok ? '需跟进' : '发现异常'}` : '现场检测发现异常');
  if (!title?.trim()) return;
  const site = window.prompt('门店或位置：', '待分派') || '待分派';
  const priority = window.prompt('优先级（普通 / 警告 / 紧急）：', latest?.ok ? '普通' : '警告') || '普通';
  try {
    const response = await fetch('/api/tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, site, priority }) });
    const ticket = await response.json();
    if (!response.ok) throw new Error(ticket.output || '保存失败');
    window.alert(`工单已创建：${ticket.id}`);
  } catch (error) { window.alert(`创建工单失败：${error.message}`); }
}

function installRegisterLocalAssetButton() {
  if (document.querySelector('[data-action="register-local-asset"]')) return;
  const assetHeading = [...document.querySelectorAll('h1')].find((node) => node.textContent.includes('资产管理'));
  const primaryButton = assetHeading?.closest('.page-head')?.querySelector('.primary');
  if (!primaryButton) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost';
  button.dataset.action = 'register-local-asset';
  button.textContent = '登记本机资产';
  primaryButton.before(button);
}

function installExportAssetsButton() {
  if (document.querySelector('[data-action="export-assets"]')) return;
  const assetHeading = [...document.querySelectorAll('h1')].find((node) => node.textContent.includes('资产管理'));
  const primaryButton = assetHeading?.closest('.page-head')?.querySelector('.primary');
  if (!primaryButton) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost';
  button.dataset.action = 'export-assets';
  button.textContent = '导出已登记资产';
  primaryButton.before(button);
}

function installImportAssetsButton() {
  if (document.querySelector('[data-action="import-assets"]')) return;
  const assetHeading = [...document.querySelectorAll('h1')].find((node) => node.textContent.includes('资产管理'));
  const primaryButton = assetHeading?.closest('.page-head')?.querySelector('.primary');
  if (!primaryButton) return;
  const button = document.createElement('button'); button.type = 'button'; button.className = 'ghost'; button.dataset.action = 'import-assets'; button.textContent = '导入资产 CSV'; primaryButton.before(button);
}

function installDownloadAgentButton() {
  if (document.querySelector('[data-action="download-field-agent"]')) return;
  const assetHeading = [...document.querySelectorAll('h1')].find((node) => node.textContent.includes('资产管理'));
  const primaryButton = assetHeading?.closest('.page-head')?.querySelector('.primary');
  if (!primaryButton) return;
  const button = document.createElement('button'); button.type = 'button'; button.className = 'ghost'; button.dataset.action = 'download-field-agent'; button.textContent = '下载门店采集代理'; primaryButton.before(button);
}

function installImportAgentReportButton() {
  if (document.querySelector('[data-action="import-agent-report"]')) return;
  const assetHeading = [...document.querySelectorAll('h1')].find((node) => node.textContent.includes('资产管理'));
  const primaryButton = assetHeading?.closest('.page-head')?.querySelector('.primary'); if (!primaryButton) return;
  const button = document.createElement('button'); button.type = 'button'; button.className = 'ghost'; button.dataset.action = 'import-agent-report'; button.textContent = '导入门店采集包'; primaryButton.before(button);
}

function downloadFieldAgent() {
  const link = document.createElement('a'); link.href = encodeURI('/agent/门店现场采集代理.ps1'); link.download = '门店现场采集代理.ps1'; document.body.append(link); link.click(); link.remove();
}

function importAgentReport() {
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json'; input.hidden = true; document.body.append(input);
  input.addEventListener('change', () => {
    const file = input.files?.[0]; input.remove(); if (!file) return; if (file.size > 2 * 1024 * 1024) return window.alert('门店采集包不能超过 2MB。');
    const reader = new FileReader(); reader.onload = async () => {
      try {
        const report = JSON.parse(String(reader.result || '')); if (report.format !== 'OpsHubAgentReport/1' || !report.computer?.Name) throw new Error('不是有效的 OpsHub 门店采集包。');
        const site = window.prompt(`采集设备：${report.computer.Name}\n填写所属门店或位置：`); if (!site?.trim()) return;
        const firstNetwork = Array.isArray(report.network) ? report.network[0] : report.network; const ip = Array.isArray(firstNetwork?.IPv4) ? firstNetwork.IPv4[0] : firstNetwork?.IPv4 || '-';
        if (!window.confirm(`将导入 ${report.computer.Name} 的只读采集结果。\n门店：${site}\nIP：${ip || '-'}\n已有资产只补全空字段，确认继续？`)) return;
        const response = await fetch('/api/agent-reports/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ site, report }) }); const result = await response.json(); if (!response.ok) throw new Error(result.output || '导入失败'); window.alert(result.output); window.location.reload();
      } catch (error) { window.alert(`门店采集包导入失败：${error.message}`); }
    }; reader.onerror = () => window.alert('读取门店采集包失败。'); reader.readAsText(file, 'utf-8');
  }, { once: true }); input.click();
}

function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]; const next = text[index + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === ',' && !quoted) { row.push(cell.trim()); cell = ''; continue; }
    if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && next === '\n') index += 1; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; continue; }
    cell += char;
  }
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); return rows;
}

function importAssets() {
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.csv,text/csv'; input.hidden = true; document.body.append(input);
  input.addEventListener('change', () => {
    const file = input.files?.[0]; input.remove(); if (!file) return;
    if (file.size > 1024 * 1024) return window.alert('CSV 不能超过 1 MB。');
    const reader = new FileReader(); reader.onload = async () => {
      const rows = parseCsv(String(reader.result || '').replace(/^\uFEFF/, '')); if (rows.length < 2) return window.alert('CSV 至少需要表头和一行资产数据。');
      const headers = rows[0].map((value) => value.toLowerCase().replaceAll(' ', ''));
      const indexOf = (...names) => headers.findIndex((header) => names.includes(header));
      const nameIndex = indexOf('资产名称', '名称', 'name'); const typeIndex = indexOf('类型', '资产类型', 'type'); const siteIndex = indexOf('门店/位置', '门店', '位置', 'site'); const ipIndex = indexOf('ip地址', 'ip', '地址'); const upstreamIndex = indexOf('上联资产编号', 'upstreamassetid', 'upstream'); const portIndex = indexOf('交换机端口', '端口', 'switchport', 'port'); const vlanIndex = indexOf('vlan'); const modelIndex = indexOf('厂商/型号', '型号', 'model'); const serialIndex = indexOf('序列号sn', '序列号', 'sn', 'serialnumber'); const macIndex = indexOf('mac地址', 'mac'); const locationIndex = indexOf('安装位置', '物理位置', 'physicallocation'); const notesIndex = indexOf('备注', '说明', 'notes');
      if ([nameIndex, typeIndex, siteIndex].some((index) => index < 0)) return window.alert('CSV 必须包含：资产名称、类型、门店/位置；IP 地址可选。');
      const assets = rows.slice(1, 101).map((row) => {
        return { name: row[nameIndex] || '', type: row[typeIndex] || '', site: row[siteIndex] || '', ip: ipIndex >= 0 ? row[ipIndex] || '-' : '-', upstreamAssetId: upstreamIndex >= 0 ? row[upstreamIndex] || '' : '', switchPort: portIndex >= 0 ? row[portIndex] || '' : '', vlan: vlanIndex >= 0 ? row[vlanIndex] || '' : '', model: modelIndex >= 0 ? row[modelIndex] || '' : '', serialNumber: serialIndex >= 0 ? row[serialIndex] || '' : '', macAddress: macIndex >= 0 ? row[macIndex] || '' : '', physicalLocation: locationIndex >= 0 ? row[locationIndex] || '' : '', notes: notesIndex >= 0 ? row[notesIndex] || '' : '' };
      }).filter((asset) => asset.name && asset.type && asset.site);
      if (!assets.length) return window.alert('未找到有效资产行。');
      if (!window.confirm(`将导入 ${assets.length} 条资产。确认继续？`)) return;
      let success = 0; const failures = [];
      for (const asset of assets) {
        try { const response = await fetch('/api/assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(asset) }); const result = await response.json(); if (!response.ok) throw new Error(result.output || '保存失败'); success += 1; }
        catch (error) { failures.push(`${asset.name}：${error.message}`); }
      }
      window.alert(`资产导入完成：成功 ${success} 条，失败 ${failures.length} 条${failures.length ? `\n${failures.slice(0, 5).join('\n')}` : ''}`); window.location.reload();
    }; reader.onerror = () => window.alert('读取 CSV 失败。'); reader.readAsText(file, 'utf-8');
  }, { once: true });
  input.click();
}

async function installAssetStatusPanel() {
  if (document.querySelector('#asset-status-panel')) return;
  const assetHeading = [...document.querySelectorAll('h1')].find((node) => node.textContent.includes('资产管理'));
  const table = assetHeading?.closest('.content')?.querySelector('.page-table');
  if (!assetHeading || !table) return;
  try {
    const response = await fetch('/api/assets'); const assets = await response.json();
    if (!response.ok || !assets.length || document.querySelector('#asset-status-panel')) return;
    const panel = document.createElement('section');
    panel.id = 'asset-status-panel'; panel.className = 'card ticket-status-panel';
    panel.innerHTML = `<div class="card-head"><h2>已登记资产状态</h2><span class="incident-meta">现场更新资产生命周期</span></div><div class="ticket-status-list">${assets.map((asset) => `<div class="ticket-status-row"><div><strong>${escapeText(asset.name)}</strong><span>${escapeText(asset.site)} · ${escapeText(asset.type)} · ${asset.id}</span></div><select class="tool-input asset-status-select" data-asset-id="${escapeText(asset.id)}">${['已登记', '在线', '离线', '维修中', '已报废'].map((status) => `<option value="${status}" ${asset.status === status ? 'selected' : ''}>${status}</option>`).join('')}</select></div>`).join('')}</div>`;
    table.after(panel);
  } catch { /* asset table remains available when the local service is unavailable */ }
}

async function updateAssetStatus(select) {
  const assetId = select.dataset.assetId; const status = select.value; select.disabled = true;
  try {
    const response = await fetch(`/api/assets/${encodeURIComponent(assetId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    const asset = await response.json(); if (!response.ok) throw new Error(asset.output || '保存失败');
  } catch (error) { window.alert(`资产状态更新失败：${error.message}`); }
  finally { select.disabled = false; }
}

async function installAssetTopologyPanel() {
  if (document.querySelector('#asset-topology-panel')) return;
  const assetHeading = [...document.querySelectorAll('h1')].find((node) => node.textContent.includes('资产管理'));
  const table = assetHeading?.closest('.content')?.querySelector('.page-table');
  if (!assetHeading || !table) return;
  const panel = document.createElement('section');
  panel.id = 'asset-topology-panel'; panel.className = 'card asset-topology-panel';
  table.after(panel);
  refreshAssetTopologyPanel();
}

async function refreshAssetTopologyPanel(selectedId = '') {
  const panel = document.querySelector('#asset-topology-panel'); if (!panel) return;
  try {
    const response = await fetch('/api/assets'); const assets = await response.json();
    if (!response.ok) throw new Error('资产服务不可用');
    if (!assets.length) { panel.innerHTML = '<div class="card-head"><h2>网络链路维护</h2></div><p class="incident-meta">登记资产后，可在这里维护交换机上联、端口和 VLAN。</p>'; return; }
    const target = assets.find((asset) => asset.id === selectedId) || assets[0];
    const candidates = assets.filter((asset) => asset.site === target.site && asset.id !== target.id);
    panel.innerHTML = `<div class="card-head"><div><h2>网络链路维护</h2><span class="incident-meta">仅保存现场确认的物理/逻辑上联，不会修改交换机配置</span></div></div><div class="asset-link-form"><label>当前资产<select class="tool-input" data-action="topology-target">${assets.map((asset) => `<option value="${escapeText(asset.id)}" ${asset.id === target.id ? 'selected' : ''}>${escapeText(asset.site)} · ${escapeText(asset.name)}</option>`).join('')}</select></label><label>上联设备<select class="tool-input" id="asset-upstream"><option value="">未维护 / 根节点</option>${candidates.map((asset) => `<option value="${escapeText(asset.id)}" ${asset.id === target.upstreamAssetId ? 'selected' : ''}>${escapeText(asset.name)} · ${escapeText(asset.type)}</option>`).join('')}</select></label><label>交换机端口<input class="tool-input" id="asset-switch-port" value="${escapeText(target.switchPort || '')}" placeholder="例如 GE1/0/12"></label><label>VLAN<input class="tool-input" id="asset-vlan" value="${escapeText(target.vlan || '')}" placeholder="例如 120"></label><button class="primary" data-action="save-asset-link" data-asset-id="${escapeText(target.id)}">保存链路</button></div><div class="asset-link-summary">当前：<strong>${escapeText(target.name)}</strong> ${target.upstreamAssetId ? `→ ${escapeText(candidates.find((asset) => asset.id === target.upstreamAssetId)?.name || '已删除资产')}` : '→ 未设置上联'}${target.switchPort ? ` · ${escapeText(target.switchPort)}` : ''}${target.vlan ? ` · VLAN ${escapeText(target.vlan)}` : ''}</div>`;
  } catch (error) { panel.innerHTML = `<p class="incident-meta">链路维护加载失败：${escapeText(error.message)}</p>`; }
}

async function saveAssetTopologyLink(button) {
  const assetId = button.dataset.assetId; const upstreamAssetId = document.querySelector('#asset-upstream')?.value || '';
  const switchPort = document.querySelector('#asset-switch-port')?.value || ''; const vlan = document.querySelector('#asset-vlan')?.value || '';
  button.disabled = true;
  try {
    const response = await fetch(`/api/assets/${encodeURIComponent(assetId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ upstreamAssetId, switchPort, vlan }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.output || '保存失败');
    await refreshAssetTopologyPanel(assetId); window.alert('网络链路已保存，网络拓扑页面会按此关系展示。');
  } catch (error) { window.alert(`网络链路保存失败：${error.message}`); }
  finally { button.disabled = false; }
}

async function installAssetDossierPanel() {
  if (document.querySelector('#asset-dossier-panel')) return;
  const assetHeading = [...document.querySelectorAll('h1')].find((node) => node.textContent.includes('资产管理'));
  const table = assetHeading?.closest('.content')?.querySelector('.page-table');
  if (!assetHeading || !table) return;
  const panel = document.createElement('section'); panel.id = 'asset-dossier-panel'; panel.className = 'card asset-dossier-panel';
  table.after(panel); refreshAssetDossierPanel();
}

async function refreshAssetDossierPanel(selectedId = '') {
  const panel = document.querySelector('#asset-dossier-panel'); if (!panel) return;
  try {
    const response = await fetch('/api/assets'); const assets = await response.json(); if (!response.ok) throw new Error('资产服务不可用');
    if (!assets.length) { panel.innerHTML = '<div class="card-head"><h2>资产档案</h2></div><p class="incident-meta">登记资产后可维护型号、SN、MAC、安装位置和现场备注。</p>'; return; }
    const target = assets.find((asset) => asset.id === selectedId) || assets[0];
    panel.innerHTML = `<div class="card-head"><div><h2>资产档案</h2><span class="incident-meta">用于现场定位、备件核对和按 SN / MAC 搜索，不存储设备密码</span></div></div><div class="asset-dossier-form"><label>当前资产<select class="tool-input" data-action="asset-dossier-target">${assets.map((asset) => `<option value="${escapeText(asset.id)}" ${asset.id === target.id ? 'selected' : ''}>${escapeText(asset.site)} · ${escapeText(asset.name)}</option>`).join('')}</select></label><label>厂商 / 型号<input class="tool-input" id="asset-model" value="${escapeText(target.model || '')}" placeholder="例如 H3C S5130S"></label><label>序列号 SN<input class="tool-input" id="asset-serial-number" value="${escapeText(target.serialNumber || '')}" placeholder="设备机身标签"></label><label>MAC 地址<input class="tool-input" id="asset-mac-address" value="${escapeText(target.macAddress || '')}" placeholder="例如 00-11-22-33-44-55"></label><label>安装位置 / 机柜<input class="tool-input" id="asset-physical-location" value="${escapeText(target.physicalLocation || '')}" placeholder="例如 弱电箱 A / 机柜 U12"></label><label class="asset-dossier-notes">现场备注<textarea class="diagnosis-box" id="asset-notes" placeholder="保修、备件、线路或其他现场说明">${escapeText(target.notes || '')}</textarea></label><button class="primary" data-action="save-asset-dossier" data-asset-id="${escapeText(target.id)}">保存资产档案</button></div>`;
    if (target.lastCollectedAt) panel.insertAdjacentHTML('beforeend', `<div class="agent-collection-summary"><strong>最近门店采集</strong><span>${new Date(target.lastCollectedAt).toLocaleString('zh-CN', { hour12: false })}</span><span>${escapeText(target.agentSummary?.operatingSystem || '系统信息未提供')}</span><span>打印服务：${escapeText(target.agentSummary?.printerStatus || '未知')}</span><span>磁盘：${target.agentSummary?.disks?.length || 0} 个卷</span></div>`);
  } catch (error) { panel.innerHTML = `<p class="incident-meta">资产档案加载失败：${escapeText(error.message)}</p>`; }
}

async function saveAssetDossier(button) {
  const assetId = button.dataset.assetId;
  const body = { model: document.querySelector('#asset-model')?.value || '', serialNumber: document.querySelector('#asset-serial-number')?.value || '', macAddress: document.querySelector('#asset-mac-address')?.value || '', physicalLocation: document.querySelector('#asset-physical-location')?.value || '', notes: document.querySelector('#asset-notes')?.value || '' };
  button.disabled = true;
  try { const response = await fetch(`/api/assets/${encodeURIComponent(assetId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const result = await response.json(); if (!response.ok) throw new Error(result.output || '保存失败'); await refreshAssetDossierPanel(assetId); window.alert('资产档案已保存，可在全局搜索中按型号、SN 或 MAC 查找。'); }
  catch (error) { window.alert(`资产档案保存失败：${error.message}`); }
  finally { button.disabled = false; }
}

async function installAssetEvidencePanel() {
  if (document.querySelector('#asset-evidence-panel')) return;
  const assetHeading = [...document.querySelectorAll('h1')].find((node) => node.textContent.includes('资产管理'));
  const table = assetHeading?.closest('.content')?.querySelector('.page-table'); if (!assetHeading || !table) return;
  const panel = document.createElement('section'); panel.id = 'asset-evidence-panel'; panel.className = 'card asset-evidence-panel'; table.after(panel); refreshAssetEvidencePanel();
}

async function refreshAssetEvidencePanel(selectedId = '') {
  const panel = document.querySelector('#asset-evidence-panel'); if (!panel) return;
  try {
    const [assetsResponse, evidenceResponse] = await Promise.all([fetch('/api/assets'), fetch('/api/evidence')]); const [assets, evidence] = await Promise.all([assetsResponse.json(), evidenceResponse.json()]); if (!assetsResponse.ok || !evidenceResponse.ok) throw new Error('本地数据服务不可用');
    if (!assets.length) { panel.innerHTML = '<div class="card-head"><h2>资产证据库</h2></div><p class="incident-meta">登记资产后可绑定配置备份、铭牌照片、线路照片和设备日志。</p>'; return; }
    const target = assets.find((asset) => asset.id === selectedId) || assets[0]; panel.dataset.selectedId = target.id; const linked = new Set(target.evidenceIds || []);
    panel.innerHTML = `<div class="card-head"><div><h2>资产证据库</h2><span class="incident-meta">配置备份、铭牌和现场照片可长期绑定到设备；不保存密码或密钥</span></div></div><div class="asset-evidence-actions"><label>当前资产<select class="tool-input" data-action="asset-evidence-target">${assets.map((asset) => `<option value="${escapeText(asset.id)}" ${asset.id === target.id ? 'selected' : ''}>${escapeText(asset.site)} · ${escapeText(asset.name)}</option>`).join('')}</select></label><label class="asset-evidence-upload">上传新证据<input id="asset-evidence-file" type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.log,.csv,.json"/></label><button class="primary" data-action="save-asset-evidence" data-asset-id="${escapeText(target.id)}">保存资产证据</button></div><div class="asset-evidence-list">${evidence.length ? evidence.map((item) => `<label class="asset-evidence-item"><input class="asset-evidence-checkbox" type="checkbox" value="${escapeText(item.id)}" ${linked.has(item.id) ? 'checked' : ''}/><a href="/api/evidence/${encodeURIComponent(item.id)}" target="_blank" rel="noopener">${escapeText(item.filename)}</a><span>${Math.ceil(Number(item.size || 0) / 1024)} KB</span></label>`).join('') : '<span class="incident-meta">暂无上传证据。可在此处上传。</span>'}</div>`;
  } catch (error) { panel.innerHTML = `<p class="incident-meta">资产证据库加载失败：${escapeText(error.message)}</p>`; }
}

async function uploadAssetEvidence(input) {
  const files = [...(input.files || [])]; if (!files.length) return; const panel = document.querySelector('#asset-evidence-panel'); const selectedId = panel?.dataset.selectedId || ''; input.disabled = true;
  try {
    for (const file of files) { if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} 超过 5MB 限制`); const data = await readLocalEvidence(file); const response = await fetch('/api/evidence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name, mime: file.type, data }) }); const result = await response.json(); if (!response.ok) throw new Error(result.output || '上传失败'); }
    await refreshAssetEvidencePanel(selectedId); window.alert(`已上传 ${files.length} 个证据，请点击“保存资产证据”完成绑定。`);
  } catch (error) { window.alert(`资产证据上传失败：${error.message}`); }
  finally { input.value = ''; input.disabled = false; }
}

async function saveAssetEvidence(button) {
  const evidenceIds = [...document.querySelectorAll('.asset-evidence-checkbox:checked')].map((item) => item.value); button.disabled = true;
  try { const response = await fetch(`/api/assets/${encodeURIComponent(button.dataset.assetId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ evidenceIds }) }); const result = await response.json(); if (!response.ok) throw new Error(result.output || '保存失败'); await refreshAssetEvidencePanel(button.dataset.assetId); window.alert(`资产证据已保存：${evidenceIds.length} 个附件。`); }
  catch (error) { window.alert(`资产证据保存失败：${error.message}`); }
  finally { button.disabled = false; }
}

function installExportWorklogsButton() {
  if (document.querySelector('[data-action="export-worklogs"]')) return;
  const worklogHeading = [...document.querySelectorAll('h1')].find((node) => node.textContent.includes('现场处置单'));
  const pageHead = worklogHeading?.closest('.page-head');
  if (!pageHead) return;
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'ghost'; button.dataset.action = 'export-worklogs'; button.textContent = '导出已保存处置单';
  pageHead.append(button);
}

async function installWorklogLinks() {
  if (document.querySelector('#worklog-links')) return;
  const worklogHeading = [...document.querySelectorAll('h1')].find((node) => node.textContent.includes('现场处置单'));
  const form = worklogHeading?.closest('.content')?.querySelector('.form-grid');
  if (!worklogHeading || !form) return;
  const panel = document.createElement('div'); panel.id = 'worklog-links'; panel.className = 'form-full worklog-link-panel';
  panel.innerHTML = '<span class="incident-meta">正在加载可关联的资产、工单和事件…</span>'; form.append(panel);
  try {
    const [assetsResponse, ticketsResponse, incidentsResponse] = await Promise.all([fetch('/api/assets'), fetch('/api/tickets'), fetch('/api/incidents')]); const [assets, tickets, incidents] = await Promise.all([assetsResponse.json(), ticketsResponse.json(), incidentsResponse.json()]);
    if (![assetsResponse, ticketsResponse, incidentsResponse].every((response) => response.ok)) throw new Error('本地数据服务不可用');
    const notes = document.querySelector('#worklog-notes')?.value || ''; const incidentFromNotes = notes.match(/\[关联事件\s+(EVT-\d+)\]/)?.[1] || ''; const ticketFromNotes = notes.match(/\[关联工单\s+(INC-[A-Za-z0-9-]+)\]/)?.[1] || '';
    panel.innerHTML = `<div class="card-head"><div><h3>关联对象</h3><span class="incident-meta">保存处置单后，关联工单和事件会进入“待验证”</span></div></div><div class="worklog-link-grid"><label>关联资产<select id="worklog-asset-id" class="tool-input"><option value="">不关联资产</option>${assets.map((asset) => `<option value="${escapeText(asset.id)}">${escapeText(asset.site)} · ${escapeText(asset.name)} · ${escapeText(asset.ip || '-')}</option>`).join('')}</select></label><label>关联工单<select id="worklog-ticket-id" class="tool-input"><option value="">不关联工单</option>${tickets.map((ticket) => `<option value="${escapeText(ticket.id)}" ${ticket.id === ticketFromNotes ? 'selected' : ''}>${escapeText(ticket.id)} · ${escapeText(ticket.title)}</option>`).join('')}</select></label><label>关联事件<select id="worklog-incident-id" class="tool-input"><option value="">不关联事件</option>${incidents.map((incident) => `<option value="${escapeText(incident.id)}" ${incident.id === incidentFromNotes ? 'selected' : ''}>${escapeText(incident.id)} · ${escapeText(incident.title)}</option>`).join('')}</select></label></div>`;
  } catch (error) { panel.innerHTML = `<span class="incident-meta">关联对象加载失败：${escapeText(error.message)}</span>`; }
}

function installWorklogEvidence() {
  if (document.querySelector('#worklog-evidence')) return;
  const worklogHeading = [...document.querySelectorAll('h1')].find((node) => node.textContent.includes('现场处置单'));
  const form = worklogHeading?.closest('.content')?.querySelector('.form-grid');
  if (!worklogHeading || !form) return;
  const panel = document.createElement('div'); panel.id = 'worklog-evidence'; panel.className = 'form-full worklog-evidence-panel'; panel.dataset.evidenceIds = '[]'; panel.dataset.evidenceItems = '[]';
  panel.innerHTML = `<div class="card-head"><div><h3>现场证据附件</h3><span class="incident-meta">本机保存，支持图片、PDF、TXT、LOG、CSV、JSON；单文件不超过 5MB</span></div></div><div class="worklog-evidence-actions"><input id="worklog-evidence-file" type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.log,.csv,.json"/><span id="worklog-evidence-state" class="incident-meta">尚未上传附件</span></div><div id="worklog-evidence-list" class="worklog-evidence-list"></div>`;
  form.append(panel);
}

function getWorklogEvidenceItems() {
  try { return JSON.parse(document.querySelector('#worklog-evidence')?.dataset.evidenceItems || '[]'); } catch { return []; }
}

function renderWorklogEvidenceItems(items) {
  const panel = document.querySelector('#worklog-evidence'); const list = document.querySelector('#worklog-evidence-list'); const state = document.querySelector('#worklog-evidence-state'); if (!panel || !list || !state) return;
  panel.dataset.evidenceItems = JSON.stringify(items); panel.dataset.evidenceIds = JSON.stringify(items.map((item) => item.id)); state.textContent = items.length ? `已上传 ${items.length} 个附件，保存处置单后建立关联` : '尚未上传附件';
  list.innerHTML = items.map((item) => `<div class="worklog-evidence-item"><a href="/api/evidence/${encodeURIComponent(item.id)}" target="_blank" rel="noopener">${escapeText(item.filename)}</a><span>${Math.ceil(Number(item.size || 0) / 1024)} KB</span><button class="ghost" type="button" data-action="remove-worklog-evidence" data-evidence-id="${escapeText(item.id)}" title="从本次处置单移除">移除</button></div>`).join('');
}

function readLocalEvidence(file) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = () => reject(new Error('读取文件失败')); reader.readAsDataURL(file); });
}

async function uploadWorklogEvidence(input) {
  const files = [...(input.files || [])]; if (!files.length) return;
  const current = getWorklogEvidenceItems(); if (current.length + files.length > 10) { window.alert('单张处置单最多关联 10 个附件。'); input.value = ''; return; }
  const state = document.querySelector('#worklog-evidence-state'); input.disabled = true;
  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]; if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} 超过 5MB 限制`);
      state.textContent = `正在上传 ${index + 1}/${files.length}：${file.name}`;
      const data = await readLocalEvidence(file); const response = await fetch('/api/evidence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name, mime: file.type, data }) }); const result = await response.json();
      if (!response.ok) throw new Error(`${file.name}：${result.output || '上传失败'}`); current.push(result); renderWorklogEvidenceItems(current);
    }
  } catch (error) { window.alert(`现场证据上传失败：${error.message}`); }
  finally { input.value = ''; input.disabled = false; if (state && !current.length) state.textContent = '尚未上传附件'; }
}

async function exportWorklogs() {
  try {
    const response = await fetch('/api/worklogs'); const worklogs = await response.json();
    if (!response.ok) throw new Error('处置单服务不可用');
    if (!worklogs.length) return window.alert('暂无已保存的现场处置单可导出。');
    const rows = [['编号', '门店/位置', '联系人', '故障标题', '关联资产', '关联工单', '关联事件', '证据附件编号', '处理结果', '备注/后续事项', '关联工具数', '保存时间'], ...worklogs.map((item) => [item.id, item.site, item.contact, item.title, item.assetName || '', item.ticketId || '', item.incidentId || '', (item.evidenceIds || []).join(' | '), item.result, item.notes, item.toolCount, item.createdAt])];
    const blob = new Blob(['\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `现场处置单-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  } catch (error) { window.alert(`处置单导出失败：${error.message}`); }
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

async function exportAssets() {
  try {
    const response = await fetch('/api/assets');
    const assets = await response.json();
    if (!response.ok) throw new Error('资产服务不可用');
    if (!assets.length) return window.alert('暂无已登记资产可导出。');
    const rows = [['资产编号', '资产名称', '类型', '门店/位置', 'IP 地址', '厂商/型号', '序列号 SN', 'MAC 地址', '安装位置', '备注', '上联资产编号', '交换机端口', 'VLAN', '登记时间'], ...assets.map((asset) => [asset.id, asset.name, asset.type, asset.site, asset.ip, asset.model || '', asset.serialNumber || '', asset.macAddress || '', asset.physicalLocation || '', asset.notes || '', asset.upstreamAssetId || '', asset.switchPort || '', asset.vlan || '', asset.createdAt || ''])];
    const blob = new Blob(['\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `已登记资产-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  } catch (error) { window.alert(`资产导出失败：${error.message}`); }
}

async function installTicketStatusPanel() {
  if (document.querySelector('#ticket-status-panel')) return;
  const ticketHeading = [...document.querySelectorAll('h1')].find((node) => node.textContent.includes('工单中心'));
  const table = ticketHeading?.closest('.content')?.querySelector('.page-table');
  if (!ticketHeading || !table) return;
  try {
    const response = await fetch('/api/tickets');
    const tickets = await response.json();
    if (!response.ok || !tickets.length || document.querySelector('#ticket-status-panel')) return;
    const panel = document.createElement('section');
    panel.id = 'ticket-status-panel';
    panel.className = 'card ticket-status-panel';
    panel.innerHTML = `<div class="card-head"><h2>我创建的工单</h2><span class="incident-meta">现场处置后更新状态</span></div><div class="ticket-status-list">${tickets.map((ticket) => `<div class="ticket-status-row"><div><strong>${escapeText(ticket.title)}</strong><span>${escapeText(ticket.site)} · ${ticket.assetName || ticket.id}</span></div><select class="tool-input ticket-status-select" data-ticket-id="${escapeText(ticket.id)}">${['待处理', '处理中', '待验证', '已解决', '已关闭'].map((status) => `<option value="${status}" ${ticket.status === status ? 'selected' : ''}>${status}</option>`).join('')}</select></div>`).join('')}</div>`;
    table.after(panel);
  } catch { /* ticket table remains available when the local service is unavailable */ }
}

function escapeText(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

async function updateTicketStatus(select) {
  const ticketId = select.dataset.ticketId;
  const status = select.value;
  select.disabled = true;
  try {
    const response = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    const ticket = await response.json();
    if (!response.ok) throw new Error(ticket.output || '保存失败');
    window.dispatchEvent(new CustomEvent('opshub-toast', { detail: `工单 ${ticket.id} 已更新为${ticket.status}` }));
  } catch (error) { window.alert(`工单状态更新失败：${error.message}`); }
  finally { select.disabled = false; }
}

async function installTicketAssetLinkPanel() {
  if (document.querySelector('#ticket-asset-link-panel')) return;
  const ticketHeading = [...document.querySelectorAll('h1')].find((node) => node.textContent.includes('工单中心'));
  const table = ticketHeading?.closest('.content')?.querySelector('.page-table');
  if (!ticketHeading || !table) return;
  const panel = document.createElement('section'); panel.id = 'ticket-asset-link-panel'; panel.className = 'card ticket-asset-link-panel';
  table.after(panel); refreshTicketAssetLinkPanel();
}

async function refreshTicketAssetLinkPanel(selectedTicketId = '') {
  const panel = document.querySelector('#ticket-asset-link-panel'); if (!panel) return;
  try {
    const [ticketsResponse, assetsResponse] = await Promise.all([fetch('/api/tickets'), fetch('/api/assets')]); const [tickets, assets] = await Promise.all([ticketsResponse.json(), assetsResponse.json()]);
    if (!ticketsResponse.ok || !assetsResponse.ok) throw new Error('本地数据服务不可用');
    if (!tickets.length || !assets.length) { panel.innerHTML = `<div class="card-head"><h2>工单关联资产</h2></div><p class="incident-meta">${!tickets.length ? '先创建工单。' : '先在资产管理登记设备。'} 关联后可从工单快速定位设备、现场位置和拓扑关系。</p>`; return; }
    const ticket = tickets.find((item) => item.id === selectedTicketId) || tickets[0];
    const siteAssets = assets.filter((asset) => asset.site === ticket.site); const options = siteAssets.length ? siteAssets : assets;
    panel.innerHTML = `<div class="card-head"><div><h2>工单关联资产</h2><span class="incident-meta">将故障工单绑定到具体设备；不修改资产本身</span></div></div><div class="ticket-asset-link-form"><label>当前工单<select class="tool-input" data-action="ticket-asset-target">${tickets.map((item) => `<option value="${escapeText(item.id)}" ${item.id === ticket.id ? 'selected' : ''}>${escapeText(item.id)} · ${escapeText(item.title)}</option>`).join('')}</select></label><label>关联资产<select class="tool-input" id="ticket-linked-asset"><option value="">暂不关联</option>${options.map((asset) => `<option value="${escapeText(asset.id)}" ${asset.id === ticket.assetId ? 'selected' : ''}>${escapeText(asset.site)} · ${escapeText(asset.name)} · ${escapeText(asset.ip || '-')}</option>`).join('')}</select></label><button class="primary" data-action="save-ticket-asset-link" data-ticket-id="${escapeText(ticket.id)}">保存关联</button></div><div class="ticket-asset-link-summary">当前关联：${ticket.assetId ? `<strong>${escapeText(ticket.assetName || options.find((asset) => asset.id === ticket.assetId)?.name || ticket.assetId)}</strong>` : '未关联资产'}${ticket.assetId && !siteAssets.length ? ' · 资产位于其他门店' : ''}</div>`;
  } catch (error) { panel.innerHTML = `<p class="incident-meta">工单关联资产加载失败：${escapeText(error.message)}</p>`; }
}

async function saveTicketAssetLink(button) {
  const assetId = document.querySelector('#ticket-linked-asset')?.value || ''; button.disabled = true;
  try { const response = await fetch(`/api/tickets/${encodeURIComponent(button.dataset.ticketId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assetId }) }); const ticket = await response.json(); if (!response.ok) throw new Error(ticket.output || '保存失败'); await refreshTicketAssetLinkPanel(ticket.id); window.alert(assetId ? '工单已关联资产。' : '已解除工单资产关联。'); }
  catch (error) { window.alert(`工单关联保存失败：${error.message}`); }
  finally { button.disabled = false; }
}

async function registerLocalAsset() {
  const site = window.prompt('填写门店或位置：');
  if (!site?.trim()) return;
  try {
    const profile = await (await fetch('/api/assets/local-profile')).json();
    const response = await fetch('/api/assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: profile.name, type: `${profile.type} (${profile.mac})`, site, ip: profile.ip }) });
    const asset = await response.json();
    if (!response.ok) throw new Error(asset.output);
    window.location.reload();
  } catch (error) { window.alert(`资产登记失败：${error.message}`); }
}

const observer = new MutationObserver(() => { installInternetHealthButton(); installGatewayHealthButton(); installAdapterHealthButton(); installDriverCheckButton(); installSoftwareInventoryButton(); installIdentityInfoButton(); installNetworkDrivesButton(); installFirewallStatusButton(); installApplicationLogButton(); installResourceHotspotsButton(); installServiceStatusButton(); installPrintTestButton(); installOpenWebButton(); installCreateTicketFromResultButton(); installStartNewFieldSessionButton(); installFieldReportContext(); installFieldChecklist(); installAiQuickPrompts(); installAiLogImport(); installAuditPanel(); installKnowledgeBase(); installCommunityKnowledgeButton(); installPdfKnowledgeButton(); installImageOcrKnowledgeButton(); installMonitoringPanel(); installTopologyView(); installTopologyDiscoveryPanel(); installLiveOverview(); installSystemHealthButton(); installGlobalSearch(); installBackupButton(); installRemoteSupportPanel(); installIncidentCommandPanel(); installIncidentTicketButtons(); installIncidentTimelineButtons(); startIncidentInvestigation(); prefillIncidentWorklog(); installWorklogLinks(); installWorklogEvidence(); installRegisterLocalAssetButton(); installExportAssetsButton(); installImportAssetsButton(); installDownloadAgentButton(); installImportAgentReportButton(); installAssetStatusPanel(); installAssetTopologyPanel(); installAssetDossierPanel(); installAssetEvidencePanel(); installExportWorklogsButton(); installTicketStatusPanel(); installTicketAssetLinkPanel(); });
observer.observe(document.querySelector('#app'), { childList: true, subtree: true });
installInternetHealthButton();
installGatewayHealthButton();
installAdapterHealthButton();
installDriverCheckButton();
installSoftwareInventoryButton();
installIdentityInfoButton();
installNetworkDrivesButton();
installFirewallStatusButton();
installApplicationLogButton();
installResourceHotspotsButton();
installServiceStatusButton();
installPrintTestButton();
installOpenWebButton();
installCreateTicketFromResultButton();
installStartNewFieldSessionButton();
installFieldReportContext();
installFieldChecklist();
installAiQuickPrompts();
installAiLogImport();
installAuditPanel();
installKnowledgeBase();
installCommunityKnowledgeButton();
installPdfKnowledgeButton();
installImageOcrKnowledgeButton();
installMonitoringPanel();
installTopologyView();
installTopologyDiscoveryPanel();
installLiveOverview();
installSystemHealthButton();
installGlobalSearch();
installBackupButton();
installRemoteSupportPanel();
installIncidentCommandPanel();
installIncidentTicketButtons();
installIncidentTimelineButtons();
startIncidentInvestigation();
prefillIncidentWorklog();
installWorklogLinks();
installWorklogEvidence();
installRegisterLocalAssetButton();
installExportAssetsButton();
installImportAssetsButton();
installDownloadAgentButton();
installImportAgentReportButton();
installAssetStatusPanel();
installAssetTopologyPanel();
installAssetDossierPanel();
installAssetEvidencePanel();
installExportWorklogsButton();
installTicketStatusPanel();
installTicketAssetLinkPanel();

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-action="register-local-asset"]')) registerLocalAsset();
  if (event.target.closest('[data-action="export-assets"]')) exportAssets();
  if (event.target.closest('[data-action="import-assets"]')) importAssets();
  if (event.target.closest('[data-action="download-field-agent"]')) downloadFieldAgent();
  if (event.target.closest('[data-action="import-agent-report"]')) importAgentReport();
  const systemHealthButton = event.target.closest('[data-action="system-health-check"]');
  if (systemHealthButton) runSystemHealthCheck(systemHealthButton);
  const aiConnectionButton = event.target.closest('[data-action="test-ai-connection"]');
  if (aiConnectionButton) testAiConnection(aiConnectionButton);
  if (event.target.closest('[data-action="close-system-health"]')) document.querySelector('.system-health-overlay')?.remove();
  const saveAssetLink = event.target.closest('[data-action="save-asset-link"]');
  if (saveAssetLink) saveAssetTopologyLink(saveAssetLink);
  const saveAssetDossierButton = event.target.closest('[data-action="save-asset-dossier"]');
  if (saveAssetDossierButton) saveAssetDossier(saveAssetDossierButton);
  const saveAssetEvidenceButton = event.target.closest('[data-action="save-asset-evidence"]');
  if (saveAssetEvidenceButton) saveAssetEvidence(saveAssetEvidenceButton);
  const saveTicketAssetButton = event.target.closest('[data-action="save-ticket-asset-link"]');
  if (saveTicketAssetButton) saveTicketAssetLink(saveTicketAssetButton);
  const removeEvidenceButton = event.target.closest('[data-action="remove-worklog-evidence"]');
  if (removeEvidenceButton) renderWorklogEvidenceItems(getWorklogEvidenceItems().filter((item) => item.id !== removeEvidenceButton.dataset.evidenceId));
  if (event.target.closest('[data-action="export-worklogs"]')) exportWorklogs();
  if (event.target.closest('[data-action="create-ticket-from-result"]')) createTicketFromResult();
  if (event.target.closest('[data-action="start-new-field-session"]')) startNewFieldSession();
  if (event.target.closest('[data-action="save-field-context"]')) saveFieldContext();
  if (event.target.closest('[data-action="export-context-report"]')) exportContextReport();
  const aiPromptButton = event.target.closest('[data-action="fill-ai-prompt"]');
  if (aiPromptButton) fillAiPrompt(aiPromptButton);
  if (event.target.closest('[data-action="import-ai-log"]')) importAiLog();
  if (event.target.closest('[data-action="create-incident"]')) createIncident();
  if (event.target.closest('[data-action="add-knowledge"]')) addKnowledge();
  if (event.target.closest('[data-action="add-community-knowledge"]')) addCommunityKnowledge();
  if (event.target.closest('[data-action="import-pdf-knowledge"]')) importPdfKnowledge();
  if (event.target.closest('[data-action="import-image-ocr-knowledge"]')) importImageOcrKnowledge();
  if (event.target.closest('[data-action="import-official-knowledge"]')) importOfficialKnowledge();
  const reviewKnowledgeButton = event.target.closest('[data-action="review-knowledge"]');
  if (reviewKnowledgeButton) reviewKnowledge(reviewKnowledgeButton);
  const monitoringButton = event.target.closest('[data-action="run-asset-monitoring"]');
  if (monitoringButton) runAssetMonitoring(monitoringButton);
  const monitoringIncidentButton = event.target.closest('[data-action="create-monitoring-incidents"]');
  if (monitoringIncidentButton) createMonitoringIncidents(monitoringIncidentButton);
  const monitoringSyncButton = event.target.closest('[data-action="sync-monitoring-status"]');
  if (monitoringSyncButton) syncMonitoringStatuses(monitoringSyncButton);
  const snmpNeighborButton = event.target.closest('[data-action="run-snmp-neighbors"]');
  if (snmpNeighborButton) runSnmpNeighborDiscovery(snmpNeighborButton);
  if (event.target.closest('[data-action="close-global-search"]')) document.querySelector('.global-search-overlay')?.remove();
  if (event.target.closest('[data-action="open-search-result"]')) document.querySelector('.global-search-overlay')?.remove();
  if (event.target.closest('[data-action="close-incident-timeline"]')) document.querySelector('.incident-timeline-overlay')?.remove();
  const timelineButton = event.target.closest('[data-action="view-incident-timeline"]');
  if (timelineButton) viewIncidentTimeline(timelineButton);
  if (event.target.closest('[data-action="open-remote-rdp"]')) openRemoteRdp();
  const remoteToolButton = event.target.closest('[data-action="launch-remote-tool"]');
  if (remoteToolButton) launchRemoteTool(remoteToolButton);
  if (event.target.closest('[data-action="export-backup"]')) exportBackup();
  if (event.target.closest('[data-action="import-backup"]')) importBackup();
  const knowledgeSourceButton = event.target.closest('[data-action="open-knowledge-source"]');
  if (knowledgeSourceButton) openKnowledgeSource(knowledgeSourceButton);
  const investigateButton = event.target.closest('[data-action="investigate-incident"]');
  if (investigateButton) investigateIncident(investigateButton);
  const worklogButton = event.target.closest('[data-action="worklog-incident"]');
  if (worklogButton) createIncidentWorklog(worklogButton);
  const incidentTicketButton = event.target.closest('[data-action="create-incident-ticket"]');
  if (incidentTicketButton) createIncidentTicket(incidentTicketButton);
  const topoDiagButton = event.target.closest('[data-action="diagnose-from-topology"]');
  if (topoDiagButton) { document.querySelector('[data-page="toolbox"]')?.click(); setTimeout(() => { const hostInput = document.querySelector('#tool-host'); if (hostInput) hostInput.value = topoDiagButton.dataset.host; const devType = (topoDiagButton.dataset.type || '').toLowerCase(); if (/打印|printer/.test(devType)) { const sceneBtn = document.querySelector('[data-scene="printer"]'); if (sceneBtn) sceneBtn.click(); } else if (/摄像|监控|nvr|camera/.test(devType)) { const sceneBtn = document.querySelector('[data-scene="cctv"]'); if (sceneBtn) sceneBtn.click(); } else if (/电脑|终端/.test(devType)) { const sceneBtn = document.querySelector('[data-scene="pc"]'); if (sceneBtn) sceneBtn.click(); } else { const sceneBtn = document.querySelector('[data-scene="network"]'); if (sceneBtn) sceneBtn.click(); } }, 400); }
});

document.addEventListener('click', (event) => {
  const serviceButton = event.target.closest('[data-tool="service-status"]');
  if (!serviceButton) return;
  event.stopImmediatePropagation();
  const serviceName = window.prompt('填写 Windows 服务名，例如：Spooler / wuauserv / MSSQLSERVER');
  if (!serviceName?.trim()) return;
  const output = document.querySelector('#tool-output');
  const status = document.querySelector('#tool-state');
  if (!output || !status) return;
  status.textContent = '正在检查服务'; output.textContent = '正在读取 Windows 服务状态…';
  fetch('/api/tools/service-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serviceName }) }).then(async (response) => ({ response, data: await response.json() })).then(({ response, data }) => {
    status.textContent = data.ok ? '执行完成' : '执行失败'; output.textContent = data.output;
    const history = JSON.parse(localStorage.getItem('opshub-tool-history') || '[]'); history.unshift({ time: new Date().toLocaleString('zh-CN', { hour12: false }), name: `检查 Windows 服务：${serviceName}`, ok: Boolean(data.ok), output: data.output }); localStorage.setItem('opshub-tool-history', JSON.stringify(history.slice(0, 30)));
  }).catch((error) => { status.textContent = '连接失败'; output.textContent = `工具服务不可用：${error.message}`; });
}, true);

document.addEventListener('change', (event) => {
  if (event.target.matches('.ticket-status-select')) updateTicketStatus(event.target);
  if (event.target.matches('.asset-status-select')) updateAssetStatus(event.target);
  if (event.target.matches('[data-action="topology-target"]')) refreshAssetTopologyPanel(event.target.value);
  if (event.target.matches('[data-action="asset-dossier-target"]')) refreshAssetDossierPanel(event.target.value);
  if (event.target.matches('[data-action="asset-evidence-target"]')) refreshAssetEvidencePanel(event.target.value);
  if (event.target.matches('#asset-evidence-file')) uploadAssetEvidence(event.target);
  if (event.target.matches('[data-action="ticket-asset-target"]')) refreshTicketAssetLinkPanel(event.target.value);
  if (event.target.matches('#worklog-evidence-file')) uploadWorklogEvidence(event.target);
  if (event.target.matches('#ai-log-file')) readAiLog(event.target);
  if (event.target.matches('[data-field-check]')) saveFieldChecklist();
  if (event.target.matches('.incident-status-select')) updateIncidentStatus(event.target);
  if (event.target.matches('#knowledge-search')) filterKnowledge(event.target);
});

