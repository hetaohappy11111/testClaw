import { Command } from 'commander';
import { registerToolsCommand } from './commands/tools.js';
import { registerSkillsCommand } from './commands/skills.js';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('testclaw')
    .description('A Claude Code-like CLI tool (simplified version)')
    .version('1.0.0');

  registerToolsCommand(program);
  registerSkillsCommand(program);

  return program;
}
