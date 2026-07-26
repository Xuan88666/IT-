/**
 * ModelDispatcher - 统一模型调度层
 * 支持所有 OpenAI 协议兼容的 AI Provider
 */
import https from 'node:https';
import http from 'node:http';

export class ModelDispatcher {
  constructor(providersConfig) {
    this.providers = Array.isArray(providersConfig) ? providersConfig : [];
    this.healthStatus = new Map(); // name -> {ok, lastCheck, latency, error}
  }

  /**
   * 选择 Provider
   * @param {string|null} preferredName - 用户指定的 Provider 名称
   * @returns {Object|null} 选中的 Provider 对象
   */
  selectProvider(preferredName = null) {
    // 1. 如果用户指定了，优先使用
    if (preferredName) {
      const provider = this.providers.find(p => p.name === preferredName && p.enabled !== false);
      if (provider) return provider;
    }

    // 2. 按优先级选择第一个启用的
    const sorted = [...this.providers]
      .filter(p => p.enabled !== false)
      .sort((a, b) => (a.priority || 999) - (b.priority || 999));

    for (const provider of sorted) {
      const health = this.healthStatus.get(provider.name);
      // 如果没检查过，或者上次是健康的，就用它
      if (!health || health.ok) return provider;
    }

    // 3. 都不健康，返回优先级最高的（让它重试）
    if (sorted.length > 0) return sorted[0];

    return null;
  }

  /**
   * 获取所有 Provider 的公开信息（不含密钥）
   * @returns {Array<Object>}
   */
  getPublicProviders() {
    return this.providers
      .filter(p => p.enabled !== false)
      .map(p => ({
        name: p.name,
        enabled: p.enabled !== false,
        health: this.healthStatus.get(p.name) || null
      }));
  }

  /**
   * 健康检查
   * @param {Object} provider
   * @returns {Promise<{ok: boolean, latency: number, error?: string}>}
   */
  async healthCheck(provider) {
    const start = Date.now();
    try {
      const endpoint = this.buildEndpoint(provider);
      const headers = this.buildHeaders(provider);
      const body = JSON.stringify({
        model: provider.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5
      });

      const response = await this.httpRequest(endpoint, {
        method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
        body,
        timeout: Math.min(provider.timeout || 10000, 10000)
      });

      const latency = Date.now() - start;
      const ok = response.statusCode === 200;

      this.healthStatus.set(provider.name, {
        ok,
        lastCheck: new Date().toISOString(),
        latency,
        error: ok ? null : `HTTP ${response.statusCode}`
      });

      return { ok, latency };
    } catch (error) {
      const latency = Date.now() - start;
      this.healthStatus.set(provider.name, {
        ok: false,
        lastCheck: new Date().toISOString(),
        latency,
        error: error.message
      });
      return { ok: false, latency, error: error.message };
    }
  }

  /**
   * 判断是否为 DeepSeek Provider
   * @private
   */
  isDeepSeek(provider) {
    const name = (provider.name || '').toLowerCase();
    const endpoint = (provider.endpoint || '').toLowerCase();
    return name.includes('deepseek') || endpoint.includes('deepseek');
  }

  /**
   * 调用模型（统一接口）
   * @param {Object} provider
   * @param {Array} messages
   * @param {Array|null} tools
   * @param {number} temperature
   * @param {Object} options - 额外选项 { responseFormat, toolChoice }
   * @returns {Promise<Object>} OpenAI 格式响应
   */
  async callModel(provider, messages, tools = null, temperature = 0.2, options = {}) {
    const body = {
      model: provider.model,
      messages,
      temperature
    };

    if (tools && Array.isArray(tools) && tools.length > 0) {
      body.tools = tools;
      if (options.toolChoice) {
        body.tool_choice = options.toolChoice;
      } else if (this.isDeepSeek(provider)) {
        body.tool_choice = 'auto';
      }
    }

    if (options.responseFormat) {
      body.response_format = options.responseFormat;
    }

    if (this.isDeepSeek(provider)) {
      body.max_tokens = provider.maxTokens || 4096;
    }

    const endpoint = this.buildEndpoint(provider);
    const headers = this.buildHeaders(provider);
    const bodyStr = JSON.stringify(body);

    const response = await this.httpRequest(endpoint, {
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(bodyStr) },
      body: bodyStr,
      timeout: provider.timeout || 55000
    });

    if (response.statusCode !== 200) {
      const errorData = response.body ? JSON.parse(response.body) : {};
      throw new Error(errorData?.error?.message || `HTTP ${response.statusCode}`);
    }

    const result = JSON.parse(response.body);
    this._updateUsage(provider, result.usage);
    return result;
  }

  /**
   * 更新 token 使用统计
   * @private
   */
  _updateUsage(provider, usage) {
    if (!usage) return;
    if (!this.usageStats) this.usageStats = new Map();
    const existing = this.usageStats.get(provider.name) || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, calls: 0 };
    existing.prompt_tokens += usage.prompt_tokens || 0;
    existing.completion_tokens += usage.completion_tokens || 0;
    existing.total_tokens += usage.total_tokens || 0;
    existing.calls += 1;
    existing.lastCall = new Date().toISOString();
    this.usageStats.set(provider.name, existing);
  }

  /**
   * 获取 token 使用统计
   */
  getUsageStats() {
    if (!this.usageStats) return {};
    const result = {};
    for (const [name, stats] of this.usageStats) {
      result[name] = { ...stats };
    }
    return result;
  }

  /**
   * 构建完整的 API 端点
   * @private
   */
  buildEndpoint(provider) {
    let endpoint = provider.endpoint.replace(/\/$/, '');

    // Azure OpenAI 特殊处理
    if (provider.apiVersion) {
      return `${endpoint}?api-version=${provider.apiVersion}`;
    }

    // 标准 OpenAI 协议
    if (!endpoint.includes('/chat/completions')) {
      endpoint += '/chat/completions';
    }

    return endpoint;
  }

  /**
   * 构建请求头
   * @private
   */
  buildHeaders(provider) {
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'OpsHub/0.1.0'
    };

    // Azure OpenAI 使用 api-key header
    if (provider.apiVersion) {
      headers['api-key'] = provider.apiKey;
    } else {
      // 标准 OpenAI 协议使用 Authorization
      headers['Authorization'] = `Bearer ${provider.apiKey}`;
    }

    return headers;
  }

  /**
   * HTTP 请求封装（支持超时和 https）
   * @private
   */
  httpRequest(url, options) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : http;

      const reqOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: options.headers || {}
      };

      const req = client.request(reqOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
        });
      });

      req.on('error', reject);

      if (options.timeout) {
        req.setTimeout(options.timeout, () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });
      }

      if (options.body) {
        req.write(options.body);
      }

      req.end();
    });
  }
}
