// Multi-level Memory Manager
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  Memory,
  MemoryType,
  ShortTermMemory,
  ShortTermEntry,
  EpisodicMemory,
  SemanticMemory,
  MemoryConfig,
  DEFAULT_MEMORY_CONFIG,
  MemoryStats,
  MemoryWriteDecision,
  RetrieveOptions,
  MemoryRetrievalResult
} from './types.js';
import { embedding } from './embedding.js';

// Generate unique ID
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Determine if content should be remembered
export async function shouldRemember(
  content: string,
  context: {
    role?: string;
    sessionId?: string;
    taskId?: string;
  }
): Promise<MemoryWriteDecision> {
  const lowerContent = content.toLowerCase();

  // Explicit "remember" commands
  if (lowerContent.includes('记住') || lowerContent.includes('remember') || lowerContent.includes('记住它')) {
    return { type: 'long_term', importance: 9, shouldStore: true };
  }

  // User preferences
  if (lowerContent.includes('我喜欢') || lowerContent.includes('我想要') || lowerContent.includes('prefer')) {
    return { type: 'semantic', importance: 8, shouldStore: true, tags: ['preference'] };
  }

  // Rules or instructions
  if (lowerContent.includes('不要') || lowerContent.includes('必须') || lowerContent.includes('规则')) {
    return { type: 'semantic', importance: 8, shouldStore: true, tags: ['rule'] };
  }

  // Task completion results
  if (lowerContent.includes('完成') || lowerContent.includes('成功') || lowerContent.includes('错误')) {
    return { type: 'episodic', importance: 6, shouldStore: true };
  }

  // Error/failure events
  if (lowerContent.includes('失败') || lowerContent.includes('error') || lowerContent.includes('异常')) {
    return { type: 'long_term', importance: 7, shouldStore: true, tags: ['error'] };
  }

  // Long meaningful responses (from assistant)
  if (context.role === 'assistant' && content.length > 500) {
    return { type: 'long_term', importance: 6, shouldStore: true };
  }

  // Default: don't store automatically
  return { type: 'short_term', importance: 0, shouldStore: false };
}

export class MemoryManager {
  private config: MemoryConfig;
  private shortTerm: Map<string, ShortTermMemory> = new Map();
  private longTerm: Map<string, Memory> = new Map();
  private episodic: Map<string, EpisodicMemory> = new Map();
  private semantic: Map<string, SemanticMemory> = new Map();
  private initialized = false;

  constructor(config: Partial<MemoryConfig> = {}) {
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const baseDir = this.config.storageDir;
    const dirs = ['short_term', 'long_term', 'episodic', 'semantic'];

    for (const dir of dirs) {
      await fs.mkdir(path.join(baseDir, dir), { recursive: true });
    }

    // Load existing memories
    await this.loadAllMemories();

    this.initialized = true;
    console.log('[Memory] Initialized with multi-level memory system');
  }

  private async loadAllMemories(): Promise<void> {
    // Load short-term memories
    await this.loadShortTermMemories();
    // Load long-term memories
    await this.loadLongTermMemories();
    // Load episodic memories
    await this.loadEpisodicMemories();
    // Load semantic memories
    await this.loadSemanticMemories();
  }

  private async loadLongTermMemories(): Promise<void> {
    try {
      const filePath = path.join(this.config.storageDir, 'long_term', 'memories.json');
      const content = await fs.readFile(filePath, 'utf-8');
      const memories: Memory[] = JSON.parse(content);
      for (const mem of memories) {
        this.longTerm.set(mem.id, mem);
      }
    } catch (e) {
      // File doesn't exist yet
    }
  }

  private async loadEpisodicMemories(): Promise<void> {
    try {
      const filePath = path.join(this.config.storageDir, 'episodic', 'tasks.json');
      const content = await fs.readFile(filePath, 'utf-8');
      const tasks: EpisodicMemory[] = JSON.parse(content);
      for (const task of tasks) {
        this.episodic.set(task.id, task);
      }
    } catch (e) {
      // File doesn't exist yet
    }
  }

  private async loadSemanticMemories(): Promise<void> {
    try {
      const filePath = path.join(this.config.storageDir, 'semantic', 'knowledge.json');
      const content = await fs.readFile(filePath, 'utf-8');
      const knowledge: SemanticMemory[] = JSON.parse(content);
      for (const mem of knowledge) {
        this.semantic.set(mem.id, mem);
      }
    } catch (e) {
      // File doesn't exist yet
    }
  }

