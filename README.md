<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-339933?logo=node.js" alt="Node.js" />
  <img src="https://img.shields.io/badge/Docker-✓-2496ED?logo=docker" alt="Docker" />
  <img src="https://img.shields.io/badge/MySQL-8.0-4479A1?logo=mysql" alt="MySQL" />
  <img src="https://img.shields.io/badge/AI-自动排障-FF6F00" alt="AI" />
  <img src="https://img.shields.io/badge/SSH/Telnet-远程会话-000000" alt="Remote" />
  <img src="https://img.shields.io/badge/37 项冒烟测试-✔-22c55e" alt="Tests" />
</p>

# IT 运维百宝箱

> 企业级一体化运维管理平台——Docker 化部署、AI 排障、服务器监控、远程会话、网络诊断、资产与工单管理。  
> 面向 200+ 门店/机房场景，将日常重复性运维操作自动化率提升至 70%。

---

## 🔥 核心架构

```
┌──────────────────────────────────────────────────────┐
│                  Web 界面（SPA）                       │
│     监控仪表盘 · 网络工具 · AI 排障 · 远程会话         │
├──────────────────────────────────────────────────────┤
│                 后端 API（Express）                    │
│   RBAC · 验证码 · 审计 · 多 Provider AI 调度          │
├────────────┬────────────┬──────────────┬──────────────┤
│ 本地存储    │ MySQL      │ SSH/Telnet   │ Docker       │
│ (JSON文件)  │ (可选)     │ 远程会话     │ 容器化部署    │
└────────────┴────────────┴──────────────┴──────────────┘
```

---

## 🚀 快速开始

### Docker 部署（推荐）

```bash
docker compose up -d
# 打开 http://localhost:3000
```

### 裸机部署

```bash
node server.js
# 打开 http://localhost:3000
```

> 完整环境要求：Node.js 20+，MySQL 8.0（可选）。

---

## 📊 功能矩阵

### 服务器监控仪表盘

| 维度 | 说明 |
|------|------|
| **CPU** | 实时使用率 + 负载均值（1/5/15m）+ 进程数 + 24h 历史趋势图 |
| **内存** | 使用率 + 总量/已用/可用 + Swap + 趋势图 |
| **磁盘** | 使用率 + 总量/已用/可用 + IO 读写速率 + 趋势图 |
| **网卡流量** | 每网卡 RX/TX 累计字节数 |
| **系统信息** | 运行天数、OS 版本、内核版本 |
| **阈值告警** | CPU > 90% / 内存 > 90% / 磁盘 > 85% 自动告警，阈值可调 |

#### 采集方式：零侵入式 SSH 免代理采集

```bash
# 一条命令将 Linux 服务器纳入监控（无需安装任何 Agent）
ssh root@your-server "bash -s" < agent/linux-monitor.sh

# 或 crontab 定时上报（推荐每 5 分钟）
*/5 * * * * curl -s -X POST http://opsbox:3000/api/server/monitor/report \
  -H 'Content-Type: application/json' -d "$(bash /path/to/linux-monitor.sh)"
```

### AI 智能排障引擎

- 多 Provider 支持（OpenAI / DeepSeek / Ollama / Azure OpenAI），按优先级自动切换与故障降级
- AI 可调用 **34+ 诊断工具**：Ping、DNS、端口扫描、ARP、路由追踪、WiFi 扫描、打印机诊断、NVR 诊断、SSL 证书检查、SNMP 探测等
- 会话持久化，重启不丢失
- 全部 Provider 不可用时回退本地规则助手兜底

### 远程管理

| 协议 | 功能 |
|------|------|
| **SSH** | 多会话终端、Shell 输入输出、utf-8 中文支持、连接历史脱敏 |
| **Telnet** | 兼容老旧网络设备（交换机、路由器） |
| **RDP** | 通过 `mstsc.exe` 启动，密码不写入历史或审计 |
| **串口** | 物理串口终端会话（需 host 支持） |

### 现场网络工具集（34+ 项）

```
Ping / DNS 查询 / TCP Ping / 端口扫描 / ARP 表 / 路由表 / MTU 探测
Traceroute 分析 / 网络质量测试 / 子网计算 / 证书检查 / TLS 扫描
WiFi 扫描 / DHCP 检测 / 打印机巡检 / 监控巡检 / 防火墙管理
SNMP 探测 / WebSocket 测试 / 反向 DNS / 宽带测速 / 环路检测
ARP 欺骗检测 / NetFlow 监听 / 连接追踪 / 进程列表 / 服务管理
```

