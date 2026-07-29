import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, open, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_SESSIONS_PER_USER = 4;
const MAX_OUTPUT_CHUNKS = 800;
const MAX_INPUT_BYTES = 8192;
const BAUD_RATES = new Set([300, 600, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]);
const PARITY_MAP = { none: 'n', even: 'e', odd: 'o', mark: 'm', space: 's' };

function normalizePort(value) {
  const port = String(value || '').trim().toUpperCase();
  if (!/^COM(?:[1-9]\d{0,2})$/.test(port)) throw new Error('串口格式必须为 COM1-COM999。');
  return port;
}

function normalizeOptions(options = {}) {
  const port = normalizePort(options.port);
  const baud = Number(options.baud || 9600);
  const dataBits = Number(options.dataBits || 8);
  const stopBits = Number(options.stopBits || 1);
  const parity = String(options.parity || 'none').toLowerCase();
  const displayMode = String(options.displayMode || 'text').toLowerCase();
  if (!BAUD_RATES.has(baud)) throw new Error('不支持的波特率。');
  if (![5, 6, 7, 8].includes(dataBits)) throw new Error('数据位必须为 5、6、7 或 8。');
  if (![1, 1.5, 2].includes(stopBits)) throw new Error('停止位必须为 1、1.5 或 2。');
  if (!Object.hasOwn(PARITY_MAP, parity)) throw new Error('校验位必须为 none、even、odd、mark 或 space。');
  if (!['text', 'hex'].includes(displayMode)) throw new Error('显示模式必须为 text 或 hex。');
  return { port, baud, dataBits, stopBits, parity, displayMode };
}

function outputText(data, displayMode) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (displayMode === 'hex') return buffer.toString('hex').replace(/(..)/g, '$1 ').trim();
  return buffer.toString('utf8').replace(/\r(?!\n)/g, '\n').replace(/[\x00-\x08\x0B\x0C\x0E-\x1A\x1C-\x1F\x7F]/g, '');
}

function inputBuffer(data, format, lineEnding) {
  const value = String(data || '');
  if (!value) throw new Error('请输入要发送的数据。');
  let buffer;
  if (String(format || 'text').toLowerCase() === 'hex') {
    const normalized = value.replace(/\s+/g, '');
    if (!normalized || normalized.length % 2 || /[^0-9a-f]/i.test(normalized)) throw new Error('HEX 数据必须由成对的十六进制字符组成。');
    buffer = Buffer.from(normalized, 'hex');
  } else {
    const suffixes = { none: '', lf: '\n', cr: '\r', crlf: '\r\n' };
    const suffix = suffixes[String(lineEnding || 'none').toLowerCase()];
    if (suffix === undefined) throw new Error('行结束符无效。');
    buffer = Buffer.from(`${value}${suffix}`, 'utf8');
  }
  if (!buffer.length || buffer.length > MAX_INPUT_BYTES) throw new Error(`单次发送必须为 1-${MAX_INPUT_BYTES} bytes。`);
  return buffer;
}

async function runPowerShell(script, timeout = 10000) {
  const { stdout, stderr } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', `$OutputEncoding=[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); ${script}`], { windowsHide: true, timeout, encoding: 'utf8' });
  return `${stdout || ''}${stderr || ''}`.trim();
}

async function configurePort(options) {
  const parity = PARITY_MAP[options.parity];
  try {
    const { stdout, stderr } = await execFileAsync('mode.com', [`${options.port}:`, `BAUD=${options.baud}`, `PARITY=${parity}`, `DATA=${options.dataBits}`, `STOP=${options.stopBits}`], { windowsHide: true, timeout: 10000, encoding: 'utf8' });
    return `${stdout || ''}${stderr || ''}`.trim();
  } catch (error) {
    const detail = String(error.stderr || error.stdout || error.message || '').trim();
    throw new Error(`无法配置 ${options.port}：${detail || '端口不存在、被占用或当前权限不足。'}`);
  }
}

