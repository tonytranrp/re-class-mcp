import { Worker } from "node:worker_threads";
import type { BridgeClientOptions } from "../bridge/ReClassBridgeClient.js";

interface BaseWorkerTask {
  bridgeOptions: BridgeClientOptions;
  timeoutMs: number;
}

interface ScriptWorkerTask extends BaseWorkerTask {
  kind: "script";
  script: string;
  expression: boolean;
  args: Record<string, unknown>;
}

interface ScriptFileWorkerTask extends BaseWorkerTask {
  kind: "script-file";
  scriptPath: string;
  expression: boolean;
  args: Record<string, unknown>;
}

interface PluginWorkerTask extends BaseWorkerTask {
  kind: "plugin-action";
  pluginFilePath: string;
  pluginName: string;
  actionName: string;
  args: Record<string, unknown>;
}

type WorkerTask = ScriptWorkerTask | ScriptFileWorkerTask | PluginWorkerTask;

interface WorkerSuccess {
  ok: true;
  value: unknown;
}

interface WorkerFailure {
  ok: false;
  error: string;
  stack?: string | undefined;
}

type WorkerReply = WorkerSuccess | WorkerFailure;

async function runWorker(task: WorkerTask): Promise<unknown> {
  const workerUrl = new URL("./PluginWorker.js", import.meta.url);
  const worker = new Worker(workerUrl, {
    workerData: task,
  });

  return await new Promise<unknown>((resolve, reject) => {
    const timeout = setTimeout(() => {
      void worker.terminate();
      reject(new Error(`Worker task timed out after ${task.timeoutMs}ms.`));
    }, task.timeoutMs);

    const cleanup = (): void => {
      clearTimeout(timeout);
      worker.removeAllListeners();
    };

    worker.once("message", (reply: WorkerReply) => {
      cleanup();
      if (reply.ok) {
        resolve(reply.value);
        return;
      }

      reject(new Error(reply.stack ? `${reply.error}\n${reply.stack}` : reply.error));
    });

    worker.once("error", (error) => {
      cleanup();
      reject(error);
    });

    worker.once("exit", (code) => {
      if (code !== 0) {
        cleanup();
        reject(new Error(`Worker exited with code ${code}.`));
      }
    });
  });
}

export async function runScriptInWorker(input: {
  bridgeOptions: BridgeClientOptions;
  script: string;
  expression: boolean;
  args?: Record<string, unknown> | undefined;
  timeoutMs: number;
}): Promise<unknown> {
  return await runWorker({
    kind: "script",
    bridgeOptions: input.bridgeOptions,
    script: input.script,
    expression: input.expression,
    args: input.args ?? {},
    timeoutMs: input.timeoutMs,
  });
}

export async function runScriptFileInWorker(input: {
  bridgeOptions: BridgeClientOptions;
  scriptPath: string;
  expression: boolean;
  args?: Record<string, unknown> | undefined;
  timeoutMs: number;
}): Promise<unknown> {
  return await runWorker({
    kind: "script-file",
    bridgeOptions: input.bridgeOptions,
    scriptPath: input.scriptPath,
    expression: input.expression,
    args: input.args ?? {},
    timeoutMs: input.timeoutMs,
  });
}

export async function runPluginActionInWorker(input: {
  bridgeOptions: BridgeClientOptions;
  pluginFilePath: string;
  pluginName: string;
  actionName: string;
  args?: Record<string, unknown> | undefined;
  timeoutMs: number;
}): Promise<unknown> {
  return await runWorker({
    kind: "plugin-action",
    bridgeOptions: input.bridgeOptions,
    pluginFilePath: input.pluginFilePath,
    pluginName: input.pluginName,
    actionName: input.actionName,
    args: input.args ?? {},
    timeoutMs: input.timeoutMs,
  });
}
