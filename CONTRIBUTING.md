# 贡献指南

感谢你考虑为 IT 运维百宝箱做出贡献！

## 🎯 如何贡献

### 报告问题

发现 Bug？有功能建议？

1. 搜索 [现有 Issues](https://github.com/your-username/it-ops-toolbox/issues) 确认未被报告
2. 使用 Issue 模板创建新 Issue
3. 清晰描述问题：
   - 复现步骤
   - 期望行为
   - 实际行为
   - 环境信息（操作系统、Node版本、部署方式）
   - 错误日志或截图

### 提交代码

1. **Fork 项目**
   ```bash
   # 点击 GitHub 页面右上角的 Fork 按钮
   ```

2. **克隆你的 Fork**
   ```bash
   git clone https://github.com/your-username/it-ops-toolbox.git
   cd it-ops-toolbox
   ```

3. **创建功能分支**
   ```bash
   git checkout -b feature/your-feature-name
   # 或修复分支
   git checkout -b fix/your-bug-fix
   ```

4. **进行修改并提交**
   ```bash
   # 遵循代码规范
   git add .
   git commit -m "feat: add new network diagnostic tool"
   ```

5. **运行测试**
   ```bash
   npm run check
   ```

6. **推送到你的 Fork**
   ```bash
   git push origin feature/your-feature-name
   ```

7. **创建 Pull Request**
   - 访问你的 Fork 页面
   - 点击 "Compare & pull request"
   - 填写 PR 描述模板
   - 等待代码审查

## 📝 代码规范

### 提交消息格式

遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type 类型：**

- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `style`: 代码格式（不影响功能）
- `refactor`: 重构
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建/工具链相关

**示例：**

```bash
feat(tools): add WiFi channel analysis tool

- Implement WiFi scanning using netsh
- Add channel interference detection
- Update tools catalog

Closes #123
```

### JavaScript 代码风格

- 使用 2 空格缩进
- 使用单引号
- 末尾加分号
- 变量名使用驼峰命名
- 常量使用大写下划线
- 函数优先使用 `async/await` 而非回调

**示例：**

```javascript
// Good
async function fetchServerStatus(hostname) {
  try {
    const response = await fetch(`/api/server/${hostname}`);
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch:', error);
    return null;
  }
}

// Bad
function fetchServerStatus(hostname, callback) {
  fetch('/api/server/' + hostname).then(function(response) {
    response.json().then(function(data) {
      callback(null, data)
    })
  }).catch(function(error) {
    callback(error)
  })
}
```

### 安全注意事项

1. **永远不要提交敏感信息**
   - API 密钥
   - 密码
   - 私钥
   - `.env` 文件

2. **输入验证**
   - 验证所有用户输入
   - 使用参数化查询防 SQL 注入
   - 转义命令参数防命令注入

3. **权限检查**
   - 所有 API 端点必须校验权限
   - 前端 UI 控制仅为提示

## 🧪 测试

新功能必须包含测试：

```bash
# 运行所有测试
npm run check

# 单独运行测试
npm test
npm run test:auth-api
npm run test:rate-limit
```

添加测试用例到 `scripts/` 目录。

## 📚 文档

更新文档：

- 新功能需更新 README.md
- API 变更需更新相关文档
- 复杂逻辑添加代码注释

## 🔍 代码审查流程

PR 提交后：

1. 自动运行 CI 测试
2. 维护者审查代码
3. 可能要求修改
4. 审查通过后合并

**审查标准：**

- ✅ 代码风格一致
- ✅ 测试通过
- ✅ 无安全风险
- ✅ 文档完整
- ✅ 提交信息清晰

## 🎨 UI/UX 指南

- 保持界面简洁直观
- 遵循现有设计风格
- 移动端适配
- 支持暗色模式（未来）
- 无障碍访问

## 💡 功能建议

想要添加新功能？

1. 先开 Issue 讨论
2. 说明：
   - 功能用途
   - 使用场景
   - 实现思路
3. 等待反馈后再开始编码

## 🐛 Bug 修复优先级

- 🔴 **Critical**: 安全漏洞、数据丢失
- 🟠 **High**: 功能无法使用
- 🟡 **Medium**: 功能异常但有替代方案
- 🟢 **Low**: 小问题、优化

## 📄 许可证

贡献的代码将在 MIT 许可证下发布。

## ❓ 问题？

- 查看 [文档](README.md)
- 搜索 [Issues](https://github.com/your-username/it-ops-toolbox/issues)
- 加入讨论区

---

**感谢你的贡献！** 🎉
