import { AgentConfig, AgentTemplate, AGENT_TEMPLATES, FactoryOptions } from './types.js';
import { AgentExecutor } from './executor.js';
import { ToolRegistry } from '../tools/index.js';

/**
 * Agent 工厂 - 根据配置创建不同类型的 Agent
 */
export class AgentFactory {
  private toolRegistry: ToolRegistry;
  private options: FactoryOptions;
  private agents: Map<string, AgentExecutor> = new Map();

  constructor(toolRegistry: ToolRegistry, options: FactoryOptions = {}) {
    this.toolRegistry = toolRegistry;
    this.options = {
      defaultMaxIterations: 10,
      defaultTimeout: 300000,
      ...options
    };
  }

  /**
   * 根据配置创建 Agent
   */
  createAgent(config: AgentConfig): AgentExecutor {
    const executor = new AgentExecutor();

    // 设置最大迭代次数
    if (config.maxIterations) {
      (executor as any).maxIterations = config.maxIterations;
    } else {
      (executor as any).maxIterations = this.options.defaultMaxIterations;
    }

    // 验证工具是否可用
    const availableTools = this.toolRegistry.getAll().map(t => t.name);
    const invalidTools = config.tools.filter(t => !availableTools.includes(t));
    if (invalidTools.length > 0) {
      console.warn(`警告: Agent '${config.name}' 配置了无效的工具: ${invalidTools.join(', ')}`);
    }

    // 存储 Agent
    this.agents.set(config.id, executor);

    console.log(`Agent '${config.name}' (${config.type}) 已创建，工具: [${config.tools.join(', ')}]`);

    return executor;
  }

  /**
   * 从模板创建预定义的 Agent
   */
  createFromTemplate(
    type: AgentTemplate['type'],
    id: string,
    name?: string
  ): AgentExecutor {
    const template = AGENT_TEMPLATES.find(t => t.type === type);
    if (!template) {
      throw new Error(`未知的 Agent 模板类型: ${type}`);
    }

    const config: AgentConfig = {
      id,
      name: name || template.name,
      type: template.type,
      description: template.description,
      tools: template.defaultTools,
      skills: template.defaultSkills
    };

    return this.createAgent(config);
  }

  /**
   * 创建代码审查 Agent
   */
  createCodeReviewer(id: string = 'code-reviewer'): AgentExecutor {
    return this.createFromTemplate('reviewer', id, 'Code Reviewer');
  }

  /**
   * 创建代码开发 Agent
   */
  createCoder(id: string = 'coder'): AgentExecutor {
    return this.createFromTemplate('coder', id, 'Code Developer');
  }

  /**
   * 创建研究 Agent
   */
  createResearcher(id: string = 'researcher'): AgentExecutor {
    return this.createFromTemplate('researcher', id, 'Researcher');
  }

  /**
   * 创建通用 Agent
   */
  createGeneralAgent(id: string = 'general'): AgentExecutor {
    return this.createFromTemplate('general', id, 'General Assistant');
  }

  /**
   * 获取已创建的 Agent
   */
  getAgent(id: string): AgentExecutor | undefined {
    return this.agents.get(id);
  }

  /**
   * 获取所有已创建的 Agent
   */
  getAllAgents(): Map<string, AgentExecutor> {
    return this.agents;
  }

  /**
   * 删除 Agent
   */
  removeAgent(id: string): boolean {
    return this.agents.delete(id);
  }

  /**
   * 获取可用的 Agent 配置列表
   */
  getAvailableTemplates(): AgentTemplate[] {
    return AGENT_TEMPLATES;
  }
}