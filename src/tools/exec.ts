import { exec as execSync } from 'child_process';
import { promisify } from 'util';
import { Tool, ToolResult, ToolContext } from './types.js';

const exec = promisify(execSync);

export class BashTool implements Tool {
  name = 'Bash';
  description = 'Executes a given bash command and returns its output.';
  inputSchema = {
    type: 'object' as const,
    properties: {
      command: { type: 'string', description: 'The command to execute' },
      timeout: { type: 'number', description: 'Timeout in milliseconds', default: 120000 }
    },
    required: ['command']
  };

  async execute(input: any, context: ToolContext): Promise<ToolResult> {
    try {
      const { stdout, stderr } = await exec(input.command, {
        cwd: context.cwd,
        timeout: input.timeout || 120000,
        maxBuffer: 10 * 1024 * 1024
      });

      return {
        success: true,
        output: stdout + stderr
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}
