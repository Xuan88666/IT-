#!/usr/bin/env node
/**
 * 测试 AI 工具调用功能
 * 验证 DeepSeek API 是否能正确识别并调用 function calling
 */

import https from 'node:https';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 加载 .env 配置
async function loadEnv() {
  try {
    const envContent = await readFile(join(__dirname, '.env'), 'utf-8');
    const env = {};
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length) {
        env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      }
    }
    return env;
  } catch {
    return {};
  }
}

// 简化的工具定义（用于测试）
const TEST_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'ping',
      description: 'Ping 目标 IP 或域名，测试连通性和延迟',
      parameters: {
        type: 'object',
        properties: {
          host: { type: 'string', description: '目标 IP 地址或域名' }
        },
        required: ['host']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_port',
      description: '测试目标主机的指定 TCP 端口是否开放',
      parameters: {
        type: 'object',
        properties: {
          host: { type: 'string', description: '目标 IP 地址' },
          port: { type: 'integer', description: '端口号，1-65535' }
        },
        required: ['host', 'port']
      }
    }
  }
];

async function callDeepSeek(apiKey, endpoint, model, messages, tools) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint.replace(/\/$/, '') + '/chat/completions');
    const body = JSON.stringify({
      model,
      temperature: 0.2,
      messages,
      tools
    });

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          reject(new Error(`解析响应失败: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('请求超时'));
    });

    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('🧪 测试 AI 工具调用功能\n');

  // 1. 加载配置
  const env = await loadEnv();

  let apiKey, endpoint, model;

  // 优先使用 JSON 配置
  if (env.OPSHUB_AI_PROVIDERS_JSON) {
    try {
      const providers = JSON.parse(env.OPSHUB_AI_PROVIDERS_JSON);
      const deepseek = providers.find(p => p.name === 'DeepSeek');
      if (deepseek) {
        apiKey = deepseek.apiKey;
        endpoint = deepseek.endpoint;
        model = deepseek.model;
      }
    } catch (e) {
      console.error('⚠️  解析 OPSHUB_AI_PROVIDERS_JSON 失败:', e.message);
    }
  }

  // 回退到单独的环境变量
  if (!apiKey) {
    apiKey = env.OPSHUB_AI_API_KEY || env.DEEPSEEK_API_KEY;
    endpoint = env.OPSHUB_AI_ENDPOINT || 'https://api.deepseek.com/v1';
    model = env.OPSHUB_AI_MODEL || 'deepseek-chat';
  }

  if (!apiKey) {
    console.error('❌ 未找到 API Key，请检查 .env 文件');
    console.error('   需要配置 OPSHUB_AI_PROVIDERS_JSON 或 OPSHUB_AI_API_KEY');
    process.exit(1);
  }

  console.log(`📡 API 端点: ${endpoint}`);
  console.log(`🤖 模型: ${model}`);
  console.log(`🔑 API Key: ${apiKey.slice(0, 8)}...${apiKey.slice(-4)}\n`);

  // 2. 测试场景 1：应该触发 function calling
  console.log('📋 测试 1: 明确要求执行 Ping 测试');
  console.log('─'.repeat(60));

  const messages1 = [
    {
      role: 'system',
      content: '你是 IT 运维助手。当用户要求检测网络时，使用提供的工具函数。'
    },
    {
      role: 'user',
      content: '请 ping 127.0.0.1 检测连通性'
    }
  ];

  try {
    const result1 = await callDeepSeek(apiKey, endpoint, model, messages1, TEST_TOOLS);

    if (result1.status !== 200) {
      console.error(`❌ HTTP ${result1.status}: ${JSON.stringify(result1.data, null, 2)}`);
    } else {
      const choice = result1.data.choices?.[0];
      const message = choice?.message;

      console.log(`✅ HTTP 200 - 响应成功`);
      console.log(`\n📨 助手响应:`);
      console.log(`  - 角色: ${message?.role}`);
      console.log(`  - 内容: ${message?.content || '(无文本内容)'}`);

      if (message?.tool_calls && message.tool_calls.length > 0) {
        console.log(`\n🎯 工具调用成功！`);
        message.tool_calls.forEach((tc, idx) => {
          console.log(`\n  工具调用 #${idx + 1}:`);
          console.log(`    - ID: ${tc.id}`);
          console.log(`    - 函数名: ${tc.function.name}`);
          console.log(`    - 参数: ${tc.function.arguments}`);
        });
      } else {
        console.log(`\n⚠️  未检测到 tool_calls`);
        console.log(`完整响应: ${JSON.stringify(message, null, 2)}`);
      }
    }
  } catch (error) {
    console.error(`❌ 请求失败: ${error.message}`);
    process.exit(1);
  }

  console.log('\n' + '─'.repeat(60));

  // 3. 测试场景 2：多个工具调用
  console.log('\n📋 测试 2: 应该触发多个工具调用');
  console.log('─'.repeat(60));

  const messages2 = [
    {
      role: 'system',
      content: '你是 IT 运维助手。当用户要求检测服务时，使用提供的工具函数。'
    },
    {
      role: 'user',
      content: '请检查 192.168.1.100 的 80 端口和 443 端口是否开放'
    }
  ];

  try {
    const result2 = await callDeepSeek(apiKey, endpoint, model, messages2, TEST_TOOLS);

    if (result2.status !== 200) {
      console.error(`❌ HTTP ${result2.status}`);
    } else {
      const message = result2.data.choices?.[0]?.message;

      if (message?.tool_calls && message.tool_calls.length > 0) {
        console.log(`✅ 工具调用成功！检测到 ${message.tool_calls.length} 个调用`);
        message.tool_calls.forEach((tc, idx) => {
          console.log(`  ${idx + 1}. ${tc.function.name}(${tc.function.arguments})`);
        });
      } else {
        console.log(`⚠️  未检测到 tool_calls`);
        console.log(`响应: ${message?.content || '(空)'}`);
      }
    }
  } catch (error) {
    console.error(`❌ 请求失败: ${error.message}`);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('\n✨ 测试完成\n');
}

main().catch(console.error);
