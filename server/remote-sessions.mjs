import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import ssh2 from 'ssh2';

const { Client: SshClient } = ssh2;
const MAX_SESSIONS_PER_USER = 8;
const MAX_OUTPUT_CHUNKS = 800;
const MAX_INPUT_LENGTH = 8192;

function validHost(value) {
  const host = String(value || '').trim();
  return host.length <= 253 && (net.isIP(host) || /^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)$/i.test(host));
}

function normalizePort(value, fallback) {
  const port = Number(value || fallback);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('端口必须在 1-65535 之间。');
  return port;
}

function stripTerminalControls(value) {
  return String(value || '')
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\r(?!\n)/g, '\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1A\x1C-\x1F\x7F]/g, '');
}

function filterTelnetNegotiation(socket, buffer) {
  const plain = [];
  const replies = [];
  for (let index = 0; index < buffer.length; index += 1) {
    const byte = buffer[index];
    if (byte !== 255) { plain.push(byte); continue; }
    const command = buffer[++index];
    if (command === 255) { plain.push(255); continue; }
    if ([251, 252, 253, 254].includes(command)) {
      const option = buffer[++index];
      if (option === undefined) break;
      if (command === 251) replies.push(255, [1, 3].includes(option) ? 253 : 254, option);
      else if (command === 253) replies.push(255, option === 3 ? 251 : 252, option);
      continue;
    }
    if (command === 250) {
      while (index < buffer.length - 1 && !(buffer[index] === 255 && buffer[index + 1] === 240)) index += 1;
      index += 1;
    }
  }
  if (replies.length) socket.write(Buffer.from(replies));
  return Buffer.from(plain);
}

export class RemoteSessionManager {
  constructor({ historyPath }) {
    this.historyPath = historyPath;
    this.sessions = new Map();
    this.history = null;
    this.historyWrite = Promise.resolve();
  }

  sessionView(session) {
    return {
      id: session.id,
      protocol: session.protocol,
      host: session.host,
      port: session.port,
      username: session.username,
      deviceType: session.deviceType,
      hostFingerprint: session.hostFingerprint || '',
      status: session.status,
      createdAt: session.createdAt,
      connectedAt: session.connectedAt || null,
      closedAt: session.closedAt || null,
      lastSeq: session.seq,
    };
  }

