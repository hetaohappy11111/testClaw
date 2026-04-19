// Memory System - Legacy compatibility preserved
// New memory system exports
export * from './types.js';
export * from './embedding.js';
export * from './manager.js';
export * from './compressor.js';

// Legacy: ConversationMemoryStore for backward compatibility
// This is the old implementation kept for compatibility
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export interface MemoryEntry {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
}

export interface ConversationMemory {
  id: string;
  entries: MemoryEntry[];
  createdAt: number;
  lastUpdated: number;
}

export interface MemoryConfig {
  storageDir: string;
  maxShortTermEntries: number;
  maxLongTermEntries: number;
}

const DEFAULT_CONFIG: MemoryConfig = {
  storageDir: path.join(os.homedir(), '.testclaw', 'memory'),
  maxShortTermEntries: 20,
  maxLongTermEntries: 100
};

export class ConversationMemoryStore {
  private memories: Map<string, ConversationMemory> = new Map();
  private config: MemoryConfig;
  private initialized = false;

  constructor(config: Partial<MemoryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await fs.mkdir(this.config.storageDir, { recursive: true });
    await this.loadAllSessions();
    this.initialized = true;
  }

  private async loadAllSessions(): Promise<void> {
    try {
      const entries = await fs.readdir(this.config.storageDir);
      for (const entry of entries) {
        if (entry.endsWith('.json')) {
          const sessionId = entry.replace('.json', '');
          await this.loadSession(sessionId);
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  private async loadSession(sessionId: string): Promise<void> {
    try {
      const filePath = path.join(this.config.storageDir, `${sessionId}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      const memory = JSON.parse(content) as ConversationMemory;
      this.memories.set(sessionId, memory);
    } catch (e) {
      // Ignore
    }
  }

  private async saveSession(sessionId: string): Promise<void> {
    const memory = this.memories.get(sessionId);
    if (!memory) return;
    try {
      const filePath = path.join(this.config.storageDir, `${sessionId}.json`);
      await fs.writeFile(filePath, JSON.stringify(memory, null, 2), 'utf-8');
    } catch (e) {
      console.error('[Memory] Failed to save session:', e);
    }
  }

  create(sessionId: string): ConversationMemory {
    const memory: ConversationMemory = {
      id: sessionId,
      entries: [],
      createdAt: Date.now(),
      lastUpdated: Date.now()
    };
    this.memories.set(sessionId, memory);
    this.saveSession(sessionId);
    return memory;
  }

  get(sessionId: string): ConversationMemory | undefined {
    return this.memories.get(sessionId);
  }

  async addEntry(sessionId: string, role: MemoryEntry['role'], content: string): Promise<void> {
    let memory = this.memories.get(sessionId);
    if (!memory) {
      memory = this.create(sessionId);
    }

    memory.entries.push({ role, content, timestamp: Date.now() });

    if (memory.entries.length > this.config.maxShortTermEntries) {
      memory.entries = memory.entries.slice(-this.config.maxShortTermEntries);
    }

    memory.lastUpdated = Date.now();
    await this.saveSession(sessionId);
  }

  getHistory(sessionId: string, maxEntries?: number): MemoryEntry[] {
    const memory = this.memories.get(sessionId);
    if (!memory) return [];
    const entries = memory.entries;
    if (maxEntries && maxEntries > 0) {
      return entries.slice(-maxEntries);
    }
    return entries;
  }

  getSummary(sessionId: string, maxEntries: number = 5): string {
    const history = this.getHistory(sessionId, maxEntries);
    const summaries: string[] = [];
    for (const entry of history) {
      const roleLabel = entry.role === 'user' ? '用户' : 'AI';
      const preview = entry.content.substring(0, 100);
      summaries.push(`${roleLabel}: ${preview}`);
    }
    return summaries.join('\n');
  }

  async clear(sessionId: string): Promise<void> {
    this.memories.delete(sessionId);
    try {
      const filePath = path.join(this.config.storageDir, `${sessionId}.json`);
      await fs.unlink(filePath);
    } catch (e) {
      // Ignore
    }
  }

  async clearAll(): Promise<void> {
    this.memories.clear();
    try {
      const entries = await fs.readdir(this.config.storageDir);
      for (const entry of entries) {
        if (entry.endsWith('.json')) {
          await fs.unlink(path.join(this.config.storageDir, entry));
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  getAllSessions(): { id: string; entries: number; lastUpdated: number }[] {
    return Array.from(this.memories.values()).map(m => ({
      id: m.id,
      entries: m.entries.length,
      lastUpdated: m.lastUpdated
    }));
  }
}

export const memoryStore = new ConversationMemoryStore();