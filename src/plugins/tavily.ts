// Tavily Web Search Plugin
import { Tool, ToolResult, ToolContext } from '../tools/types.js';

export interface TavilyConfig {
  apiKey: string;
  searchDepth?: 'basic' | 'advanced';
  maxResults?: number;
}

export class TavilySearchTool implements Tool {
  name = 'TavilySearch';
  description = 'Search the web using Tavily search engine. Returns relevant URLs and summaries.';

  inputSchema = {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Search query' },
      searchDepth: { type: 'string', enum: ['basic', 'advanced'], default: 'basic' },
      maxResults: { type: 'number', default: 5 }
    },
    required: ['query']
  };

  private config: TavilyConfig;

  constructor(config: TavilyConfig) {
    this.config = {
      searchDepth: 'basic',
      maxResults: 5,
      ...config
    };
  }

  async execute(input: any, context: ToolContext): Promise<ToolResult> {
    const { query, searchDepth, maxResults } = input;

    const apiKey = this.config.apiKey;
    if (!apiKey) {
      return { success: false, error: 'Tavily API key not configured' };
    }

    try {
      const url = 'https://api.tavily.com/search';

      const params = new URLSearchParams({
        api_key: apiKey,
        query,
        search_depth: searchDepth || this.config.searchDepth || 'basic',
        max_results: String(maxResults || this.config.maxResults)
      });

      const response = await fetch(`${url}?${params}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${errorText}` };
      }

      const data: any = await response.json();

      if (!data.results || data.results.length === 0) {
        return { success: true, output: 'No results found' };
      }

      // Format results
      const results = data.results.map((r: any, i: number) => {
        return `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.content?.substring(0, 200) || r.snippet || ''}`;
      }).join('\n\n');

      return {
        success: true,
        output: `Found ${data.results.length} results for "${query}":\n\n${results}`
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

export class TavilyFetchTool implements Tool {
  name = 'TavilyFetch';
  description = 'Fetch content from a specific URL (use after TavilySearch to get detailed content).';

  inputSchema = {
    type: 'object' as const,
    properties: {
      url: { type: 'string', description: 'URL to fetch' }
    },
    required: ['url']
  };

  async execute(input: any, context: ToolContext): Promise<ToolResult> {
    const { url } = input;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'text/html, application/json'
        }
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }

      const text = await response.text();
      // Limit output length
      const truncated = text.length > 5000 ? text.substring(0, 5000) + '\n...[truncated]' : text;

      return { success: true, output: truncated };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}