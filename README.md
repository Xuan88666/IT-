# IT 运维百宝箱

面向门店、办公室、机房和桌面支持的运维指挥台。资产、工单、知识、附件和 AI 配置保存在本机；注册/公告/版本检查等增值功能使用 MySQL（可选）。

> 注意：服务默认监听 `0.0.0.0:3000`（便于部署到服务器/宝塔）。如果只在本机使用，请勿在防火墙放行该端口，或通过防火墙仅允许本机访问。

## 启动

双击 `启动运维百宝箱.cmd`，浏览器打开：

```text
http://127.0.0.1:3000/
```

需要重载代码时双击 `重启运维百宝箱.cmd`。开发检查：

```powershell
npm.cmd run build
node --check server.mjs
npm.cmd test
npm.cmd run package:portable
```

## 现场使用顺序

1. 在“资产管理”登记设备，维护型号、SN、MAC、位置和上联端口。
2. 在“现场工具”执行网络、打印、监控或 Windows 检查。
3. 在“监控告警”巡检已登记资产，必要时同步状态并创建事件。
4. 在“AI 排障助手”描述现象，可导入日志或门店 Agent 的 JSON 采集包。
5. 受控修复必须由现场人员确认；修复后完成验证和回滚检查。
6. 创建工单和现场处置单，关联资产、事件、证据附件并导出报告。
7. 在“审计日志”导出 `ITOpsToolboxBackup/2` 便携备份，证据文件会一并打包。

## 门店现场采集 Agent

在“资产管理”点击“下载门店采集代理”。它是一次性只读 PowerShell 脚本：不常驻、不远控、不修改系统或网络配置。运行后会在桌面生成 `IT-Ops-Toolbox-FieldCollect-*.json`，可用于：

- “导入门店采集包”，登记或补全资产；
- AI 排障助手的“导入日志”；
- 现场处置单的证据附件。

## AI 与知识库

- AI 密钥只放在本机 `.env`，该文件已被 Git 忽略。
- 支持多 Provider（OpenAI 协议兼容：DeepSeek、Ollama、Azure OpenAI 等），按优先级自动切换；全部失败时回退本地规则助手。配置见 `config-ai-providers.example.md`。
- AI 会话持久化在 `data/ai-sessions/`，重启不丢失。
- 知识库支持官方网页、文本型 PDF、社区经验和图片 OCR。
- OCR 使用本地 `tesseract.js` 中文语言包，原图不会上传外网，也不会自动保存。

## 数据与安全

- 数据：`data/it-ops-toolbox.json`。旧版 `data/opshub.json` 会在首次写入时自动迁移，不会丢失。
- 证据附件：`data/evidence/`
- OCR 缓存：`data/ocr-cache/`
- 受控修复、AI 只读诊断、Agent 导入、OCR 和附件上传均写入审计。
- 自动巡检和定时任务当前保持关闭，防止在未经确认时持续访问门店设备。
- 不要在资产备注、知识库或处置单中保存设备密码、SNMP 团体字串和 API Key。
- 静态资源默认拒绝敏感路径：`.env`、`data/`、后端源码、隐藏文件均不可通过 HTTP 下载；仅放行前端资源和门店 Agent 脚本。
- 静态资源启用 gzip 压缩与 ETag 协商缓存，页面加载体积约减少 75%。

## Docker 部署

```bash
# 构建并启动（首次）
docker compose up -d

# 查看日志
docker compose logs -f app

# 停止
docker compose down

# 更新后重新构建
docker compose build --no-cache app && docker compose up -d
```

数据持久化在 Docker 卷 `opsbox-data` 和 `mysql-data`，重启不丢失。MySQL 暴露在宿主机 `3307` 端口避免与本机冲突。

## 服务器监控

监控页面在"监控与告警"下。通过 SSH 将 Linux 服务器纳入监控：

```bash
# 在 Linux 服务器上直接运行采集脚本
ssh root@your-server "bash -s" < agent/linux-monitor.sh

# 或将脚本部署到服务器，定时上报（crontab 每 5 分钟）
*/5 * * * * curl -s -X POST http://your-opsbox:3000/api/server/monitor/report \
  -H 'Content-Type: application/json' -d "$(bash /path/to/linux-monitor.sh)"
```

监控页面自动展示：CPU/内存/磁盘使用率仪表盘、历史趋势图（24h）、网卡流量、运行时间、OS 版本。支持自定义阈值告警（CPU > 90%、内存 > 90%、磁盘 > 85%）。

## 可选外部工具

系统自检会显示本机是否安装 Wireshark、Nmap、HWiNFO、CrystalDiskInfo、海康 SADP、RustDesk、AnyDesk 和 Net-SNMP。缺少这些工具不会影响核心功能，只会禁用对应入口。

## 权限分离 / RBAC

首次打开 `http://127.0.0.1:3000/` 时会要求初始化管理员账号。密码只保存本机哈希，不会写入报告、审计日志或导出文本。

角色划分：

- 管理员：账号管理、备份导入导出、全部现场工具、受控修复、外部工具启动、AI、审计。
- 运维工程师：资产/工单/处置单写入、现场工具、受控修复、外部工具启动、AI、审计查看；不能管理账号和备份。
- 只读人员：查看资产/工单/知识库，执行只读排查工具，使用 AI 建议；不能新建/修改数据，不能执行受控修复，不能启动外部程序，不能导出/导入备份。

安全边界：

- 后端会强制校验权限，前端禁用按钮只是提示，不作为安全边界。
- 未登录访问业务 API 会返回 401。
- 无权限访问会返回 403。
- 受控修复包括刷新 DNS、DHCP 续租、打印服务启动/重启、清理打印队列、打印测试页。
- 启动外部程序包括 RDP、打开设备网页、Wireshark/Nmap/RustDesk/AnyDesk 等本机工具桥。
- 远程管理工作台提供真实 SSH/Telnet 多会话终端、命令输入输出、会话断开、输出导出和脱敏连接历史；RDP 通过 Windows `mstsc.exe` 启动，密码不写入历史或审计。
- 会话保存在服务端内存中，重启运维百宝箱后需要重新登录。
