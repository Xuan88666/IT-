@echo off
chcp 65001 >nul
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo   IT 运维百宝箱 - 推送到 GitHub
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

:: 检查 Git
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 错误: 未找到 Git，请先安装 Git for Windows
    echo 下载地址: https://git-scm.com/download/win
    pause
    exit /b 1
)

echo ✓ Git 已安装
echo.

:: 获取仓库地址
set /p REPO_URL="请输入你的 GitHub 仓库地址（例如 https://github.com/username/it-ops-toolbox.git）: "

if "%REPO_URL%"=="" (
    echo ❌ 错误: 仓库地址不能为空
    pause
    exit /b 1
)

echo.
echo 📝 配置 Git 远程仓库...
git remote remove origin 2>nul
git remote add origin %REPO_URL%

echo.
echo 📦 添加文件到 Git...
git add .

echo.
echo 💾 提交更改...
git commit -m "feat: 初始提交 - 优化后的运维百宝箱

- 添加 GitHub Actions CI/CD 工作流
- 优化 Docker 配置（多架构支持、安全加固）
- 添加完整的部署文档（Docker、宝塔、裸机）
- 添加贡献指南和安全策略
- 优化 .gitignore 和 .dockerignore
- 添加 PM2 配置和部署脚本"

echo.
echo 🚀 推送到 GitHub...
git branch -M main
git push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    echo   ✅ 成功推送到 GitHub！
    echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    echo.
    echo 🌐 访问你的仓库: %REPO_URL:~0,-4%
    echo.
    echo 📋 下一步：
    echo    1. 查看 docs\GITHUB_SETUP.md 了解更多配置
    echo    2. 查看 docs\BAOTA_DEPLOY.md 开始部署到服务器
    echo.
) else (
    echo.
    echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    echo   ❌ 推送失败
    echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    echo.
    echo 可能的原因：
    echo    1. 网络连接问题
    echo    2. 认证失败 - 需要使用 Personal Access Token
    echo    3. 仓库地址错误
    echo.
    echo 解决方案：
    echo    1. 检查网络连接
    echo    2. 生成 Token: https://github.com/settings/tokens
    echo    3. 推送时用 Token 代替密码
    echo.
    echo 查看详细指南: docs\GITHUB_SETUP.md
    echo.
)

pause
