import { Tool, ToolResult, ToolContext } from './types.js';

export class WebFetchTool implements Tool {
  name = 'WebFetch';
  description = 'Fetches content from a specified URL.';
  inputSchema = {
    type: 'object' as const,
    properties: {
      url: { type: 'string', description: 'The URL to fetch content from' },
      prompt: { type: 'string', description: 'Prompt to run on the fetched content' }
    },
    required: ['url']
  };

  async execute(input: any, context: ToolContext): Promise<ToolResult> {
    try {
      const response = await fetch(input.url, {
        method: 'GET',
        headers: {
          'User-Agent': 'TestClaw/1.0'
        }
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const text = await response.text();

      if (input.prompt) {
        // Simple prompt processing - just return relevant portion
        const prompt = input.prompt.toLowerCase();
        if (prompt.includes('summary')) {
          return { success: true, output: text.substring(0, 500) + '...' };
        }
      }

      return { success: true, output: text };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

export class WebSearchTool implements Tool {
  name = 'WebSearch';
  description = 'Searches the web and returns results.';
  inputSchema = {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'The search query' }
    },
    required: ['query']
  };

  async execute(input: any, context: ToolContext): Promise<ToolResult> {
    try {
      // Simple web search using DuckDuckGo API
      const response = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(input.query)}&format=json`,
        {
          headers: { 'User-Agent': 'TestClaw/1.0' }
        }
      );

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }

      const data: any = await response.json();
      const results = data.RelatedTopics?.slice(0, 5).map((t: any) => t.Text).join('\n') || 'No results';

      return { success: true, output: results };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
