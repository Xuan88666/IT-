# IT 运维百宝箱重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有工具集合升级为保留全部原工具与输出台的桌面运维工作台，并补齐知识库、电脑优化、办公修复和现场闭环。

**Architecture:** 保持原生 JavaScript 和本地 Node 服务。前端以兼容层将既有工具 ID、处理函数和 `appendOutput` 纳入统一注册、搜索与输出体验；服务端用独立的桌面诊断/修复模块提供真实的 PowerShell 受控执行能力。知识库沿用本地数据和官方来源白名单，扩展结构与前端呈现。

**Tech Stack:** Vanilla JavaScript、Node.js、Express、PowerShell、Vite、Playwright。

## Global Constraints

- 项目显示名固定为“IT 运维百宝箱”。
- 不删除既有工具 ID、入口、执行函数或输出台。
- Windows 为首期运行平台；诊断默认只读，修复必须明确确认、权限和审计。
- 新旧工具统一使用参数区、输出台、结论和导出流程。
- 外部工具只做本机检测和合法启动，不打包第三方程序。
- 不在知识库、日志或导出物中保存密码、密钥或 SNMP 团体字串。

---

## File Structure

- `index.html`: 应用标题、样式和脚本入口。
- `app.js`: 路由、现有工具兼容层、页面渲染和用户交互。
- `toolkit.css`: 工作台、工具面板、输出台和知识库的视觉系统。
- `server.mjs`: API 注册、RBAC、审计、原有工具端点和知识库持久化。
- `server/desktop-ops.mjs`: Windows 资产采集、健康检查、优化、Office/WPS 检测和受控修复。
- `server/tool-catalog.mjs`: 工具分类、风险、权限、知识标签和快捷入口元数据。
- `data/knowledge-seed.json`: 内置品牌、官方来源和高频 SOP 的结构化种子数据。
- `scripts/desktop-ops-contract-test.mjs`: 桌面运维 API 契约与危险操作确认测试。
- `scripts/tool-catalog-test.mjs`: 工具目录完整性、唯一 ID 和分类可达性测试。

## Task 1: 建立工具目录与保留校验

**Files:**
- Create: `server/tool-catalog.mjs`
- Modify: `app.js`
- Create: `scripts/tool-catalog-test.mjs`

**Interfaces:**
- Produces: `TOOL_CATALOG`, `getToolById(id)`, `getToolGroups()`。
- Consumes: 既有 `toolsByCategory` 和所有 `data-tool` 入口。

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import { TOOL_CATALOG, getToolById } from '../server/tool-catalog.mjs';

assert.ok(TOOL_CATALOG.length >= 60);
assert.equal(new Set(TOOL_CATALOG.map((tool) => tool.id)).size, TOOL_CATALOG.length);
assert.equal(getToolById('ping-test').id, 'ping-test');
assert.equal(getToolById('office-health').group, 'desktop');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/tool-catalog-test.mjs`

Expected: `ERR_MODULE_NOT_FOUND` for `server/tool-catalog.mjs`.

- [ ] **Step 3: Write minimal implementation**

```js
export const TOOL_CATALOG = [
  { id: 'ping-test', group: 'network', risk: 'read', keywords: ['Ping', '连通性'] },
  { id: 'printer-health', group: 'desktop', risk: 'read', keywords: ['打印机', 'Spooler'] },
  { id: 'office-health', group: 'desktop', risk: 'read', keywords: ['Office', 'WPS'] },
];
export const getToolById = (id) => TOOL_CATALOG.find((tool) => tool.id === id);
export const getToolGroups = () => Object.groupBy(TOOL_CATALOG, (tool) => tool.group);
```

Populate the catalog from every existing `toolsByCategory` entry and add new tool definitions without removing old IDs. In `app.js`, use catalog metadata only for navigation/search; continue dispatching existing IDs to existing handlers.

- [ ] **Step 4: Verify**

Run: `node scripts/tool-catalog-test.mjs; node --check app.js`

Expected: process exits `0`.

- [ ] **Step 5: Commit**

```powershell
git add server/tool-catalog.mjs app.js scripts/tool-catalog-test.mjs
git commit -m "feat: catalog all operations tools"
```

## Task 2: 统一命名、工作台首页与输出历史

**Files:**
- Modify: `index.html`, `app.js`, `toolkit.css`, `README.md`, `scripts/smoke-test.mjs`

**Interfaces:**
- Produces: `renderDashboardPage()`, `beginToolRun(toolId)`, `finishToolRun(runId, status, summary)`.
- Consumes: `TOOL_CATALOG` 和现有工具的 `appendOutput(text, type)`。

- [ ] **Step 1: Add failing smoke assertions**

Add assertions for `IT 运维百宝箱`, `data-dashboard="health"`, `data-dashboard="quick-actions"`, `data-dashboard="tool-finder"`, and `data-dashboard="recent-runs"`.

- [ ] **Step 2: Verify failure**

Run: `npm.cmd test`

Expected: selectors are missing.

- [ ] **Step 3: Implement dashboard and compatible run wrapper**

```js
function beginToolRun(toolId) {
  const run = { id: crypto.randomUUID(), toolId, startedAt: new Date().toISOString(), status: 'running', lines: [] };
  state.toolHistory.unshift(run);
  state.activeToolRun = run;
  return run;
}

