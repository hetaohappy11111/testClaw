import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import { toolRegistry, ToolRegistry } from './tools/index.js';
import { skillLoader } from './skills/index.js';
import { agentExecutor, AgentExecutor, AgentFactory, MultiAgentCoordinator, AgentConfig, AgentTask, AgentResult, AgentType } from './agent/index.js';
import { createMiniMaxProvider } from './llm/index.js';
import { memoryStore } from './memory/index.js';
import { Skill } from './skills/types.js';
import { ToolContext } from './tools/types.js';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine skills directory based on environment
const skillsDir = __dirname.includes('/src') 
  ? path.join(__dirname, '..', 'skills') // Development mode
  : path.join(__dirname, 'skills');       // Production mode

// Load environment variables
dotenv.config();
const API_KEY = process.env.MINIMAX_API_KEY || '';
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || '';

// Initialize LLM provider
let llmProvider: any = null;
if (API_KEY) {
  llmProvider = createMiniMaxProvider(API_KEY, ANTHROPIC_BASE_URL || undefined);
  if (llmProvider) {
    agentExecutor.setLLMProvider(llmProvider);
    console.log('LLM Provider 已配置 (MiniMax-M2.7)');
  } else {
    console.log('注意: API key 格式无效，请检查 .env 文件中的 MINIMAX_API_KEY');
  }
}


