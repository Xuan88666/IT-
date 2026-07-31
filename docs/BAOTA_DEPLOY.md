# 宝塔面板部署指南

本指南帮助你在宝塔面板上快速部署 IT 运维百宝箱。

---

## 📋 准备工作

### 1. 环境要求

- **操作系统**: CentOS 7+, Ubuntu 18.04+, Debian 9+
- **宝塔面板**: 7.4.0+
- **Node.js**: 20.0.0+（通过宝塔软件商店安装）
- **MySQL**: 8.0+（可选，通过宝塔软件商店安装）
- **内存**: 至少 2GB
- **磁盘**: 至少 10GB 可用空间

### 2. 安装宝塔面板

如果还没有安装宝塔：

```bash
# CentOS
yum install -y wget && wget -O install.sh http://download.bt.cn/install/install_6.0.sh && sh install.sh

# Ubuntu/Debian
wget -O install.sh http://download.bt.cn/install/install-ubuntu_6.0.sh && sudo bash install.sh
```

安装完成后，记录面板地址、用户名和密码。

---

## 🚀 部署步骤

### 第一步：安装必需软件

1. 登录宝塔面板（`http://你的服务器IP:8888`）
2. 进入 **软件商店**
3. 安装以下软件：
   - **Node 版本管理器** - 安装后选择 Node.js 20.x
   - **MySQL 8.0** - 用于数据存储（可选）
   - **Nginx** - 用于反向代理（推荐）
   - **PM2 管理器** - Node.js 进程管理（自动安装）

### 第二步：创建数据库（可选）

如果使用 MySQL：

1. 进入宝塔 → **数据库**
2. 点击 **添加数据库**
3. 配置：
   - 数据库名：`ops_box`
   - 用户名：`ops_box_user`（自动生成）
   - 密码：点击生成强密码
   - 访问权限：**本地服务器**（不要选择所有人）
   - 字符集：**utf8mb4**
4. 点击 **提交**
5. **记录数据库名、用户名和密码**

### 第三步：上传项目代码

#### 方式A：Git 克隆（推荐）

1. 在宝塔面板中打开 **终端**
2. 执行：

```bash
cd /www/wwwroot
git clone https://github.com/你的用户名/it-ops-toolbox.git
cd it-ops-toolbox
```

#### 方式B：文件上传

1. 在本地打包项目：
   ```bash
   # 在本地执行
   tar -czf it-ops-toolbox.tar.gz --exclude=node_modules --exclude=.git --exclude=data --exclude=release .
   ```
2. 使用宝塔 **文件管理器** 上传到 `/www/wwwroot/`
3. 解压：右键 → 解压 → 选择解压到 `it-ops-toolbox` 目录

### 第四步：创建 Node.js 项目

1. 进入宝塔 → **网站** → **Node项目**
2. 点击 **添加Node项目**
3. 配置如下：

   | 配置项 | 值 |
   |--------|-----|
   | 项目名称 | IT运维百宝箱 |
   | 项目路径 | `/www/wwwroot/it-ops-toolbox` |
   | 运行目录 | `/www/wwwroot/it-ops-toolbox` |
   | 启动文件 | `server.js` |
   | Node版本 | 20.x |
   | 运行端口 | 3000 |
   | 启动方式 | PM2 |

4. 点击 **提交**

### 第五步：配置环境变量

有两种方式配置：

#### 方式A：通过宝塔界面（推荐）

1. 在 Node 项目列表中，点击项目的 **设置**
2. 找到 **环境变量** 标签
3. 添加以下变量：

```
PORT=3000
NODE_ENV=production
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=ops_box_user
MYSQL_PASS=你的数据库密码
MYSQL_DB=ops_box
JWT_SECRET=生成的随机密钥（见下方）
EMAIL_HOST=smtp.qq.com
EMAIL_PORT=465
EMAIL_USER=your-email@qq.com
EMAIL_PASS=QQ邮箱授权码
EMAIL_FROM=运维百宝箱<your-email@qq.com>
```

#### 方式B：创建 .env 文件

