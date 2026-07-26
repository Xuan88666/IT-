import { spawn } from 'child_process';
import http from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdtempSync, rmSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = __dirname;

const tmpDir = mkdtempSync(join(root, 'data-test-tools-'));
process.env.OPSHUB_DATA_DIR = tmpDir;

const serverProc = spawn('node', ['server.mjs'], {
  cwd: root,
  env: { ...process.env, OPSHUB_DATA_DIR: tmpDir },
  stdio: ['ignore', 'pipe', 'pipe']
});

let serverReady = false;
serverProc.stdout.on('data', (data) => {
  if (data.toString().includes('OpsHub running')) serverReady = true;
});

function waitForServer() {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const check = () => {
      if (serverReady) return resolve();
      if (Date.now() - startTime > 10000) return reject(new Error('Server timeout'));
      setTimeout(check, 100);
    };
    check();
  });
}

let authCookie = '';

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const headers = {};
    if (body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }
    if (authCookie) headers['Cookie'] = authCookie;
    const req = http.request(`http://127.0.0.1:8787${path}`, { method, headers }, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => {
        const cookies = res.headers['set-cookie'] || [];
        const m = cookies.join(';').match(/opshub_session=([^;]+)/);
        if (m) authCookie = `opshub_session=${m[1]}`;
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, body: buf }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(data);
    req.end();
  });
}

const tools = [
  { name: 'tcp-ping', label: 'TCP 延迟测试', body: { host: '127.0.0.1', port: 80, count: 3 } },
  { name: 'mtu-probe', label: 'MTU 路径探测', body: { host: '127.0.0.1' } },
  { name: 'network-quality', label: '网络质量检测', body: { host: '127.0.0.1', count: 5 } },
  { name: 'wifi-scan', label: 'Wi-Fi 信号扫描', body: {} },
  { name: 'dhcp-test', label: 'DHCP 状态检查', body: {} },
  { name: 'process-list', label: '进程列表 TOP', body: {} },
  { name: 'service-list', label: '系统服务列表', body: {} },
  { name: 'login-history', label: '登录历史记录', body: {} },
  { name: 'shared-folders', label: '共享文件夹列表', body: {} },
  { name: 'scheduled-tasks', label: '计划任务列表', body: {} },
  { name: 'time-sync', label: '时间同步检查', body: {} },
  { name: 'env-vars', label: '环境变量', body: {} },
  { name: 'usb-history', label: 'USB 设备历史', body: {} },
  { name: 'audio-check', label: '音频设备检查', body: {} },
  { name: 'pos-peripherals', label: 'POS 外设检查', body: {} },
];

async function main() {
  console.log('='.repeat(60));
  console.log('现场工具可用性验证 - 共 ' + tools.length + ' 个新工具');
  console.log('='.repeat(60));
  console.log();

  try {
    await waitForServer();
    console.log('✅ 服务器启动成功\n');

    console.log('初始化管理员...');
    await request('POST', '/api/auth/bootstrap', {
      username: 'admin',
      password: 'AdminPass123!',
      displayName: '系统管理员',
      role: 'admin'
    });

    console.log('登录中...');
    const login = await request('POST', '/api/auth/login', {
      username: 'admin',
      password: 'AdminPass123!'
    });
    if (login.status !== 200) throw new Error('登录失败: ' + JSON.stringify(login.body));
    console.log('✅ 登录成功\n');

    let passed = 0;
    let failed = 0;
    const failures = [];

    for (const tool of tools) {
      process.stdout.write(`测试 ${tool.label}（${tool.name}）... `);
      try {
        const res = await request('POST', `/api/tools/${tool.name}`, tool.body);
        if (res.status === 200) {
          const out = String(res.body.output || '').replace(/\n/g, ' ').slice(0, 80);
          console.log('✅ 正常');
          console.log('   ' + out);
          passed++;
        } else {
          console.log('❌ HTTP ' + res.status);
          console.log('   ' + String(res.body?.output || res.body || '').slice(0, 80));
          failed++;
          failures.push(tool.name);
        }
      } catch (e) {
        console.log('❌ 异常: ' + e.message);
        failed++;
        failures.push(tool.name);
      }
    }

    console.log();
    console.log('='.repeat(60));
    console.log(`测试完成：✅ ${passed} 通过，❌ ${failed} 失败，共 ${tools.length} 个`);
    if (failures.length) console.log('失败工具: ' + failures.join(', '));
    console.log('='.repeat(60));
  } catch (e) {
    console.error('测试失败:', e.message);
    process.exitCode = 1;
  } finally {
    serverProc.kill();
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

main();
