# 部署指南

## 📋 目录

- [Docker 部署（推荐）](#docker-部署推荐)
- [宝塔面板部署](#宝塔面板部署)
- [裸机部署](#裸机部署)
- [环境变量配置](#环境变量配置)
- [常见问题](#常见问题)

---

## 🐳 Docker 部署（推荐）

### 前置要求

- Docker 20.10+
- Docker Compose V2

### 快速启动

```bash
# 1. 克隆项目
git clone https://github.com/your-username/it-ops-toolbox.git
cd it-ops-toolbox

# 2. 配置环境变量
cp .env.example .env

# 3. 编辑 .env 文件，设置必需的密钥
nano .env
# 必须设置：JWT_SECRET, MYSQL_PASS, MYSQL_ROOT_PASS

# 4. 启动服务
docker compose up -d

# 5. 查看日志
docker compose logs -f app

# 6. 访问应用
# 浏览器打开 http://localhost:3000
```

### Docker 常用命令

```bash
# 停止服务
docker compose down

# 重启服务
docker compose restart app

# 查看服务状态
docker compose ps

# 进入容器调试
docker compose exec app sh

# 查看实时日志
docker compose logs -f app

# 重新构建镜像
docker compose build --no-cache app

# 清理并重启（保留数据）
docker compose down && docker compose up -d

# 完全清理（包括数据卷）
docker compose down -v
```

### 数据持久化

数据保存在 Docker 卷中：

- `opsbox-data`: 应用数据（资产、工单、AI会话等）
- `mysql-data`: MySQL 数据库

备份数据：

```bash
# 备份应用数据
docker run --rm -v opsbox-data:/data -v $(pwd):/backup alpine tar czf /backup/opsbox-backup.tar.gz -C /data .

# 备份 MySQL
docker compose exec mysql mysqldump -u root -p$MYSQL_ROOT_PASS ops_box > backup.sql
```

恢复数据：

```bash
# 恢复应用数据
docker run --rm -v opsbox-data:/data -v $(pwd):/backup alpine tar xzf /backup/opsbox-backup.tar.gz -C /data

# 恢复 MySQL
docker compose exec -T mysql mysql -u root -p$MYSQL_ROOT_PASS ops_box < backup.sql
```

---

## 🏗️ 宝塔面板部署

### 1. 安装环境

在宝塔面板中安装：

- **Node.js 20+**（应用管理器 → Node 版本管理器）
- **MySQL 8.0**（软件商店）
- **Nginx**（软件商店，可选，用于反向代理）

### 2. 创建数据库

1. 进入宝塔 → 数据库 → 添加数据库
2. 数据库名：`ops_box`
3. 字符集：`utf8mb4`
4. 记录数据库用户名和密码

### 3. 导入数据库结构

```bash
# SSH 连接到服务器
mysql -u 数据库用户名 -p ops_box < /path/to/init.sql
```

### 4. 创建 Node.js 项目

1. 进入宝塔 → 网站 → Node项目
2. 点击"添加Node项目"
3. 配置：
   - **项目名称**: IT运维百宝箱
   - **项目路径**: `/www/wwwroot/it-ops-toolbox`
   - **Node版本**: 20.x
   - **启动文件**: `server.js`
   - **端口**: 3000

### 5. 上传项目文件

```bash
# 使用 SFTP 或宝塔文件管理器上传项目文件到
/www/wwwroot/it-ops-toolbox/
```

### 6. 配置环境变量

在宝塔的 Node 项目设置中添加环境变量，或创建 `.env` 文件：

```bash
cd /www/wwwroot/it-ops-toolbox
nano .env
```

填写配置（参考 `.env.example`）：

```env
PORT=3000
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=数据库用户名
MYSQL_PASS=数据库密码
MYSQL_DB=ops_box
JWT_SECRET=生成一个至少32字符的随机字符串
EMAIL_HOST=smtp.qq.com
EMAIL_PORT=465
EMAIL_USER=your-email@qq.com
EMAIL_PASS=邮箱授权码
```

### 7. 安装依赖并启动

```bash
cd /www/wwwroot/it-ops-toolbox
npm install --production
```

在宝塔的 Node 项目管理中点击"启动"。

### 8. 配置 Nginx 反向代理（可选）

1. 创建网站：宝塔 → 网站 → 添加站点
   - 域名：`ops.yourdomain.com`
   - PHP版本：纯静态
2. 配置反向代理：
   - 进入网站设置 → 反向代理
   - 目标URL: `http://127.0.0.1:3000`
   - 启用 WebSocket 支持
3. 或者手动编辑配置（推荐）：

复制 `deploy/nginx.conf` 中的配置到网站配置文件。

### 9. 防火墙配置

在宝塔和云服务商控制台开放端口：

- **3000**: 应用端口（如使用Nginx反向代理可不开放）
- **80/443**: HTTP/HTTPS（Nginx）

### 10. SSL证书（可选）

在宝塔网站设置中申请并配置 Let's Encrypt 免费证书。

---

## 💻 裸机部署

### 前置要求

- Node.js 20+
- MySQL 8.0（可选，不配置则使用 JSON 文件存储）
- Git

### 部署步骤

```bash
# 1. 克隆项目
git clone https://github.com/your-username/it-ops-toolbox.git
cd it-ops-toolbox

# 2. 安装依赖
npm install --production

# 3. 配置环境变量
cp .env.example .env
nano .env

# 4. 初始化数据库（如果使用MySQL）
mysql -u root -p < init.sql

# 5. 启动应用
node server.js

# 或使用 PM2 守护进程
npm install -g pm2
pm2 start server.js --name "it-ops-toolbox"
pm2 save
pm2 startup
```

### 使用 PM2 管理

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs it-ops-toolbox

# 重启
pm2 restart it-ops-toolbox

# 停止
pm2 stop it-ops-toolbox

# 删除
pm2 delete it-ops-toolbox
```

---

## ⚙️ 环境变量配置

### 必需配置

| 变量 | 说明 | 示例 |
|------|------|------|
| `JWT_SECRET` | JWT签名密钥（至少32字符） | `your-long-random-secret-here` |
| `MYSQL_PASS` | MySQL用户密码 | `strong-password` |
| `MYSQL_ROOT_PASS` | MySQL root密码（Docker） | `strong-root-password` |

### 数据库配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MYSQL_HOST` | `127.0.0.1` | MySQL主机 |
| `MYSQL_PORT` | `3306` | MySQL端口 |
| `MYSQL_USER` | - | MySQL用户名 |
| `MYSQL_DB` | `ops_box` | 数据库名 |

### 邮件配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `EMAIL_HOST` | `smtp.qq.com` | SMTP服务器 |
| `EMAIL_PORT` | `465` | SMTP端口 |
| `EMAIL_USER` | - | 发件邮箱 |
| `EMAIL_PASS` | - | 邮箱授权码 |
| `EMAIL_FROM` | - | 发件人显示名称 |

### AI配置

```bash
# 单个Provider
OPSHUB_AI_NAME=OpenAI
OPSHUB_AI_ENDPOINT=https://api.openai.com/v1
OPSHUB_AI_API_KEY=sk-xxx
OPSHUB_AI_MODEL=gpt-4

# 或多个Provider（JSON数组）
OPSHUB_AI_PROVIDERS_JSON=[{"name":"OpenAI","endpoint":"https://api.openai.com/v1","apiKey":"sk-xxx","model":"gpt-4"},{"name":"DeepSeek","endpoint":"https://api.deepseek.com","apiKey":"sk-xxx","model":"deepseek-chat"}]
```

---

## 🔧 常见问题

### 1. 无法连接到MySQL

**症状**: `ECONNREFUSED 127.0.0.1:3306`

**解决**:
- 检查 MySQL 是否启动：`systemctl status mysql`
- 验证用户名密码是否正确
- Docker部署：确保 `MYSQL_HOST=mysql`（服务名）

### 2. JWT_SECRET 未设置

**症状**: 启动时警告或登录失败

**解决**:
```bash
# 生成随机密钥
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# 将输出的字符串设置为 JWT_SECRET
```

### 3. 邮件验证码发送失败

**症状**: 注册时收不到验证码

**解决**:
- QQ邮箱：使用授权码而非密码
- 阿里云/腾讯云：开放出站 465 端口
- 检查 SMTP 配置是否正确

### 4. Docker 容器无法启动

**症状**: `docker compose up` 失败

**解决**:
```bash
# 查看详细日志
docker compose logs app

# 检查环境变量
docker compose config

# 清理并重建
docker compose down -v
docker compose build --no-cache
docker compose up -d
```

### 5. 权限问题

**症状**: `EACCES: permission denied`

**解决**:
```bash
# Docker 数据卷权限
docker compose exec app chown -R node:node /app/data

# 裸机部署
sudo chown -R $USER:$USER /path/to/it-ops-toolbox/data
chmod -R 755 /path/to/it-ops-toolbox/data
```

### 6. 端口被占用

**症状**: `EADDRINUSE: address already in use :::3000`

**解决**:
```bash
# 查找占用进程
lsof -i :3000  # Linux/Mac
netstat -ano | findstr :3000  # Windows

# 修改端口
# 在 .env 中设置 PORT=3001
```

### 7. AI 功能不可用

**症状**: AI 对话无响应

**解决**:
- 检查 `OPSHUB_AI_*` 环境变量是否配置
- 验证 API Key 是否有效
- 检查网络连接和代理设置
- 未配置 AI 时会回退到本地规则助手

---

## 📊 健康检查

访问以下端点检查服务状态：

- **健康检查**: `http://localhost:3000/api/health`
- **应用首页**: `http://localhost:3000/`

---

## 🔄 更新升级

### Docker 部署更新

```bash
cd it-ops-toolbox
git pull origin main
docker compose build --no-cache app
docker compose up -d
```

### 裸机部署更新

```bash
cd it-ops-toolbox
git pull origin main
npm install --production
pm2 restart it-ops-toolbox
```

---

## 📞 技术支持

遇到问题？

1. 查看 [README.md](README.md) 了解项目功能
2. 查看 [GitHub Issues](https://github.com/your-username/it-ops-toolbox/issues)
3. 提交新的 Issue 描述问题