1. 在宝塔文件管理器中，进入 `/www/wwwroot/it-ops-toolbox`
2. 创建新文件 `.env`
3. 复制 `.env.example` 的内容并修改

**生成 JWT_SECRET：**

在宝塔终端执行：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

将输出的字符串作为 `JWT_SECRET` 的值。

**获取 QQ 邮箱授权码：**

1. 登录 QQ 邮箱网页版
2. 设置 → 账户 → POP3/IMAP/SMTP/Exchange/CardDAV/CalDAV服务
3. 开启 POP3/SMTP 服务
4. 生成授权码（不是 QQ 密码）

### 第六步：安装依赖

在宝塔终端执行：

```bash
cd /www/wwwroot/it-ops-toolbox
npm install --production
```

或者使用部署脚本：

```bash
chmod +x scripts/deploy-baota.sh
./scripts/deploy-baota.sh
```

### 第七步：导入数据库

如果配置了 MySQL：

```bash
cd /www/wwwroot/it-ops-toolbox
mysql -h 127.0.0.1 -u ops_box_user -p ops_box < init.sql
# 输入数据库密码
```

### 第八步：启动应用

1. 回到宝塔 → **网站** → **Node项目**
2. 找到 IT运维百宝箱 项目
3. 点击 **启动** 按钮
4. 查看状态是否为 **运行中**

如果启动失败：
- 点击 **日志** 查看错误信息
- 检查环境变量是否配置正确
- 检查端口 3000 是否被占用

### 第九步：配置防火墙

开放必要端口：

1. 宝塔 → **安全**
2. 添加规则：
   - 端口：`3000`
   - 备注：`IT运维百宝箱`
   - 点击 **放行**

**如果使用阿里云/腾讯云：**

还需在云服务商的安全组中开放 3000 端口：
- 登录云服务商控制台
- 找到你的服务器实例
- 安全组 → 添加规则
- 类型：自定义TCP，端口：3000，来源：0.0.0.0/0

### 第十步：配置 Nginx 反向代理（推荐）

#### 为什么需要反向代理？

- 使用标准 80/443 端口
- 配置 HTTPS（SSL）
- 更好的性能和安全性
- 支持域名访问

#### 配置步骤

1. 在宝塔 → **网站** → 点击 **添加站点**
2. 配置：
   - 域名：`ops.yourdomain.com`（或直接填 IP）
   - 根目录：随意（不使用）
   - PHP版本：**纯静态**
3. 点击 **提交**

4. 点击刚创建的网站 → **设置**

5. 找到 **反向代理** 标签 → **添加反向代理**
   - 代理名称：`IT运维百宝箱`
   - 目标URL：`http://127.0.0.1:3000`
   - 发送域名：`$host`
   - 点击 **提交**

6. 点击 **配置文件** 标签，替换为以下内容：

```nginx
upstream opsbox_backend {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 80;
    server_name ops.yourdomain.com;  # 修改为你的域名或服务器IP

    # 安全头
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy same-origin;

    # 日志
    access_log /www/wwwlogs/opsbox_access.log;
    error_log /www/wwwlogs/opsbox_error.log;

    # 客户端最大上传
    client_max_body_size 50m;

    # gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/javascript image/svg+xml;
    gzip_min_length 1024;

    # API 请求
    location /api/ {
        proxy_pass http://opsbox_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_buffering off;
    }

    # WebSocket（远程终端）
    location ~ ^/api/(remote|serial)/ {
        proxy_pass http://opsbox_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
    }

    # 前端静态资源
    location / {
        proxy_pass http://opsbox_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

7. 点击 **保存**

8. 测试配置：在宝塔终端执行
   ```bash
   nginx -t
   ```

9. 重载 Nginx：
   ```bash
   nginx -s reload
   ```

#### 配置 HTTPS（可选但推荐）

1. 在网站设置中找到 **SSL** 标签
2. 选择 **Let's Encrypt** 免费证书
3. 填写邮箱，点击 **申请**
4. 开启 **强制HTTPS**

---

## 🔍 验证部署

### 1. 检查服务状态

```bash
# 查看 PM2 进程
pm2 list

