import { Tool } from '../tools/types.js';

export interface PluginManifest {
  id: string;
  name: string;
  version?: string;
  description?: string;
  tools?: string[];
  hooks?: string[];
}

export interface PluginApi {
  registerTool: (tool: Tool) => void;
  registerHook: (event: string, handler: Function) => void;
  config: Record<string, any>;
}

export interface Plugin {
  manifest: PluginManifest;
  loaded: boolean;
}
