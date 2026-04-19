import * as fs from 'fs/promises';
import * as path from 'path';
import { Tool, ToolResult, ToolContext } from './types.js';

export class ReadTool implements Tool {
  name = 'Read';
  description = 'Reads a file from the local filesystem.';
  inputSchema = {
    type: 'object' as const,
    properties: {
      file_path: { type: 'string', description: 'The path to the file to read' },
      limit: { type: 'number', description: 'Maximum number of lines to read' },
      offset: { type: 'number', description: 'Line number to start reading from' }
    },
    required: ['file_path']
  };

  async execute(input: any, context: ToolContext): Promise<ToolResult> {
    try {
      const filePath = path.resolve(input.file_path);
      const content = await fs.readFile(filePath, 'utf-8');
      let lines = content.split('\n');

      if (input.offset) {
        lines = lines.slice(input.offset - 1);
      }
      if (input.limit) {
        lines = lines.slice(0, input.limit);
      }

      return {
        success: true,
        output: lines.join('\n')
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

export class WriteTool implements Tool {
  name = 'Write';
  description = 'Writes a file to the local filesystem.';
  inputSchema = {
    type: 'object' as const,
    properties: {
      file_path: { type: 'string', description: 'The path to the file to write' },
      content: { type: 'string', description: 'The content to write to the file' }
    },
    required: ['file_path', 'content']
  };

  async execute(input: any, context: ToolContext): Promise<ToolResult> {
    try {
      const filePath = path.resolve(input.file_path);
      await fs.writeFile(filePath, input.content, 'utf-8');
      return { success: true, output: 'File written successfully' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

export class EditTool implements Tool {
  name = 'Edit';
  description = 'Replaces text in a file.';
  inputSchema = {
    type: 'object' as const,
    properties: {
      file_path: { type: 'string', description: 'The path to the file to edit' },
      old_string: { type: 'string', description: 'The text to replace' },
      new_string: { type: 'string', description: 'The replacement text' },
      replace_all: { type: 'boolean', description: 'Replace all occurrences', default: false }
    },
    required: ['file_path', 'old_string', 'new_string']
  };

  async execute(input: any, context: ToolContext): Promise<ToolResult> {
    try {
      const filePath = path.resolve(input.file_path);
      let content = await fs.readFile(filePath, 'utf-8');

      if (input.replace_all) {
        content = content.split(input.old_string).join(input.new_string);
      } else {
        content = content.replace(input.old_string, input.new_string);
      }

      await fs.writeFile(filePath, content, 'utf-8');
      return { success: true, output: 'File edited successfully' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

export class GlobTool implements Tool {
  name = 'Glob';
  description = 'Returns a list of paths matching a glob pattern.';
  inputSchema = {
    type: 'object' as const,
    properties: {
      pattern: { type: 'string', description: 'The glob pattern to match' },
      path: { type: 'string', description: 'Directory to search in' }
    },
    required: ['pattern']
  };

  async execute(input: any, context: ToolContext): Promise<ToolResult> {
    try {
      const pattern = input.pattern;
      const searchPath = input.path || context.cwd;

      // Recursive glob matching
      const matches = await globMatch(searchPath, pattern);

      return { success: true, output: matches.join('\n') };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

function matchGlob(name: string, pattern: string): boolean {
  // Handle ** for recursive matching
  let regexPattern = pattern
    .replace(/\*\*/g, '<<<STARSTAR>>>')
    .replace(/\*/g, '.*')
    .replace(/<<<STARSTAR>>>/g, '.*');

  // Handle ?
  regexPattern = regexPattern.replace(/\?/g, '.');

  // Escape dots for exact matches
  if (!pattern.includes('*')) {
    regexPattern = pattern.replace(/\./g, '\\.');
  }

  const regex = new RegExp('^' + regexPattern + '$');
  return regex.test(name);
}

async function globMatch(dir: string, pattern: string): Promise<string[]> {
  const results: string[] = [];

  // Split pattern into parts
  const parts = pattern.split('/').filter(p => p);

  // Handle different pattern types
  if (parts.length === 0) {
    return [];
  }

  // Case 1: Pattern starts with ** - search recursively from current dir
  if (parts[0] === '**') {
    const searchExt = parts.length > 1 ? parts[1] : '*';
    await scanRecursive(dir, searchExt, parts.slice(2));
    return results;
  }

  // Case 2: Pattern contains ** in the middle (e.g., src/**/*.ts)
  const starStarIndex = parts.indexOf('**');
  if (starStarIndex > 0) {
    // Everything before ** is the directory to start from
    const baseDir = path.join(dir, ...parts.slice(0, starStarIndex));
    const filePattern = parts[starStarIndex + 1] || '*';
    await scanRecursive(baseDir, filePattern, parts.slice(starStarIndex + 2));
    return results;
  }

  // Case 3: Simple pattern like *.ts, src/*.ts
  const firstWildcard = parts.findIndex(p => p.includes('*'));
  if (firstWildcard === -1) {
    // No wildcard - check if path exists
    try {
      const fullPath = path.join(dir, pattern);
      const stat = await fs.stat(fullPath);
      return [fullPath];
    } catch {
      return [];
    }
  }

  // Pattern has wildcard - find base directory
  const baseDir = path.join(dir, ...parts.slice(0, firstWildcard));
  const filePattern = parts[firstWildcard];

  try {
    await fs.access(baseDir);
  } catch {
    return [];
  }

  const remaining = parts.slice(firstWildcard + 1);
  await scanDir(baseDir, filePattern, remaining);

  return results;

  async function scanDir(directory: string, filePattern: string, remaining: string[]): Promise<void> {
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(directory, entry.name);

        if (matchGlob(entry.name, filePattern)) {
          if (remaining.length === 0) {
            results.push(entryPath);
          } else if (entry.isDirectory()) {
            await scanDir(entryPath, remaining[0], remaining.slice(1));
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  async function scanRecursive(directory: string, filePattern: string, rest: string[]): Promise<void> {
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(directory, entry.name);

        if (matchGlob(entry.name, filePattern)) {
          if (rest.length === 0) {
            results.push(entryPath);
          } else if (entry.isDirectory()) {
            await scanRecursive(entryPath, rest[0], rest.slice(1));
          }
        }

        // Also recurse into directories even if they don't match the pattern
        if (entry.isDirectory()) {
          await scanRecursive(entryPath, filePattern, rest);
        }
      }
    } catch {
      // Ignore
    }
  }
}

export class GrepTool implements Tool {
  name = 'Grep';
  description = 'Searches for a pattern in files.';
  inputSchema = {
    type: 'object' as const,
    properties: {
      pattern: { type: 'string', description: 'The regular expression pattern to search for' },
      path: { type: 'string', description: 'Directory to search in' },
      output_mode: { type: 'string', enum: ['content', 'files_with_matches', 'count'], default: 'content' }
    },
    required: ['pattern']
  };

  async execute(input: any, context: ToolContext): Promise<ToolResult> {
    try {
      const pattern = new RegExp(input.pattern);
      const searchPath = input.path || context.cwd;

      const files = await fs.readdir(searchPath, { withFileTypes: true });
      const matchingFiles: string[] = [];
      const content: string[] = [];

      for (const file of files) {
        if (file.isFile()) {
          const filePath = path.join(searchPath, file.name);
          const fileContent = await fs.readFile(filePath, 'utf-8');
          const lines = fileContent.split('\n');

          let matchCount = 0;
          for (let i = 0; i < lines.length; i++) {
            if (pattern.test(lines[i])) {
              matchCount++;
              if (input.output_mode === 'content') {
                content.push(`${filePath}:${i + 1}: ${lines[i]}`);
              }
            }
          }

          if (matchCount > 0) {
            matchingFiles.push(filePath);
          }
        }
      }

      if (input.output_mode === 'count') {
        return { success: true, output: matchingFiles.length.toString() };
      } else if (input.output_mode === 'files_with_matches') {
        return { success: true, output: matchingFiles.join('\n') };
      }

      return { success: true, output: content.join('\n') };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
