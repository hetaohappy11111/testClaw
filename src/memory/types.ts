// Multi-level Memory Type Definitions

// Memory type enum
export type MemoryType = 'short_term' | 'long_term' | 'episodic' | 'semantic';

// Unified memory entry
export interface Memory {
  id: string;
  type: MemoryType;
  content: string;
  embedding?: number[];  // Vector for similarity search
  importance: number;    // 0-10 importance score
  createdAt: number;
  lastAccessed: number;
  metadata: {
    sessionId?: string;
    taskId?: string;
    tags?: string[];
    source?: 'user' | 'assistant' | 'system';
  };
}

// Episodic memory (task execution record)
export interface EpisodicMemory {
  id: string;
  task: string;
  input: string;
  output: string;
  result: 'success' | 'failure';
  tools: string[];
  duration: number;
  createdAt: number;
}

// Semantic memory (rules/preferences)
export interface SemanticMemory {
  id: string;
  category: 'preference' | 'rule' | 'knowledge';
  content: string;
  summary: string;
  createdAt: number;
  updatedAt: number;
}

// Short-term memory (active session)
export interface ShortTermMemory {
  sessionId: string;
  entries: ShortTermEntry[];
  createdAt: number;
}

export interface ShortTermEntry {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
}

// Memory configuration
export interface MemoryConfig {
  storageDir: string;
  maxShortTermEntries: number;  // Current session sliding window
  maxLongTermEntries: number;   // Long-term memory limit
  embeddingDim: number;        // Embedding dimension
  compressionThreshold: number; // When to compress
  similarityThreshold: number;   // For retrieval
}

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  storageDir: '/Users/hetao/.testclaw/memory',
  maxShortTermEntries: 20,
  maxLongTermEntries: 100,
  embeddingDim: 128,
  compressionThreshold: 15,
  similarityThreshold: 0.6
};

// Memory write decision
export interface MemoryWriteDecision {
  type: MemoryType;
  importance: number;
  shouldStore: boolean;
  tags?: string[];
}

// Retrieval options
export interface RetrieveOptions {
  types: MemoryType[];
  topK: number;
  sessionId?: string;
  minSimilarity?: number;
}

// Memory retrieval result
export interface MemoryRetrievalResult {
  memory: Memory;
  similarity: number;
}

// Memory statistics
export interface MemoryStats {
  shortTerm: number;
  longTerm: number;
  episodic: number;
  semantic: number;
  total: number;
}