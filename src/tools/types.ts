// Tool Types
export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, any>;
  required?: string[];
}

export interface ToolResult {
  success: boolean;
  output?: any;
  error?: string;
}

export interface ToolContext {
  cwd: string;
  homeDir: string;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  execute(input: any, context: ToolContext): Promise<ToolResult>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: ToolInputSchema;
}
