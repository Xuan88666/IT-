@echo off
chcp 65001 >nul
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo   推送代码到 GitHub
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo 仓库地址: https://github.com/Xuan88666/it-ops-toolbox
echo.
echo 即将推送代码...
echo.

cd /d "%~dp0"
git push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    echo   ✅ 推送成功！
    echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    echo.
    echo 🌐 访问你的仓库: https://github.com/Xuan88666/it-ops-toolbox
    echo.
    echo 📋 下一步：部署到服务器
    echo    查看文档: docs\BAOTA_DEPLOY.md
    echo.
) else (
    echo.
    echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    echo   ❌ 推送失败
    echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    echo.
    echo 如果提示需要密码，请使用 Personal Access Token：
    echo.
    echo 1. 访问: https://github.com/settings/tokens
    echo 2. 点击 "Generate new token" → "Generate new token (classic)"
    echo 3. 勾选 "repo" 权限
    echo 4. 生成并复制 Token
    echo 5. 再次运行此脚本，密码处粘贴 Token
    echo.
)

pause
