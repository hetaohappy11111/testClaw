// Enterprise Skill Types - Multi-type support
import { ToolContext, ToolResult } from '../tools/types.js';

// Base Skill interface
export interface BaseSkill {
  name: string;
  description: string;
  type: SkillType;
  category: string;
  version: string;
  author?: string;
  permissions: Permission[];
  metadata: Record<string, any>;
}

export type SkillType = 'prompt' | 'code' | 'workflow';

// Permission levels
export type Permission =
  | 'read'
  | 'write'
  | 'execute'
  | 'network'
  | 'filesystem'
  | 'admin';

// Prompt-based Skill (existing style)
export interface PromptSkill extends BaseSkill {
  type: 'prompt';
  template: string;
  examples: string[];
  patterns: string[];
}

// Code-based Skill (executable function)
export interface CodeSkill extends BaseSkill {
  type: 'code';
  language: 'javascript' | 'python' | 'bash';
  code: string;
  inputSchema?: Record<string, any>;
  outputSchema?: Record<string, any>;
  timeout?: number;
}

// Workflow Skill (multi-step)
export interface WorkflowSkill extends BaseSkill {
  type: 'workflow';
  steps: WorkflowStep[];
  retryPolicy?: RetryPolicy;
}

export interface WorkflowStep {
  name: string;
  skill?: string;
  tool?: string;
  input: Record<string, any>;
  condition?: string;
  onError?: 'continue' | 'abort' | 'retry';
}

export interface RetryPolicy {
  maxRetries: number;
  backoffMs: number;
}

// Skill Execution Result
export interface SkillResult {
  skill: string;
  success: boolean;
  output?: string;
  error?: string;
  duration: number;
  steps?: StepResult[];
}

export interface StepResult {
  name: string;
  success: boolean;
  output?: string;
  error?: string;
  duration: number;
}

// Skill Manifest
export interface SkillManifest {
  name: string;
  description: string;
  type: SkillType;
  version: string;
  author?: string;
  permissions?: Permission[];
  category?: string;
  tags?: string[];
}

// Skill Loader Config
export interface SkillLoaderConfig {
  skillsDir: string;
  watchForChanges: boolean;
  autoReload: boolean;
  sandboxed: boolean;
}

// Skill Execution Context
export interface SkillContext {
  userId?: string;
  sessionId?: string;
  cwd: string;
  homeDir: string;
  env: Record<string, string>;
}

// Simple skill definition (for compatibility)
export interface Skill {
  name: string;
  description: string;
  content: string;
  userInvocable: boolean;
}

export interface SkillDefinition {
  name: string;
  description: string;
  user_invocable: boolean;
}

export interface SkillMatch {
  skill: Skill;
  confidence: number;
  matched: string;
}