import { FastMCP } from "fastmcp";
import { z } from "zod";
import {
  type BridgeClientOptions,
  ReClassBridgeClient,
  formatJson,
} from "./bridge/ReClassBridgeClient.js";
import {
  appendNodes,
  createClassWithNodes,
  describeClassLayout,
  findClasses,
  followPointerChain,
  readCString,
  readPointerValue,
} from "./bridge/ReClassHelpers.js";
import {
  type CodexInstallMode,
  installCodexServer,
} from "./config/CodexConfig.js";
import {
  collectDoctorReport,
  ensureBridgeReady,
  type ReClassAutomationOptions,
  type ReClassPlatform,
} from "./runtime/ReClassAutomation.js";

const SERVER_VERSION = "0.2.0" as const;

export interface ServerOptions extends BridgeClientOptions, ReClassAutomationOptions {}

export interface ServeCliOptions extends ServerOptions {
  command: "serve";
  mode: "stdio" | "httpStream";
  httpHost: string;
  httpPort: number;
  endpoint: `/${string}`;
}

interface DoctorCliOptions extends ServerOptions {
  command: "doctor";
}

interface LaunchCliOptions extends ServerOptions {
  command: "launch-reclass";
}

interface InstallCodexCliOptions extends ServerOptions {
  command: "install-codex";
  configPath?: string | undefined;
  installMode: CodexInstallMode;
  githubRepo?: string | undefined;
  packageName?: string | undefined;
  startupTimeoutSec: number;
}

type ParsedCliCommand =
  | ServeCliOptions
  | DoctorCliOptions
  | LaunchCliOptions
  | InstallCodexCliOptions;