### 资产与工单管理

- 资产登记（型号、SN、MAC、IP、位置、上联端口）
- 工单全生命周期（创建 → 处理 → 关联资产/事件 → 导出）
- 现场处置单 + 证据附件上传
- 门店采集代理（只读 PowerShell，不常驻、不远控）

### RBAC 权限体系

| 角色 | 权限 |
|------|------|
| ⭐ 管理员 | 全部权限：账号管理、备份导入导出、系统配置 |
| 🔧 运维工程师 | 资产/工单写入、工具执行、受控修复、远程管理 |
| 👁 只读人员 | 查看资产/工单/知识库、只读排查工具、AI 使用 |

> 后端强制校验权限，前端 UI 控制仅为提示，安全边界在后端。

---

## 🐳 Docker 部署架构

```
┌──────────────────────────────────────────┐
│              docker-compose               │
│  ┌─────────────┐    ┌──────────────────┐  │
│  │   MySQL 8.0  │    │  opsbox 应用容器  │  │
│  │   Port 3307  │    │  Node.js 20      │  │
│  │   Vol: mysql │◄──►│  Vol: opsbox-data│  │
│  └─────────────┘    │  Port 3000        │  │
│                      └──────────────────┘  │
└──────────────────────────────────────────┘
```

```bash
# 启动
docker compose up -d

# 构建更新
docker compose build --no-cache app

# 查看日志
docker compose logs -f app

# 停止
docker compose down
```

数据持久化在 Docker 卷，重启不丢失。MySQL 映射到 3307 端口避免与本机冲突。

---

## 🛡️ 安全设计

| 项目 | 措施 |
|------|------|
| **密钥保护** | API Key 只存后端 `.env`（Git 忽略），前端不返回密钥 |
| **静态文件** | 白名单放行机制，`.env`、`data/`、后端源码、隐藏文件不可下载 |
| **密码安全** | scrypt 哈希 + 时间恒定比较，不写入日志/审计/导出 |
| **命令注入** | PowerShell 参数转义（`psQuote`/`psCmdArg`），FTP 路径穿越防护 |
| **会话文件** | 原子写入（临时文件+rename）+ 串行队列，防并发覆盖丢失 |
| **抓包文件** | 用户 ID 校验，随机 ID 24bit→64bit 熵增强 |
| **XSS 防护** | DOMPurify 过滤用户输入，HTTP-only Cookie |
| **请求限流** | 验证码（每邮箱 60s + 每 IP 每小时 5 次）、登录锁定（5 次/10 分钟） |
| **传输优化** | gzip 压缩 + ETag 协商缓存（304），静态资源体积减少 75% |

---

## 📈 工程化保障

```bash
# 完整检查
npm run check
# → 语法检查 + Vite 构建 + 37 项冒烟测试 + 124 项工具目录校验

# 认证 API 契约测试
npm run test:auth-api

# 限流测试
npm run test:rate-limit

# 便携打包
npm run package:portable
```

**测试覆盖**：冒烟测试 37 项（登录/注册/RBAC/工具/抓包/OCR/AI/远程会话/监控）  
**工具目录**：124 项认证入口逐一校验  
**代码行数**：核心后端 ~4300 行，前端 SPA ~7800 行

---

## 📁 项目结构

```
├── Dockerfile                # 多阶段构建
├── docker-compose.yml        # app + MySQL
├── deploy/
│   ├── entrypoint.sh         # 容器入口脚本
│   └── nginx.conf            # 反向代理配置（含 WebSocket）
├── server.mjs                # 后端主入口（~3100 行）
├── app.js                    # 前端 SPA（~7800 行）
├── server/
│   ├── ai/                   # AI 多 Provider 调度 + 会话管理
│   ├── tools-extended.mjs   # 34+ 诊断工具
│   │   + 临时服务（HTTP/FTP/Syslog/DHCP）
│   ├── packet-capture.mjs    # 抓包分析
│   ├── remote-sessions.mjs   # SSH/Telnet 远程会话
│   └── rate-limit.mjs        # 请求限流引擎
├── agent/
│   ├── 门店现场采集代理.ps1   # Windows 门店采集
│   └── linux-monitor.sh      # Linux 服务器监控 Agent
├── vendor/
│   └── lucide.min.js         # 图标库本地化
└── scripts/
    ├── smoke-test.mjs        # 37 项冒烟测试
    └── build-portable.ps1    # 便携打包
```

---

## 📃 License

MIT
