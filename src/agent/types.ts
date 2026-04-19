// Agent 类型
export type AgentType = 'general' | 'coder' | 'reviewer' | 'researcher' | 'custom';

// Agent 配置
export interface AgentConfig {
  id: string;
  name: string;
  type: AgentType;
  description: string;
  tools: string[];           // 允许使用的工具
  maxIterations?: number;
  timeout?: number;
  skills?: string[];         // 绑定技能
}

// Agent 执行结果
export interface AgentResult {
  agentId: string;
  success: boolean;
  output: string;
  toolExecutions: {
    name: string;
    arguments: any;
    result: {
      success: boolean;
      output?: any;
      error?: string;
    };
    duration?: number;
  }[];
  error?: string;
  duration: number;
}

// 任务定义
export interface AgentTask {
  id: string;
  description: string;
  input: string;
  context: {
    cwd: string;
    homeDir: string;
    [key: string]: any;
  };
  assignedAgent?: string;
  priority?: number;
  dependencies?: string[];
}

// Agent 执行模式
export type ExecutionMode = 'parallel' | 'sequential' | 'direct';

// 协调器选项
export interface CoordinatorOptions {
  defaultTimeout?: number;
  maxConcurrent?: number;
  retryOnFailure?: boolean;
  maxRetries?: number;
}

// 工具上下文
export interface AgentToolContext {
  cwd: string;
  homeDir: string;
  [key: string]: any;
}

// Agent 工厂选项
export interface FactoryOptions {
  defaultMaxIterations?: number;
  defaultTimeout?: number;
}

// 预定义 Agent 模板
export interface AgentTemplate {
  type: AgentType;
  name: string;
  description: string;
  defaultTools: string[];
  defaultSkills?: string[];
}

// 预定义的 Agent 模板
export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    type: 'general',
    name: 'General Assistant',
    description: '通用助手，处理各种任务',
    defaultTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'WebFetch', 'WebSearch']
  },
  {
    type: 'coder',
    name: 'Code Developer',
    description: '代码开发助手，擅长编写和修改代码',
    defaultTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash']
  },
  {
    type: 'reviewer',
    name: 'Code Reviewer',
    description: '代码审查专家，分析代码质量',
    defaultTools: ['Read', 'Glob', 'Grep']
  },
  {
    type: 'researcher',
    name: 'Researcher',
    description: '研究助手，擅长搜索和获取信息',
    defaultTools: ['WebSearch', 'WebFetch', 'Grep', 'Read']
  },
  {
    type: 'custom',
    name: 'Custom Agent',
    description: '自定义 Agent',
    defaultTools: []
  }
];