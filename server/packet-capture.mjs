import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_PACKETS = 200000;

function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  return Number.isInteger(number) ? Math.min(Math.max(number, min), max) : fallback;
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function topEntries(map, limit = 12) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function ipv4(buffer, offset) {
  return `${buffer[offset]}.${buffer[offset + 1]}.${buffer[offset + 2]}.${buffer[offset + 3]}`;
}

function ipv6(buffer, offset) {
  const words = [];
  for (let index = 0; index < 16; index += 2) words.push(buffer.readUInt16BE(offset + index).toString(16));
  let bestStart = -1;
  let bestLength = 0;
  for (let start = 0; start < words.length;) {
    if (words[start] !== '0') { start += 1; continue; }
    let end = start;
    while (end < words.length && words[end] === '0') end += 1;
    if (end - start > bestLength) { bestStart = start; bestLength = end - start; }
    start = end;
  }
  if (bestLength < 2) return words.join(':');
  const left = words.slice(0, bestStart).join(':');
  const right = words.slice(bestStart + bestLength).join(':');
  return `${left}::${right}`;
}

function readDnsName(buffer, offset, end, depth = 0) {
  if (depth > 8) return { name: '', next: offset };
  const labels = [];
  let cursor = offset;
  let next = offset;
  let jumped = false;
  while (cursor < end) {
    const length = buffer[cursor];
    if (length === 0) {
      if (!jumped) next = cursor + 1;
      return { name: labels.join('.'), next };
    }
    if ((length & 0xc0) === 0xc0) {
      if (cursor + 1 >= end) break;
      const pointer = ((length & 0x3f) << 8) | buffer[cursor + 1];
      if (!jumped) next = cursor + 2;
      jumped = true;
      const pointed = readDnsName(buffer, pointer, end, depth + 1);
      if (pointed.name) labels.push(pointed.name);
      return { name: labels.join('.'), next };
    }
    if (length > 63 || cursor + 1 + length > end) break;
    labels.push(buffer.subarray(cursor + 1, cursor + 1 + length).toString('utf8').replace(/[^\x20-\x7e]/g, '?'));
    cursor += length + 1;
    if (!jumped) next = cursor;
  }
  return { name: '', next };
}

function extractDnsQuery(payload, tcp = false) {
  let offset = tcp ? 2 : 0;
  if (payload.length < offset + 12) return null;
  if ((payload.readUInt16BE(offset + 2) & 0x8000) !== 0 || payload.readUInt16BE(offset + 4) < 1) return null;
  const question = readDnsName(payload, offset + 12, payload.length);
  if (!question.name || question.next + 4 > payload.length) return null;
  const types = { 1: 'A', 2: 'NS', 5: 'CNAME', 12: 'PTR', 15: 'MX', 16: 'TXT', 28: 'AAAA', 33: 'SRV', 255: 'ANY' };
  const type = payload.readUInt16BE(question.next);
  return `${question.name} (${types[type] || `TYPE${type}`})`;
}

function extractHttp(payload) {
  if (!payload.length) return null;
  const firstLine = payload.subarray(0, Math.min(payload.length, 2048)).toString('latin1').split(/\r?\n/, 1)[0];
  return /^(GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH|CONNECT)\s+\S+\s+HTTP\/1\.[01]$/.test(firstLine) ? firstLine.slice(0, 500) : null;
}

function parseLldp(buffer, offset, end) {
  const neighbor = {};
  while (offset + 2 <= end) {
    const header = buffer.readUInt16BE(offset);
    offset += 2;
    const type = header >>> 9;
    const length = header & 0x1ff;
    if (offset + length > end) break;
    const value = buffer.subarray(offset, offset + length);
    if (type === 0) break;
    if (type === 2 && length > 1) neighbor.port = value.subarray(1).toString('utf8').replace(/[^\x20-\x7e]/g, '').trim();
    if (type === 5) neighbor.device = value.toString('utf8').replace(/[^\x20-\x7e]/g, '').trim();
    if (type === 6) neighbor.description = value.toString('utf8').replace(/[^\x20-\x7e]/g, '').trim().slice(0, 160);
    if (type === 127 && length >= 6 && value.subarray(0, 3).equals(Buffer.from([0x00, 0x80, 0xc2])) && value[3] === 1) neighbor.vlan = value.readUInt16BE(4);
    offset += length;
  }
  return neighbor.device || neighbor.port ? neighbor : null;
}

