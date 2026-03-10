import { stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type {
  ListedPlugin,
  LoadedPluginModule,
  NormalizedPluginAction,
  PluginActionHandler,
  PluginActionModule,
  PluginModuleDefinition,
} from "./PluginTypes.js";

function normalizeAction(
  name: string,
  value: PluginActionHandler | PluginActionModule,
): NormalizedPluginAction {
  if (typeof value === "function") {
    return {
      name,
      run: value,
    };
  }

  if (!value || typeof value.run !== "function") {
    throw new Error(`Plugin action "${name}" is missing a run function.`);
  }

  return {
    name,
    description: value.description,
    run: value.run,
  };
}

function extractDefinition(imported: Record<string, unknown>): PluginModuleDefinition {
  const candidate = imported.default ?? imported.plugin;
  if (!candidate || typeof candidate !== "object") {
    throw new Error("Plugin module must export a default object or named 'plugin' object.");
  }

  const definition = candidate as PluginModuleDefinition;
  if (!definition.name || typeof definition.name !== "string") {
    throw new Error("Plugin module is missing a string 'name'.");
  }

  if (!definition.actions || typeof definition.actions !== "object") {
    throw new Error(`Plugin "${definition.name}" is missing an 'actions' object.`);
  }

  return definition;
}

export async function loadPluginModule(filePath: string): Promise<LoadedPluginModule> {
  const fileStats = await stat(filePath);
  const imported = (await import(`${pathToFileURL(filePath).href}?t=${fileStats.mtimeMs}`)) as Record<
    string,
    unknown
  >;
  const definition = extractDefinition(imported);

  const actions = Object.fromEntries(
    Object.entries(definition.actions).map(([name, value]) => [name, normalizeAction(name, value)]),
  );

  return {
    filePath,
    name: definition.name,
    version: definition.version,
    description: definition.description,
    actions,
  };
}

export function listablePlugin(plugin: LoadedPluginModule): ListedPlugin {
  return {
    file_path: plugin.filePath,
    name: plugin.name,
    version: plugin.version,
    description: plugin.description,
    actions: Object.values(plugin.actions).map((action) => ({
      name: action.name,
      description: action.description,
    })),
  };
}