# 查看日志
pm2 logs it-ops-toolbox

# 或在宝塔界面查看
# 网站 → Node项目 → 日志
```

### 2. 访问应用

**直接访问：**
```
http://你的服务器IP:3000
```

**通过 Nginx：**
```
http://ops.yourdomain.com
或
https://ops.yourdomain.com（配置SSL后）
```

### 3. 健康检查

```bash
curl http://127.0.0.1:3000/api/health
```

应返回：
```json
{"status":"ok"}
```

---

## 🛠️ 日常运维

### 查看日志

```bash
# PM2 日志
pm2 logs it-ops-toolbox

# 或查看文件
tail -f /www/wwwroot/it-ops-toolbox/logs/error.log
tail -f /www/wwwroot/it-ops-toolbox/logs/out.log
```

### 重启应用

```bash
# 方式1：宝塔界面
# 网站 → Node项目 → 重启

# 方式2：命令行
pm2 restart it-ops-toolbox
```

### 停止应用

```bash
pm2 stop it-ops-toolbox
```

### 更新代码

```bash
cd /www/wwwroot/it-ops-toolbox
git pull origin main
npm install --production
pm2 restart it-ops-toolbox
```

### 备份数据

```bash
# 备份数据目录
tar -czf /www/backup/opsbox-data-$(date +%Y%m%d).tar.gz /www/wwwroot/it-ops-toolbox/data

# 备份数据库
mysqldump -u ops_box_user -p ops_box > /www/backup/opsbox-db-$(date +%Y%m%d).sql
```

### 设置自动启动

宝塔的 PM2 会在系统重启后自动启动应用，无需额外配置。

验证：
```bash
pm2 startup
pm2 save
```

---

## ❗ 常见问题

### 1. 启动失败：端口被占用

```bash
# 查找占用 3000 端口的进程
lsof -i :3000

# 杀死进程
kill -9 PID

# 或修改 .env 中的 PORT 为其他端口
```

### 2. 无法连接数据库

检查：
- MySQL 是否启动：`systemctl status mysql`
- 用户名密码是否正确
- 数据库是否存在：`mysql -u root -p -e "SHOW DATABASES;"`
- 防火墙是否阻止：确保 MySQL 监听 127.0.0.1

### 3. 邮件验证码发送失败

检查：
- `EMAIL_PASS` 使用授权码，不是QQ密码
- 服务器是否开放出站 465 端口
- 云服务商是否封禁 25 端口（使用 465 可避免）

### 4. 访问 403/404

检查：
- Nginx 配置是否正确
- 反向代理目标是否为 `http://127.0.0.1:3000`
- Node 应用是否正常运行

### 5. WebSocket 连接失败（SSH/Telnet 不可用）

确保 Nginx 配置包含 WebSocket 支持：
```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

### 6. 内存不足

如果服务器内存小于 2GB：
```bash
# 减少 PM2 实例数量
pm2 delete it-ops-toolbox
pm2 start server.js --name it-ops-toolbox -i 1
```

或添加 swap：
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 🔒 安全建议

1. **修改 SSH 端口**：默认 22 端口易被扫描
2. **配置防火墙**：仅开放必要端口（22, 80, 443, 3000）
3. **强密码**：数据库、宝塔、系统账户使用复杂密码
4. **定期更新**：`yum update` 或 `apt update && apt upgrade`
5. **启用 HTTPS**：使用 Let's Encrypt 免费证书
6. **限制 IP**：如果是内网使用，在安全组限制访问IP
7. **定期备份**：设置宝塔计划任务自动备份

---

## 📞 获取帮助

遇到问题？

1. 查看日志：`pm2 logs it-ops-toolbox`
2. 查看 [DEPLOY.md](DEPLOY.md) 通用部署文档
3. 查看 [GitHub Issues](https://github.com/your-username/it-ops-toolbox/issues)

---

**部署完成后，首次访问会提示创建管理员账户。请妥善保管登录凭据！**
