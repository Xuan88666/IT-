# OpsHub UI and AI Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Deliver a modern, responsive local operations workbench with reusable Shoelace UI components and a tested staged aiAnalyze pipeline.

**Architecture:** Retain the vanilla JavaScript shell and existing HTTP contracts. Add a small ui layer for shared Shoelace feedback controls, then extract AI orchestration into server/ai/analysis-pipeline.mjs through dependency injection while operational helpers remain in server.mjs.

**Tech Stack:** Node.js ESM, Vite, Shoelace Web Components, Lucide, native node:test, PowerShell.

## Global Constraints

- Preserve local-first behavior, 127.0.0.1 binding, endpoints, response fields, and RBAC.
- Load Shoelace from the installed local npm package, never a remote CDN.
- Do not introduce React, Vue, a client-side router, or new destructive operations.
- Keep existing Chinese copy and keyboard workflows. Existing actions remain usable if UI components fail to load.

---

### Task 1: Add Local Shoelace Runtime and Feedback Helpers

**Files:**
- Modify: D:\Desktop\IT运维百宝箱\package.json, D:\Desktop\IT运维百宝箱\package-lock.json, D:\Desktop\IT运维百宝箱\index.html, D:\Desktop\IT运维百宝箱\scripts\smoke-test.mjs
- Create: D:\Desktop\IT运维百宝箱\ui\components.mjs

**Interfaces:** components.mjs exports showToast(message, variant = 'primary'), confirmAction(options), and withPending(button, task).

- [ ] **Step 1: Write a failing runtime assertion**

Add after the home-page check in scripts/smoke-test.mjs:

~~~~js
await check('本地 Shoelace 组件运行时可访问', async () => {
  const html = await (await request('/')).text();
  if (!html.includes('/node_modules/@shoelace-style/shoelace/')) throw new Error('首页未加载本地 Shoelace 组件运行时');
  await request('/node_modules/@shoelace-style/shoelace/dist/themes/light.css');
});
~~~~

- [ ] **Step 2: Run the failing test**

Run: npm test

Expected: FAIL with 首页未加载本地 Shoelace 组件运行时.

- [ ] **Step 3: Install and initialize the local component library**

Run: npm install @shoelace-style/shoelace@^2.20.1

Add before application styles/modules in index.html:

~~~~html
<link rel="stylesheet" href="/node_modules/@shoelace-style/shoelace/dist/themes/light.css" />
<script type="module" src="/node_modules/@shoelace-style/shoelace/dist/shoelace.js"></script>
<script type="module" src="/ui/components.mjs"></script>
~~~~

Create ui/components.mjs:

~~~~js
function toastStack() {
  let node = document.querySelector('#opshub-toast-stack');
  if (!node) { node = document.createElement('div'); node.id = 'opshub-toast-stack'; node.className = 'opshub-toast-stack'; document.body.append(node); }
  return node;
}
export function showToast(message, variant = 'primary') {
  const alert = document.createElement('sl-alert');
  alert.variant = variant; alert.closable = true; alert.duration = 3200; alert.textContent = String(message);
  toastStack().append(alert); alert.toast(); return alert;
}
export async function confirmAction(options) {
  return window.confirm([options.title, options.message, options.confirmLabel || '确认'].join('\n\n'));
}
export async function withPending(button, task) {
  const disabled = button && button.disabled;
  if (button) { button.disabled = true; button.setAttribute('loading', ''); }
  try { return await task(); }
  finally { if (button) { button.disabled = Boolean(disabled); button.removeAttribute('loading'); } }
}
~~~~

- [ ] **Step 4: Verify and commit**

Run: npm test

Expected: PASS, including the local Shoelace assertion.

~~~~powershell
git add package.json package-lock.json index.html ui/components.mjs scripts/smoke-test.mjs
git commit -m "feat(ui): add local Shoelace runtime"
~~~~

### Task 2: Upgrade the Application Shell and Responsive Navigation

**Files:**
- Modify: D:\Desktop\IT运维百宝箱\app.js at nav(), render(), and the delegated click handler
- Modify: D:\Desktop\IT运维百宝箱\styles.css

**Interfaces:** renderAppShell(mainContent) uses current state.auth and nav(). toggle-mobile-nav opens .mobile-nav. Existing data-page navigation events remain the only page-selection contract.

- [ ] **Step 1: Add the application-frame renderer**

Add above render():

