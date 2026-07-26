/**
 * ProvidersConfig - AI Provider 配置加载
 * 从环境变量中加载多个 Provider 配置
 */

/**
 * 从环境变量加载 Provider 配置
 * @returns {Array<Object>} Provider 配置数组
 */
export function loadProvidersFromEnv() {
  const providers = [];

  // 优先读取 JSON 配置（支持多个 Provider）
  if (process.env.OPSHUB_AI_PROVIDERS_JSON) {
    try {
      const parsed = JSON.parse(process.env.OPSHUB_AI_PROVIDERS_JSON);
      if (Array.isArray(parsed)) {
        providers.push(...parsed.filter(p => p.name && p.endpoint && p.apiKey && p.model));
      }
    } catch (error) {
      console.warn('Failed to parse OPSHUB_AI_PROVIDERS_JSON:', error.message);
    }
  }

  // 兜底：单个 Provider 配置（向后兼容）
  if (providers.length === 0) {
    const endpoint = process.env.OPSHUB_AI_ENDPOINT;
    const apiKey = process.env.OPSHUB_AI_API_KEY;
    const model = process.env.OPSHUB_AI_MODEL;
    const name = process.env.OPSHUB_AI_NAME || 'DeepSeek';

    if (endpoint && apiKey && model) {
      providers.push({
        name,
        endpoint,
        apiKey,
        model,
        enabled: true,
        priority: 1
      });
    }
  }

  return providers;
}

/**
 * 验证 Provider 配置
 * @param {Object} provider
 * @returns {boolean}
 */
export function validateProvider(provider) {
  if (!provider || typeof provider !== 'object') return false;

  const required = ['name', 'endpoint', 'apiKey', 'model'];
  for (const field of required) {
    if (!provider[field] || typeof provider[field] !== 'string') {
      return false;
    }
  }

  // 验证 endpoint 格式
  try {
    new URL(provider.endpoint);
  } catch {
    return false;
  }

  return true;
}

/**
 * 脱敏 API Key（用于日志和审计）
 * @param {string} apiKey
 * @returns {string}
 */
export function maskApiKey(apiKey) {
  if (!apiKey || apiKey.length < 12) return '***';
  return apiKey.slice(0, 8) + '...' + apiKey.slice(-4);
}
