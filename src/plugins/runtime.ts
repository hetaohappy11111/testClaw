import { Tool } from '../tools/types.js';

export interface PluginRuntimeApi {
  registerTool: (tool: Tool) => void;
  registerHook: (event: string, handler: Function) => void;
  config: Record<string, any>;
  getTool: (name: string) => Tool | undefined;
}

export function createPluginApi(): PluginRuntimeApi {
  const hooks: Map<string, Function[]> = new Map();

  return {
    registerTool: (tool: Tool) => {
      // Will be implemented by plugin loader
    },
    registerHook: (event: string, handler: Function) => {
      const handlers = hooks.get(event) || [];
      handlers.push(handler);
      hooks.set(event, handlers);
    },
    config: {},
    getTool: (name: string) => undefined
  };
}
