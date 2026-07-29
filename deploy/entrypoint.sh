#!/bin/sh
# ============================================================
# IT 运维百宝箱 - Docker 入口脚本
# ============================================================
set -e

DATA_DIR="${IT_OPS_TOOLBOX_DATA_DIR:-/app/data}"

# 确保数据目录存在
mkdir -p "$DATA_DIR/ai-sessions" "$DATA_DIR/evidence" "$DATA_DIR/ocr-cache"

# 如果没有 .env 文件且环境变量没配全，给提示
if [ ! -f /app/.env ] && [ -z "$JWT_SECRET" ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  ⚠  JWT_SECRET 未配置，使用随机密钥"
    echo "  生产环境请在 docker-compose.yml 中设置"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
fi

# 启动服务
exec node /app/server.js
