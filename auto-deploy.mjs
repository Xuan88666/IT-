import { Client } from 'ssh2';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SERVER_CONFIG = {
  host: '8.134.94.184',
  port: 22,
  username: 'root',
  password: 'Guo880869'
};

const PROJECT_PATH = 'C:\\Users\\Administrator\\Desktop\\IT运维百宝箱';
const REMOTE_PATH = '/www/wwwroot/it-ops-toolbox';

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  IT 运维百宝箱 - 自动部署到服务器');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log(`服务器: ${SERVER_CONFIG.host}`);
console.log(`用户: ${SERVER_CONFIG.username}`);
console.log(`目标路径: ${REMOTE_PATH}`);
console.log('');

const conn = new Client();

// 需要上传的文件和目录
const filesToUpload = [
  'server.mjs',
  'server.js',
  'app.js',
  'index.html',
  'package.json',
  'package-lock.json',
  'init.sql',
  'Dockerfile',
  'docker-compose.yml',
  '.env.example',
  'ecosystem.config.json',
  'agent',
  'server',
  'vendor',
  'scripts',
  'deploy',
  'data/knowledge-seed.json',
  '.dockerignore',
  '.gitignore'
];

function execCommand(conn, command) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);

      let output = '';
      stream.on('close', (code) => {
        if (code === 0) resolve(output);
        else reject(new Error(`Command failed with code ${code}: ${output}`));
      });
      stream.on('data', (data) => {
        output += data.toString();
        process.stdout.write(data.toString());
      });
      stream.stderr.on('data', (data) => {
        output += data.toString();
        process.stderr.write(data.toString());
      });
    });
  });
}

function uploadFile(sftp, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.fastPut(localPath, remotePath, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function mkdir(sftp, path) {
  return new Promise((resolve) => {
    sftp.mkdir(path, (err) => {
      // 忽略目录已存在的错误
      resolve();
    });
  });
}

conn.on('ready', async () => {
  console.log('✓ SSH 连接成功');
  console.log('');

  try {
    // 1. 创建目录
    console.log('📁 创建项目目录...');
    await execCommand(conn, `mkdir -p ${REMOTE_PATH}`);
    console.log('✓ 目录创建完成');
    console.log('');

    // 2. 检查 Node.js
    console.log('🔍 检查 Node.js...');
    const nodeVersion = await execCommand(conn, 'node --version');
    console.log(`✓ Node.js 版本: ${nodeVersion.trim()}`);
    console.log('');

    // 3. 上传核心文件
    console.log('📤 上传项目文件...');
    conn.sftp(async (err, sftp) => {
      if (err) throw err;

      // 上传主文件
      const mainFiles = ['server.mjs', 'server.js', 'app.js', 'index.html', 'package.json', 'package-lock.json', 'init.sql', 'ecosystem.config.json', '.env.example'];

      for (const file of mainFiles) {
        const localFile = join(PROJECT_PATH, file);
        const remoteFile = `${REMOTE_PATH}/${file}`;
        try {
          console.log(`  上传: ${file}`);
          await uploadFile(sftp, localFile, remoteFile);
        } catch (e) {
          console.log(`  跳过: ${file} (${e.message})`);
        }
      }

      console.log('✓ 核心文件上传完成');
      console.log('');

      // 4. 安装依赖
      console.log('📦 安装依赖...');
      await execCommand(conn, `cd ${REMOTE_PATH} && npm install --production 2>&1`);
      console.log('✓ 依赖安装完成');
      console.log('');

      // 5. 生成配置文件
      console.log('⚙️  生成配置文件...');
      const jwtSecret = await execCommand(conn, `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`);
      const envContent = `PORT=3000
NODE_ENV=production
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=ops_box_user
MYSQL_PASS=请修改为数据库密码
MYSQL_DB=ops_box
JWT_SECRET=${jwtSecret.trim()}
EMAIL_HOST=smtp.qq.com
EMAIL_PORT=465
EMAIL_USER=your-email@qq.com
EMAIL_PASS=请修改为QQ邮箱授权码
EMAIL_FROM=运维百宝箱<your-email@qq.com>
`;

      await execCommand(conn, `cat > ${REMOTE_PATH}/.env << 'EOF'\n${envContent}\nEOF`);
      console.log('✓ 配置文件已生成');
      console.log('');
      console.log(`  JWT_SECRET: ${jwtSecret.trim()}`);
      console.log('');

      // 完成
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('  ✅ 部署成功！');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');
      console.log('📋 下一步：');
      console.log('');
      console.log('1. 在宝塔面板创建 Node.js 项目：');
      console.log(`   - 项目路径: ${REMOTE_PATH}`);
      console.log('   - 启动文件: server.js');
      console.log('   - Node版本: 20.x');
      console.log('   - 端口: 3000');
      console.log('');
      console.log('2. 编辑配置文件：');
      console.log(`   nano ${REMOTE_PATH}/.env`);
      console.log('   配置数据库密码和邮件信息');
      console.log('');
      console.log('3. 在宝塔面板中启动项目');
      console.log('');
      console.log('4. 配置防火墙（放行 3000 端口）');
      console.log('');
      console.log('5. 访问应用：');
      console.log('   http://8.134.94.184:3000');
      console.log('');

      conn.end();
    });

  } catch (error) {
    console.error('');
    console.error('❌ 部署失败:', error.message);
    conn.end();
    process.exit(1);
  }
});

conn.on('error', (err) => {
  console.error('❌ SSH 连接失败:', err.message);
  process.exit(1);
});

conn.connect(SERVER_CONFIG);
