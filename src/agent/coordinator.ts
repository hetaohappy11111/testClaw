import {
  AgentTask,
  AgentResult,
  CoordinatorOptions,
  ExecutionMode,
  AgentToolContext
} from './types.js';
import { AgentFactory } from './factory.js';
import { AgentExecutor } from './executor.js';
import { ToolRegistry } from '../tools/index.js';
import { Skill } from '../skills/types.js';

/**
 * 多 Agent 协调器 - 管理多个 Agent 之间的任务分发和协调
 */
export class MultiAgentCoordinator {
  private agents: Map<string, AgentExecutor> = new Map();
  private toolRegistry: ToolRegistry;
  private agentFactory: AgentFactory;
  private skills: Skill[] = [];
  private options: Required<CoordinatorOptions>;
  private llmProvider: any = null;

  constructor(toolRegistry: ToolRegistry, options: CoordinatorOptions = {}) {
    this.toolRegistry = toolRegistry;
    this.agentFactory = new AgentFactory(toolRegistry);
    this.options = {
      defaultTimeout: options.defaultTimeout || 300000,
      maxConcurrent: options.maxConcurrent || 5,
      retryOnFailure: options.retryOnFailure ?? true,
      maxRetries: options.maxRetries || 2
    };

    this.registerDefaultAgents();
  }

  /**
   * 设置 LLM Provider
   */
  setLLMProvider(provider: any) {
    this.llmProvider = provider;
    // 设置所有已注册 Agent 的 LLM Provider
    for (const agent of this.agents.values()) {
      agent.setLLMProvider(provider);
    }
  }

  /**
   * 注册默认的 Agent
   */
  private registerDefaultAgents() {
    // 创建通用 Agent
    const generalAgent = this.agentFactory.createGeneralAgent('general');
    this.agents.set('general', generalAgent);

    // 创建专业 Agent
    const codeReviewer = this.agentFactory.createCodeReviewer('reviewer');
    this.agents.set('reviewer', codeReviewer);

    const coder = this.agentFactory.createCoder('coder');
    this.agents.set('coder', coder);

    const researcher = this.agentFactory.createResearcher('researcher');
    this.agents.set('researcher', researcher);

    console.log('默认 Agent 已注册: general, reviewer, coder, researcher');
  }

  /**
   * 注册新的 Agent
   */
  registerAgent(id: string, executor: AgentExecutor): void {
    this.agents.set(id, executor);
    console.log(`Agent '${id}' 已注册`);
  }

  /**
   * 根据任务自动选择合适的 Agent
   */
  private selectAgentForTask(task: AgentTask): AgentExecutor {
    // 如果任务指定了 Agent，优先使用
    if (task.assignedAgent) {
      const agent = this.agents.get(task.assignedAgent);
      if (agent) {
        return agent;
      }
      console.warn(`指定的 Agent '${task.assignedAgent}' 不存在，使用默认 Agent`);
    }

    // 基于任务描述选择合适的 Agent
    const input = task.input.toLowerCase();
    const desc = task.description.toLowerCase();

    // 代码审查任务
    if (desc.includes('review') || desc.includes('审查') || desc.includes('检查')) {
      const reviewer = this.agents.get('reviewer');
      if (reviewer) return reviewer;
    }

    // 搜索任务
    if (input.includes('search') || input.includes('搜索') || input.includes('find')) {
      const researcher = this.agents.get('researcher');
      if (researcher) return researcher;
    }

    // 代码编写任务
    if (input.includes('code') || input.includes('write') || input.includes('生成') || input.includes('create')) {
      const coder = this.agents.get('coder');
      if (coder) return coder;
    }

    // 默认使用通用 Agent
    const generalAgent = this.agents.get('general');
    if (generalAgent) return generalAgent;

    // 如果没有通用 Agent，使用第一个可用的
    const firstAgent = this.agents.values().next().value;
    if (firstAgent) return firstAgent;

    // 如果没有任何 Agent，抛出错误
    throw new Error('没有可用的 Agent');
  }

