/**
 * SessionManager - 会话持久化管理
 * 将 AI 对话会话保存为 JSON 文件，支持重启后恢复
 */
import { readFile, writeFile, readdir, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export class SessionManager {
  constructor(sessionsDir) {
    this.sessionsDir = sessionsDir; // data/ai-sessions/
  }

  /**
   * 创建新会话
   * @param {string} title - 会话标题
   * @param {string} issue - 初始问题
   * @returns {Promise<Object>} 会话对象
   */
  async createSession(title, issue) {
    const session = {
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: title || issue.slice(0, 50),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      toolTrace: [],
      status: 'active' // active | completed | archived
    };

    await this.saveSession(session);
    return session;
  }

  /**
   * 加载会话
   * @param {string} sessionId
   * @returns {Promise<Object|null>}
   */
  async loadSession(sessionId) {
    try {
      // 防止路径穿越攻击
      if (!this.isValidSessionId(sessionId)) {
        return null;
      }

      const filePath = join(this.sessionsDir, `${sessionId}.json`);
      const content = await readFile(filePath, 'utf-8');
      const session = JSON.parse(content);

      // 验证会话结构
      if (!session.id || !session.createdAt) {
        return null;
      }

      return session;
    } catch {
      return null;
    }
  }

  /**
   * 保存会话
   * @param {Object} session
   */
  async saveSession(session) {
    try {
      await mkdir(this.sessionsDir, { recursive: true });

      if (!this.isValidSessionId(session.id)) {
        throw new Error('Invalid session ID');
      }

      const filePath = join(this.sessionsDir, `${session.id}.json`);
      session.updatedAt = new Date().toISOString();

      // 检查文件大小限制（防止单个会话过大）
      const content = JSON.stringify(session, null, 2);
      if (content.length > 10 * 1024 * 1024) {
        throw new Error('Session file too large (>10MB)');
      }

      await writeFile(filePath, content, 'utf-8');
    } catch (error) {
      console.error('Failed to save session:', error.message);
      throw error;
    }
  }

  /**
   * 列出所有会话（按更新时间倒序）
   * @param {number} limit
   * @returns {Promise<Array<Object>>}
   */
  async listSessions(limit = 50) {
    try {
      await mkdir(this.sessionsDir, { recursive: true });
      const files = await readdir(this.sessionsDir);
      const sessions = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        try {
          const content = await readFile(
            join(this.sessionsDir, file),
            'utf-8'
          );
          const session = JSON.parse(content);

          sessions.push({
            id: session.id,
            title: session.title || '未命名会话',
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            status: session.status || 'active',
            messageCount: Array.isArray(session.messages) ? session.messages.length : 0
          });
        } catch (error) {
          // 跳过损坏的文件
          console.warn(`Skipping corrupted session file: ${file}`, error.message);
        }
      }

      // 按更新时间倒序排序
      sessions.sort((a, b) =>
        new Date(b.updatedAt) - new Date(a.updatedAt)
      );

      return sessions.slice(0, limit);
    } catch {
      return [];
    }
  }

  /**
   * 删除会话
   * @param {string} sessionId
   * @returns {Promise<boolean>}
   */
  async deleteSession(sessionId) {
    try {
      if (!this.isValidSessionId(sessionId)) {
        return false;
      }

      const filePath = join(this.sessionsDir, `${sessionId}.json`);
      await unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 更新会话状态
   * @param {string} sessionId
   * @param {string} status - active | completed | archived
   * @returns {Promise<boolean>}
   */
  async updateSessionStatus(sessionId, status) {
    try {
      const session = await this.loadSession(sessionId);
      if (!session) return false;

      session.status = status;
      await this.saveSession(session);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 验证会话 ID 格式（防止路径穿越）
   * @private
   */
  isValidSessionId(sessionId) {
    if (typeof sessionId !== 'string') return false;
    // 只允许字母、数字、短横线
    return /^session-[a-z0-9-]{10,50}$/.test(sessionId);
  }
}