~~~~js
function renderAppShell(mainContent) {
  const user = escapeHtml(state.auth.user?.displayName || state.auth.user?.username);
  const role = escapeHtml(state.auth.user?.roleLabel || '');
  return '<div class="app-shell"><header class="app-header">'
    + '<button class="icon-button mobile-nav-toggle" data-action="toggle-mobile-nav" aria-label="打开导航"><i data-lucide="menu"></i></button>'
    + '<div class="brand-mark"><i data-lucide="activity"></i><span>OpsHub</span><small>IT Operations</small></div>'
    + '<label class="global-search"><i data-lucide="search"></i><input class="search" placeholder="搜索资产、事件、工单或 IP" /></label>'
    + '<div class="header-status"><span class="status-dot online"></span>本机服务正常</div><div class="user-chip">' + user + ' · ' + role + '</div>'
    + '<button class="icon-button" data-action="auth-logout" aria-label="退出登录" title="退出登录"><i data-lucide="log-out"></i></button>'
    + '</header><div class="app-workspace">' + nav() + '<main class="content">' + mainContent + '</main></div>'
    + '<sl-drawer class="mobile-nav" label="OpsHub 导航" placement="start">' + nav() + '</sl-drawer></div>';
}
~~~~

- [ ] **Step 2: Route rendering and mobile navigation through the frame**

Replace the authenticated branch in render() with renderAppShell(currentPage()). Before normal action handling, add:

~~~~js
if (action === 'toggle-mobile-nav') { document.querySelector('.mobile-nav')?.show(); return; }
~~~~

When a data-page element is selected, call document.querySelector('.mobile-nav')?.hide() before render().

- [ ] **Step 3: Add scoped workbench styles**

Append to styles.css:

~~~~css
.app-workspace { display: grid; grid-template-columns: 264px minmax(0, 1fr); min-height: calc(100vh - 64px); }
.app-header { min-height: 64px; display: flex; align-items: center; gap: 12px; padding: 0 22px; background: #13202c; color: #f8fafc; }
.brand-mark, .global-search, .header-status { display: flex; align-items: center; gap: 8px; }
.global-search { margin-left: auto; width: min(420px, 34vw); }
.icon-button { inline-size: 36px; block-size: 36px; display: inline-grid; place-items: center; border: 1px solid var(--line); border-radius: 7px; background: var(--panel); color: var(--ink); cursor: pointer; }
.opshub-toast-stack { position: fixed; right: 20px; bottom: 20px; z-index: 1000; display: grid; gap: 8px; }
.mobile-nav-toggle, .mobile-nav { display: none; }
@media (max-width: 960px) { .app-workspace { grid-template-columns: 1fr; } .app-workspace > .sidebar { display: none; } .mobile-nav-toggle, .mobile-nav { display: inline-grid; } .global-search { width: auto; flex: 1; } }
~~~~

- [ ] **Step 4: Verify and commit**

Run: npm test && npm run build

At 1440px and 390px browser widths, verify desktop navigation, mobile drawer, focus order, and logout.

~~~~powershell
git add app.js styles.css
git commit -m "feat(ui): modernize application shell"
~~~~

### Task 3: Upgrade AI Workspace States and Shared Feedback

**Files:**
- Modify: D:\Desktop\IT运维百宝箱\app.js at chatPage(), render(), runAiAnalysis(), and feedback helpers
- Modify: D:\Desktop\IT运维百宝箱\chat-scroll.css, D:\Desktop\IT运维百宝箱\styles.css, D:\Desktop\IT运维百宝箱\enhancements.js
- Modify: D:\Desktop\IT运维百宝箱\scripts\smoke-test.mjs

**Interfaces:** state.aiPending prevents duplicate runs. open-ai-context opens .ai-context-drawer. showToast, confirmAction, and withPending replace shared native feedback calls.

- [ ] **Step 1: Add a failing stable-response regression check**

~~~~js
await check('AI 排障响应保留稳定字段', async () => {
  const data = await json('/api/ai/analyze', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ issue: '打印机离线', evidence: '', provider: '本地运维规则助手' }) });
  for (const key of ['ok', 'provider', 'output', 'suggestedTools', 'opsBrief']) if (!(key in data)) throw new Error('AI 响应缺少 ' + key);
});
~~~~

- [ ] **Step 2: Add a non-duplicating submit state**

Import helpers at app.js top, add aiPending: false to state, and wrap existing request/update code:

~~~~js
if (state.aiPending) return;
const submit = document.querySelector('[data-action="ai-run"]');
state.aiPending = true;
try { await withPending(submit, async () => { /* retain current request, parse, history, and message updates */ }); }
finally { state.aiPending = false; render(); }
~~~~

