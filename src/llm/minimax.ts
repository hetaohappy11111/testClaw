import { LLMConfig, ChatMessage } from './types.js';

export class MiniMaxProvider {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async chat(messages: ChatMessage[], tools?: any[]): Promise<any> {
    const url = `${this.config.baseUrl}/v1/messages`;

    // Convert messages to Anthropic format
    const anthropicMessages = [];
    let systemPrompt = '';

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemPrompt = msg.content;
      } else {
        anthropicMessages.push({
          role: msg.role,
          content: [{ type: 'text', text: msg.content }]
        });
      }
    }

    const body: any = {
      model: this.config.model,
      messages: anthropicMessages,
      max_tokens: 4096,
      system: systemPrompt
    };

    // Enable tools for function calling
    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    try {
      const data = JSON.parse(text);

      // Handle tool_use response - convert to tool_calls format
      if (data.content) {
        const processedContent = data.content.map((block: any) => {
          if (block.type === 'tool_use') {
            return {
              type: 'tool_call',
              id: block.id,
              name: block.name,
              input: block.input
            };
          }
          return block;
        });
        data.content = processedContent;
      }

      return data;
    } catch {
      throw new Error(`Invalid JSON: ${text.substring(0, 100)}`);
    }
  }
}

export function createMiniMaxProvider(apiKey: string, baseUrl?: string): MiniMaxProvider | null {
  if (!apiKey || !apiKey.startsWith('sk-')) {
    return null;
  }

  return new MiniMaxProvider({
    apiKey,
    baseUrl: baseUrl || 'https://api.minimaxi.com/anthropic',
    model: 'MiniMax-M2.7'
  });
}