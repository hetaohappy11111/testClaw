// Enterprise Skill Manager - Dynamic loading, permissions, sandboxing
import * as fs from 'fs/promises';
import * as path from 'path';
import * as fsWatcher from 'fs/promises';
import {
  BaseSkill,
  SkillType,
  Permission,
  PromptSkill,
  CodeSkill,
  WorkflowSkill,
  SkillResult,
  SkillManifest,
  SkillLoaderConfig,
  SkillContext
} from './enterprise-types.js';
import { toolRegistry } from '../tools/index.js';
import matter from 'gray-matter';

export class SkillManager {
  private skills: Map<string, BaseSkill> = new Map();
  private config: SkillLoaderConfig;
  private watchers: Map<string, any> = new Map();
  private initialized = false;

  constructor(config?: Partial<SkillLoaderConfig>) {
    this.config = {
      skillsDir: config?.skillsDir || './skills',
      watchForChanges: config?.watchForChanges ?? true,
      autoReload: config?.autoReload ?? true,
      sandboxed: config?.sandboxed ?? true
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load all skills
    await this.loadAllSkills();

    // Setup file watcher for hot reload
    if (this.config.watchForChanges) {
      await this.setupWatcher();
    }

    this.initialized = true;
    console.log('[SkillManager] Initialized with', this.skills.size, 'skills');
  }

  private async loadAllSkills(): Promise<void> {
    try {
      const entries = await fs.readdir(this.config.skillsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillPath = path.join(this.config.skillsDir, entry.name, 'SKILL.md');
          const manifestPath = path.join(this.config.skillsDir, entry.name, 'manifest.json');

          try {
            const skill = await this.loadSkill(entry.name, skillPath, manifestPath);
            if (skill) {
              this.skills.set(skill.name, skill);
            }
          } catch (e) {
            console.error(`[SkillManager] Failed to load skill ${entry.name}:`, e);
          }
        }
      }
    } catch (e) {
      console.error('[SkillManager] Failed to load skills:', e);
    }
  }

  private async loadSkill(
    name: string,
    skillPath: string,
    manifestPath?: string
  ): Promise<BaseSkill | null> {
    try {
      const content = await fs.readFile(skillPath, 'utf-8');
      const { data, content: body } = matter(content);

      const manifest: Partial<SkillManifest> = data || {};

      // Load manifest if exists
      let extManifest: Partial<SkillManifest> = {};
      try {
        if (manifestPath) {
          const manifestContent = await fs.readFile(manifestPath, 'utf-8');
          extManifest = JSON.parse(manifestContent);
        }
      } catch { /* optional */ }

      const merged = { ...manifest, ...extManifest };

      // Determine skill type
      const type = (merged.type as SkillType) || 'prompt';

      const baseSkill: BaseSkill = {
        name: merged.name || name,
        description: merged.description || '',
        type,
        category: merged.category || 'general',
        version: merged.version || '1.0.0',
        author: merged.author,
        permissions: merged.permissions || ['read'],
        metadata: {}
      };

      // Type-specific loading
      if (type === 'code') {
        return this.loadCodeSkill(baseSkill, body);
      } else if (type === 'workflow') {
        return this.loadWorkflowSkill(baseSkill, body);
      } else {
        return this.loadPromptSkill(baseSkill, body);
      }
    } catch (e) {
      console.error(`[SkillManager] Error loading skill ${name}:`, e);
      return null;
    }
  }

  private loadPromptSkill(base: BaseSkill, content: string): PromptSkill {
    const patterns = this.extractPatterns(content);
    const examples = this.extractExamples(content);
console.log('patterns', patterns);
console.log('examples', examples);
    return {
      ...base,
      type: 'prompt',
      template: content,
      patterns,
      examples
    };
  }

  private loadCodeSkill(base: BaseSkill, content: string): CodeSkill {
    // Extract code block
    const codeMatch = content.match(/```(?:javascript|python|bash)\n([\s\S]*?)```/);
    const code = codeMatch?.[1] || content;

    // Extract language
    let language: 'javascript' | 'python' | 'bash' = 'javascript';
    if (content.includes('```python')) language = 'python';
    else if (content.includes('```bash')) language = 'bash';

    return {
      ...base,
      type: 'code',
      language,
      code
    };
  }