  getOwnedSession(ownerId, sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || session.ownerId !== ownerId) throw new Error('远程会话不存在或已结束。');
    return session;
  }

  append(session, data) {
    const text = stripTerminalControls(Buffer.isBuffer(data) ? data.toString('utf8') : data);
    if (!text) return;
    session.seq += 1;
    session.output.push({ seq: session.seq, at: Date.now(), data: text.slice(0, 65536) });
    if (session.output.length > MAX_OUTPUT_CHUNKS) session.output.splice(0, session.output.length - MAX_OUTPUT_CHUNKS);
  }

  async loadHistory() {
    if (this.history) return this.history;
    try {
      const parsed = JSON.parse(await readFile(this.historyPath, 'utf8'));
      this.history = Array.isArray(parsed) ? parsed : [];
    } catch {
      this.history = [];
    }
    return this.history;
  }

  async saveHistory() {
    const snapshot = JSON.stringify((this.history || []).slice(0, 200), null, 2);
    this.historyWrite = this.historyWrite.then(async () => {
      await mkdir(dirname(this.historyPath), { recursive: true });
      const temporary = `${this.historyPath}.tmp`;
      await writeFile(temporary, snapshot, 'utf8');
      await rename(temporary, this.historyPath);
    });
    return this.historyWrite;
  }

  async addHistory(ownerId, entry) {
    const history = await this.loadHistory();
    const key = `${ownerId}|${entry.protocol}|${entry.host}|${entry.port}|${entry.username || ''}`;
    const existing = history.find(item => item.key === key);
    const record = {
      id: existing?.id || randomUUID(),
      key,
      ownerId,
      protocol: entry.protocol,
      host: entry.host,
      port: entry.port,
      username: entry.username || '',
      deviceType: entry.deviceType || '',
      resolution: entry.resolution || '',
      hostFingerprint: entry.hostFingerprint || '',
      lastUsedAt: new Date().toISOString(),
    };
    this.history = [record, ...history.filter(item => item.key !== key)].slice(0, 200);
    await this.saveHistory();
    return record;
  }

  async listHistory(ownerId) {
    return (await this.loadHistory()).filter(item => item.ownerId === ownerId).map(({ key, ownerId: _ownerId, ...item }) => item);
  }

  async deleteHistory(ownerId, historyId) {
    const history = await this.loadHistory();
    const before = history.length;
    this.history = history.filter(item => !(item.ownerId === ownerId && item.id === historyId));
    if (this.history.length === before) throw new Error('未找到远程连接历史。');
    await this.saveHistory();
  }

  async create(ownerId, options = {}) {
    const protocol = String(options.protocol || 'ssh').trim().toLowerCase();
    if (!['ssh', 'telnet'].includes(protocol)) throw new Error('远程终端仅支持 SSH 或 Telnet。');
    const host = String(options.host || '').trim();
    if (!validHost(host)) throw new Error('请输入有效的 IP 或主机名。');
    const port = normalizePort(options.port, protocol === 'ssh' ? 22 : 23);
    const username = String(options.username || '').trim().slice(0, 128);
    const password = String(options.password || '').slice(0, 512);
    if (protocol === 'ssh' && !username) throw new Error('SSH 连接必须填写用户名。');
    const activeCount = [...this.sessions.values()].filter(item => item.ownerId === ownerId && !['closed', 'error'].includes(item.status)).length;
    if (activeCount >= MAX_SESSIONS_PER_USER) throw new Error(`每个账号最多同时打开 ${MAX_SESSIONS_PER_USER} 个远程会话。`);

    const session = {
      id: randomUUID(), ownerId, protocol, host, port, username,
      deviceType: String(options.deviceType || '').trim().slice(0, 80),
      status: 'connecting', createdAt: new Date().toISOString(), connectedAt: null,
      closedAt: null, seq: 0, output: [], client: null, stream: null,
    };
    const history = await this.loadHistory();
    const previous = history.find(item => item.ownerId === ownerId && item.protocol === protocol && item.host === host && item.port === port && (item.username || '') === username);
    this.sessions.set(session.id, session);
    this.append(session, `[${protocol.toUpperCase()}] 正在连接 ${host}:${port} ...\n`);

    try {
      if (protocol === 'ssh') await this.connectSsh(session, { password, privateKey: options.privateKey, expectedFingerprint: previous?.hostFingerprint || '' });
      else await this.connectTelnet(session, { username, password });
      await this.addHistory(ownerId, session);
      return this.sessionView(session);
    } catch (error) {
      session.status = 'error';
      session.closedAt = new Date().toISOString();
      this.append(session, `连接失败：${error.message}\n`);
      this.destroyTransport(session);
      throw error;
    }
  }

  connectSsh(session, { password, privateKey, expectedFingerprint }) {
    return new Promise((resolve, reject) => {
      const client = new SshClient();
      session.client = client;
      let settled = false;
      const fail = (error) => { if (!settled) { settled = true; reject(error); } };
      client.on('ready', () => {
        client.shell({ term: 'xterm', cols: 120, rows: 32 }, (error, stream) => {
          if (error) return fail(error);
          session.stream = stream;
          session.status = 'connected';
          session.connectedAt = new Date().toISOString();
          this.append(session, `[SSH] 已连接 ${session.host}:${session.port}\n`);
          stream.on('data', data => this.append(session, data));
          stream.stderr?.on('data', data => this.append(session, data));
          stream.on('close', () => this.markClosed(session, 'SSH 远端已关闭会话。'));
          if (!settled) { settled = true; resolve(); }
        });
      });
      client.on('error', error => {
        this.append(session, `[SSH] ${error.message}\n`);
        fail(error);
      });
      client.on('close', () => this.markClosed(session, 'SSH 连接已断开。'));
      const config = {
        host: session.host,
        port: session.port,
        username: session.username,
        readyTimeout: 12000,
        keepaliveInterval: 10000,
        keepaliveCountMax: 3,
        tryKeyboard: Boolean(password),
        hostHash: 'sha256',
        hostVerifier: (hash) => {
          session.hostFingerprint = `SHA256:${hash}`;
          this.append(session, `[SSH] 主机指纹 ${session.hostFingerprint}\n`);
          if (expectedFingerprint && expectedFingerprint !== session.hostFingerprint) {
            this.append(session, `[SSH] 主机指纹与历史记录不一致，已拒绝连接。历史：${expectedFingerprint}\n`);
            return false;
          }
          return true;
        },
      };
      if (password) config.password = password;
      const key = String(privateKey || '').trim();
      if (key) config.privateKey = key;
      client.connect(config);
    });
  }

  connectTelnet(session, { username, password }) {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: session.host, port: session.port });
      session.client = socket;
      let settled = false;
      let promptBuffer = '';
      let usernameSent = false;
      let passwordSent = false;
      socket.setTimeout(15000);
      socket.on('connect', () => {
        settled = true;
        socket.setTimeout(0);
        session.stream = socket;
        session.status = 'connected';
        session.connectedAt = new Date().toISOString();
        this.append(session, `[TELNET] 已连接 ${session.host}:${session.port}\n`);
        resolve();
      });
      socket.on('data', data => {
        const plain = filterTelnetNegotiation(socket, data);
        this.append(session, plain);
        if ((!username || usernameSent) && (!password || passwordSent)) return;
        promptBuffer = `${promptBuffer}${plain.toString('utf8')}`.slice(-512);
        if (username && !usernameSent && /(?:login|username|user name|用户名)\s*[:：]?\s*$/i.test(promptBuffer)) {
          socket.write(`${username}\r\n`);
          usernameSent = true;
          promptBuffer = '';
        } else if (password && usernameSent && !passwordSent && /(?:password|密码)\s*[:：]?\s*$/i.test(promptBuffer)) {
          socket.write(`${password}\r\n`);
          passwordSent = true;
          promptBuffer = '';
        }
      });
      socket.on('timeout', () => socket.destroy(new Error('Telnet 连接超时。')));
      socket.on('error', error => {
        this.append(session, `[TELNET] ${error.message}\n`);
        if (!settled) reject(error);
      });
      socket.on('close', () => this.markClosed(session, 'Telnet 连接已断开。'));
    });
  }

  markClosed(session, message) {
    if (session.status === 'closed') return;
    session.status = session.status === 'error' ? 'error' : 'closed';
    session.closedAt ||= new Date().toISOString();
    this.append(session, `${message}\n`);
  }

  destroyTransport(session) {
    try { session.stream?.end?.(); } catch { /* already closed */ }
    try { session.client?.end?.(); } catch { /* already closed */ }
    try { session.client?.destroy?.(); } catch { /* already closed */ }
  }

  list(ownerId) {
    return [...this.sessions.values()].filter(item => item.ownerId === ownerId).map(item => this.sessionView(item));
  }

  output(ownerId, sessionId, after = 0) {
    const session = this.getOwnedSession(ownerId, sessionId);
    const cursor = Math.max(0, Number(after) || 0);
    const chunks = session.output.filter(item => item.seq > cursor);
    return { session: this.sessionView(session), chunks, nextSeq: chunks.at(-1)?.seq || cursor };
  }

  send(ownerId, sessionId, data) {
    const session = this.getOwnedSession(ownerId, sessionId);
    if (session.status !== 'connected' || !session.stream) throw new Error('远程会话当前未连接。');
    const input = String(data || '');
    if (!input || input.length > MAX_INPUT_LENGTH) throw new Error(`单次输入必须为 1-${MAX_INPUT_LENGTH} 个字符。`);
    session.stream.write(input);
    return this.sessionView(session);
  }

  close(ownerId, sessionId) {
    const session = this.getOwnedSession(ownerId, sessionId);
    session.status = 'closed';
    session.closedAt = new Date().toISOString();
    this.append(session, '会话已由用户断开。\n');
    this.destroyTransport(session);
    return this.sessionView(session);
  }

  closeAll() {
    for (const session of this.sessions.values()) this.destroyTransport(session);
  }
}

export { validHost as validRemoteHost, normalizePort as normalizeRemotePort };