Replace toast(message) with a wrapper that calls showToast(message, variant).

- [ ] **Step 3: Add the contextual evidence drawer**

Add an open-ai-context icon button to the AI header, append this after the chat shell, and handle its action:

~~~~html
<sl-drawer class="ai-context-drawer" label="本次排障上下文" placement="end">
  <section class="ai-context-section"><h3>现场工具记录</h3><div id="ai-context-tools"></div></section>
  <section class="ai-context-section"><h3>当前会话</h3><div id="ai-context-session"></div></section>
</sl-drawer>
~~~~

~~~~js
if (action === 'open-ai-context') { document.querySelector('.ai-context-drawer')?.show(); return; }
~~~~

Populate drawer entries using DOM nodes and textContent from state.toolHistory.slice(0, 12) and state.chatMessages. Never insert raw command output through innerHTML.

- [ ] **Step 4: Replace shared native feedback**

In enhancements.js, replace destructive confirmation checks with confirmAction and replace success/error window.alert calls with showToast(message, 'success') or showToast(message, 'danger'). Retain file-picker calls unchanged.

- [ ] **Step 5: Verify and commit**

Add responsive chat and drawer CSS; at narrow widths keep the message pane primary. Run npm test && npm run build. Verify duplicate-send prevention, toast close controls, drawer content, and Enter/Shift+Enter behavior.

~~~~powershell
git add app.js enhancements.js chat-scroll.css styles.css scripts/smoke-test.mjs
git commit -m "feat(ui): upgrade AI workspace feedback"
~~~~

### Task 4: Extract and Test the AI Analysis Pipeline

**Files:**
- Create: D:\Desktop\IT运维百宝箱\server\ai\analysis-pipeline.mjs, D:\Desktop\IT运维百宝箱\server\ai\analysis-pipeline.test.mjs
- Modify: D:\Desktop\IT运维百宝箱\server.mjs at aiAnalyze(), D:\Desktop\IT运维百宝箱\package.json

**Interfaces:** createAiAnalyzer(deps) returns async analyze(body). Dependencies are createPrompt, suggestTools, loadSession, createSession, saveSession, getKnowledge, getAssets, runDiagnostic, selectProvider, fallbackProvider, callModel, localAdvice, and buildOpsBrief. Responses preserve ok, mode, provider, sessionId, suggestedTools, opsBrief, output, action, and fallbackFrom.

- [ ] **Step 1: Write failing unit tests**

Create analysis-pipeline.test.mjs:

~~~~js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createAiAnalyzer } from './analysis-pipeline.mjs';
function deps(overrides = {}) {
  const session = { id: 'session-1234567890', messages: [] };
  return { createPrompt: () => ({ issue: '打印机离线', evidence: '端口不通', normalConversation: false, messages: [{ role: 'system', content: 'system' }, { role: 'user', content: 'user' }] }), suggestTools: () => ['printer-health'], loadSession: async () => null, createSession: async () => session, saveSession: async () => {}, getKnowledge: async () => '', getAssets: async () => '', runDiagnostic: async () => null, selectProvider: () => null, fallbackProvider: () => null, callModel: async () => { throw new Error('not called'); }, localAdvice: () => '本地建议', buildOpsBrief: () => ({ rootCause: '待确认' }), ...overrides };
}
test('uses the local assistant when no provider is available', async () => {
  const result = await createAiAnalyzer(deps()).analyze({});
  assert.equal(result.mode, 'local'); assert.equal(result.provider, '本地运维规则助手'); assert.deepEqual(result.suggestedTools, ['printer-health']);
});
test('falls back after provider failures', async () => {
  const result = await createAiAnalyzer(deps({ selectProvider: () => ({ name: 'Primary' }), callModel: async () => { throw new Error('timeout'); } })).analyze({ provider: 'Primary' });
  assert.equal(result.mode, 'local'); assert.equal(result.fallbackFrom, 'Primary'); assert.match(result.output, /本地建议/);
});
~~~~

- [ ] **Step 2: Verify the test fails**

Run: node --test server/ai/analysis-pipeline.test.mjs

Expected: FAIL with ERR_MODULE_NOT_FOUND for analysis-pipeline.mjs.

- [ ] **Step 3: Implement and integrate the pipeline**

Create analysis-pipeline.mjs:

~~~~js
function enrich(prompt, knowledge, assets) {
  const evidence = [knowledge, assets, prompt.evidence].filter(Boolean).join('\n\n').slice(0, 18000);
  return { ...prompt, evidence, messages: [prompt.messages[0], { role: 'user', content: '故障现象：' + prompt.issue + '\n检测证据：' + evidence }] };
}
export function createAiAnalyzer(deps) {
  return async function analyze(body = {}) {
    const base = deps.createPrompt(body);
    const prompt = enrich(base, await deps.getKnowledge(base.issue), await deps.getAssets(base.issue));
    const suggestedTools = deps.suggestTools(prompt.issue);
    const session = (body.sessionId && await deps.loadSession(body.sessionId)) || await deps.createSession(prompt.issue.slice(0, 50), prompt.issue);
    session.messages.push({ role: 'user', content: prompt.issue });
    const action = await deps.runDiagnostic(prompt.issue);
    const primary = deps.selectProvider(body.provider);
    for (const provider of [primary, deps.fallbackProvider(primary)].filter(Boolean)) {
      try {
        const response = await deps.callModel(provider, prompt.messages);
        const output = String(response.choices?.[0]?.message?.content || '').trim() || deps.localAdvice(prompt.issue, prompt.evidence);
        session.messages.push({ role: 'assistant', content: output }); await deps.saveSession(session);
        return { ok: true, mode: 'provider', provider: provider.name, sessionId: session.id, fallbackFrom: provider === primary ? null : primary?.name || null, action, suggestedTools, opsBrief: prompt.normalConversation ? null : deps.buildOpsBrief(prompt.issue, output, action), output };
      } catch (error) { deps.recordFailure?.(provider.name, error); }
    }
    const output = deps.localAdvice(prompt.issue, prompt.evidence);
    session.messages.push({ role: 'assistant', content: output }); await deps.saveSession(session);
    return { ok: true, mode: 'local', provider: '本地运维规则助手', sessionId: session.id, fallbackFrom: primary?.name || null, action, suggestedTools, opsBrief: prompt.normalConversation ? null : deps.buildOpsBrief(prompt.issue, output, action), output };
  };
}
~~~~

Import it in server.mjs, instantiate once with existing helpers, preserve action evidence/audit behavior through injected dependencies, and replace aiAnalyze(body) with return aiAnalyzer(body).

- [ ] **Step 4: Run all AI tests and commit**

Set package.json test to: node --test server/ai/analysis-pipeline.test.mjs && node scripts/smoke-test.mjs

Run: npm test

Expected: both pipeline tests and smoke tests PASS.

~~~~powershell
git add server.mjs server/ai/analysis-pipeline.mjs server/ai/analysis-pipeline.test.mjs package.json
git commit -m "refactor(ai): extract analysis pipeline"
~~~~

### Task 5: Keep Portable Packaging Self-Contained

**Files:**
- Modify: D:\Desktop\IT运维百宝箱\scripts\build-portable.ps1, D:\Desktop\IT运维百宝箱\README.md

**Interfaces:** the portable app directory includes server and ui alongside root source files and production npm dependencies.

- [ ] **Step 1: Copy runtime source directories**

After the Agent copy in build-portable.ps1, add:

~~~~powershell
foreach ($directory in @('server', 'ui')) {
  $source = Join-Path $projectRoot $directory
  if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $appRoot -Recurse -Force }
}
~~~~

- [ ] **Step 2: Document local UI dependencies**

Add to README.md:

~~~~markdown
界面组件使用已安装的本地 Shoelace 包；便携包会随应用安装生产依赖，现场运行不依赖外部 UI CDN。
~~~~

- [ ] **Step 3: Run release verification and commit**

Run: npm run check

Expected: syntax checks, Vite build, unit tests, and smoke tests PASS.

Run: npm run package:portable

Verify:

~~~~powershell
$latest = Get-ChildItem release -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
@('app\server\ai\analysis-pipeline.mjs', 'app\ui\components.mjs') | ForEach-Object { if (-not (Test-Path (Join-Path $latest.FullName $_))) { throw "Portable package missing $_" } }
~~~~

~~~~powershell
git add scripts/build-portable.ps1 README.md
git commit -m "build: package UI and AI modules"
~~~~

## Plan Self-Review

- Tasks 1-3 cover local open-source UI components, the responsive product-workbench visual hierarchy, AI interaction states, and feedback.
- Task 4 covers normalization through existing prompt helpers, enrichment, provider selection, fallback, stable fields, and unit tests.
- Task 5 ensures the new runtime modules survive portable packaging.
- Introduced interfaces are defined in the task that creates them. The plan contains no unresolved placeholder steps.