  private async saveLongTermMemories(): Promise<void> {
    try {
      const filePath = path.join(this.config.storageDir, 'long_term', 'memories.json');
      const memories = Array.from(this.longTerm.values());
      await fs.writeFile(filePath, JSON.stringify(memories, null, 2), 'utf-8');
    } catch (e) {
      console.error('[Memory] Failed to save long-term:', e);
    }
  }

  private async saveEpisodicMemories(): Promise<void> {
    try {
      const filePath = path.join(this.config.storageDir, 'episodic', 'tasks.json');
      const tasks = Array.from(this.episodic.values());
      await fs.writeFile(filePath, JSON.stringify(tasks, null, 2), 'utf-8');
    } catch (e) {
      console.error('[Memory] Failed to save episodic:', e);
    }
  }

  private async saveSemanticMemories(): Promise<void> {
    try {
      const filePath = path.join(this.config.storageDir, 'semantic', 'knowledge.json');
      const knowledge = Array.from(this.semantic.values());
      await fs.writeFile(filePath, JSON.stringify(knowledge, null, 2), 'utf-8');
    } catch (e) {
      console.error('[Memory] Failed to save semantic:', e);
    }
  }

  // Short-term memory operations
  getShortTerm(sessionId: string): ShortTermMemory {
    let mem = this.shortTerm.get(sessionId);
    if (!mem) {
      mem = { sessionId, entries: [], createdAt: Date.now() };
      this.shortTerm.set(sessionId, mem);
    }
    return mem;
  }

  async addShortTermEntry(
    sessionId: string,
    role: ShortTermEntry['role'],
    content: string
  ): Promise<void> {
    const mem = this.getShortTerm(sessionId);
    mem.entries.push({
      role,
      content,
      timestamp: Date.now()
    });

    // Sliding window - keep only last N entries
    if (mem.entries.length > this.config.maxShortTermEntries) {
      mem.entries = mem.entries.slice(-this.config.maxShortTermEntries);
    }

    // Save to disk
    await this.saveShortTermMemory(sessionId);
  }

  private async saveShortTermMemory(sessionId: string): Promise<void> {
    try {
      const mem = this.shortTerm.get(sessionId);
      if (!mem) return;
      const filePath = path.join(this.config.storageDir, 'short_term', `${sessionId}.json`);
      await fs.writeFile(filePath, JSON.stringify(mem, null, 2), 'utf-8');
    } catch (e) {
      console.error('[Memory] Failed to save short-term:', e);
    }
  }

  private async loadShortTermMemories(): Promise<void> {
    try {
      const dirPath = path.join(this.config.storageDir, 'short_term');
      const entries = await fs.readdir(dirPath);
      for (const entry of entries) {
        if (entry.endsWith('.json')) {
          const sessionId = entry.replace('.json', '');
          const filePath = path.join(dirPath, entry);
          const content = await fs.readFile(filePath, 'utf-8');
          const mem = JSON.parse(content) as ShortTermMemory;
          this.shortTerm.set(sessionId, mem);
        }
      }
    } catch (e) {
      // Ignore - directory may not exist
    }
  }

  getShortTermHistory(sessionId: string, maxEntries?: number): ShortTermEntry[] {
    const mem = this.shortTerm.get(sessionId);
    if (!mem) return [];

    const entries = mem.entries;
    if (maxEntries && maxEntries > 0) {
      return entries.slice(-maxEntries);
    }
    return entries;
  }

  // Long-term memory operations
  async addLongTermMemory(
    content: string,
    metadata?: {
      sessionId?: string;
      taskId?: string;
      tags?: string[];
      source?: 'user' | 'assistant' | 'system';
    }
  ): Promise<Memory> {
    // Check for duplicates
    const existing = await this.retrieve(content, { types: ['long_term'], topK: 1, minSimilarity: 0.9 });
    if (existing.length > 0) {
      // Update last accessed time
      const mem = existing[0].memory;
      mem.lastAccessed = Date.now();
      await this.saveLongTermMemories();
      return mem;
    }

    const mem: Memory = {
      id: generateId('lt'),
      type: 'long_term',
      content,
      embedding: embedding.create(content, this.config),
      importance: 5,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      metadata: metadata || {}
    };

    this.longTerm.set(mem.id, mem);

    // Enforce limit
    if (this.longTerm.size > this.config.maxLongTermEntries) {
      // Remove oldest entries
      const sorted = Array.from(this.longTerm.values())
        .sort((a, b) => a.lastAccessed - b.lastAccessed);
      const toRemove = sorted.slice(0, this.longTerm.size - this.config.maxLongTermEntries);
      for (const rm of toRemove) {
        this.longTerm.delete(rm.id);
      }
    }

    await this.saveLongTermMemories();
    return mem;
  }