function parseTransport(buffer, offset, end, protocol, source, destination, state) {
  let sourcePort = null;
  let destinationPort = null;
  let payload = Buffer.alloc(0);
  let protocolName = protocol === 6 ? 'TCP' : protocol === 17 ? 'UDP' : protocol === 1 ? 'ICMP' : protocol === 58 ? 'ICMPv6' : `IP-${protocol}`;
  if ((protocol === 6 || protocol === 17) && offset + 4 <= end) {
    sourcePort = buffer.readUInt16BE(offset);
    destinationPort = buffer.readUInt16BE(offset + 2);
    increment(state.ports, `${protocolName}/${sourcePort}`);
    increment(state.ports, `${protocolName}/${destinationPort}`);
    if (protocol === 6 && offset + 20 <= end) {
      const headerLength = (buffer[offset + 12] >>> 4) * 4;
      if (headerLength >= 20 && offset + headerLength <= end) payload = buffer.subarray(offset + headerLength, end);
    } else if (protocol === 17 && offset + 8 <= end) payload = buffer.subarray(offset + 8, end);
  }
  increment(state.protocols, protocolName);
  increment(state.endpoints, source);
  increment(state.endpoints, destination);
  const left = sourcePort === null ? source : `${source}:${sourcePort}`;
  const right = destinationPort === null ? destination : `${destination}:${destinationPort}`;
  increment(state.conversations, `${left} -> ${right} (${protocolName})`);
  if ((sourcePort === 53 || destinationPort === 53) && state.dnsQueries.length < 100) {
    const query = extractDnsQuery(payload, protocol === 6);
    if (query && !state.dnsQueries.includes(query)) state.dnsQueries.push(query);
  }
  if (protocol === 6 && state.httpRequests.length < 100) {
    const request = extractHttp(payload);
    if (request) state.httpRequests.push(`${source} -> ${destination}: ${request}`);
  }
}

function parseIpv4(buffer, offset, end, state) {
  if (offset + 20 > end || (buffer[offset] >>> 4) !== 4) return;
  const headerLength = (buffer[offset] & 0x0f) * 4;
  if (headerLength < 20 || offset + headerLength > end) return;
  const totalLength = buffer.readUInt16BE(offset + 2);
  const packetEnd = Math.min(end, totalLength >= headerLength ? offset + totalLength : end);
  parseTransport(buffer, offset + headerLength, packetEnd, buffer[offset + 9], ipv4(buffer, offset + 12), ipv4(buffer, offset + 16), state);
}

function parseIpv6(buffer, offset, end, state) {
  if (offset + 40 > end || (buffer[offset] >>> 4) !== 6) return;
  const source = ipv6(buffer, offset + 8);
  const destination = ipv6(buffer, offset + 24);
  let protocol = buffer[offset + 6];
  let cursor = offset + 40;
  for (let count = 0; count < 6 && [0, 43, 44, 51, 60].includes(protocol) && cursor + 2 <= end; count += 1) {
    const next = buffer[cursor];
    let length = protocol === 44 ? 8 : protocol === 51 ? (buffer[cursor + 1] + 2) * 4 : (buffer[cursor + 1] + 1) * 8;
    if (cursor + length > end) break;
    cursor += length;
    protocol = next;
  }
  parseTransport(buffer, cursor, end, protocol, source, destination, state);
}

