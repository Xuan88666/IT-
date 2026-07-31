# GitHub 仓库创建和推送指南

按照以下步骤将项目推送到 GitHub。

---

## 📝 第一步：在 GitHub 创建仓库

### 1. 登录 GitHub

访问 [https://github.com](https://github.com) 并登录你的账户。

### 2. 创建新仓库

1. 点击右上角的 **+** 号
2. 选择 **New repository**
3. 填写仓库信息：

   | 字段 | 建议值 |
   |------|--------|
   | **Repository name** | `it-ops-toolbox` 或 `IT运维百宝箱` |
   | **Description** | `企业级一体化运维管理平台 - Docker部署、AI排障、服务器监控、远程会话` |
   | **Public/Private** | 根据需要选择（推荐 Public） |
   | **Initialize repository** | ❌ **不要勾选** 任何初始化选项 |

4. 点击 **Create repository**

### 3. 记录仓库地址

创建完成后，GitHub 会显示仓库地址，例如：

```
https://github.com/你的用户名/it-ops-toolbox.git
```

**记下这个地址，下一步会用到。**

---

## 💻 第二步：推送代码到 GitHub

### 方式 A：Windows PowerShell（推荐）

在项目目录打开 PowerShell，执行以下命令：

```powershell
# 1. 配置 Git 用户信息（如果还没配置）
git config --global user.name "你的名字"
git config --global user.email "你的邮箱@example.com"

# 2. 添加远程仓库（替换为你的仓库地址）
git remote remove origin 2>$null  # 移除旧的 origin（如果存在）
git remote add origin https://github.com/你的用户名/it-ops-toolbox.git

# 3. 添加所有文件到 Git
git add .

# 4. 提交更改
git commit -m "feat: 初始提交 - 优化后的运维百宝箱

- 添加 GitHub Actions CI/CD 工作流
- 优化 Docker 配置（多架构支持、安全加固）
- 添加完整的部署文档（Docker、宝塔、裸机）
- 添加贡献指南和安全策略
- 优化 .gitignore 和 .dockerignore"

# 5. 推送到 GitHub
git branch -M main
git push -u origin main
```

### 方式 B：使用 Git Bash

```bash
# 1. 配置 Git 用户信息
git config --global user.name "你的名字"
git config --global user.email "你的邮箱@example.com"

# 2. 添加远程仓库
git remote remove origin 2>/dev/null
git remote add origin https://github.com/你的用户名/it-ops-toolbox.git

# 3. 添加、提交、推送
git add .
git commit -m "feat: 初始提交 - 优化后的运维百宝箱"
git branch -M main
git push -u origin main
```

### 遇到认证问题？

如果推送时提示输入用户名密码，但密码验证失败，请使用 **Personal Access Token**：

1. 访问 [https://github.com/settings/tokens](https://github.com/settings/tokens)
2. 点击 **Generate new token** → **Generate new token (classic)**
3. 设置：
   - Note: `IT运维百宝箱部署`
   - Expiration: `No expiration`（或自定义）
   - 勾选权限：`repo`（所有）
4. 点击 **Generate token**
5. **复制生成的 token**（只显示一次）
6. 推送时：
   - Username: 你的 GitHub 用户名
   - Password: 刚才复制的 token

---

## 🔧 第三步：验证推送成功

1. 刷新你的 GitHub 仓库页面
2. 应该能看到所有文件已上传
3. README.md 会自动显示在仓库首页

---

## 📋 第四步：配置 GitHub Actions（可选）

推送成功后，GitHub Actions 会自动运行：

1. 进入仓库页面
2. 点击 **Actions** 标签
3. 查看工作流运行状态：
   - **Tests** - 代码测试
   - **Docker Build and Push** - Docker 镜像构建

如果测试失败，查看详细日志进行修复。

---

## 🎯 下一步：部署到服务器

代码推送成功后，参考以下文档部署到服务器：

### 宝塔面板部署（你选择的方式）

详细步骤请查看：**[docs/BAOTA_DEPLOY.md](docs/BAOTA_DEPLOY.md)**

快速步骤：

```bash
# 在服务器上执行
cd /www/wwwroot
git clone https://github.com/你的用户名/it-ops-toolbox.git
cd it-ops-toolbox
chmod +x scripts/deploy-baota.sh
./scripts/deploy-baota.sh
```

然后在宝塔面板中创建 Node.js 项目。

### Docker 部署

```bash
# 在服务器上执行
git clone https://github.com/你的用户名/it-ops-toolbox.git
cd it-ops-toolbox
cp .env.example .env
nano .env  # 配置环境变量
docker compose up -d
```

详细步骤请查看：**[DEPLOY.md](DEPLOY.md)**

---

## 🔗 配置仓库设置（可选）

### 1. 添加仓库主题

仓库页面 → **Settings** → **Topics**

添加标签：
```
nodejs, docker, devops, monitoring, network-tools, ai, it-operations
```

### 2. 设置仓库描述

在仓库首页点击 ⚙️ 图标，设置：
- Description: `企业级一体化运维管理平台 - Docker部署、AI排障、服务器监控、远程会话`
- Website: 你的演示站点地址（如果有）

### 3. 添加 GitHub Pages（可选）

如果想托管文档：

1. **Settings** → **Pages**
2. Source: `Deploy from a branch`
3. Branch: `main` → `/docs`
4. 点击 **Save**

### 4. 配置分支保护（推荐）

**Settings** → **Branches** → **Add rule**

- Branch name pattern: `main`
- 勾选：
  - ✅ Require a pull request before merging
  - ✅ Require status checks to pass before merging

---

## 📊 后续更新代码

本地修改后推送更新：

```bash
# 1. 查看修改
git status

# 2. 添加修改
git add .

# 3. 提交
git commit -m "feat: 添加新功能描述"

# 4. 推送
git push origin main
```

---

## ❓ 常见问题

### 1. git 命令找不到

**Windows:**
下载并安装 [Git for Windows](https://git-scm.com/download/win)

**检查安装：**
```powershell
git --version
```

### 2. 推送被拒绝（rejected）

```bash
# 拉取远程更改后再推送
git pull origin main --rebase
git push origin main
```

### 3. 文件太大无法推送

GitHub 单文件限制 100MB。检查并移除大文件：

```bash
# 查找大文件
find . -type f -size +50M

# 从 Git 历史中移除
git rm --cached 大文件路径
echo "大文件路径" >> .gitignore
git commit -m "chore: 移除大文件"
```

### 4. 忘记添加 .env 到 .gitignore

如果不小心提交了 .env：

```bash
# 从 Git 中移除但保留本地文件
git rm --cached .env
git commit -m "chore: 移除敏感文件 .env"
git push origin main

# 然后修改所有密钥！（已泄露）
```

### 5. 中文文件名显示乱码

```bash
git config --global core.quotepath false
```

---

## 🎉 完成！

代码已成功推送到 GitHub！

**接下来：**

1. ⭐ **Star** 自己的仓库（可选）
2. 📖 阅读 [docs/BAOTA_DEPLOY.md](docs/BAOTA_DEPLOY.md) 部署到服务器
3. 🔧 配置宝塔面板 Node.js 项目
4. 🌐 通过浏览器访问应用

---

**需要帮助？** 查看 [DEPLOY.md](DEPLOY.md) 或提交 Issue。
