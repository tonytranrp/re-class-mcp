import { FastMCP } from "fastmcp";
import { z } from "zod";
import {
  type BridgeClientOptions,
  ReClassBridgeClient,
  formatJson,
} from "./bridge/ReClassBridgeClient.js";

const SERVER_VERSION = "0.1.0" as const;

export interface ServerOptions extends BridgeClientOptions {}

export interface CliOptions extends ServerOptions {
  mode: "stdio" | "httpStream";
  httpHost: string;
  httpPort: number;
  endpoint: `/${string}`;
}

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

export function parseCliArgs(argv: string[]): CliOptions {
  const values = [...argv];
  const modeToken = values[0] === "http" ? "httpStream" : values[0] === "stdio" ? "stdio" : "stdio";
  const args = values[0] === "http" || values[0] === "stdio" ? values.slice(1) : values;

  const options: CliOptions = {
    mode: modeToken,
    host: "127.0.0.1",
    port: 27016,
    timeoutMs: 10_000,
    httpHost: "127.0.0.1",
    httpPort: 38116,
    endpoint: "/mcp",
  };

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    const next = args[index + 1];

    switch (current) {
      case "--host":
        options.host = stringFromArg(next, options.host);
        index += 1;
        break;
      case "--port":
        options.port = numberFromArg(next, options.port);
        index += 1;
        break;
      case "--timeout":
        options.timeoutMs = numberFromArg(next, options.timeoutMs);
        index += 1;
        break;
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

function addToolSet(server: FastMCP, bridge: ReClassBridgeClient): void {
  const noArgs = z.object({});
  const processSelector = z
    .object({
      process_id: z.number().int().positive().optional(),
      process_name: z.string().min(1).optional(),
    })
    .refine((value) => value.process_id !== undefined || value.process_name !== undefined, {
      message: "Provide process_id or process_name.",
    });

  const classSelector = z
    .object({
      identifier: z.string().min(1),
    });

  const classIdSelector = z
    .object({
      class_id: z.string().min(1),
    });

  const classNameSelector = z
    .object({
      class_name: z.string().min(1),
    });

  const classRefSchema = z.union([classIdSelector, classNameSelector]);

  const withNodeIndex = classRefSchema.and(
    z.object({
      node_index: z.number().int().nonnegative(),
    }),
  );

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
    name: "get_class",
    description: "Get a class by id or name.",
    parameters: classSelector,
    execute: async (args) => await run("get_class", { id: args.identifier }),
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

  addToolSet(server, bridge);
  addResources(server, bridge);

  return server;
}

export async function startFromCli(argv: string[]): Promise<void> {
  const options = parseCliArgs(argv);
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