  // Episodic memory operations (task records)
  async addEpisodicMemory(
    task: string,
    input: string,
    output: string,
    result: 'success' | 'failure',
    tools: string[],
    duration: number
  ): Promise<EpisodicMemory> {
    const mem: EpisodicMemory = {
      id: generateId('ep'),
      task,
      input,
      output,
      result,
      tools,
      duration,
      createdAt: Date.now()
    };

    this.episodic.set(mem.id, mem);
    await this.saveEpisodicMemories();
    return mem;
  }

  getRecentTasks(limit: number = 10): EpisodicMemory[] {
    return Array.from(this.episodic.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  // Semantic memory operations
  async addSemanticMemory(
    category: 'preference' | 'rule' | 'knowledge',
    content: string,
    summary: string
  ): Promise<SemanticMemory> {
    // Check for existing
    const existing = Array.from(this.semantic.values())
      .find(m => m.category === category && m.content === content);

    if (existing) {
      existing.summary = summary;
      existing.updatedAt = Date.now();
      await this.saveSemanticMemories();
      return existing;
    }

    const mem: SemanticMemory = {
      id: generateId('sem'),
      category,
      content,
      summary,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.semantic.set(mem.id, mem);
    await this.saveSemanticMemories();
    return mem;
  }

  getSemanticMemories(category?: 'preference' | 'rule' | 'knowledge'): SemanticMemory[] {
    const all = Array.from(this.semantic.values());
    if (category) {
      return all.filter(m => m.category === category);
    }
    return all;
  }

  // Memory retrieval (RAG flow)
  async retrieve(query: string, options: RetrieveOptions): Promise<MemoryRetrievalResult[]> {
    const queryEmbedding = embedding.create(query, this.config);
    const results: MemoryRetrievalResult[] = [];
    const seen = new Set<string>();

    // Search long-term memories
    if (options.types.includes('long_term')) {
      for (const mem of this.longTerm.values()) {
        if (options.sessionId && mem.metadata.sessionId !== options.sessionId) {
          continue;
        }
        if (seen.has(mem.id)) continue;

        let sim = 0;
        if (mem.embedding) {
          sim = embedding.similarity(queryEmbedding, mem.embedding);
        }

        if (options.minSimilarity && sim < options.minSimilarity) continue;

        results.push({ memory: mem, similarity: sim });
        seen.add(mem.id);
      }
    }

    // Sort by similarity and return top K
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, options.topK);
  }

  // Get related semantic memories
  async getSemanticContext(query: string): Promise<string[]> {
    const keywords = embedding.extractKeywords(query);
    const relevant: string[] = [];

    for (const mem of this.semantic.values()) {
      const memKeywords = embedding.extractKeywords(mem.content);
      const overlap = keywords.filter(k => memKeywords.includes(k));
      if (overlap.length > 0) {
        relevant.push(mem.summary);
      }
    }

    return relevant.slice(0, 5);
  }

  // Get statistics
  getStats(): MemoryStats {
    return {
      shortTerm: this.shortTerm.size,
      longTerm: this.longTerm.size,
      episodic: this.episodic.size,
      semantic: this.semantic.size,
      total: this.shortTerm.size + this.longTerm.size + this.episodic.size + this.semantic.size
    };
  }

  // Clear session
  async clearSession(sessionId: string): Promise<void> {
    this.shortTerm.delete(sessionId);
  }

  // Clear all
  async clearAll(): Promise<void> {
    this.shortTerm.clear();
    this.longTerm.clear();
    this.episodic.clear();
    this.semantic.clear();

    const dirs = ['short_term', 'long_term', 'episodic', 'semantic'];
    for (const dir of dirs) {
      try {
        const filePath = path.join(this.config.storageDir, dir);
        const entries = await fs.readdir(filePath);
        for (const entry of entries) {
          if (entry.endsWith('.json')) {
            await fs.unlink(path.join(filePath, entry));
          }
        }
      } catch (e) {
        // Ignore
      }
    }
  }
}

export const memoryManager = new MemoryManager();