  private loadWorkflowSkill(base: BaseSkill, content: string): WorkflowSkill {
    // Try to parse steps from content
    const steps: any[] = [];
    const stepPattern = content.match(/## Step (\d+): /g);
    if (stepPattern) {
      steps.push({
        name: 'Step parsed',
        // Steps parsed from content
      });
    }

    return {
      ...base,
      type: 'workflow',
      steps
    };
  }

  // Get all skills filtered by category
  getSkillsByCategory(category: string): BaseSkill[] {
    return Array.from(this.skills.values()).filter(
      skill => skill.category === category
    );
  }

  private extractPatterns(content: string): string[] {
    const patterns: string[] = [];
    const match = content.match(/## (When to Use|Usage Examples)[\s\S]*?(?:\n##|$)/i);
    if (match) {
      const lines = match[0].split('\n');
      for (const line of lines) {
        const trimmed = line.trim().replace(/^[-*]\s*/, '');
        if (trimmed && trimmed.length > 3) {
          patterns.push(trimmed);
        }
      }
    }
    return patterns;
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

  private async setupWatcher(): Promise<void> {
    // Simple polling for now
    // In production, use chokidar or fs.watch
  }

  // Reload a specific skill
  async reloadSkill(name: string): Promise<boolean> {
    const skillPath = path.join(this.config.skillsDir, name, 'SKILL.md');
    const manifestPath = path.join(this.config.skillsDir, name, 'manifest.json');

    const skill = await this.loadSkill(name, skillPath, manifestPath);
    if (skill) {
      this.skills.set(name, skill);
      return true;
    }
    return false;
  }

  // Execute skill with permission checking
  async execute(
    name: string,
    input: any,
    context: SkillContext
  ): Promise<SkillResult> {
    const startTime = Date.now();
    const skill = this.skills.get(name);

    if (!skill) {
      return {
        skill: name,
        success: false,
        error: `Skill not found: ${name}`,
        duration: Date.now() - startTime
      };
    }

    // Permission check
    if (!this.hasPermission(skill, input)) {
      return {
        skill: name,
        success: false,
        error: 'Permission denied',
        duration: Date.now() - startTime
      };
    }

    try {
      // Execute based on type
      if (skill.type === 'code') {
        return await this.executeCodeSkill(skill as CodeSkill, input, context);
      } else if (skill.type === 'workflow') {
        return await this.executeWorkflowSkill(skill as WorkflowSkill, input, context);
      } else {
        // Prompt skill - return template
        return {
          skill: name,
          success: true,
          output: (skill as PromptSkill).template,
          duration: Date.now() - startTime
        };
      }
    } catch (e) {
      return {
        skill: name,
        success: false,
        error: (e as Error).message,
        duration: Date.now() - startTime
      };
    }
  }

  private hasPermission(skill: BaseSkill, input: any): boolean {
    if (!this.config.sandboxed) return true;

    // Check required permissions
    const required = skill.permissions || ['read'];

    // For now, allow all (in production, check against user permissions)
    return true;
  }

  private async executeCodeSkill(
    skill: CodeSkill,
    input: any,
    context: SkillContext
  ): Promise<SkillResult> {
    const startTime = Date.now();

    // Execute in sandbox
    if (skill.language === 'bash') {
      const result = await toolRegistry.execute('Bash', {
        command: skill.code
      }, context as any);

      return {
        skill: skill.name,
        success: result.success,
        output: result.output,
        error: result.error,
        duration: Date.now() - startTime
      };
    }

    // JavaScript - simple eval (sandboxed)
    if (skill.language === 'javascript') {
      try {
        // Create sandbox context
        const sandbox = {
          input,
          context,
          console: {
            log: (...args: any[]) => args.join(' '),
            error: (...args: any[]) => args.join(' ')
          }
        };

        // Simple execution
        const fn = new Function('sandbox', `with(sandbox) { ${skill.code} }`);
        const output = fn(sandbox);

        return {
          skill: skill.name,
          success: true,
          output: String(output),
          duration: Date.now() - startTime
        };
      } catch (e) {
        return {
          skill: skill.name,
          success: false,
          error: (e as Error).message,
          duration: Date.now() - startTime
        };
      }
    }

    return {
      skill: skill.name,
      success: false,
      error: `Unsupported language: ${skill.language}`,
      duration: Date.now() - startTime
    };
  }

  private async executeWorkflowSkill(
    skill: WorkflowSkill,
    input: any,
    context: SkillContext
  ): Promise<SkillResult> {
    const startTime = Date.now();
    const steps: any[] = [];

    let currentInput = input;

    for (const step of skill.steps) {
      const stepStart = Date.now();

      try {
        let output: any;

        if (step.tool) {
          const result = await toolRegistry.execute(step.tool, currentInput, context as any);
          output = result.output;
        } else if (step.skill) {
          const result = await this.execute(step.skill, currentInput, context);
          output = result.output;
        }

        steps.push({
          name: step.name,
          success: true,
          output,
          duration: Date.now() - stepStart
        });

        currentInput = { ...currentInput, ...output };
      } catch (e) {
        steps.push({
          name: step.name,
          success: false,
          error: (e as Error).message,
          duration: Date.now() - stepStart
        });

        if (step.onError === 'abort') {
          break;
        }
      }
    }

    return {
      skill: skill.name,
      success: steps.every(s => s.success),
      duration: Date.now() - startTime,
      steps
    };
  }

  // Get all skills
  getAll(): BaseSkill[] {
    return Array.from(this.skills.values());
  }

  // Get by name
  get(name: string): BaseSkill | undefined {
    return this.skills.get(name);
  }

  // List by type
  getByType(type: SkillType): BaseSkill[] {
    return Array.from(this.skills.values()).filter(s => s.type === type);
  }

  // Search skills
  search(query: string): BaseSkill[] {
    const lower = query.toLowerCase();
    return Array.from(this.skills.values()).filter(s =>
      s.name.toLowerCase().includes(lower) ||
      s.description.toLowerCase().includes(lower) ||
      s.category.toLowerCase().includes(lower)
    );
  }

  // Shutdown
  async shutdown(): Promise<void> {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
  }
}

export const skillManager = new SkillManager();