function parsePacket(buffer, linkType, state) {
  let offset = 0;
  let etherType = null;
  if (linkType === 1) {
    if (buffer.length < 14) return;
    etherType = buffer.readUInt16BE(12);
    offset = 14;
    // pktmon may emit decrypted IEEE 802.11 data frames while declaring
    // LINKTYPE_ETHERNET. Detect the validated LLC/SNAP boundary before
    // treating bytes 12-13 as an Ethernet EtherType.
    const frameControl = buffer.length >= 32 ? buffer.readUInt16LE(0) : 0;
    if (((frameControl >>> 2) & 0x03) === 2) {
      const toDs = Boolean(frameControl & 0x0100);
      const fromDs = Boolean(frameControl & 0x0200);
      const qosData = Boolean(((frameControl >>> 4) & 0x08));
      const ordered = Boolean(frameControl & 0x8000);
      let wifiHeaderLength = toDs && fromDs ? 30 : 24;
      if (qosData) wifiHeaderLength += 2;
      if (qosData && ordered) wifiHeaderLength += 4;
      if (wifiHeaderLength + 8 <= buffer.length && buffer[wifiHeaderLength] === 0xaa && buffer[wifiHeaderLength + 1] === 0xaa && buffer[wifiHeaderLength + 2] === 0x03) {
        etherType = buffer.readUInt16BE(wifiHeaderLength + 6);
        offset = wifiHeaderLength + 8;
      }
    }
    while ([0x8100, 0x88a8, 0x9100].includes(etherType) && offset + 4 <= buffer.length) {
      etherType = buffer.readUInt16BE(offset + 2);
      offset += 4;
    }
  } else if (linkType === 101) {
    etherType = buffer[0] >>> 4 === 6 ? 0x86dd : 0x0800;
  } else if (linkType === 113) {
    if (buffer.length < 16) return;
    etherType = buffer.readUInt16BE(14);
    offset = 16;
  } else {
    increment(state.protocols, `LINKTYPE-${linkType}`);
    return;
  }
  if (etherType === 0x0800) parseIpv4(buffer, offset, buffer.length, state);
  else if (etherType === 0x86dd) parseIpv6(buffer, offset, buffer.length, state);
  else if (etherType === 0x0806) increment(state.protocols, 'ARP');
  else if (etherType === 0x88cc) {
    increment(state.protocols, 'LLDP');
    const neighbor = parseLldp(buffer, offset, buffer.length);
    if (neighbor && state.lldpNeighbors.length < 50 && !state.lldpNeighbors.some((item) => JSON.stringify(item) === JSON.stringify(neighbor))) state.lldpNeighbors.push(neighbor);
  } else increment(state.protocols, `EtherType-0x${etherType.toString(16).padStart(4, '0')}`);
}

function parseClassicPcap(buffer, state) {
  if (buffer.length < 24) throw new Error('PCAP 文件头不完整。');
  const magic = buffer.subarray(0, 4).toString('hex');
  const littleEndian = ['d4c3b2a1', '4d3cb2a1'].includes(magic);
  if (!littleEndian && !['a1b2c3d4', 'a1b23c4d'].includes(magic)) throw new Error('不是受支持的 classic PCAP 文件。');
  const read32 = (offset) => littleEndian ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
  const linkType = read32(20);
  let offset = 24;
  while (offset + 16 <= buffer.length && state.packetCount < MAX_PACKETS) {
    const capturedLength = read32(offset + 8);
    const originalLength = read32(offset + 12);
    offset += 16;
    if (capturedLength > 16 * 1024 * 1024 || offset + capturedLength > buffer.length) throw new Error('PCAP 数据包长度字段无效或文件已截断。');
    parsePacket(buffer.subarray(offset, offset + capturedLength), linkType, state);
    state.packetCount += 1;
    state.capturedBytes += capturedLength;
    state.wireBytes += originalLength;
    offset += capturedLength;
  }
  state.format = 'PCAP';
  state.linkTypes.add(linkType);
}

function parsePcapNg(buffer, state) {
  let offset = 0;
  let littleEndian = true;
  let interfaces = [];
  while (offset + 12 <= buffer.length && state.packetCount < MAX_PACKETS) {
    const blockTypeRaw = buffer.readUInt32LE(offset);
    if (blockTypeRaw === 0x0a0d0d0a) {
      if (offset + 28 > buffer.length) throw new Error('PCAPNG Section Header 不完整。');
      const bom = buffer.subarray(offset + 8, offset + 12).toString('hex');
      if (bom === '4d3c2b1a') littleEndian = true;
      else if (bom === '1a2b3c4d') littleEndian = false;
      else throw new Error('PCAPNG 字节序标记无效。');
      interfaces = [];
    }
    const read32 = (position) => littleEndian ? buffer.readUInt32LE(position) : buffer.readUInt32BE(position);
    const read16 = (position) => littleEndian ? buffer.readUInt16LE(position) : buffer.readUInt16BE(position);
    const blockType = blockTypeRaw === 0x0a0d0d0a ? 0x0a0d0d0a : read32(offset);
    const blockLength = read32(offset + 4);
    if (blockLength < 12 || blockLength % 4 !== 0 || offset + blockLength > buffer.length || read32(offset + blockLength - 4) !== blockLength) throw new Error('PCAPNG 块长度无效或文件已截断。');
    if (blockType === 1 && blockLength >= 20) {
      const linkType = read16(offset + 8);
      interfaces.push(linkType);
      state.linkTypes.add(linkType);
    } else if (blockType === 6 && blockLength >= 32) {
      const interfaceId = read32(offset + 8);
      const capturedLength = read32(offset + 20);
      const originalLength = read32(offset + 24);
      if (capturedLength > blockLength - 32) throw new Error('PCAPNG Enhanced Packet 长度字段无效。');
      parsePacket(buffer.subarray(offset + 28, offset + 28 + capturedLength), interfaces[interfaceId] ?? 1, state);
      state.packetCount += 1;
      state.capturedBytes += capturedLength;
      state.wireBytes += originalLength;
    } else if (blockType === 3 && blockLength >= 16) {
      const originalLength = read32(offset + 8);
      const capturedLength = Math.min(originalLength, blockLength - 16);
      parsePacket(buffer.subarray(offset + 12, offset + 12 + capturedLength), interfaces[0] ?? 1, state);
      state.packetCount += 1;
      state.capturedBytes += capturedLength;
      state.wireBytes += originalLength;
    }
    offset += blockLength;
  }
  state.format = 'PCAPNG';
}

