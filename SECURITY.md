# Security Policy

## 支持的版本

我们为以下版本提供安全更新：

| 版本 | 支持状态 |
| --- | --- |
| 0.1.x | :white_check_mark: |

## 报告漏洞

如果您发现安全漏洞，请**不要**公开提交 Issue。

请通过以下方式私密报告：

1. **邮件**: 发送到 security@your-domain.com
2. **GitHub Security Advisory**: 使用 GitHub 的私密漏洞报告功能

### 报告内容应包括：

- 漏洞描述
- 复现步骤
- 影响范围
- 可能的修复建议（可选）

### 响应时间承诺：

- **24小时内**: 确认收到报告
- **7天内**: 提供初步评估
- **30天内**: 发布修复补丁（视严重程度而定）

## 安全最佳实践

### 部署前

1. **强密码策略**
   ```bash
   # 生成强随机密钥
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **环境变量保护**
   - 绝不提交 `.env` 文件到代码仓库
   - 使用环境变量管理工具（如 Docker Secrets、Kubernetes Secrets）
   - 定期轮换 API 密钥和数据库密码

3. **网络隔离**
   - MySQL 不对外暴露（仅容器内部或 127.0.0.1）
   - 使用防火墙限制访问端口
   - 配置 CORS 白名单：`CORS_ORIGINS=https://ops.example.com`

### 生产环境

1. **HTTPS 强制**
   ```nginx
   # Nginx 配置
   server {
       listen 80;
       return 301 https://$host$request_uri;
   }
   ```

2. **安全响应头**
   ```nginx
   add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
   add_header X-Content-Type-Options nosniff;
   add_header X-Frame-Options SAMEORIGIN;
   add_header X-XSS-Protection "1; mode=block";
   add_header Content-Security-Policy "default-src 'self'";
   ```

3. **定期更新**
   ```bash
   # 检查依赖漏洞
   npm audit
   npm audit fix
   
   # Docker 镜像更新
   docker compose pull
   docker compose up -d
   ```

4. **日志监控**
   - 启用审计日志：`auditLogging: true`
   - 定期审查异常登录尝试
   - 设置日志保留策略

5. **备份策略**
   ```bash
   # 每日自动备份
   0 2 * * * /path/to/backup.sh
   ```

### 已知安全措施

本项目已实施：

- ✅ bcrypt 密码哈希（12轮）
- ✅ JWT Token 认证
- ✅ RBAC 权限控制
- ✅ SQL 参数化查询（防注入）
- ✅ 命令参数转义（防命令注入）
- ✅ 请求速率限制
- ✅ HTTP-only Cookie
- ✅ HMAC 验证码哈希
- ✅ 文件上传大小限制
- ✅ 静态文件白名单
- ✅ gzip 压缩 + ETag 缓存
- ✅ 敏感信息脱敏（日志、导出）
- ✅ 原子文件写入（防并发损坏）

### 禁止的操作

⚠️ **警告**：以下操作会严重降低安全性

- 禁用 HTTPS
- 使用弱密码或默认密码
- 暴露 MySQL 到公网
- 跳过权限校验
- 在日志中记录密码
- 禁用速率限制
- 使用 `--no-verify` 跳过钩子

## 已修复的漏洞

### 2024年

- 暂无公开漏洞

## 致谢

感谢负责任地披露安全问题的研究人员。
