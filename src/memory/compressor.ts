// Memory compression module - converts short-term to semantic memory
import {
  ShortTermEntry,
  SemanticMemory
} from './types.js';
import { memoryManager } from './manager.js';

// Extract key information from conversation entries
export function extractKeyInfo(entries: ShortTermEntry[]): string[] {
  const keyPoints: string[] = [];

  for (const entry of entries) {
    if (entry.role === 'user') {
      // Extract user requests/intentions
      const lines = entry.content.split('\n').filter(l => l.trim());
      if (lines.length > 0) {
        keyPoints.push(`用户请求: ${lines[0].substring(0, 100)}`);
      }
    } else if (entry.role === 'assistant') {
      // Extract key actions/operations
      if (entry.content.includes('TOOL_CALL:')) {
        const matches = entry.content.match(/TOOL_CALL:\s*(\w+)/g);
        if (matches) {
          keyPoints.push(...matches.map(m => m.replace('TOOL_CALL:', '执行工具: ')));
        }
      }
    }
  }

  return keyPoints.slice(-5); // Keep last 5 key points
}

// Summarize conversation history (without LLM for now)
export function summarizeConversation(entries: ShortTermEntry[]): string {
  if (entries.length === 0) return '';

  const summaries: string[] = [];
  const userMessages: string[] = [];
  const assistantMessages: string[] = [];

  for (const entry of entries) {
    if (entry.role === 'user') {
      userMessages.push(entry.content.substring(0, 50));
    } else if (entry.role === 'assistant') {
      assistantMessages.push(entry.content.substring(0, 50));
    }
  }

  if (userMessages.length > 0) {
    summaries.push(`用户 ${userMessages.length} 次交互`);
  }
  if (assistantMessages.length > 0) {
    summaries.push(`助手 ${assistantMessages.length} 次响应`);
  }

  return summaries.join('; ');
}

// Compress session - convert to semantic memory
export async function compressSession(
  sessionId: string,
  sessionSummary?: string
): Promise<void> {
  const entries = memoryManager.getShortTermHistory(sessionId);

  if (entries.length < 5) return; // Don't compress if too few

  const summary = sessionSummary || summarizeConversation(entries);
  const keyInfo = extractKeyInfo(entries);

  // Create semantic memory
  await memoryManager.addSemanticMemory(
    'knowledge',
    keyInfo.join('; '),
    summary
  );

  // Clear short-term (optional - keep last few)
  const mem = memoryManager.getShortTerm(sessionId);
  if (mem.entries.length > 3) {
    mem.entries = mem.entries.slice(-3);
  }
}

// Detect if compression is needed
export function shouldCompress(entries: ShortTermEntry[], threshold: number): boolean {
  return entries.length >= threshold;
}