// Enterprise Skill System - Enhanced skill matching
import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';
import { Skill, SkillDefinition, SkillMatch } from './types.js';

export interface EnhancedSkill extends Skill {
  patterns: string[];
  keywords: string[];
  priority: number;
  examples: string[];
}

export class SkillMatcher {
  private skills: Map<string, EnhancedSkill> = new Map();

  async loadFromDirectory(dirPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillPath = path.join(dirPath, entry.name, 'SKILL.md');
          try {
            const skill = await this.loadSkillFile(skillPath);
            if (skill) {
              this.skills.set(skill.name, skill);
            }
          } catch {
            // Skip if error
          }
        }
      }
    } catch (error) {
      console.error('[SkillMatcher] Error:', error);
    }
  }

  private async loadSkillFile(filePath: string): Promise<EnhancedSkill | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const { data, content: skillContent } = matter(content);

      const name = data.name || path.basename(path.dirname(filePath));

      return {
        name,
        description: data.description || '',
        content: skillContent,
        userInvocable: data['user-invocable'] || false,
        patterns: this.extractPatterns(skillContent),
        keywords: this.extractKeywords(skillContent),
        priority: data.priority || 0,
        examples: this.extractExamples(skillContent)
      };
    } catch {
      return null;
    }
  }

  private extractPatterns(content: string): string[] {
    const patterns: string[] = [];
    // Extract from "When to Use" and "Usage Examples"
    const whenMatch = content.match(/## (When to Use|Usage Examples)[\s\S]*?(?:\n##|$)/i);
    if (whenMatch) {
      const lines = whenMatch[0].split('\n');
      for (const line of lines) {
        const trimmed = line.trim().replace(/^[-*]\s*/, '');
        if (trimmed && trimmed.length > 3) {
          patterns.push(this.lineToPattern(trimmed));
        }
      }
    }
    return patterns;
  }

  private lineToPattern(line: string): string {
    const words = line.toLowerCase().replace(/["'.]/g, '').split(/\s+/)
      .filter(w => w.length > 2);
    return words.slice(0, 3).join('|');
  }

  private extractKeywords(content: string): string[] {
    const keywords: string[] = [];
    const match = content.match(/## Capabilities[\s\S]*?(?:\n##|$)/i);
    if (match) {
      const lines = match[0].split('\n');
      for (const line of lines) {
        const trimmed = line.trim().replace(/^[-*]\s*/, '');
        if (trimmed) keywords.push(trimmed.toLowerCase());
      }
    }
    return keywords;
  }

  private extractExamples(content: string): string[] {
    const examples: string[] = [];
    const match = content.match(/##[ ]*Examples[\s\S]*?(?:\n##|$)/i);
    if (match) {
      const lines = match[0].split('\n');
      for (const line of lines) {
        const trimmed = line.trim().replace(/^[-*]\s*/, '');
        if (trimmed && trimmed.length > 3) examples.push(trimmed);
      }
    }
    return examples;
  }

  // Match input to best skill
  match(input: string): SkillMatch | null {
    const lowerInput = input.toLowerCase();
    const scores: { skill: EnhancedSkill; score: number }[] = [];

    for (const skill of this.skills.values()) {
      let score = 0;
      const skillLowerName = skill.name.toLowerCase();

      // 1. Explicit skill call: /skill name - HIGHEST priority
      if (lowerInput.startsWith('/skill ' + skillLowerName + ' ') ||
          lowerInput.startsWith('/skill ' + skillLowerName) ||
          lowerInput.startsWith('/使用 ' + skillLowerName)) {
        score += 100;
      }

      // 2. Direct skill name mention (especially for short names like "git", "bash")
      if (skillLowerName === 'git-helper') {
        if (lowerInput.includes('git ')) score += 40;
      } else if (skillLowerName === 'bash-executor') {
        if (lowerInput.includes('bash') || lowerInput.includes('shell')) score += 40;
        if (lowerInput.includes('run ') || lowerInput.includes('execute') || lowerInput.includes('npm ')) score += 20;
      } else if (lowerInput.includes(skillLowerName)) {
        score += 50;
      }

      // 3. Keyword matching (10 points each)
      for (const keyword of skill.keywords) {
        const kwLower = keyword.toLowerCase();
        if (lowerInput.includes(kwLower)) score += 10;
      }

      // 4. Pattern matching (15 points each)
      for (const pattern of skill.patterns) {
        try {
          if (new RegExp(pattern, 'i').test(lowerInput)) score += 15;
        } catch { /* skip invalid */ }
      }

      // 5. Example matching
      for (const example of skill.examples.slice(0, 5)) {
        const exampleLower = example.toLowerCase();
        const words = exampleLower.split(' ').filter(w => w.length > 3);
        for (const w of words) {
          if (lowerInput.includes(w)) score += 3;
        }
      }

      // 6. Priority bonus
      score += skill.priority;

      if (score > 0) scores.push({ skill, score });
    }

    scores.sort((a, b) => b.score - a.score);

    if (scores.length === 0 || scores[0].score < 10) return null;

    return {
      skill: {
        name: scores[0].skill.name,
        description: scores[0].skill.description,
        content: scores[0].skill.content,
        userInvocable: scores[0].skill.userInvocable
      },
      confidence: Math.min(scores[0].score / 100, 1),
      matched: scores[0].skill.name
    };
  }

  getAll(): SkillDefinition[] {
    return Array.from(this.skills.values()).map(s => ({
      name: s.name,
      description: s.description,
      user_invocable: s.userInvocable
    }));
  }

  get(name: string): EnhancedSkill | undefined {
    return this.skills.get(name);
  }

  // Parse explicit skill call
  // Supports: /skill code-review, /skill code_review, /使用 code-review
  parseExplicitSkill(input: string): { skillName: string; params: string } | null {
    // Match /skill or /使用 followed by skill name (with optional hyphen/underscore)
    const match = input.match(/^\/(?:skill|使用)\s+([a-zA-Z][\w-]*)\s*(.*)$/i);
    if (match) {
      return { skillName: match[1], params: match[2] || '' };
    }
    return null;
  }
}

export const skillMatcher = new SkillMatcher();