import { resolve } from "node:path";
import { ReClassBridgeClient, type BridgeClientOptions } from "../bridge/ReClassBridgeClient.js";
import {
  appendNodes,
  createClassWithNodes,
  describeClassLayout,
  findClasses,
  followPointerChain,
  readCString,
  readPointerValue,
} from "../bridge/ReClassHelpers.js";
import { dumpStructure, dumpStructures, type DumpStructuresOptions, type DumpStructureOptions } from "../dump/StructureDumper.js";
import { clampConcurrency, mapWithConcurrency } from "../util/parallel.js";

export function normalizeForTransport(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeForTransport(entry));
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, normalizeForTransport(entry)]),
    );
  }

  return value;
}

function parseHex(data: string): Uint8Array {
  return Buffer.from(data.replace(/\s+/g, ""), "hex");
}

export function createPluginApi(bridgeOptions: BridgeClientOptions): Record<string, unknown> {
  const bridge = new ReClassBridgeClient(bridgeOptions);

  const api = {
    bridge: async (command: string, args: Record<string, unknown> = {}) => {
      return normalizeForTransport(await bridge.assertSuccess(command, args));
    },
    listClasses: async () => normalizeForTransport(await bridge.assertSuccess("get_classes")),
    getClass: async (identifier: string) =>
      normalizeForTransport(await bridge.assertSuccess("get_class", { id: identifier })),
    readPointerValue: async (address: string, pointerSize = 8) =>
      normalizeForTransport(await readPointerValue(bridge, address, pointerSize as 4 | 8)),
    followPointerChain: async (
      baseAddress: string,
      offsets: number[],
      pointerSize = 8,
      finalDereference = false,
    ) =>
      normalizeForTransport(
        await followPointerChain(bridge, baseAddress, offsets, pointerSize as 4 | 8, finalDereference),
      ),
    readCString: async (address: string, maxLength: number, encoding: "utf8" | "utf16le" = "utf8") =>
      normalizeForTransport(await readCString(bridge, address, maxLength, encoding)),
    findClasses: async (query: string) => normalizeForTransport(await findClasses(bridge, query)),
    describeClassLayout: async (identifier: string) =>
      normalizeForTransport(await describeClassLayout(bridge, identifier)),
    createClassWithNodes: async (
      name: string,
      nodes: Array<{ type: string; name?: string; comment?: string }>,
      address?: string,
      comment?: string,
    ) => normalizeForTransport(await createClassWithNodes(bridge, name, nodes, address, comment)),
    appendNodes: async (
      identifier: string,
      nodes: Array<{ type: string; name?: string; comment?: string }>,
    ) => normalizeForTransport(await appendNodes(bridge, identifier, nodes)),
    readMemoryMany: async (
      requests: Array<{ address: string; size: number }>,
      concurrency = 4,
    ) =>
      normalizeForTransport(
        await mapWithConcurrency(requests, clampConcurrency(concurrency, 4, 16), async (request) => {
          return await bridge.assertSuccess("read_memory", {
            address: request.address,
            size: String(request.size),
          });
        }),
      ),
    readMemoryManyDecoded: async (
      requests: Array<{ address: string; size: number }>,
      concurrency = 4,
    ) =>
      normalizeForTransport(
        await mapWithConcurrency(requests, clampConcurrency(concurrency, 4, 16), async (request) => {
          const response = await bridge.assertSuccess<{ success: boolean; data: string; [key: string]: unknown }>("read_memory", {
            address: request.address,
            size: String(request.size),
          });
          return {
            ...response,
            bytes: Array.from(parseHex(response.data)),
          };
        }),
      ),
    dumpStructure: async (identifier: string, options: DumpStructureOptions = {}) =>
      normalizeForTransport(await dumpStructure(bridge, identifier, options)),
    dumpStructures: async (options: DumpStructuresOptions) =>
      normalizeForTransport(await dumpStructures(bridge, options)),
    resolvePath: (pathValue: string) => resolve(pathValue),
  };

  return api;
}
