import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';
import { Skill, SkillDefinition } from './types.js';

export class SkillLoader {
  private skills: Map<string, Skill> = new Map();

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
            // Skip if SKILL.md doesn't exist
          }
        } else if (entry.name === 'SKILL.md') {
          const skill = await this.loadSkillFile(path.join(dirPath, entry.name));
          if (skill) {
            this.skills.set(skill.name, skill);
          }
        }
      }
    } catch (error) {
      console.error('Error loading skills:', error);
    }
  }

  private async loadSkillFile(filePath: string): Promise<Skill | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const { data, content: skillContent } = matter(content);

      return {
        name: data.name || path.basename(path.dirname(filePath)),
        description: data.description || '',
        content: skillContent,
        userInvocable: data['user-invocable'] || false
      };
    } catch {
      return null;
    }
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  getAll(): SkillDefinition[] {
    return Array.from(this.skills.values()).map(skill => ({
      name: skill.name,
      description: skill.description,
      user_invocable: skill.userInvocable
    }));
  }

  getUserInvocable(): SkillDefinition[] {
    return this.getAll().filter(s => s.user_invocable);
  }
}

export const skillLoader = new SkillLoader();
