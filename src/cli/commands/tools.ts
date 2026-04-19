import { Command } from 'commander';
import { toolRegistry } from '../../tools/index.js';

export function registerToolsCommand(program: Command) {
  program
    .command('tools')
    .description('List available tools')
    .action(() => {
      const tools = toolRegistry.getAll();
      console.log('\nAvailable Tools:\n');
      for (const tool of tools) {
        console.log(`  ${tool.name.padEnd(15)} - ${tool.description}`);
      }
      console.log();
    });
}
