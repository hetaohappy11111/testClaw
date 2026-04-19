import * as path from 'path';
import { toolRegistry } from '../tools/index.js';
import { Skill, SkillMatch } from '../skills/types.js';
import { ToolContext, ToolResult } from '../tools/types.js';
import { memoryStore } from '../memory/index.js';
import { memoryManager, shouldRemember } from '../memory/manager.js';

export interface ToolCall {
  name: string;
  arguments: any;
}

export interface ToolExecution {
  name: string;
  arguments: any;
  result: ToolResult;
  duration?: number;
}

export interface ExecutionResult {
  content: string;
  toolExecutions?: ToolExecution[];
  error?: string;
}

export class AgentExecutor {
  private toolRegistry = toolRegistry;
  private llmProvider: any = null;
  private maxIterations = 10;
  private sessionId = 'default';

  setLLMProvider(provider: any) {
    this.llmProvider = provider;
  }

  setSessionId(sessionId: string) {
    this.sessionId = sessionId;
  }

  buildSystemPrompt(skills: Skill[], currentSkill?: SkillMatch | null): string {
    const toolDefs = this.toolRegistry.getAll();

    // For skill tasks, create a very directive prompt
    let prompt = '';

    if (currentSkill) {
      // Skill-specific prompt - very directive
      prompt = `你需要完成一个具体的任务。请严格按照以下步骤执行，不要输出其他内容。

## 任务：${currentSkill.skill.name}
${currentSkill.skill.description}

## 执行步骤
${currentSkill.skill.content}

## 输出格式要求
每一步都**必须**按以下格式输出（不要输出其他内容）：

TOOL_CALL: 工具名 | 参数=值

例如：
TOOL_CALL: Glob | pattern=src/**/*.ts
TOOL_CALL: Read | file_path=src/agent/executor.ts

**绝对禁止**：
- 不要输出 markdown 代码块
- 不要输出 bash 命令（如 \`ls -la\`）
- 不要只输出文字描述
- 必须直接输出 TOOL_CALL 格式

**重要**：完成任务后，输出：
Final Answer: 你的结果

`;

    } else {
      prompt = `你是一个 AI 编程助手，帮助用户完成编码任务。

## 🔄 ReAct 执行模式 - 必须遵循
当你需要执行操作时，**必须**按以下格式输出工具调用：

TOOL_CALL: 工具名 | 参数1=值1 | 参数2=值2

示例（严格按照此格式）：
TOOL_CALL: Glob | pattern=*.ts
TOOL_CALL: Read | file_path=package.json
TOOL_CALL: Bash | command=ls -la

**禁止**只输出文字描述！**禁止**只给bash命令！**必须**使用 TOOL_CALL 格式调用工具！

`;
    }

    // Add available tools
    prompt += `## 可用工具
`;
    for (const tool of toolDefs) {
      prompt += `- ${tool.name}: ${tool.description}\n`;
    }
    prompt += '\n';

    // Add skills to prompt
    if (skills.length > 0 && !currentSkill) {
      prompt += `## 可用技能\n`;
      for (const skill of skills) {
        prompt += `- ${skill.name}: ${skill.description}\n`;
      }
      prompt += '\n';
    }

    return prompt;
  }

