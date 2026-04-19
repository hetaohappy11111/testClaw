import { Tool, ToolDefinition, ToolContext, ToolResult } from './types.js';
import { ReadTool, WriteTool, EditTool, GlobTool, GrepTool } from './fs.js';
import { BashTool } from './exec.js';
import { WebFetchTool, WebSearchTool } from './web.js';
import { TavilySearchTool, TavilyFetchTool } from '../plugins/tavily.js';

// Check for Tavily API key in environment
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';
const HAS_TAVILY = TAVILY_API_KEY.startsWith('tvly-');

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  constructor() {
    this.registerDefaultTools();
  }

  private registerDefaultTools() {
    const defaultTools: Tool[] = [
      new ReadTool(),
      new WriteTool(),
      new EditTool(),
      new GlobTool(),
      new GrepTool(),
      new BashTool(),
      new WebFetchTool(),
      new WebSearchTool()
    ];

    // Always register Tavily tools (will fail gracefully if no key)
    if (HAS_TAVILY) {
      defaultTools.push(new TavilySearchTool({ apiKey: TAVILY_API_KEY }));
      defaultTools.push(new TavilyFetchTool());
    }

    for (const tool of defaultTools) {
      this.tools.set(tool.name, tool);
    }
  }

  register(tool: Tool) {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema
    }));
  }

  async execute(name: string, input: any, context: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, error: `Tool '${name}' not found` };
    }
    return tool.execute(input, context);
  }
}

export const toolRegistry = new ToolRegistry();