function numberFromArg(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Expected a number but received "${value}".`);
  }

  return parsed;
}

function stringFromArg(value: string | undefined, fallback: string): string {
  return value && value.length > 0 ? value : fallback;
}

function isServeCommandToken(value: string | undefined): boolean {
  return value === undefined || value === "stdio" || value === "http" || value.startsWith("--");
}

function defaultBridgeOptions(): BridgeClientOptions {
  return {
    host: "127.0.0.1",
    port: 27016,
    timeoutMs: 10_000,
  };
}

function defaultAutomationOptions(): ReClassAutomationOptions {
  return {
    autoLaunch: false,
    platform: "x64",
    launchTimeoutMs: 20_000,
    launchPollMs: 500,
    restartExisting: false,
  };
}

function applyCommonArg(
  target: ServerOptions,
  current: string,
  next: string | undefined,
): number {
  switch (current) {
    case "--host":
      target.host = stringFromArg(next, target.host);
      return 1;
    case "--port":
      target.port = numberFromArg(next, target.port);
      return 1;
    case "--timeout":
      target.timeoutMs = numberFromArg(next, target.timeoutMs);
      return 1;
    case "--auto-launch":
      target.autoLaunch = true;
      return 0;
    case "--reclass-root":
      target.reClassInstallRoot = stringFromArg(next, target.reClassInstallRoot ?? "");
      return 1;
    case "--platform": {
      const platform = stringFromArg(next, target.platform);
      if (platform !== "x64" && platform !== "x86") {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      target.platform = platform;
      return 1;
    }
    case "--launch-timeout":
      target.launchTimeoutMs = numberFromArg(next, target.launchTimeoutMs);
      return 1;
    case "--launch-poll":
      target.launchPollMs = numberFromArg(next, target.launchPollMs);
      return 1;
    case "--restart-reclass":
      target.restartExisting = true;
      return 0;
    case "--attach-process":
      target.attachProcessName = stringFromArg(next, "");
      return 1;
    case "--attach-process-id":
      target.attachProcessId = numberFromArg(next, 0);
      return 1;
    default:
      return -1;
  }
}

export function parseCliArgs(argv: string[]): ParsedCliCommand {
  const values = [...argv];
  const first = values[0];

  if (first === "doctor") {
    const options: DoctorCliOptions = {
      command: "doctor",
      ...defaultBridgeOptions(),
      ...defaultAutomationOptions(),
    };

    for (let index = 1; index < values.length; index += 1) {
      const current = values[index];
      if (current === undefined) {
        break;
      }

      const consumed = applyCommonArg(options, current, values[index + 1]);
      if (consumed < 0) {
        throw new Error(`Unknown argument: ${current}`);
      }
      index += consumed;
    }

    return options;
  }

  if (first === "launch-reclass") {
    const options: LaunchCliOptions = {
      command: "launch-reclass",
      ...defaultBridgeOptions(),
      ...defaultAutomationOptions(),
      autoLaunch: true,
    };

    for (let index = 1; index < values.length; index += 1) {
      const current = values[index];
      if (current === undefined) {
        break;
      }

      const consumed = applyCommonArg(options, current, values[index + 1]);
      if (consumed < 0) {
        throw new Error(`Unknown argument: ${current}`);
      }
      index += consumed;
    }

    return options;
  }

  if (first === "install-codex") {
    const options: InstallCodexCliOptions = {
      command: "install-codex",
      ...defaultBridgeOptions(),
      ...defaultAutomationOptions(),
      installMode: "local",
      packageName: "re-class-mcp",
      startupTimeoutSec: 60,
    };

    for (let index = 1; index < values.length; index += 1) {
      const current = values[index];
      if (current === undefined) {
        break;
      }
      const next = values[index + 1];
      const consumed = applyCommonArg(options, current, next);
      if (consumed >= 0) {
        index += consumed;
        continue;
      }

      switch (current) {
        case "--config":
          options.configPath = stringFromArg(next, "");
          index += 1;
          break;
        case "--mode": {
          const mode = stringFromArg(next, options.installMode);
          if (mode !== "local" && mode !== "github" && mode !== "npm") {
            throw new Error(`Unsupported install mode: ${mode}`);
          }

          options.installMode = mode;
          index += 1;
          break;
        }
        case "--github-repo":
          options.githubRepo = stringFromArg(next, "");
          index += 1;
          break;
        case "--package-name":
          options.packageName = stringFromArg(next, options.packageName ?? "re-class-mcp");
          index += 1;
          break;
        case "--startup-timeout":
          options.startupTimeoutSec = numberFromArg(next, options.startupTimeoutSec);
          index += 1;
          break;
        default:
          throw new Error(`Unknown argument: ${current}`);
      }
    }

    return options;
  }

  if (!isServeCommandToken(first)) {
    throw new Error(`Unknown command: ${first}`);
  }

  const modeToken = first === "http" ? "httpStream" : "stdio";
  const args = first === "http" || first === "stdio" ? values.slice(1) : values;
  const options: ServeCliOptions = {
    command: "serve",
    mode: modeToken,
    httpHost: "127.0.0.1",
    httpPort: 38116,
    endpoint: "/mcp",
    ...defaultBridgeOptions(),
    ...defaultAutomationOptions(),
  };

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (current === undefined) {
      break;
    }
    const next = args[index + 1];
    const consumed = applyCommonArg(options, current, next);
    if (consumed >= 0) {
      index += consumed;
      continue;
    }

    switch (current) {
      case "--http-host":
        options.httpHost = stringFromArg(next, options.httpHost);
        index += 1;
        break;
      case "--http-port":
        options.httpPort = numberFromArg(next, options.httpPort);
        index += 1;
        break;
      case "--endpoint":
        options.endpoint = (stringFromArg(next, options.endpoint) as `/${string}`);
        index += 1;
        break;
      case "--stdio":
        options.mode = "stdio";
        break;
      case "--http":
        options.mode = "httpStream";
        break;
      default:
        throw new Error(`Unknown argument: ${current}`);
    }
  }

  return options;
}

function addToolSet(
  server: FastMCP,
  bridge: ReClassBridgeClient,
  automation: ReClassAutomationOptions,
): void {
  const noArgs = z.object({});
  const pointerSizeSchema = z.union([z.literal(4), z.literal(8)]);
  const processSelector = z
    .object({
      process_id: z.number().int().positive().optional(),
      process_name: z.string().min(1).optional(),
    })
    .refine((value) => value.process_id !== undefined || value.process_name !== undefined, {
      message: "Provide process_id or process_name.",
    });

  const classSelector = z.object({
    identifier: z.string().min(1),
  });

  const classIdSelector = z.object({
    class_id: z.string().min(1),
  });

  const classNameSelector = z.object({
    class_name: z.string().min(1),
  });

  const classRefSchema = z.union([classIdSelector, classNameSelector]);

  const withNodeIndex = classRefSchema.and(
    z.object({
      node_index: z.number().int().nonnegative(),
    }),
  );

  const nodeSpecSchema = z.object({
    type: z.string().min(1),
    name: z.string().min(1).optional(),
    comment: z.string().optional(),
  });

  const run = async (
    command: string,
    args: Record<string, unknown> = {},
  ): Promise<string> => formatJson(await bridge.assertSuccess(command, args));

  server.addTool({
    name: "is_connected",
    description: "Check whether the ReClass bridge plugin is reachable.",
    parameters: noArgs,
    execute: async () => await run("ping"),
  });

  server.addTool({
    name: "doctor_reclass",
    description: "Report bridge reachability, resolved ReClass install path, and launch settings.",
    parameters: noArgs,
    execute: async () => formatJson(await collectDoctorReport(bridge, automation)),
  });

  server.addTool({
    name: "ensure_reclass_ready",
    description: "Ensure the bridge is online, launching ReClass if this MCP server was configured for auto-launch.",
    parameters: noArgs,
    execute: async () => formatJson(await ensureBridgeReady(bridge, automation)),
  });

  server.addTool({
    name: "launch_reclass",
    description: "Launch ReClass.NET and wait for the bridge to come online.",
    parameters: noArgs,
    execute: async () =>
      formatJson(
        await ensureBridgeReady(bridge, {
          ...automation,
          autoLaunch: true,
        }),
      ),
  });

  server.addTool({
    name: "get_status",
    description: "Return bridge attachment status and current process info.",
    parameters: noArgs,
    execute: async () => await run("get_status"),
  });

  server.addTool({
    name: "get_runtime_status",
    description: "Return runtime plugin status, version, and bridge config.",
    parameters: noArgs,
    execute: async () => await run("get_runtime_status"),
  });

  server.addTool({
    name: "restart_bridge",
    description: "Restart the ReClass TCP bridge without restarting ReClass.NET.",
    parameters: noArgs,
    execute: async () => await run("restart_bridge"),
  });

  server.addTool({
    name: "get_process_info",
    description: "Get the currently attached process details.",
    parameters: noArgs,
    execute: async () => await run("get_process_info"),
  });

  server.addTool({
    name: "list_processes",
    description: "List processes visible to ReClass.NET.",
    parameters: noArgs,
    execute: async () => await run("list_processes"),
  });

  server.addTool({
    name: "attach_process",
    description: "Attach ReClass.NET to a process by PID or process name.",
    parameters: processSelector,
    execute: async (args) => {
      const payload: Record<string, unknown> = {};
      if (args.process_id !== undefined) {
        payload.process_id = String(args.process_id);
      }
      if (args.process_name !== undefined) {
        payload.process_name = args.process_name;
      }
      return await run("attach_process", payload);
    },
  });

  server.addTool({
    name: "detach_process",
    description: "Detach ReClass.NET from the current target process.",
    parameters: noArgs,
    execute: async () => await run("detach_process"),
  });

  server.addTool({
    name: "read_memory",
    description: "Read memory from the attached process.",
    parameters: z.object({
      address: z.string().min(1),
      size: z.number().int().positive().max(0x10000),
    }),
    execute: async (args) => await run("read_memory", {
      address: args.address,
      size: String(args.size),
    }),
  });

  server.addTool({
    name: "read_pointer_value",
    description: "Read one pointer-sized value from the attached process.",
    parameters: z.object({
      address: z.string().min(1),
      pointer_size: pointerSizeSchema.default(8),
    }),
    execute: async (args) =>
      formatJson(await readPointerValue(bridge, args.address, args.pointer_size)),
  });

  server.addTool({
    name: "follow_pointer_chain",
    description: "Resolve a multilevel pointer chain by repeatedly dereferencing and applying offsets.",
    parameters: z.object({
      base_address: z.string().min(1),
      offsets: z.array(z.number().int()),
      pointer_size: pointerSizeSchema.default(8),
      final_dereference: z.boolean().optional(),
    }),
    execute: async (args) =>
      formatJson(
        await followPointerChain(
          bridge,
          args.base_address,
          args.offsets,
          args.pointer_size,
          args.final_dereference ?? false,
        ),
      ),
  });

  server.addTool({
    name: "read_c_string",
    description: "Read a null-terminated UTF-8 or UTF-16LE string from the attached process.",
    parameters: z.object({
      address: z.string().min(1),
      max_length: z.number().int().positive().max(0x4000),
      encoding: z.enum(["utf8", "utf16le"]).default("utf8"),
    }),
    execute: async (args) =>
      formatJson(await readCString(bridge, args.address, args.max_length, args.encoding)),
  });

  server.addTool({
    name: "write_memory",
    description: "Write raw hex bytes into the attached process.",
    parameters: z.object({
      address: z.string().min(1),
      data: z.string().min(2),
    }),
    execute: async (args) => await run("write_memory", args),
  });

  server.addTool({
    name: "get_modules",
    description: "List modules from the attached process.",
    parameters: noArgs,
    execute: async () => await run("get_modules"),
  });

  server.addTool({
    name: "get_sections",
    description: "List memory sections from the attached process.",
    parameters: noArgs,
    execute: async () => await run("get_sections"),
  });

  server.addTool({
    name: "parse_address",
    description: "Resolve a ReClass-style formula such as module.exe+0x1234.",
    parameters: z.object({
      formula: z.string().min(1),
    }),
    execute: async (args) => await run("parse_address", args),
  });

  server.addTool({
    name: "get_classes",
    description: "List ReClass classes from the active project.",
    parameters: noArgs,
    execute: async () => await run("get_classes"),
  });

  server.addTool({
    name: "find_classes",
    description: "Filter active ReClass classes by substring match on name or id.",
    parameters: z.object({
      query: z.string().min(1),
    }),
    execute: async (args) => formatJson(await findClasses(bridge, args.query)),
  });

  server.addTool({
    name: "get_class",
    description: "Get a class by id or name.",
    parameters: classSelector,
    execute: async (args) => await run("get_class", { id: args.identifier }),
  });

  server.addTool({
    name: "describe_class_layout",
    description: "Get a class and return its node layout with computed end offsets.",
    parameters: classSelector,
    execute: async (args) => formatJson(await describeClassLayout(bridge, args.identifier)),
  });

  server.addTool({
    name: "get_nodes",
    description: "List nodes for a class by name or id.",
    parameters: classRefSchema,
    execute: async (args) => await run("get_nodes", args),
  });

  server.addTool({
    name: "create_class",
    description: "Create a new ReClass class.",
    parameters: z.object({
      name: z.string().min(1),
      address: z.string().min(1).optional(),
    }),
    execute: async (args) => await run("create_class", args.address ? args : { name: args.name }),
  });

  server.addTool({
    name: "create_class_with_nodes",
    description: "Create a class and append an initial node list in one call.",
    parameters: z.object({
      name: z.string().min(1),
      address: z.string().min(1).optional(),
      comment: z.string().optional(),
      nodes: z.array(nodeSpecSchema),
    }),
    execute: async (args) =>
      formatJson(await createClassWithNodes(bridge, args.name, args.nodes, args.address, args.comment)),
  });

  server.addTool({
    name: "delete_class",
    description: "Delete a class by id or name.",
    parameters: classSelector,
    execute: async (args) => await run("delete_class", { id: args.identifier }),
  });

  server.addTool({
    name: "rename_class",
    description: "Rename a class by id or name.",
    parameters: z.object({
      identifier: z.string().min(1),
      name: z.string().min(1),
    }),
    execute: async (args) => await run("rename_class", { id: args.identifier, name: args.name }),
  });

  server.addTool({
    name: "set_class_address",
    description: "Update a class address formula.",
    parameters: z.object({
      identifier: z.string().min(1),
      address: z.string().min(1),
    }),
    execute: async (args) => await run("set_class_address", { id: args.identifier, address: args.address }),
  });

  server.addTool({
    name: "set_class_comment",
    description: "Set a class comment.",
    parameters: z.object({
      identifier: z.string().min(1),
      comment: z.string(),
    }),
    execute: async (args) => await run("set_class_comment", { id: args.identifier, comment: args.comment }),
  });

  server.addTool({
    name: "add_node",
    description: "Add a node to a class.",
    parameters: classRefSchema.and(
      z.object({
        type: z.string().min(1),
        name: z.string().min(1).optional(),
      }),
    ),
    execute: async (args) => await run("add_node", args),
  });

  server.addTool({
    name: "append_nodes",
    description: "Append multiple nodes to an existing class in one call.",
    parameters: classSelector.and(
      z.object({
        nodes: z.array(nodeSpecSchema),
      }),
    ),
    execute: async (args) => formatJson(await appendNodes(bridge, args.identifier, args.nodes)),
  });

  server.addTool({
    name: "rename_node",
    description: "Rename a node inside a class.",
    parameters: withNodeIndex.and(
      z.object({
        name: z.string().min(1),
      }),
    ),
    execute: async (args) => await run("rename_node", args),
  });

  server.addTool({
    name: "set_comment",
    description: "Set a node comment inside a class.",
    parameters: withNodeIndex.and(
      z.object({
        comment: z.string(),
      }),
    ),
    execute: async (args) => await run("set_comment", args),
  });

  server.addTool({
    name: "change_node_type",
    description: "Replace a node with a different node type.",
    parameters: withNodeIndex.and(
      z.object({
        type: z.string().min(1),
      }),
    ),
    execute: async (args) => await run("change_node_type", args),
  });

  server.addTool({
    name: "list_node_types",
    description: "List supported ReClass node types exposed by the runtime.",
    parameters: noArgs,
    execute: async () => await run("list_node_types"),
  });
}

function addResources(server: FastMCP, bridge: ReClassBridgeClient): void {
  server.addResource({
    uri: "reclass://status",
    name: "ReClass Runtime Status",
    mimeType: "application/json",
    load: async () => ({
      text: formatJson(await bridge.assertSuccess("get_runtime_status")),
    }),
  });

  server.addResource({
    uri: "reclass://classes",
    name: "ReClass Classes",
    mimeType: "application/json",
    load: async () => ({
      text: formatJson(await bridge.assertSuccess("get_classes")),
    }),
  });

  server.addResourceTemplate({
    uriTemplate: "reclass://class/{identifier}",
    name: "ReClass Class",
    mimeType: "application/json",
    arguments: [
      {
        name: "identifier",
        description: "Class id or class name",
        required: true,
      },
    ],
    load: async ({ identifier }) => ({
      text: formatJson(await bridge.assertSuccess("get_class", { id: identifier })),
    }),
  });
}

export function createServer(options: ServerOptions): FastMCP {
  const bridge = new ReClassBridgeClient(options);

  const server = new FastMCP({
    name: "re-class-mcp",
    version: SERVER_VERSION,
    instructions:
      "Use this server to inspect and manipulate ReClass.NET state through the local bridge plugin. " +
      "Process attachment, class layout editing, and raw memory reads all route through ReClass.NET.",
  });

  addToolSet(server, bridge, options);
  addResources(server, bridge);

  return server;
}

async function runDoctor(options: DoctorCliOptions): Promise<void> {
  const bridge = new ReClassBridgeClient(options);
  process.stdout.write(`${formatJson(await collectDoctorReport(bridge, options))}\n`);
}

async function runLaunch(options: LaunchCliOptions): Promise<void> {
  const bridge = new ReClassBridgeClient(options);
  process.stdout.write(`${formatJson(await ensureBridgeReady(bridge, options))}\n`);
}

async function runInstallCodex(options: InstallCodexCliOptions): Promise<void> {
  const result = await installCodexServer(options);
  process.stdout.write(`${formatJson(result)}\n`);
}

async function runServer(options: ServeCliOptions): Promise<void> {
  if (
    options.autoLaunch ||
    options.restartExisting ||
    options.attachProcessId !== undefined ||
    options.attachProcessName !== undefined
  ) {
    const bridge = new ReClassBridgeClient(options);
    await ensureBridgeReady(bridge, options);
  }

  const server = createServer(options);

  const stop = async (): Promise<void> => {
    await server.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void stop();
  });

  process.on("SIGTERM", () => {
    void stop();
  });

  if (options.mode === "httpStream") {
    await server.start({
      transportType: "httpStream",
      httpStream: {
        host: options.httpHost,
        port: options.httpPort,
        endpoint: options.endpoint,
      },
    });
    return;
  }

  await server.start({
    transportType: "stdio",
  });
}

export async function startFromCli(argv: string[]): Promise<void> {
  const options = parseCliArgs(argv);

  switch (options.command) {
    case "doctor":
      await runDoctor(options);
      return;
    case "launch-reclass":
      await runLaunch(options);
      return;
    case "install-codex":
      await runInstallCodex(options);
      return;
    case "serve":
      await runServer(options);
      return;
    default:
      throw new Error(`Unhandled command: ${(options as { command: string }).command}`);
  }
}

export type { ReClassPlatform };
