export interface PluginActionContext {
  args: Record<string, unknown>;
  api: Record<string, unknown>;
}

export type PluginActionHandler = (context: PluginActionContext) => Promise<unknown> | unknown;

export interface PluginActionModule {
  description?: string | undefined;
  run: PluginActionHandler;
}

export interface PluginModuleDefinition {
  name: string;
  version?: string | undefined;
  description?: string | undefined;
  actions: Record<string, PluginActionHandler | PluginActionModule>;
}

export interface NormalizedPluginAction {
  name: string;
  description?: string | undefined;
  run: PluginActionHandler;
}

export interface LoadedPluginModule {
  filePath: string;
  name: string;
  version?: string | undefined;
  description?: string | undefined;
  actions: Record<string, NormalizedPluginAction>;
}

export interface ListedPlugin {
  file_path: string;
  name: string;
  version?: string | undefined;
  description?: string | undefined;
  actions: Array<{
    name: string;
    description?: string | undefined;
  }>;
}

export interface ScriptExecutionOptions {
  args?: Record<string, unknown> | undefined;
  expression?: boolean | undefined;
  timeoutMs?: number | undefined;
}