  buildToolsForLLM() {
    const toolDefs = this.toolRegistry.getAll();
    return toolDefs.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema
      }
    }));
  }

  async executeWithLLM(
    userMessage: string,
    context: ToolContext,
    skills: Skill[],
    sessionId?: string,
    currentSkill?: SkillMatch | null
  ): Promise<ExecutionResult> {
    if (!this.llmProvider) {
      return { content: 'LLM provider not configured', error: 'Please set MiniMax API key' };
    }

    const session = sessionId || this.sessionId;
    const history = memoryManager.getShortTermHistory(session);
    const systemPrompt = this.buildSystemPrompt(skills, currentSkill);

    const messages: any[] = [{ role: 'system', content: systemPrompt }];

    // Add history (last 10 messages)
    const recentHistory = history.slice(-10);
    for (const entry of recentHistory) {
      if (entry.role === 'user') {
        messages.push({ role: 'user', content: entry.content });
      } else if (entry.role === 'assistant') {
        messages.push({ role: 'assistant', content: entry.content });
      }
    }

    // Add relevant semantic context from memory manager (RAG)
    const semanticContext = await memoryManager.getSemanticContext(userMessage);
    if (semanticContext.length > 0) {
      messages.push({
        role: 'system',
        content: `相关记忆: ${semanticContext.join('; ')}`
      });
    }

    // Retrieve long-term memories
    const relevantMemories = await memoryManager.retrieve(userMessage, {
      types: ['long_term'],
      topK: 3,
      minSimilarity: 0.5
    });
    if (relevantMemories.length > 0) {
      const memContent = relevantMemories.map(r => r.memory.content.substring(0, 100)).join('; ');
      messages.push({
        role: 'system',
        content: `参考: ${memContent}`
      });
    }

    messages.push({ role: 'user', content: userMessage });

    // If a skill is active, add a more specific task description
    if (currentSkill) {
      // Add a follow-up message that reinforces the task
      const taskDescriptions: Record<string, string> = {
        'code-review': '请使用 Glob 工具查找 src 目录下的所有 TypeScript 文件，然后用 Read 工具读取文件内容，最后输出代码审查报告',
        'bash-executor': '请使用 Bash 工具执行用户请求的命令',
        'file-generator': '请生成用户请求的文件内容',
        'git-helper': '请使用 Git 工具帮助用户完成版本控制任务',
        'web-search': '请使用 WebSearch 或 TavilySearch 搜索用户请求的内容',
        'search-code': '请使用 Grep 工具搜索代码',
        'read-file': '请使用 Read 工具读取文件',
        'coding-agent': '请帮助用户完成编码任务'
      };

      const taskDesc = taskDescriptions[currentSkill.skill.name] || `请按照 ${currentSkill.skill.name} 技能执行任务`;
      messages.push({ role: 'user', content: taskDesc });
    }

    let iterations = 0;
    let lastContent = '';
    let finalAnswer = '';
    const toolExecutions: ToolExecution[] = [];
    let hasFinalAnswer = false;

    // ReAct 循环
    while (iterations < this.maxIterations && !hasFinalAnswer) {
      iterations++;

      try {
        const response = await this.llmProvider.chat(messages);

      let content = '';
      let thinking = '';
      let toolCallRequests: { name: string; input: any }[] = [];

      if (response.content && Array.isArray(response.content)) {
        for (const block of response.content) {
          if (block.type === 'thinking') {
            thinking = block.thinking || '';
          } else if (block.type === 'text') {
            content = block.text || '';
          } else if (block.type === 'tool_call') {
            // Handle native tool_call format from MiniMax
            toolCallRequests.push({
              name: block.name,
              input: block.input || {}
            });
          }
        }
      } else {
          // Fallback: content might be a string directly
          content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
        }

        // Show thinking
        if (thinking) {
          console.log('\n\x1b[90m💭 Thought:\x1b[0m');
          console.log('\x1b[90m' + thinking.substring(0, 200) + '\x1b[0m');
        }

        // FIRST: Extract tool calls from text content (before checking Final Answer)
        // Extract tool calls from text content
        if (toolCallRequests.length === 0 && content.trim()) {
          let cleanContent = content.replace(/&#34;/g, '"').replace(/&#39;/g, "'");

          // Format 1: [TOOL_CALL] {tool => "Glob", args => { --pattern "..." }} [/TOOL_CALL]
          const customMatch = cleanContent.match(/\[TOOL_CALL\]\s*\{tool\s*=>\s*"(\w+)"[\s\S]*?--(\w+)\s+\[?"([^"\]]+)"?\]?[\s\S]*?\}\s*\[\/TOOL_CALL\]/i);
          if (customMatch) {
            const paramName = customMatch[2] === 'FILES' ? 'file_path' : customMatch[2];
            toolCallRequests.push({ name: customMatch[1], input: { [paramName]: customMatch[3] } });
          }
          // Format 2: glob "src/**/*.ts"
          else {
            const globMatch = cleanContent.match(/(?:glob|Glob)\s+["']([^"']+)["']/i);
            if (globMatch) {
              toolCallRequests.push({ name: 'Glob', input: { pattern: globMatch[1] } });
            }
            else {
              const readMatch = cleanContent.match(/(?:read|Read)\s+["']([^"']+\.ts)["']/i);
              if (readMatch) {
                toolCallRequests.push({ name: 'Read', input: { file_path: path.resolve(context.cwd, readMatch[1]) } });
              }
            }
          }
        }

        // SECOND: Check for Final Answer (only if no tool calls found)
        // Check for Final Answer
        const finalMatch = content.match(/Final Answer:\s*([\s\S]*)$/i);
        if (finalMatch && toolCallRequests.length === 0) {
          finalAnswer = finalMatch[1].trim();
          hasFinalAnswer = true;
          lastContent = finalAnswer;
          break;
        }

        // Parse tool calls from text content
        const toolCallRegex = /TOOL_CALL:?\s*(\w+)\s*\|?\s*(.+)/gi;
        let match;
        while ((match = toolCallRegex.exec(content)) !== null) {
          const toolName = match[1].trim();
          const argsStr = match[2].trim();

          const args: any = {};
          // Split by | and parse each key=value pair
          const pairs = argsStr.split('|');
          for (const pair of pairs) {
            const eqIdx = pair.indexOf('=');
            if (eqIdx > 0) {
              const key = pair.substring(0, eqIdx).trim();
              const value = pair.substring(eqIdx + 1).trim();
              args[key] = value;
            }
          }
          if (Object.keys(args).length > 0) {
            toolCallRequests.push({ name: toolName, input: args });
          }
        }

        // ReAct Action 执行
        if (toolCallRequests.length > 0) {
          for (const request of toolCallRequests) {
            const startTime = Date.now();

            // 显示 Action
            console.log('\n\x1b[33m🔧 Action:\x1b[0m', request.name);
            console.log('\x1b[90m📥 Input:\x1b[0m', JSON.stringify(request.input));

            const result = await this.toolRegistry.execute(request.name, request.input, context);
            const duration = Date.now() - startTime;

            toolExecutions.push({
              name: request.name,
              arguments: request.input,
              result,
              duration
            });

            // ReAct Observation 反馈给 LLM
            const obsContent = `[Observation] ${request.name}: ${result.success ? result.output : result.error}`;
            messages.push({
              role: 'user' as any,
              content: obsContent
            });

            // 显示结果
            console.log('\n\x1b[90m📤 Observation:\x1b[0m');
            const out = result.success ? result.output : result.error;
            console.log('\x1b[90m' + (out || '(空)').toString().substring(0, 300) + '\x1b[0m');
            console.log('');

            // 继续循环，不断开
          }
          continue;
        }

        // 没有工具调用，也没有 Final Answer，可能是普通回复
        if (content.trim()) {
          lastContent = content;
          hasFinalAnswer = true;
        }
      } catch (e) {
        return { content: '', error: (e as Error).message };
      }
    }

    if (iterations >= this.maxIterations) {
      return { content: lastContent, toolExecutions, error: 'Max iterations reached' };
    }

    // Save to memory (async) - use new short-term memory
    await memoryManager.addShortTermEntry(session, 'user', userMessage);
    await memoryManager.addShortTermEntry(session, 'assistant', lastContent);

    // Auto-save important content to long-term memory
    if (lastContent.length > 200) {
      const decision = await shouldRemember(lastContent, { role: 'assistant', sessionId: session });
      if (decision.shouldStore) {
        await memoryManager.addLongTermMemory(lastContent, { sessionId: session, source: 'assistant' });
      }
    }

    // Record episodic memory for tool executions
    if (toolExecutions.length > 0) {
      const allTools = toolExecutions.map(t => t.name);
      const duration = toolExecutions.reduce((sum, t) => sum + (t.duration || 0), 0);
      await memoryManager.addEpisodicMemory(
        userMessage.substring(0, 50),
        userMessage,
        lastContent.substring(0, 200),
        lastContent.includes('error') ? 'failure' : 'success',
        allTools,
        duration
      );
    }

    return { content: lastContent, toolExecutions };
  }

  async executeTool(
    toolName: string,
    input: any,
    context: ToolContext
  ): Promise<ToolResult> {
    return this.toolRegistry.execute(toolName, input, context);
  }
}

export const agentExecutor = new AgentExecutor();