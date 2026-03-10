import { mkdir, readdir, stat, watch } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { loadPluginModule, listablePlugin } from "./PluginModule.js";
import { runPluginActionInWorker } from "./WorkerRunner.js";
import type { BridgeClientOptions } from "../bridge/ReClassBridgeClient.js";
import type { ListedPlugin } from "./PluginTypes.js";

function isPluginFile(path: string): boolean {
  const extension = extname(path).toLowerCase();
  return extension === ".mjs" || extension === ".js";
}

async function discoverPluginFiles(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const fullPath = resolve(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await discoverPluginFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && isPluginFile(fullPath)) {
      results.push(fullPath);
    }
  }

  return results.sort((left, right) => left.localeCompare(right));
}

export class PluginManager {
  private readonly pluginRoot: string;
  private watchAbortController: AbortController | undefined;
  private reloadTimer: NodeJS.Timeout | undefined;
  private plugins = new Map<string, ListedPlugin>();
  private loadErrors = new Map<string, string>();
  private started = false;

  public constructor(pluginRoot: string) {
    this.pluginRoot = resolve(pluginRoot);
  }

  public get pluginDirectory(): string {
    return this.pluginRoot;
  }

  public async start(): Promise<void> {
    if (this.started) {
      return;
    }

    await mkdir(this.pluginRoot, { recursive: true });
    await this.reload();

    this.watchAbortController = new AbortController();
    const watchAbortController = this.watchAbortController;
    this.started = true;

    void (async () => {
      try {
        for await (const _event of watch(this.pluginRoot, {
          recursive: true,
          signal: watchAbortController.signal,
        })) {
          this.scheduleReload();
        }
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ABORT_ERR") {
          throw error;
        }
      }
    })();
  }

  public async stop(): Promise<void> {
    this.reloadTimer && clearTimeout(this.reloadTimer);
    this.reloadTimer = undefined;

    if (this.watchAbortController) {
      this.watchAbortController.abort();
      this.watchAbortController = undefined;
    }

    this.started = false;
  }

  public async reload(): Promise<{ plugins: ListedPlugin[]; errors: Array<{ file_path: string; error: string }> }> {
    await mkdir(this.pluginRoot, { recursive: true });
    const filePaths = await discoverPluginFiles(this.pluginRoot);
    const nextPlugins = new Map<string, ListedPlugin>();
    const nextErrors = new Map<string, string>();

    for (const filePath of filePaths) {
      try {
        await stat(filePath);
        const loaded = await loadPluginModule(filePath);
        nextPlugins.set(loaded.name, listablePlugin(loaded));
      } catch (error) {
        nextErrors.set(filePath, String(error));
      }
    }

    this.plugins = nextPlugins;
    this.loadErrors = nextErrors;

    return {
      plugins: this.listPlugins(),
      errors: this.listErrors(),
    };
  }

  public listPlugins(): ListedPlugin[] {
    return [...this.plugins.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  public listErrors(): Array<{ file_path: string; error: string }> {
    return [...this.loadErrors.entries()]
      .map(([filePath, error]) => ({ file_path: filePath, error }))
      .sort((left, right) => left.file_path.localeCompare(right.file_path));
  }

  public async runPlugin(
    name: string,
    action: string,
    args: Record<string, unknown>,
    bridgeOptions: BridgeClientOptions,
    timeoutMs: number,
  ): Promise<unknown> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin not found: ${name}`);
    }

    return await runPluginActionInWorker({
      bridgeOptions,
      pluginFilePath: plugin.file_path,
      pluginName: plugin.name,
      actionName: action,
      args,
      timeoutMs,
    });
  }

  private scheduleReload(): void {
    this.reloadTimer && clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => {
      void this.reload();
    }, 250);
  }
}
