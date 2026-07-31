# ============================================================
# IT 运维百宝箱 - Docker 多阶段构建
# 支持多架构：linux/amd64, linux/arm64
# ============================================================
# 构建阶段
FROM node:20-alpine AS builder

# 安全：创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# 安装构建依赖
RUN apk add --no-cache python3 make g++ git

WORKDIR /app

# 先装依赖（缓存层）
COPY --chown=nodejs:nodejs package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund && \
    npm rebuild bcrypt && \
    npm rebuild

# 复制源码
COPY --chown=nodejs:nodejs . .

# Vite 构建（CSS 压缩）
RUN npx vite build 2>/dev/null || true

# ============================================================
# 运行阶段
FROM node:20-alpine

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# 安装运行时依赖
RUN apk add --no-cache tini dumb-init curl ca-certificates && \
    rm -rf /var/cache/apk/*

WORKDIR /app

# 复制编译后的 node_modules
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# 复制运行时核心文件
COPY --from=builder --chown=nodejs:nodejs /app/server.mjs ./server.mjs
COPY --from=builder --chown=nodejs:nodejs /app/server.js ./server.js
COPY --from=builder --chown=nodejs:nodejs /app/app.js ./app.js
COPY --from=builder --chown=nodejs:nodejs /app/index.html ./index.html
COPY --from=builder --chown=nodejs:nodejs /app/toolkit.css ./toolkit.css
COPY --from=builder --chown=nodejs:nodejs /app/bento.css ./bento.css
COPY --from=builder --chown=nodejs:nodejs /app/version-update.css ./version-update.css
COPY --from=builder --chown=nodejs:nodejs /app/version-update.js ./version-update.js
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./package.json

# 子模块
COPY --from=builder --chown=nodejs:nodejs /app/server/ ./server/
COPY --from=builder --chown=nodejs:nodejs /app/vendor/ ./vendor/
COPY --from=builder --chown=nodejs:nodejs /app/agent/ ./agent/
COPY --from=builder --chown=nodejs:nodejs /app/data/knowledge-seed.json ./data/knowledge-seed.json 2>/dev/null || true

# Vite 构建产物（CSS hash）
COPY --from=builder --chown=nodejs:nodejs /app/dist/ ./dist/ 2>/dev/null || true

# 部署脚本
COPY --from=builder --chown=nodejs:nodejs /app/deploy/ ./deploy/
RUN chmod +x ./deploy/entrypoint.sh

# 目录准备（确保 nodejs 用户有写权限）
RUN mkdir -p /app/data /app/data/ai-sessions /app/data/evidence /app/data/ocr-cache && \
    chown -R nodejs:nodejs /app/data

# 切换到非 root 用户
USER nodejs

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -sf http://127.0.0.1:3000/api/health > /dev/null || exit 1

EXPOSE 3000

ENV NODE_ENV=production

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