export class SerialSessionManager {
  constructor({ historyPath }) {
    this.historyPath = historyPath;
    this.sessions = new Map();
    this.history = null;
    this.historyWrite = Promise.resolve();
  }

  sessionView(session) {
    return {
      id: session.id,
      protocol: 'serial',
      port: session.port,
      baud: session.baud,
      dataBits: session.dataBits,
      stopBits: session.stopBits,
      parity: session.parity,
      displayMode: session.displayMode,
      status: session.status,
      createdAt: session.createdAt,
      connectedAt: session.connectedAt || null,
      closedAt: session.closedAt || null,
      lastSeq: session.seq,
    };
  }

  append(session, data) {
    const text = outputText(data, session.displayMode);
    if (!text) return;
    session.seq += 1;
    session.output.push({ seq: session.seq, at: Date.now(), data: text.slice(0, 65536) });
    if (session.output.length > MAX_OUTPUT_CHUNKS) session.output.splice(0, session.output.length - MAX_OUTPUT_CHUNKS);
  }

  getOwnedSession(ownerId, sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || session.ownerId !== ownerId) throw new Error('串口会话不存在或已结束。');
    return session;
  }

  async loadHistory() {
    if (this.history) return this.history;
    try {
      const parsed = JSON.parse(await readFile(this.historyPath, 'utf8'));
      this.history = Array.isArray(parsed) ? parsed : [];
    } catch { this.history = []; }
    return this.history;
  }

  async saveHistory() {
    const content = JSON.stringify((this.history || []).slice(0, 200), null, 2);
    this.historyWrite = this.historyWrite.then(async () => {
      await mkdir(dirname(this.historyPath), { recursive: true });
      const temporary = `${this.historyPath}.tmp`;
      await writeFile(temporary, content, 'utf8');
      await rename(temporary, this.historyPath);
    });
    return this.historyWrite;
  }

  async addHistory(ownerId, session) {
    const history = await this.loadHistory();
    const key = `${ownerId}|${session.port}|${session.baud}|${session.dataBits}|${session.stopBits}|${session.parity}`;
    const existing = history.find((item) => item.key === key);
    const record = {
      id: existing?.id || randomUUID(), key, ownerId, protocol: 'serial', port: session.port,
      baud: session.baud, dataBits: session.dataBits, stopBits: session.stopBits, parity: session.parity,
      displayMode: session.displayMode, lastUsedAt: new Date().toISOString(),
    };
    this.history = [record, ...history.filter((item) => item.key !== key)].slice(0, 200);
    await this.saveHistory();
    return record;
  }

  async listHistory(ownerId) {
    return (await this.loadHistory()).filter((item) => item.ownerId === ownerId).map(({ key, ownerId: _ownerId, ...item }) => item);
  }

  async deleteHistory(ownerId, historyId) {
    const history = await this.loadHistory();
    const before = history.length;
    this.history = history.filter((item) => !(item.ownerId === ownerId && item.id === historyId));
    if (before === this.history.length) throw new Error('未找到串口连接历史。');
    await this.saveHistory();
  }

  async listPorts() {
    if (process.platform !== 'win32') return [];
    const script = "$ports=@(); Get-CimInstance Win32_SerialPort -ErrorAction SilentlyContinue | ForEach-Object { $ports += [pscustomobject]@{port=$_.DeviceID;name=$_.Name;description=$_.Description} }; if(-not $ports){ $map=Get-ItemProperty 'HKLM:\\HARDWARE\\DEVICEMAP\\SERIALCOMM' -ErrorAction SilentlyContinue; if($map){ $map.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object { $ports += [pscustomobject]@{port=[string]$_.Value;name=[string]$_.Name;description='Registry discovery'} } } }; @($ports | Sort-Object port) | ConvertTo-Json -Compress";
    try {
      const output = await runPowerShell(script);
      if (!output) return [];
      const items = JSON.parse(output);
      return (Array.isArray(items) ? items : [items]).filter((item) => /^COM\d+$/i.test(String(item?.port || ''))).map((item) => ({ port: String(item.port).toUpperCase(), name: String(item.name || item.port).slice(0, 160), description: String(item.description || '').slice(0, 240) }));
    } catch (error) { throw new Error(`扫描串口失败：${error.message}`); }
  }

  async create(ownerId, options = {}) {
    if (process.platform !== 'win32') throw new Error('当前内置串口终端仅支持 Windows。');
    const config = normalizeOptions(options);
    const activeCount = [...this.sessions.values()].filter((item) => item.ownerId === ownerId && item.status === 'connected').length;
    if (activeCount >= MAX_SESSIONS_PER_USER) throw new Error(`每个账号最多同时打开 ${MAX_SESSIONS_PER_USER} 个串口会话。`);
    if ([...this.sessions.values()].some((item) => item.status === 'connected' && item.port === config.port)) throw new Error(`${config.port} 已被当前工具箱会话占用。`);
    const session = { id: randomUUID(), ownerId, ...config, status: 'connecting', createdAt: new Date().toISOString(), connectedAt: null, closedAt: null, seq: 0, output: [], handle: null, closed: false };
    this.sessions.set(session.id, session);
    this.append(session, `[SERIAL] 正在打开 ${config.port}，${config.baud}/${config.dataBits}${config.parity}/${config.stopBits}\n`);
    try {
      await configurePort(config);
      session.handle = await open(`\\\\.\\${config.port}`, 'r+');
      session.status = 'connected';
      session.connectedAt = new Date().toISOString();
      this.append(session, `[SERIAL] 已连接 ${config.port}，等待数据...\n`);
      await this.addHistory(ownerId, session);
      this.readLoop(session).catch(() => {});
      return this.sessionView(session);
    } catch (error) {
      session.status = 'error';
      session.closedAt = new Date().toISOString();
      this.append(session, `[SERIAL] 打开失败：${error.message}\n`);
      await this.destroyTransport(session);
      throw error;
    }
  }

  async readLoop(session) {
    const buffer = Buffer.allocUnsafe(4096);
    try {
      while (!session.closed && session.status === 'connected' && session.handle) {
        const { bytesRead } = await session.handle.read(buffer, 0, buffer.length, null);
        if (bytesRead > 0) this.append(session, buffer.subarray(0, bytesRead));
      }
    } catch (error) {
      if (!session.closed) {
        session.status = 'error';
        session.closedAt = new Date().toISOString();
        this.append(session, `[SERIAL] 读取中断：${error.message}\n`);
      }
    }
  }

  list(ownerId) {
    return [...this.sessions.values()].filter((item) => item.ownerId === ownerId).map((item) => this.sessionView(item));
  }

  output(ownerId, sessionId, after = 0) {
    const session = this.getOwnedSession(ownerId, sessionId);
    const cursor = Math.max(0, Number(after) || 0);
    const chunks = session.output.filter((item) => item.seq > cursor);
    return { session: this.sessionView(session), chunks, nextSeq: chunks.at(-1)?.seq || cursor };
  }

  async send(ownerId, sessionId, { data, format, lineEnding }) {
    const session = this.getOwnedSession(ownerId, sessionId);
    if (session.status !== 'connected' || !session.handle) throw new Error('串口会话当前未连接。');
    const buffer = inputBuffer(data, format, lineEnding);
    await session.handle.write(buffer, 0, buffer.length, null);
    this.append(session, `[TX] ${outputText(buffer, session.displayMode)}\n`);
    return this.sessionView(session);
  }

  async destroyTransport(session) {
    session.closed = true;
    try { await session.handle?.close(); } catch { /* already closed */ }
    session.handle = null;
  }

  async close(ownerId, sessionId) {
    const session = this.getOwnedSession(ownerId, sessionId);
    if (session.status !== 'closed') {
      session.status = 'closed';
      session.closedAt = new Date().toISOString();
      this.append(session, '[SERIAL] 会话已由用户断开。\n');
      await this.destroyTransport(session);
    }
    return this.sessionView(session);
  }

  async closeAll() {
    await Promise.all([...this.sessions.values()].map((session) => this.destroyTransport(session)));
  }
}
