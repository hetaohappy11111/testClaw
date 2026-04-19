import * as fs from 'fs/promises';
import * as path from 'path';
import { Plugin, PluginManifest, PluginApi } from './types.js';
import { ToolRegistry } from '../tools/index.js';

export class PluginLoader {
  private plugins: Map<string, Plugin> = new Map();
  private toolRegistry: ToolRegistry;

  constructor(toolRegistry: ToolRegistry) {
    this.toolRegistry = toolRegistry;
  }

  async loadFromDirectory(dirPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const manifestPath = path.join(dirPath, entry.name, 'openclaw.plugin.json');
          await this.loadPlugin(manifestPath);
        }
      }
    } catch (error) {
      console.error('Error loading plugins:', error);
    }
  }

  private async loadPlugin(manifestPath: string): Promise<void> {
    try {
      const content = await fs.readFile(manifestPath, 'utf-8');
      const manifest: PluginManifest = JSON.parse(content);

      this.plugins.set(manifest.id, {
        manifest,
        loaded: true
      });

      console.log(`Loaded plugin: ${manifest.name}`);
    } catch {
      // Skip if manifest doesn't exist
    }
  }

  get(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  getAll(): Plugin[] {
    return Array.from(this.plugins.values());
  }
}
