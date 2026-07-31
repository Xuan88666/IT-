# 🚀 快速开始 - 推送到 GitHub 和部署指南

---

## 📝 第一步：在 GitHub 创建仓库（5分钟）

### 操作步骤：

1. 打开浏览器，访问 [https://github.com/new](https://github.com/new)
2. 填写信息：
   - **Repository name**: `it-ops-toolbox`
   - **Description**: `企业级一体化运维管理平台 - Docker部署、AI排障、服务器监控、远程会话`
   - **Public** 或 **Private**: 根据需要选择
   - **❌ 不要勾选** "Add a README file"
   - **❌ 不要勾选** "Add .gitignore"
   - **❌ 不要勾选** "Choose a license"
3. 点击 **Create repository**
4. **记录仓库地址**，例如：
   ```
   https://github.com/你的用户名/it-ops-toolbox.git
   ```

---

## 💻 第二步：推送代码到 GitHub（2分钟）

### 方式 A：使用自动化脚本（推荐）

**Windows 用户：**
1. 双击运行 `scripts\push-to-github.cmd`
2. 输入刚才创建的仓库地址
3. 按提示完成推送

**Linux/Mac 用户：**
```bash
chmod +x scripts/push-to-github.sh
./scripts/push-to-github.sh
```

### 方式 B：手动执行（如果脚本失败）

打开终端（PowerShell/CMD/终端），在项目目录执行：

```powershell
# Windows PowerShell
git config --global user.name "你的名字"
git config --global user.email "你的邮箱"
git remote add origin https://github.com/你的用户名/it-ops-toolbox.git
git add .
git commit -m "feat: 初始提交 - 优化后的运维百宝箱"
git branch -M main
git push -u origin main
```

**如果遇到认证问题：**
- 访问 [https://github.com/settings/tokens](https://github.com/settings/tokens)
- 生成 Personal Access Token
- 推送时使用 Token 作为密码

---

## 🎯 第三步：部署到服务器

你选择的部署方式是：**宝塔面板 + Node.js**

### 3.1 服务器准备

SSH 连接到你的服务器：

```bash
ssh root@你的服务器IP
```

### 3.2 克隆代码

```bash
cd /www/wwwroot
git clone https://github.com/你的用户名/it-ops-toolbox.git
cd it-ops-toolbox
```

### 3.3 运行部署脚本

```bash
chmod +x scripts/deploy-baota.sh
./scripts/deploy-baota.sh
```

脚本会自动：
- ✅ 检查 Node.js 环境
- ✅ 安装依赖
- ✅ 创建 .env 配置文件
- ✅ 生成随机 JWT_SECRET
- ✅ 提示配置数据库

### 3.4 配置环境变量

编辑 `.env` 文件：

```bash
nano .env
```

**必须配置的项目：**

```env
# 数据库配置（如果使用 MySQL）
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=ops_box_user
MYSQL_PASS=你在宝塔创建的数据库密码
MYSQL_DB=ops_box

# JWT 密钥（已自动生成，无需修改）
JWT_SECRET=自动生成的随机密钥

# 邮件配置
EMAIL_HOST=smtp.qq.com
EMAIL_PORT=465
EMAIL_USER=your-email@qq.com
EMAIL_PASS=QQ邮箱授权码
EMAIL_FROM=运维百宝箱<your-email@qq.com>
```

保存：`Ctrl+X` → `Y` → `Enter`

### 3.5 导入数据库（如果使用 MySQL）

```bash
mysql -h 127.0.0.1 -u ops_box_user -p ops_box < init.sql
# 输入数据库密码
```

### 3.6 在宝塔面板创建 Node.js 项目

1. 登录宝塔面板：`http://你的服务器IP:8888`
2. 进入 **网站** → **Node项目**
3. 点击 **添加Node项目**
4. 填写：
   - 项目名称：`IT运维百宝箱`
   - 项目路径：`/www/wwwroot/it-ops-toolbox`
   - 启动文件：`server.js`
   - Node版本：`20.x`
   - 运行端口：`3000`
5. 点击 **提交**
6. 点击 **启动**

### 3.7 配置防火墙

**宝塔防火墙：**
1. 宝塔面板 → **安全**
2. 添加规则：端口 `3000`，备注 `IT运维百宝箱`

**云服务商安全组：**
- 登录阿里云/腾讯云控制台
- 找到服务器 → 安全组
- 添加入站规则：TCP 3000 端口

### 3.8 访问应用

打开浏览器：

```
http://你的服务器IP:3000
```

首次访问会提示创建管理员账户。

---

## 🌐 第四步：配置域名和 HTTPS（可选）

### 4.1 添加网站

1. 宝塔 → **网站** → **添加站点**
2. 域名：`ops.yourdomain.com`
3. PHP版本：**纯静态**

### 4.2 配置反向代理

1. 点击网站 → **设置** → **反向代理**
2. 添加反向代理：
   - 目标URL：`http://127.0.0.1:3000`
   - 启用 WebSocket 支持

3. 或者手动配置：点击 **配置文件**，参考 `deploy/nginx.conf`

### 4.3 申请 SSL 证书

1. 网站设置 → **SSL**
2. 选择 **Let's Encrypt**
3. 申请免费证书
4. 开启 **强制 HTTPS**

现在可以通过 HTTPS 访问：

```
https://ops.yourdomain.com
```

---

## 📊 验证部署成功

### 检查服务状态

```bash
# 查看 PM2 进程
pm2 list

# 查看日志
pm2 logs it-ops-toolbox

# 健康检查
curl http://127.0.0.1:3000/api/health
```

应返回：
```json
{"status":"ok"}
```

---

## 📚 完整文档索引

| 文档 | 说明 | 路径 |
|------|------|------|
| 📖 README | 项目介绍和功能列表 | `README.md` |
| 🚀 通用部署指南 | Docker/宝塔/裸机部署 | `DEPLOY.md` |
| 🏗️ 宝塔详细部署 | 宝塔面板完整步骤 | `docs/BAOTA_DEPLOY.md` |
| 🔧 GitHub 设置 | 仓库创建和配置 | `docs/GITHUB_SETUP.md` |
| 📊 优化总结 | 本次优化详情 | `docs/OPTIMIZATION_SUMMARY.md` |
| 🤝 贡献指南 | 如何参与开发 | `CONTRIBUTING.md` |
| 🔒 安全策略 | 安全实践和漏洞报告 | `SECURITY.md` |

---

## 🆘 遇到问题？

### 常见问题

1. **Git 推送失败**
   - 检查网络连接
   - 使用 Personal Access Token
   - 查看 `docs/GITHUB_SETUP.md`

2. **Node.js 启动失败**
   - 查看日志：`pm2 logs it-ops-toolbox`
   - 检查环境变量配置
   - 查看 `docs/BAOTA_DEPLOY.md` 常见问题部分

3. **数据库连接失败**
   - 检查 MySQL 是否启动
   - 验证用户名密码
   - 确认数据库已创建

4. **邮件发送失败**
   - 使用 QQ 邮箱授权码（不是密码）
   - 检查服务器 465 端口是否开放

### 获取帮助

- 📖 查看完整文档
- 🐛 提交 GitHub Issue
- 💬 查看项目 Discussions

---

## ✅ 完成清单

部署完成后，确认以下项目：

- [ ] 代码已推送到 GitHub
- [ ] GitHub Actions 工作流运行正常
- [ ] 服务器可以访问应用（HTTP）
- [ ] 数据库连接正常
- [ ] 邮件发送功能正常
- [ ] 创建了管理员账户
- [ ] 配置了域名和 HTTPS（可选）
- [ ] 设置了数据备份计划

---

## 🎉 恭喜！

你的 IT 运维百宝箱已成功部署！

**立即体验以下功能：**
- 🖥️ 服务器监控仪表盘
- 🤖 AI 智能排障
- 🔧 34+ 网络诊断工具
- 📱 SSH/Telnet 远程终端
- 📦 资产和工单管理

**接下来：**
1. 邀请团队成员注册账号
2. 添加服务器监控
3. 配置 AI Provider（OpenAI/DeepSeek）
4. 探索各项功能

---

**文档更新**: 2026-07-31  
**需要帮助**: 查看 `DEPLOY.md` 或提交 Issue