function appendOutput(text, type = 'info') {
  state.activeToolRun?.lines.push({ text: String(text), type, at: new Date().toISOString() });
  // Preserve existing #tk-output DOM rendering below.
}
```

Render the health board, high-frequency actions, global tool finder, recent runs and external tool status without duplicating tool code. Keep the `data-tool` dispatch contract. Replace legacy visible names and mojibake with UTF-8 Chinese text.

- [ ] **Step 4: Verify**

Run: `npm.cmd run build; node scripts/smoke-test.mjs`

Expected: the build passes, every dashboard section appears once, and a completed tool run is listed.

- [ ] **Step 5: Commit**

```powershell
git add index.html app.js toolkit.css README.md scripts/smoke-test.mjs
git commit -m "feat: rebuild IT ops workbench homepage"
```

## Task 3: 恢复知识库、品牌资料中心与来源结构

**Files:**
- Create: `data/knowledge-seed.json`
- Modify: `server.mjs`, `app.js`, `toolkit.css`
- Create: `scripts/knowledge-contract-test.mjs`

**Interfaces:**
- Produces: `/api/knowledge`, `/api/knowledge/sources`, `/api/knowledge/brands`, `/api/knowledge/search?q=`.
- Card fields: `id`, `title`, `category`, `brand`, `models`, `symptoms`, `content`, `sourceUrl`, `source`, `reviewStatus`, `updatedAt`.

- [ ] **Step 1: Write the failing API contract**

```js
const response = await fetch(`${baseUrl}/api/knowledge/search?q=打印机`);
const body = await response.json();
assert.equal(response.status, 200);
assert.ok(body.items.some((item) => item.category === '打印'));
assert.ok(body.brands.some((brand) => brand.name === 'HP'));
```

- [ ] **Step 2: Implement structured seed merging**

Load the seed file at service startup, merge it with `store.knowledge`, preserve the existing built-in knowledge and official-domain allowlist, and expose filtered brand/search routes.

- [ ] **Step 3: Render the knowledge center**

Render brand rail, category chips, full-text search, official/internal badges, applicability, SOP detail, official source action and “关联到输出台”. Preserve add/import/PDF/OCR controls.

- [ ] **Step 4: Verify**

Run: `node scripts/knowledge-contract-test.mjs; npm.cmd test`

Expected: seeded and persisted documents are searchable, and official links render externally.

- [ ] **Step 5: Commit**

```powershell
git add data/knowledge-seed.json server.mjs app.js toolkit.css scripts/knowledge-contract-test.mjs
git commit -m "feat: restore operations knowledge center"
```

## Task 4: Windows 桌面采集、体检与现场采证

**Files:**
- Create: `server/desktop-ops.mjs`
- Modify: `server.mjs`, `app.js`
- Create: `scripts/desktop-ops-contract-test.mjs`

**Interfaces:**
- Produces: `collectDesktopInventory()`, `runDesktopHealthCheck()`, `collectIncidentEvidence()`.
- HTTP endpoints: `GET /api/desktop/inventory`, `GET /api/desktop/health`, `POST /api/desktop/evidence`.

- [ ] **Step 1: Write read-only contract tests**

```js
const inventory = await fetch(`${baseUrl}/api/desktop/inventory`).then((r) => r.json());
assert.equal(inventory.ok, true);
assert.ok('hardware' in inventory.data);
assert.ok('operatingSystem' in inventory.data);
```

- [ ] **Step 2: Implement bounded collectors**

Use `Get-CimInstance`, `Get-PhysicalDisk`, `Get-NetAdapter`, `Get-PnpDevice`, `Get-Volume`, `Get-WinEvent`, and `Get-Printer` through the existing constrained PowerShell runner. Return structured fields plus textual output; do not accept shell text from clients.

- [ ] **Step 3: Add tool entries and output integration**

Add `desktop-inventory`, `desktop-health`, and `incident-evidence` cards. Results must use the existing output console and be exportable.

- [ ] **Step 4: Verify**

Run: `node scripts/desktop-ops-contract-test.mjs; npm.cmd test`

Expected: permitted users receive data and all endpoints reject untrusted commands.

- [ ] **Step 5: Commit**

```powershell
git add server/desktop-ops.mjs server.mjs app.js scripts/desktop-ops-contract-test.mjs
git commit -m "feat: add desktop health and evidence collection"
```

## Task 5: 电脑优化、Windows 修复与 Office/WPS 修复

**Files:**
- Modify: `server/desktop-ops.mjs`, `server.mjs`, `app.js`, `toolkit.css`, `scripts/desktop-ops-contract-test.mjs`

**Interfaces:**
- HTTP endpoints: `GET /api/desktop/optimize/plan`, `POST /api/desktop/optimize/run`, `GET /api/office/health`, `POST /api/office/repair`.
- Mutating request: `{ actions: string[], confirmed: true }`.

- [ ] **Step 1: Write confirmation tests**

```js
const denied = await fetch(`${baseUrl}/api/desktop/optimize/run`, {
  method: 'POST', headers, body: JSON.stringify({ actions: ['temp-files'] }),
});
assert.equal(denied.status, 400);
const plan = await fetch(`${baseUrl}/api/desktop/optimize/plan`).then((r) => r.json());
assert.ok(plan.actions.every((item) => item.risk && item.rollback));
```

- [ ] **Step 2: Implement allowlisted desktop plans**

Define temporary files, recycle bin, browser cache, DNS cache, startup review and power-plan diagnostics. Require `confirmed: true`, repair permission and an audit entry; preserve before/after measurements. Never execute raw client commands.

- [ ] **Step 3: Implement Office/WPS detection and repair plans**

Detect installed versions, processes, add-ins, template/cache paths, associations, license evidence and relevant event logs. Limit repair actions to add-in disable, template/cache backup/reset, association repair and Office quick-repair launch. PST/OST changes remain plan-only until explicitly confirmed.

- [ ] **Step 4: Build repair pages**

Offer symptom presets for cannot start, crash, slow, format issue, add-in failure, activation, email profile and WPS association. Show risk, backup, rollback and output in the standard console.

- [ ] **Step 5: Verify**

Run: `node scripts/desktop-ops-contract-test.mjs; node --check server/desktop-ops.mjs; npm.cmd test`

Expected: diagnostics work without confirmation; unknown, unauthorized and unconfirmed repairs are rejected.

- [ ] **Step 6: Commit**

```powershell
git add server/desktop-ops.mjs server.mjs app.js toolkit.css scripts/desktop-ops-contract-test.mjs
git commit -m "feat: add controlled desktop and office repair"
```

## Task 6: 网络/安全、批量任务、验收报告与外部工具

**Files:**
- Modify: `server.mjs`, `app.js`, `toolkit.css`, `README.md`, `scripts/smoke-test.mjs`

**Interfaces:**
- HTTP endpoints: `POST /api/tools/batch-check`, `GET /api/security/baseline`, `POST /api/reports/acceptance`.
- CSV batch request: `{ targets: [{ host: string }], checks: ['ping' | 'ports' | 'disk' | 'service'] }`.

- [ ] **Step 1: Write validation tests**

Assert that invalid hosts, more than 100 targets, unknown checks and unconfirmed repairs return client errors. Assert that delivery reports contain `network`, `printing`, `office`, `disk`, `updates` and `security`.

- [ ] **Step 2: Implement bounded checks**

Reuse existing helpers. Validate host/IP/domain input, cap target and port ranges, and serialize batch results into the standard output/report format. Add read-only security baseline, VPN/proxy/shared-folder, certificate/domain, AD and Windows/Linux server checks.

- [ ] **Step 3: Implement the three field shortcuts**

Expose one-click incident collection, symptom-driven desktop diagnosis and delivery acceptance. Chain only named allowlisted checks, write a run record and export a report; never repair automatically.

- [ ] **Step 4: Verify all deliverables**

Run: `npm.cmd run check; npm.cmd run package:portable`

Expected: build, syntax, smoke and portable package complete. README lists every module, external integration policy and safety boundaries.

- [ ] **Step 5: Commit**

```powershell
git add server.mjs app.js toolkit.css README.md scripts/smoke-test.mjs
git commit -m "feat: complete operations workflow and reporting"
```

## Plan Self-Review

- Spec coverage: Tasks 1-2 preserve and aggregate existing tools/output; Task 3 restores knowledge; Tasks 4-5 cover desktop, optimization, Office/WPS and evidence; Task 6 covers network/security, AD/server checks, batches, reports and three field shortcuts.
- No placeholders: Tasks name exact files, interfaces, test code, commands and expected outcomes.
- Type consistency: catalog uses stable string IDs; mutation endpoints share `actions` plus `confirmed`; run output remains typed lines for all UI paths.