  /**
   * 分发任务给指定的 Agent
   */
  async dispatch(task: AgentTask): Promise<AgentResult> {
    const agent = this.selectAgentForTask(task);
    const agentId = this.findAgentId(agent);

    console.log(`\n[Coordinator] 分发任务 '${task.id}' 到 Agent '${agentId}'`);
    console.log(`[Coordinator] 任务描述: ${task.description}`);
    console.log(`[Coordinator] 输入: ${task.input.substring(0, 100)}...`);

    const startTime = Date.now();

    try {
      const result = await agent.executeWithLLM(
        task.input,
        task.context,
        this.skills,
        task.id,
        null
      );

      return {
        agentId,
        success: !result.error,
        output: result.content,
        toolExecutions: result.toolExecutions || [],
        error: result.error,
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        agentId,
        success: false,
        output: '',
        toolExecutions: [],
        error: (error as Error).message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * 并行执行多个任务
   */
  async executeParallel(tasks: AgentTask[]): Promise<AgentResult[]> {
    console.log(`\n[Coordinator] 并行执行 ${tasks.length} 个任务`);

    // 限制并发数量
    const limitedTasks = tasks.slice(0, this.options.maxConcurrent);

    const promises = limitedTasks.map(task =>
      this.dispatch(task).catch(error => ({
        agentId: 'unknown',
        success: false,
        output: '',
        toolExecutions: [],
        error: (error as Error).message,
        duration: 0
      }))
    );

    const results = await Promise.all(promises);

    // 打印执行摘要
    const successCount = results.filter(r => r.success).length;
    console.log(`[Coordinator] 执行完成: ${successCount}/${results.length} 成功`);

    return results;
  }

  /**
   * 串行执行多个任务（带依赖）
   */
  async executeSequential(tasks: AgentTask[]): Promise<AgentResult[]> {
    console.log(`\n[Coordinator] 串行执行 ${tasks.length} 个任务`);

    const results: AgentResult[] = [];

    for (const task of tasks) {
      // 检查依赖是否满足
      if (task.dependencies && task.dependencies.length > 0) {
        const failedDeps = task.dependencies.filter(
          depId => {
            const depResult = results.find(r => r.agentId === depId);
            return !depResult || !depResult.success;
          }
        );

        if (failedDeps.length > 0) {
          console.warn(`[Coordinator] 任务 '${task.id}' 的依赖未满足: ${failedDeps.join(', ')}`);
          results.push({
            agentId: 'unknown',
            success: false,
            output: '',
            toolExecutions: [],
            error: `依赖未满足: ${failedDeps.join(', ')}`,
            duration: 0
          });
          continue;
        }
      }

      const result = await this.dispatch(task);
      results.push(result);

      // 如果任务失败且不允许继续，可以提前退出
      if (!result.success && !this.options.retryOnFailure) {
        console.warn(`[Coordinator] 任务 '${task.id}' 失败，停止执行`);
        break;
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[Coordinator] 执行完成: ${successCount}/${results.length} 成功`);

    return results;
  }

  /**
   * 直接执行任务（不通过 Agent）
   */
  async executeDirect(task: AgentTask): Promise<AgentResult> {
    console.log(`\n[Coordinator] 直接执行任务 '${task.id}'`);

    const startTime = Date.now();
    const agentId = 'direct';

    try {
      // 使用通用 Agent 执行
      const agent = this.agents.get('general');
      if (!agent) {
        throw new Error('没有可用的 Agent');
      }

      const result = await agent.executeWithLLM(
        task.input,
        task.context,
        this.skills,
        task.id,
        null
      );

      return {
        agentId,
        success: !result.error,
        output: result.content,
        toolExecutions: result.toolExecutions || [],
        error: result.error,
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        agentId,
        success: false,
        output: '',
        toolExecutions: [],
        error: (error as Error).message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * 根据模式执行任务
   */
  async execute(tasks: AgentTask[], mode: ExecutionMode = 'direct'): Promise<AgentResult[]> {
    switch (mode) {
      case 'parallel':
        return this.executeParallel(tasks);
      case 'sequential':
        return this.executeSequential(tasks);
      case 'direct':
      default:
        // 直接模式: 逐个执行，收集结果
        const results: AgentResult[] = [];
        for (const task of tasks) {
          const result = await this.dispatch(task);
          results.push(result);
        }
        return results;
    }
  }

  /**
   * 设置技能列表
   */
  setSkills(skills: Skill[]) {
    this.skills = skills;
  }

  /**
   * 获取所有已注册的 Agent
   */
  getAgents(): Map<string, AgentExecutor> {
    return this.agents;
  }

  /**
   * 获取指定 Agent
   */
  getAgent(id: string): AgentExecutor | undefined {
    return this.agents.get(id);
  }

  /**
   * 获取 Agent 工厂
   */
  getFactory(): AgentFactory {
    return this.agentFactory;
  }

  /**
   * 查找 Agent ID
   */
  private findAgentId(agent: AgentExecutor): string {
    for (const [id, a] of this.agents.entries()) {
      if (a === agent) return id;
    }
    return 'unknown';
  }

  /**
   * 获取协调器状态
   */
  getStatus() {
    return {
      agentCount: this.agents.size,
      agentIds: Array.from(this.agents.keys()),
      options: this.options
    };
  }
}