export function analyzeCaptureBuffer(buffer, { filename = 'capture.pcap' } = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('抓包文件为空。');
  if (buffer.length > MAX_UPLOAD_BYTES) throw new Error('抓包文件超过 25MB 离线分析限制。');
  const state = {
    format: '', packetCount: 0, capturedBytes: 0, wireBytes: 0,
    linkTypes: new Set(), protocols: new Map(), endpoints: new Map(), conversations: new Map(), ports: new Map(),
    dnsQueries: [], httpRequests: [], lldpNeighbors: [],
  };
  if (buffer.subarray(0, 4).toString('hex') === '0a0d0d0a') parsePcapNg(buffer, state);
  else parseClassicPcap(buffer, state);
  const result = {
    ok: true,
    filename: basename(String(filename || 'capture.pcap')).slice(0, 160),
    format: state.format,
    packetCount: state.packetCount,
    capturedBytes: state.capturedBytes,
    wireBytes: state.wireBytes,
    linkTypes: [...state.linkTypes],
    protocols: topEntries(state.protocols),
    endpoints: topEntries(state.endpoints),
    conversations: topEntries(state.conversations),
    ports: topEntries(state.ports),
    dnsQueries: state.dnsQueries,
    httpRequests: state.httpRequests,
    lldpNeighbors: state.lldpNeighbors,
  };
  const lines = [
    `PCAP 协议分析：${result.filename}`,
    '='.repeat(64),
    `格式            ${result.format}`,
    `数据包          ${result.packetCount}`,
    `捕获字节        ${result.capturedBytes}`,
    `链路字节        ${result.wireBytes}`,
    `链路类型        ${result.linkTypes.join(', ') || '-'}`,
    '', '协议分布', ...result.protocols.map((item) => `  ${item.name.padEnd(18)} ${item.count}`),
    '', 'Top 通信端点', ...result.endpoints.map((item) => `  ${item.name.padEnd(42)} ${item.count}`),
    '', 'Top 会话', ...result.conversations.map((item) => `  ${item.name}  [${item.count}]`),
    '', 'Top 端口', ...result.ports.map((item) => `  ${item.name.padEnd(18)} ${item.count}`),
  ];
  if (result.dnsQueries.length) lines.push('', 'DNS 查询', ...result.dnsQueries.map((item) => `  ${item}`));
  if (result.httpRequests.length) lines.push('', 'HTTP 请求', ...result.httpRequests.map((item) => `  ${item}`));
  if (result.lldpNeighbors.length) lines.push('', 'LLDP 邻居', ...result.lldpNeighbors.map((item) => `  ${item.device || '-'} | 端口 ${item.port || '-'} | VLAN ${item.vlan || '-'} | ${item.description || ''}`));
  if (state.packetCount >= MAX_PACKETS) lines.push('', `提示：已达到 ${MAX_PACKETS} 包解析上限，后续数据包未展开。`);
  result.output = lines.join('\n');
  result.summary = `已解析 ${result.packetCount} 个数据包，识别 ${result.protocols.length} 类协议、${result.endpoints.length} 个主要端点、${result.dnsQueries.length} 条 DNS 查询。`;
  result.csv = ['类型,名称,数量', ...result.protocols.map((item) => `协议,"${item.name.replaceAll('"', '""')}",${item.count}`), ...result.endpoints.map((item) => `端点,"${item.name.replaceAll('"', '""')}",${item.count}`), ...result.ports.map((item) => `端口,"${item.name.replaceAll('"', '""')}",${item.count}`)].join('\n');
  return result;
}

