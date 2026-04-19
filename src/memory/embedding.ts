// Simple embedding implementation without external dependencies
// Uses hash-based + word frequency vector approach
import {
  Memory,
  MemoryConfig,
  DEFAULT_MEMORY_CONFIG
} from './types.js';

// Simple hash function for strings
function simpleHash(str: string, dim: number): number[] {
  const vector = new Array(dim).fill(0);

  // Use multiple hash functions for better distribution
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    const hash1 = (charCode * 31 + i) % dim;
    const hash2 = (charCode * 17 + i * 7) % dim;
    const hash3 = (charCode * 13 + i * 3) % dim;

    vector[Math.abs(hash1)] += 1;
    vector[Math.abs(hash2)] += 0.5;
    vector[Math.abs(hash3)] += 0.25;
  }

  // Normalize L2
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude > 0) {
    return vector.map(v => v / magnitude);
  }

  return vector;
}

// Extract keywords from text
function extractKeywords(text: string): string[] {
  // Simple tokenization
  const words = text.toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1);

  // Stop words filter
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were',
    'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that',
    'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
    'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how',
    'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
    'some', 'such', 'no', 'not', 'only', 'same', 'so', 'than',
    'too', 'very', 'just', 'also', 'now', 'here', 'there', 'then',
    '如果', '那么', '这个', '那个', '什么', '怎么', '为什么',
    '一个', '所以', '因为', '但是', '或者', '而且', '或者'
  ]);

  return words.filter(w => !stopWords.has(w) && w.length > 1);
}

// Word frequency based embedding
function wordFreqEmbedding(text: string, dim: number): number[] {
  const keywords = extractKeywords(text);
  const vector = new Array(dim).fill(0);

  // Hash each keyword and accumulate
  for (const keyword of keywords) {
    const hash = simpleHash(keyword, dim);
    for (let i = 0; i < dim; i++) {
      vector[i] += hash[i];
    }
  }

  // Normalize
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude > 0) {
    return vector.map(v => v / magnitude);
  }

  return vector;
}

// Main embedding function
export function createEmbedding(text: string, config?: Partial<MemoryConfig>): number[] {
  const cfg = { ...DEFAULT_MEMORY_CONFIG, ...config };
  // Combine hash and word frequency approach
  const hashVec = simpleHash(text, cfg.embeddingDim);
  const wordVec = wordFreqEmbedding(text, cfg.embeddingDim);

  // Combine both vectors with weights
  return hashVec.map((v, i) => v * 0.3 + wordVec[i] * 0.7);
}

// Cosine similarity between two vectors
export function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) return 0;

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

export const embedding = {
  create: createEmbedding,
  similarity: cosineSimilarity,
  extractKeywords
};