async function main() {
  const args = process.argv.slice(2);

  // Check for --help or -h
  if (args[0] === '--help' || args[0] === '-h') {
    console.log(`
TestClaw v1.0.0 - 一个类 Claude Code 的 CLI 工具

用法: testclaw <command> [args]

命令:
  tools               列出可用工具
  skills [action]   管理技能
  memory [action]  记忆管理
  chat <message>   使用 AI 对话
  run <prompt>    AI 执行任务
  agent <prompt>  多 Agent 模式执行任务

【记忆功能】
  testclaw chat --session my-session 你好    使用指定会话
  testclaw memory list                       查看当前会话记忆
  testclaw memory list my-session            查看指定会话记忆
  testclaw memory clear                       清除所有记忆

=== 工具详细使用说明 ===

【Read 读取文件】
  testclaw read <file_path> [limit] [offset]

【Write 写入文件】
  testclaw write <file_path> <content>

【Edit 编辑文件】
  testclaw edit <file_path> <old_string> <new_string> [replace_all]

【Bash 执行命令】
  testclaw bash <command>

【Grep 搜索文件】
  testclaw grep <pattern> [path] [output_mode]

【Glob 匹配文件】
  testclaw glob <pattern> [path]

【WebFetch 获取网页】
  testclaw fetch <url> [prompt]

【WebSearch 搜索网页】
  testclaw search <query>

=== AI 对话模式 ===

【使用 MiniMax AI 对话】
  testclaw chat 你好，帮我看一下 package.json

【让 AI 执行任务】
  testclaw run 列出当前目录的 TypeScript 文件

详细信息请运行: testclaw --help
`);
    return;
  }

  // Check for --version or -V
  if (args[0] === '--version' || args[0] === '-V') {
    console.log('1.0.0');
    return;
  }

  // Check if a subcommand was provided
  if (args[0] === 'tools') {
    const tools = toolRegistry.getAll();
    console.log('\nAvailable Tools:\n');
    for (const tool of tools) {
      console.log(`  ${tool.name.padEnd(15)} - ${tool.description}`);
    }
    console.log();
    return;
  }

  if (args[0] === 'skills') {
    await skillLoader.loadFromDirectory(skillsDir);

    const action = args[1];
    if (!action || action === 'list') {
      const skills = skillLoader.getAll();
      console.log('\nAvailable Skills:\n');
      if (skills.length === 0) {
        console.log('  (no skills loaded)');
      } else {
        for (const skill of skills) {
          const badge = skill.user_invocable ? ' [user]' : '';
          console.log(`  ${skill.name.padEnd(20)} - ${skill.description}${badge}`);
        }
      }
      console.log();
    } else if (action === 'show' && args[2]) {
      const skill = skillLoader.get(args[2]);
      if (skill) {
        console.log(`\n## ${skill.name}\n${skill.description}\n\n${skill.content}\n`);
      } else {
        console.log(`Skill '${args[2]}' not found`);
      }
    }
    return;
  }

  // Memory commands
  if (args[0] === 'memory') {
    const action = args[1];
    const sessionId = args[2] || 'default';

    if (action === 'list') {
      const history = memoryStore.getHistory(sessionId);
      console.log(`\n会话 '${sessionId}' 的历史记录 (${history.length} 条):\n`);
      for (let i = 0; i < history.length; i++) {
        const entry = history[i];
        const roleLabel = entry.role === 'user' ? '👤 用户' : '🤖 AI';
        const preview = entry.content.substring(0, 80) + (entry.content.length > 80 ? '...' : '');
        console.log(`  ${i + 1}. ${roleLabel}: ${preview}`);
      }
      console.log();
    } else if (action === 'clear' && args[2]) {
      memoryStore.clear(args[2]);
      console.log(`已清除会话 '${args[2]}' 的历史记录`);
    } else if (action === 'clear') {
      memoryStore.clearAll();
      console.log('已清除所有历史记录');
    } else if (!action) {
      console.log('\n记忆命令:');
      console.log('  testclaw memory list           列出当前会话历史');
      console.log('  testclaw memory list <session>  列出指定会话历史');
      console.log('  testclaw memory clear <session> 清除指定会话历史');
      console.log('  testclaw memory clear          清除所有历史');
    }
    return;
  }

  // Chat with AI
  if (args[0] === 'chat') {
    if (!API_KEY) {
      console.log('请设置 MINIMAX_API_KEY 环境变量');
      console.log('在 .env 文件中设置: MINIMAX_API_KEY=你的key');
      return;
    }

    // Get session ID (optional)
    let sessionId = 'default';
    let messageStartIndex = 1;
    if (args[1] === '--session' || args[1] === '-s') {
      sessionId = args[2] || 'default';
      messageStartIndex = 3;
    }

    const message = args.slice(messageStartIndex).join(' ');
    const context: ToolContext = {
      cwd: process.cwd(),
      homeDir: os.homedir()
    };

    await skillLoader.loadFromDirectory(skillsDir);
    const skills = Array.from((skillLoader as any)['skills'].values()) as Skill[];

    try {
      const result = await agentExecutor.executeWithLLM(message, context, skills, sessionId);

      // Show tool executions in structured format if any
      if (result.toolExecutions && result.toolExecutions.length > 0) {
        console.log('\n\x1b[33m%s\x1b[0m', '━'.repeat(50));
        console.log('\x1b[35m%s\x1b[0m', '🔧 工具调用信息');
        console.log('\x1b[33m%s\x1b[0m', '━'.repeat(50));

        for (const exec of result.toolExecutions) {
          console.log(`\n  \x1b[32m● ${exec.name}\x1b[0m`);
          console.log(`    \x1b[90m参数:\x1b[0m ${JSON.stringify(exec.arguments, null, 2).replace(/\n/g, '\n    ')}`);
          console.log(`    \x1b[90m耗时:\x1b[0m ${exec.duration}ms`);

          if (exec.result.success) {
            const output = typeof exec.result.output === 'string'
              ? exec.result.output
              : JSON.stringify(exec.result.output, null, 2);
            const displayOutput = output.length > 500 ? output.substring(0, 500) + '...' : output;
            console.log(`    \x1b[90m结果:\x1b[0m\n${displayOutput.split('\n').map((l: string) => '      ' + l).join('\n')}`);
          } else {
            console.log(`    \x1b[31m错误: ${exec.result.error}\x1b[0m`);
          }
        }
        console.log('\n\x1b[33m%s\x1b[0m', '━'.repeat(50));
        console.log('\n\x1b[36m%s\x1b[0m', '📝 最终结果:');
        console.log('\x1b[33m%s\x1b[0m', '─'.repeat(50));
      }

      console.log(result.content);
      if (result.toolExecutions && result.toolExecutions.length > 0) {
        console.log('\x1b[33m%s\x1b[0m', '─'.repeat(50));
      }
    } catch (e) {
      console.log('\x1b[31m%s\x1b[0m', '❌ AI 对话错误:', (e as Error).message);
      console.log('请检查 API key 是否正确，或联系 MiniMax 支持。');
    }
    return;
  }

  // Run AI task
  if (args[0] === 'run') {
    if (!API_KEY) {
      console.log('请设置 MINIMAX_API_KEY 环境变量');
      console.log('在 .env 文件中设置: MINIMAX_API_KEY=你的key');
      return;
    }

    // Get session ID (optional)
    let sessionId = 'default';
    let promptStartIndex = 1;
    if (args[1] === '--session' || args[1] === '-s') {
      sessionId = args[2] || 'default';
      promptStartIndex = 3;
    }

    const prompt = args.slice(promptStartIndex).join(' ');
    const context: ToolContext = {
      cwd: process.cwd(),
      homeDir: os.homedir()
    };

    await skillLoader.loadFromDirectory(skillsDir);
    const skills = Array.from((skillLoader as any)['skills'].values()) as Skill[];

    try {
      console.log('\n\x1b[36m%s\x1b[0m', '> ' + prompt);
      const result = await agentExecutor.executeWithLLM(prompt, context, skills, sessionId);

      // Show tool executions in structured format
      if (result.toolExecutions && result.toolExecutions.length > 0) {
        console.log('\n\x1b[33m%s\x1b[0m', '━'.repeat(50));
        console.log('\x1b[35m%s\x1b[0m', '🔧 工具调用信息');
        console.log('\x1b[33m%s\x1b[0m', '━'.repeat(50));

        for (const exec of result.toolExecutions) {
          console.log(`\n  \x1b[32m● ${exec.name}\x1b[0m`);
          console.log(`    \x1b[90m参数:\x1b[0m ${JSON.stringify(exec.arguments, null, 2).replace(/\n/g, '\n    ')}`);
          console.log(`    \x1b[90m耗时:\x1b[0m ${exec.duration}ms`);

          if (exec.result.success) {
            const output = typeof exec.result.output === 'string'
              ? exec.result.output
              : JSON.stringify(exec.result.output, null, 2);
            // Show first 500 chars of output
            const displayOutput = output.length > 500 ? output.substring(0, 500) + '...' : output;
            console.log(`    \x1b[90m结果:\x1b[0m\n${displayOutput.split('\n').map((l: string) => '      ' + l).join('\n')}`);
          } else {
            console.log(`    \x1b[31m错误: ${exec.result.error}\x1b[0m`);
          }
        }
        console.log('\n\x1b[33m%s\x1b[0m', '━'.repeat(50));
      }

      console.log('\n\x1b[36m%s\x1b[0m', '📝 最终结果:');
      console.log('\x1b[33m%s\x1b[0m', '─'.repeat(50));
      console.log(result.content);
      console.log('\x1b[33m%s\x1b[0m', '─'.repeat(50));
    } catch (e) {
      console.log('\x1b[31m%s\x1b[0m', '❌ AI 执行错误:', (e as Error).message);
    }
    return;
  }

  // Multi-Agent mode
  if (args[0] === 'agent') {
    if (!API_KEY) {
      console.log('请设置 MINIMAX_API_KEY 环境变量');
      console.log('在 .env 文件中设置: MINIMAX_API_KEY=你的key');
      return;
    }

    const prompt = args.slice(1).join(' ');
    const context: ToolContext = {
      cwd: process.cwd(),
      homeDir: os.homedir()
    };

    await skillLoader.loadFromDirectory(skillsDir);
    const skills = Array.from((skillLoader as any)['skills'].values()) as Skill[];

    try {
      console.log('\n\x1b[36m%s\x1b[0m', '> [Multi-Agent] ' + prompt);

      // Create coordinator
      const coordinator = new MultiAgentCoordinator(toolRegistry);
      coordinator.setLLMProvider(llmProvider);
      coordinator.setSkills(skills);

      // Show coordinator status
      const status = coordinator.getStatus();
      console.log('\x1b[90m已注册 Agents: ' + status.agentIds.join(', ') + '\x1b[0m');

      // Create task
      const task: AgentTask = {
        id: 'task-1',
        description: '多 Agent 任务',
        input: prompt,
        context
      };

      // Execute
      const result = await coordinator.dispatch(task);

      // Show results
      console.log('\n\x1b[33m%s\x1b[0m', '━'.repeat(50));
      console.log('\x1b[35m%s\x1b[0m', `🤖 Agent: ${result.agentId}`);
      console.log('\x1b[90m耗时: ${result.duration}ms\x1b[0m');
      console.log('\x1b[33m%s\x1b[0m', '━'.repeat(50));

      if (result.toolExecutions && result.toolExecutions.length > 0) {
        console.log('\n\x1b[35m%s\x1b[0m', '🔧 工具调用信息');
        for (const exec of result.toolExecutions) {
          console.log(`\n  \x1b[32m● ${exec.name}\x1b[0m`);
          console.log(`    \x1b[90m参数:\x1b[0m ${JSON.stringify(exec.arguments, null, 2).replace(/\n/g, '\n    ')}`);
          console.log(`    \x1b[90m耗时:\x1b[0m ${exec.duration}ms`);
        }
        console.log('\n\x1b[33m%s\x1b[0m', '━'.repeat(50));
      }

      console.log('\n\x1b[36m%s\x1b[0m', '📝 最终结果:');
      console.log('\x1b[33m%s\x1b[0m', '─'.repeat(50));
      console.log(result.success ? result.output : `Error: ${result.error}`);
      console.log('\x1b[33m%s\x1b[0m', '─'.repeat(50));
    } catch (e) {
      console.log('\x1b[31m%s\x1b[0m', '❌ 多 Agent 执行错误:', (e as Error).message);
    }
    return;
  }

  if (args.length === 0) {
    console.log(`
TestClaw v1.0.0 - 一个类 Claude Code 的 CLI 工具

用法: testclaw <command> [args]

命令:
  tools               列出可用工具
  skills [action]   管理技能
  memory [action]  记忆管理
  chat <message>   使用 AI 对话
  run <prompt>    AI 执行任务
  agent <prompt>  多 Agent 模式执行任务

【记忆功能】
  testclaw chat --session my-session 你好    使用指定会话
  testclaw memory list                       查看当前会话记忆
  testclaw memory list my-session            查看指定会话记忆
  testclaw memory clear                       清除所有记忆

详细信息请运行: testclaw --help
`);
    return;
  }

  // Get the prompt from arguments
  const prompt = args.join(' ');

  // Set up context
  const context: ToolContext = {
    cwd: process.cwd(),
    homeDir: os.homedir()
  };

  // Load skills from bundled directory
  await skillLoader.loadFromDirectory(skillsDir);

  // Build system prompt
  const skills = Array.from((skillLoader as any)['skills'].values()) as Skill[];
  const systemPrompt = agentExecutor.buildSystemPrompt(skills);

  // Simple CLI mode - just execute a tool based on prompt keywords
  const promptLower = prompt.toLowerCase();

  if (promptLower.startsWith('read ')) {
    const filePath = prompt.substring(5).trim();
    const result = await toolRegistry.execute('Read', { file_path: filePath }, context);
    console.log(result.success ? result.output : `Error: ${result.error}`);
  } else if (promptLower.startsWith('write ')) {
    const parts = prompt.substring(6).split(' ');
    if (parts.length >= 2) {
      const filePath = parts[0];
      const content = parts.slice(1).join(' ');
      const result = await toolRegistry.execute('Write', { file_path: filePath, content }, context);
      console.log(result.success ? result.output : `Error: ${result.error}`);
    }
  } else if (promptLower.startsWith('edit ')) {
    const parts = prompt.substring(5).split(' ');
    if (parts.length >= 3) {
      const filePath = parts[0];
      const oldString = parts[1];
      const newString = parts[2];
      const replaceAll = parts[3] === 'true';
      const result = await toolRegistry.execute('Edit', { file_path: filePath, old_string: oldString, new_string: newString, replace_all: replaceAll }, context);
      console.log(result.success ? result.output : `Error: ${result.error}`);
    }
  } else if (promptLower.startsWith('bash ') || promptLower.startsWith('run ')) {
    const command = prompt.substring(promptLower.startsWith('bash ') ? 5 : 4).trim();
    const result = await toolRegistry.execute('Bash', { command }, context);
    console.log(result.success ? result.output : `Error: ${result.error}`);
  } else if (promptLower.startsWith('grep ')) {
    const parts = prompt.substring(5).split(' ');
    const pattern = parts[0];
    const searchPath = parts[1] || context.cwd;
    const result = await toolRegistry.execute('Grep', { pattern, path: searchPath }, context);
    console.log(result.success ? result.output : `Error: ${result.error}`);
  } else if (promptLower.startsWith('glob ')) {
    const pattern = prompt.substring(5).trim();
    const result = await toolRegistry.execute('Glob', { pattern, path: context.cwd }, context);
    console.log(result.success ? result.output : `Error: ${result.error}`);
  } else if (promptLower.startsWith('webfetch ') || promptLower.startsWith('fetch ')) {
    const url = prompt.substring(promptLower.startsWith('webfetch ') ? 9 : 6).trim();
    const result = await toolRegistry.execute('WebFetch', { url }, context);
    console.log(result.success ? result.output : `Error: ${result.error}`);
  } else if (promptLower.startsWith('search ')) {
    const query = prompt.substring(7).trim();
    const result = await toolRegistry.execute('WebSearch', { query }, context);
    console.log(result.success ? result.output : `Error: ${result.error}`);
  } else {
    // Default: use AI if API key is available, otherwise show help
    if (API_KEY) {
      const skills = Array.from((skillLoader as any)['skills'].values()) as Skill[];
      const result = await agentExecutor.executeWithLLM(prompt, context, skills);
      console.log(result.content);
    } else {
      console.log(`\nTestClaw v1.0.0\n`);
      console.log(`System Prompt:\n${systemPrompt}\n`);
    }
  }
}

main().catch(console.error);