# AI Providers 配置示例

## 推荐：使用 JSON 配置（支持多个 Provider）

```bash
OPSHUB_AI_PROVIDERS_JSON='[
  {
    "name": "DeepSeek",
    "endpoint": "https://api.deepseek.com",
    "apiKey": "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "model": "deepseek-v4-flash",
    "enabled": true,
    "priority": 1,
    "timeout": 30000,
    "maxRetries": 2
  },
  {
    "name": "Ollama 本地",
    "endpoint": "http://192.168.1.100:11434/v1",
    "apiKey": "ollama",
    "model": "qwen2.5:7b",
    "enabled": true,
    "priority": 2,
    "timeout": 60000,
    "maxRetries": 1
  },
  {
    "name": "Azure OpenAI",
    "endpoint": "https://your-resource.openai.azure.com/openai/deployments/gpt-4o",
    "apiKey": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "model": "gpt-4o",
    "enabled": false,
    "priority": 3,
    "apiVersion": "2024-02-15-preview"
  },
  {
    "name": "OpenAI",
    "endpoint": "https://api.openai.com/v1",
    "apiKey": "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "model": "gpt-4o",
    "enabled": false,
    "priority": 4
  }
]'

# 兜底：单个 Provider 配置（向后兼容）
# OPSHUB_AI_ENDPOINT=https://api.deepseek.com
# OPSHUB_AI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# OPSHUB_AI_MODEL=deepseek-chat
# OPSHUB_AI_NAME=DeepSeek

# 数据存储目录（可选）
# OPSHUB_DATA_DIR=./data

# 服务端口（可选）
# PORT=8787
```

## 配置字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | 显示名称（前端可见） |
| `endpoint` | string | ✅ | API 端点（不含 `/chat/completions`） |
| `apiKey` | string | ✅ | API 密钥（前端不可见） |
| `model` | string | ✅ | 模型名称 |
| `enabled` | boolean | ❌ | 是否启用（默认 true） |
| `priority` | number | ❌ | 优先级（数字越小越优先，默认 999） |
| `timeout` | number | ❌ | 超时时间 ms（默认 55000） |
| `maxRetries` | number | ❌ | 失败重试次数（默认 2） |
| `apiVersion` | string | ❌ | Azure 专用：API 版本 |

## 常见 Provider 配置示例

### DeepSeek
```json
{
  "name": "DeepSeek",
  "endpoint": "https://api.deepseek.com",
  "apiKey": "sk-xxxxx",
  "model": "deepseek-v4-flash"
}
```

### Ollama（本地部署）
```json
{
  "name": "Ollama 本地",
  "endpoint": "http://192.168.1.100:11434/v1",
  "apiKey": "ollama",
  "model": "qwen2.5:7b"
}
```

### Azure OpenAI
```json
{
  "name": "Azure OpenAI",
  "endpoint": "https://your-resource.openai.azure.com/openai/deployments/gpt-4o",
  "apiKey": "xxxxx",
  "model": "gpt-4o",
  "apiVersion": "2024-02-15-preview"
}
```

### OpenAI
```json
{
  "name": "OpenAI",
  "endpoint": "https://api.openai.com/v1",
  "apiKey": "sk-xxxxx",
  "model": "gpt-4o"
}
```

### 通义千问（兼容 OpenAI 协议）
```json
{
  "name": "通义千问",
  "endpoint": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  "apiKey": "sk-xxxxx",
  "model": "qwen-plus"
}
```
