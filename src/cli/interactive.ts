// Interactive CLI REPL for continuous conversation
import * as readline from 'readline';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import { toolRegistry } from '../tools/index.js';
import { skillLoader, skillMatcher } from '../skills/index.js';
import { agentExecutor } from '../agent/executor.js';
import { createMiniMaxProvider } from '../llm/index.js';
import { memoryManager } from '../memory/manager.js';
import { Skill, SkillMatch } from '../skills/types.js';
import { ToolContext } from '../tools/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
const API_KEY = process.env.MINIMAX_API_KEY || '';

// Skills directory - relative to project root
const skillsDir = path.resolve(__dirname, '../../skills');

class InteractiveCLI {
  private rl: readline.Interface;
  private sessionId: string;
  private context: ToolContext;
  private skills: Skill[] = [];
  private currentSkill: SkillMatch | null = null;

  constructor(sessionId: string = 'default') {
    this.sessionId = sessionId;
    this.context = {
      cwd: process.cwd(),
      homeDir: os.homedir()
    };

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> '
    });
  }

  async initialize(): Promise<void> {
    // Initialize new multi-level memory manager
    await memoryManager.initialize();

    // Initialize LLM provider
    if (API_KEY) {
      const llmProvider = createMiniMaxProvider(API_KEY);
      if (llmProvider) {
        agentExecutor.setLLMProvider(llmProvider);
      }
    }

    // Load skills (legacy loader + matcher)
    await skillLoader.loadFromDirectory(skillsDir);
    this.skills = Array.from((skillLoader as any)['skills'].values()) as Skill[];

    // Load enhanced skill matcher
    await skillMatcher.loadFromDirectory(skillsDir);
  }

  async start(): Promise<void> {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║           TestClaw Interactive Mode                      ║
╠═══════════════════════════════════════════════════════════╣
║  会话 ID: ${this.sessionId.padEnd(45)}║
║  记忆: 多级记忆系统已启用                               ║
║  模型: MiniMax-M2.7                                     ║
╠═══════════════════════════════════════════════════════════╣
║  命令:                                                   ║
║    :help     - 显示帮助                                   ║
║    :session - 切换会话                                   ║
║    :history - 查看历史                                   ║
║    :memory  - 查看记忆统计                               ║
║    :clear   - 清除当前会话                               ║
║    :quit    - 退出                                       ║
╚═══════════════════════════════════════════════════════════╝
`);

    try {
      // Show recent history (using new short-term memory)
      const history = memoryManager.getShortTermHistory(this.sessionId, 3);
      if (history.length > 0) {
        console.log('📜 最近对话:');
        for (const entry of history) {
          const roleLabel = entry.role === 'user' ? '👤' : '🤖';
          const preview = entry.content.substring(0, 60) + (entry.content.length > 60 ? '...' : '');
          console.log(`  ${roleLabel} ${preview}`);
        }
        console.log('');
      }
    } catch (error) {
      console.log('⚠️  无法加载历史记录:', (error as Error).message);
    }

    console.log('\n🔧 调试信息: 准备显示提示符...');
    console.log('🔧 调试信息: 现在可以输入命令了，例如 :help');
    console.log('');
    // 简单的提示符，不使用 ANSI 转义序列
    this.rl.setPrompt('> ');
    this.rl.prompt();



    this.rl.on('line', async (line) => {
      const input = line.trim();

      if (!input) {
        this.rl.prompt();
        return;
      }

      // Handle commands
      if (input.startsWith(':')) {
        await this.handleCommand(input);
        this.rl.prompt();
        return;
      }

      // Skill 匹配处理
      const explicitCall = skillMatcher.parseExplicitSkill(input);

      if (explicitCall) {
        // 显式调用 /skill xxx
        const skill = skillMatcher.get(explicitCall.skillName) as any;
        if (skill) {
          console.log('\x1b[36m%s\x1b[0m', `使用 Skill: ${skill.name}`);
          console.log('\x1b[90m%s\x1b[0m', `${skill.description}`);
          console.log('');
          this.currentSkill = { skill, confidence: 1.0, matched: skill.name };
        } else {
          console.log(`Skill 未找到: ${explicitCall.skillName}`);
        }
      } else {
        // 自动匹配
        const match = skillMatcher.match(input);
        if (match && match.confidence > 0.3) {
          console.log('\x1b[90m%s\x1b[0m', `[匹配: ${match.matched} ${(match.confidence * 100).toFixed(0)}%]`);
          this.currentSkill = match;
        } else {
          this.currentSkill = null;
        }
      }

      // Send to LLM
      console.log('');
      try {
        const result = await agentExecutor.executeWithLLM(input, this.context, this.skills, this.sessionId, this.currentSkill);

        // Result already shown by ReAct loop, just show final content
        console.log('\x1b[36m%s\x1b[0m', '✅ 完成');

        if (result.error) {
          console.log('\x1b[31m%s\x1b[0m', `错误: ${result.error}`);
        }

      } catch (e) {
        console.log('\x1b[31m%s\x1b[0m', `❌ 错误: ${(e as Error).message}`);
      }

      this.rl.prompt();
    });

    this.rl.on('close', () => {
      console.log('\n👋 再见!');
      process.exit(0);
    });
  }

  async handleCommand(input: string): Promise<void> {
    const parts = input.split(' ');
    const cmd = parts[0].toLowerCase();

    switch (cmd) {
      case ':help':
        console.log(`
可用命令:
  :help            显示帮助
  :session [id]    切换或查看会话 (默认 default)
  :history [n]     查看最近 n 条历史 (默认 5)
  :memory [type]   查看记忆统计 (可选: short/long/episodic/semantic)
  :skill [name]    列出或查看 Skill 详情
  :clear           清除当前会话记忆
  :sessions        列出所有会话
  :quit            退出

Skill 调用:
  /skill <name>    显式调用 Skill
  直接输入      自动匹配 Skill
`);
        break;

      case ':session':
        if (parts[1]) {
          this.sessionId = parts[1];
          console.log(`✓ 切换到会话: ${this.sessionId}`);
          const history = memoryManager.getShortTermHistory(this.sessionId, 3);
          if (history.length > 0) {
            console.log('📜 最近对话:');
            for (const entry of history) {
              const roleLabel = entry.role === 'user' ? '👤' : '🤖';
              console.log(`  ${roleLabel} ${entry.content.substring(0, 60)}...`);
            }
          }
        } else {
          console.log(`当前会话: ${this.sessionId}`);
        }
        break;

      case ':history':
        const count = parseInt(parts[1]) || 5;
        const history = memoryManager.getShortTermHistory(this.sessionId, count);
        console.log(`\n📜 历史记录 (最近 ${count} 条):`);
        for (let i = 0; i < history.length; i++) {
          const entry = history[i];
          const roleLabel = entry.role === 'user' ? '👤 用户' : '🤖 AI';
          console.log(`\n${i + 1}. ${roleLabel}`);
          console.log(`   ${entry.content.substring(0, 100)}`);
        }
        console.log('');
        break;

      case ':clear':
        await memoryManager.clearSession(this.sessionId);
        console.log('✓ 已清除当前会话记忆');
        break;

      case ':memory':
        const type = parts[1];
        const stats = memoryManager.getStats();
        console.log('\n📊 记忆统计:');
        console.log(`  短期记忆: ${stats.shortTerm} 会话`);
        console.log(`  长期记忆: ${stats.longTerm} 条`);
        console.log(`  情景记忆: ${stats.episodic} 条`);
        console.log(`  语义记忆: ${stats.semantic} 条`);
        console.log(`  总计: ${stats.total} 条\n`);

        if (type === 'semantic' || !type) {
          const semantic = memoryManager.getSemanticMemories();
          if (semantic.length > 0) {
            console.log('📚 语义记忆:');
            for (const mem of semantic.slice(0, 10)) {
              console.log(`  [${mem.category}] ${mem.summary.substring(0, 50)}`);
            }
          }
        }

        if (type === 'episodic' || !type) {
          const tasks = memoryManager.getRecentTasks(5);
          if (tasks.length > 0) {
            console.log('\n📋 最近任务:');
            for (const task of tasks) {
              const status = task.result === 'success' ? '✓' : '✗';
              console.log(`  ${status} ${task.task.substring(0, 40)} (${task.duration}ms)`);
            }
          }
        }
        console.log('');
        break;

      case ':skill':
        if (parts[1]) {
          // 查看指定 skill 详情
          const skill = skillMatcher.get(parts[1]) as any;
          if (skill) {
            console.log(`\n📄 Skill: ${skill.name}`);
            console.log(`   类型: ${skill.type || 'prompt'}`);
            console.log(`   描述: ${skill.description}`);
            console.log(`   优先级: ${skill.priority || 0}`);
            console.log(`   关键词: ${skill.keywords?.slice(0, 5).join(', ') || '(无)'}`);
            if (skill.examples?.length > 0) {
              console.log(`   示例:`);
              for (const ex of skill.examples.slice(0, 3)) {
                console.log(`     - ${ex}`);
              }
            }
            console.log('');
          } else {
            console.log(`Skill 未找到: ${parts[1]}`);
          }
        } else {
          // 列出所有 skills
          const all = skillMatcher.getAll();
          console.log('\n📋 可用 Skills:');
          for (const s of all) {
            console.log(`  ${s.name.padEnd(15)} - ${s.description}`);
          }
          console.log('');
        }
        break;

      case ':sessions':
        // Show all sessions (short-term memories)
        const allSessions = Array.from((memoryManager as any).shortTerm?.keys() || []);
        console.log('\n📂 所有会话:');
        if (allSessions.length > 0) {
          for (const s of allSessions) {
            console.log(`  ${s}`);
          }
        } else {
          console.log('  (无)');
        }
        console.log('');
        break;

      case ':quit':
      case ':exit':
        this.rl.close();
        break;

      default:
        console.log(`未知命令: ${cmd}. 输入 :help 查看帮助`);
    }
  }
}

// Run interactive mode
async function main() {
  const args = process.argv.slice(2);

  let sessionId = 'default';
  let interactiveMode = false;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--session' || args[i] === '-s') {
      sessionId = args[i + 1] || 'default';
      i++;
    } else if (args[i] === '--interactive' || args[i] === '-i') {
      interactiveMode = true;
    }
  }

  // Default to interactive mode if no other commands
  if (!API_KEY) {
    console.log('错误: 请设置 MINIMAX_API_KEY 环境变量');
    process.exit(1);
  }

  if (interactiveMode || args.length === 0) {
    const cli = new InteractiveCLI(sessionId);
    await cli.initialize();
    await cli.start();
  } else {
    console.log('用法: testclaw interactive [--session <id>]');
    console.log('  或: testclaw -i [--session <id>]');
    console.log('\n示例:');
    console.log('  testclaw interactive           # 启动交互模式');
    console.log('  testclaw -i -s dev           # 使用 dev 会话启动');
  }
}

main();