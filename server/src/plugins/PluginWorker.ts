import { readFile } from "node:fs/promises";
import { parentPort, workerData } from "node:worker_threads";
import vm from "node:vm";
import { createPluginApi, normalizeForTransport } from "./PluginApi.js";
import { loadPluginModule } from "./PluginModule.js";

type WorkerData =
  | {
      kind: "script";
      bridgeOptions: { host: string; port: number; timeoutMs: number };
      script: string;
      expression: boolean;
      args: Record<string, unknown>;
    }
  | {
      kind: "script-file";
      bridgeOptions: { host: string; port: number; timeoutMs: number };
      scriptPath: string;
      expression: boolean;
      args: Record<string, unknown>;
    }
  | {
      kind: "plugin-action";
      bridgeOptions: { host: string; port: number; timeoutMs: number };
      pluginFilePath: string;
      pluginName: string;
      actionName: string;
      args: Record<string, unknown>;
    };

const asyncWrapperPrefix = "(async () => {\n";
const asyncWrapperSuffix = "\n})()";

async function executeScript(
  script: string,
  expression: boolean,
  args: Record<string, unknown>,
  api: Record<string, unknown>,
): Promise<unknown> {
  const body = expression ? `return (${script});` : script;
  const context = vm.createContext({
    api,
    args,
    console,
    Buffer,
    setTimeout,
    clearTimeout,
    TextEncoder,
    TextDecoder,
  });

  const compiled = new vm.Script(`${asyncWrapperPrefix}${body}${asyncWrapperSuffix}`, {
    filename: expression ? "script_eval_expression.js" : "script_eval.js",
  });

  return await compiled.runInContext(context, {
    timeout: 30_000,
  });
}

async function run(): Promise<void> {
  if (!parentPort) {
    throw new Error("Worker must run with a parent port.");
  }

  const input = workerData as WorkerData;
  const api = createPluginApi(input.bridgeOptions);

  try {
    let value: unknown;

    switch (input.kind) {
      case "script":
        value = await executeScript(input.script, input.expression, input.args, api);
        break;
      case "script-file": {
        const script = await readFile(input.scriptPath, "utf8");
        value = await executeScript(script, input.expression, input.args, api);
        break;
      }
      case "plugin-action": {
        const plugin = await loadPluginModule(input.pluginFilePath);
        if (plugin.name !== input.pluginName) {
          throw new Error(`Plugin name mismatch. Expected ${input.pluginName}, loaded ${plugin.name}.`);
        }

        const action = plugin.actions[input.actionName];
        if (!action) {
          throw new Error(`Plugin action not found: ${input.pluginName}.${input.actionName}`);
        }

        value = await action.run({
          args: input.args,
          api,
        });
        break;
      }
      default:
        throw new Error(`Unsupported worker task kind: ${(input as { kind: string }).kind}`);
    }

    parentPort.postMessage({
      ok: true,
      value: normalizeForTransport(value),
    });
  } catch (error) {
    const failure = error as Error;
    parentPort.postMessage({
      ok: false,
      error: failure.message,
      stack: failure.stack,
    });
  }
}

void run();