async function runPktmon(args, timeout = 15000) {
  const executable = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'pktmon.exe');
  const { stdout, stderr } = await execFileAsync(executable, args, { windowsHide: true, timeout, encoding: 'utf8' });
  return `${stdout || ''}${stderr || ''}`.trim();
}

export class PacketCaptureManager {
  constructor({ dataDir }) {
    this.captureDir = join(dataDir, 'captures');
    this.indexPath = join(this.captureDir, 'index.json');
    this.active = null;
    this.timer = null;
    this.records = null;
  }

  async loadRecords() {
    if (this.records) return this.records;
    try {
      const parsed = JSON.parse(await readFile(this.indexPath, 'utf8'));
      this.records = Array.isArray(parsed) ? parsed : [];
    } catch { this.records = []; }
    return this.records;
  }

  async saveRecords() {
    await mkdir(this.captureDir, { recursive: true });
    await writeFile(this.indexPath, JSON.stringify((this.records || []).slice(0, 50), null, 2), 'utf8');
  }

  available() {
    const executable = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'pktmon.exe');
    return process.platform === 'win32' && existsSync(executable);
  }

  publicRecord(record) {
    if (!record) return null;
    const { etlPath, pcapPath, ...safe } = record;
    return { ...safe, downloadUrl: record.status === 'completed' && existsSync(pcapPath) ? `/api/packet-capture/files/${encodeURIComponent(record.id)}` : null };
  }

  async status() {
    const records = await this.loadRecords();
    return { ok: true, available: this.available(), active: this.publicRecord(this.active), captures: records.slice(0, 20).map((item) => this.publicRecord(item)) };
  }

  async start({ userId, username, durationSeconds, packetSize, fileSizeMB }) {
    if (!this.available()) throw new Error('当前系统未提供 pktmon.exe，无法启动内置抓包。');
    if (this.active) throw new Error('已有抓包任务正在运行，请先停止或等待自动结束。');
    const records = await this.loadRecords();
    const duration = clampInteger(durationSeconds, 30, 5, 120);
    const size = clampInteger(packetSize, 0, 0, 65535);
    const maxFile = clampInteger(fileSizeMB, 32, 4, 64);
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const id = `CAP-${stamp}-${randomBytes(3).toString('hex')}`;
    await mkdir(this.captureDir, { recursive: true });
    const etlPath = join(this.captureDir, `${id}.etl`);
    const pcapPath = join(this.captureDir, `${id}.pcapng`);
    await runPktmon(['start', '--capture', '--comp', 'nics', '--pkt-size', String(size), '--file-name', etlPath, '--file-size', String(maxFile), '--log-mode', 'circular']);
    const record = { id, status: 'capturing', startedAt: new Date().toISOString(), completedAt: null, durationSeconds: duration, packetSize: size, fileSizeMB: maxFile, startedBy: username, userId, etlPath, pcapPath, error: null };
    this.active = record;
    records.unshift(record);
    this.records = records.slice(0, 50);
    await this.saveRecords();
    this.timer = setTimeout(() => { this.stop({ reason: 'duration' }).catch(() => {}); }, duration * 1000);
    this.timer.unref?.();
    return this.publicRecord(record);
  }

  async stop({ reason = 'manual' } = {}) {
    if (!this.active) throw new Error('当前没有正在运行的抓包任务。');
    const record = this.active;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    try {
      await runPktmon(['stop'], 20000);
      await runPktmon(['etl2pcap', record.etlPath, '--out', record.pcapPath], 60000);
      record.status = 'completed';
      record.completedAt = new Date().toISOString();
      record.stopReason = reason;
      try { record.bytes = (await readFile(record.pcapPath)).length; } catch { record.bytes = 0; }
    } catch (error) {
      record.status = 'failed';
      record.completedAt = new Date().toISOString();
      record.error = error.message;
      throw error;
    } finally {
      this.active = null;
      await this.saveRecords();
    }
    return this.publicRecord(record);
  }

  async file(id) {
    const records = await this.loadRecords();
    const record = records.find((item) => item.id === id && item.status === 'completed');
    if (!record || !existsSync(record.pcapPath)) throw new Error('抓包文件不存在或尚未完成转换。');
    return { record: this.publicRecord(record), data: await readFile(record.pcapPath) };
  }

  async shutdown() {
    if (!this.active) return;
    await this.stop({ reason: 'server-shutdown' }).catch(() => {});
  }
}

export { MAX_UPLOAD_BYTES };
