#!/bin/bash
# ============================================================
# IT 运维百宝箱 - 自动部署脚本（宝塔面板）
# ============================================================

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  IT 运维百宝箱 - 宝塔部署脚本"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js，请先在宝塔面板安装 Node.js 20+"
    exit 1
fi

NODE_VERSION=$(node -v)
echo "✓ Node.js 版本: $NODE_VERSION"

# 检查 MySQL
if ! command -v mysql &> /dev/null; then
    echo "⚠️  警告: 未找到 MySQL 客户端，如需 MySQL 请先安装"
else
    echo "✓ MySQL 已安装"
fi

# 安装依赖
echo ""
echo "📦 安装依赖..."
npm install --production

# 检查 .env 文件
if [ ! -f .env ]; then
    echo ""
    echo "⚠️  未找到 .env 文件"
    echo "📝 从模板创建 .env..."
    cp .env.example .env

    # 生成随机 JWT_SECRET
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

    # 更新 .env 文件
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/replace_with_a_long_random_secret/$JWT_SECRET/g" .env
    else
        sed -i "s/replace_with_a_long_random_secret/$JWT_SECRET/g" .env
    fi

    echo "✓ .env 文件已创建，JWT_SECRET 已自动生成"
    echo ""
    echo "⚠️  请编辑 .env 文件，配置以下必需项："
    echo "   - MYSQL_HOST, MYSQL_USER, MYSQL_PASS, MYSQL_DB"
    echo "   - EMAIL_HOST, EMAIL_USER, EMAIL_PASS"
    echo ""
    read -p "按回车继续..."
fi

# 导入数据库（如果配置了 MySQL）
echo ""
read -p "是否需要导入数据库结构？(y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    source .env
    if [ -n "$MYSQL_USER" ] && [ -n "$MYSQL_PASS" ]; then
        echo "📊 导入数据库结构..."
        mysql -h "${MYSQL_HOST:-127.0.0.1}" -P "${MYSQL_PORT:-3306}" -u "$MYSQL_USER" -p"$MYSQL_PASS" "$MYSQL_DB" < init.sql
        echo "✓ 数据库导入完成"
    else
        echo "❌ .env 中未配置 MySQL 信息，跳过数据库导入"
    fi
fi

# 运行测试（可选）
echo ""
read -p "是否运行测试？(y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🧪 运行测试..."
    npm test || echo "⚠️  部分测试失败，但不影响部署"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ 部署准备完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📌 下一步："
echo "   1. 在宝塔 Node 项目管理中创建项目"
echo "   2. 启动文件设置为: server.js"
echo "   3. 端口设置为: 3000"
echo "   4. 添加环境变量或确保 .env 文件存在"
echo "   5. 点击启动按钮"
echo ""
echo "🌐 访问地址: http://你的服务器IP:3000"
echo ""
