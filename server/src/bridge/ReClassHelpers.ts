import { ReClassBridgeClient } from "./ReClassBridgeClient.js";

interface ReadMemoryResponse {
  success: boolean;
  address: string;
  size: number;
  data: string;
  [key: string]: unknown;
}

interface GetClassesResponse {
  success: boolean;
  classes: ClassSummary[];
  [key: string]: unknown;
}

interface GetClassResponse {
  success: boolean;
  class: ClassDetails;
  [key: string]: unknown;
}

export interface NodeSpec {
  type: string;
  name?: string | undefined;
  comment?: string | undefined;
}

export interface ClassSummary {
  id: string;
  uuid: string;
  name: string;
  address: string;
  size: number;
  node_count: number;
  comment: string;
}

export interface ClassNodeLayout {
  index: number;
  type: string;
  name: string;
  offset: number;
  size: number;
  comment: string;
  is_hidden: boolean;
  child_count?: number;
  inner_type?: string;
  referenced_class?: string;
}

export interface ClassDetails extends ClassSummary {
  nodes: ClassNodeLayout[];
}

function normalizeHex(data: string): string {
  return data.replace(/\s+/g, "");
}

function readMemoryBytes(data: string): Buffer {
  return Buffer.from(normalizeHex(data), "hex");
}

function toHex(value: bigint): string {
  return `0x${value.toString(16).toUpperCase()}`;
}

async function readMemory(
  bridge: ReClassBridgeClient,
  address: string,
  size: number,
): Promise<Buffer> {
  const response = await bridge.assertSuccess<ReadMemoryResponse>("read_memory", {
    address,
    size: String(size),
  });

  return readMemoryBytes(response.data);
}

export async function readPointerValue(
  bridge: ReClassBridgeClient,
  address: string,
  pointerSize: 4 | 8,
): Promise<{ address: string; pointer: string; pointer_size: number }> {
  const buffer = await readMemory(bridge, address, pointerSize);
  const value = pointerSize === 8 ? buffer.readBigUInt64LE(0) : BigInt(buffer.readUInt32LE(0));

  return {
    address,
    pointer: toHex(value),
    pointer_size: pointerSize,
  };
}

export async function followPointerChain(
  bridge: ReClassBridgeClient,
  baseAddress: string,
  offsets: number[],
  pointerSize: 4 | 8,
  finalDereference: boolean,
): Promise<{
  base_address: string;
  pointer_size: number;
  hops: Array<{
    read_at: string;
    pointer: string;
    offset: number;
    next_address: string;
  }>;
  final_address: string;
  final_pointer?: string;
}> {
  const hops: Array<{
    read_at: string;
    pointer: string;
    offset: number;
    next_address: string;
  }> = [];

  let currentAddress = baseAddress;
  for (const offset of offsets) {
    const { pointer } = await readPointerValue(bridge, currentAddress, pointerSize);
    const nextAddress = toHex(BigInt(pointer) + BigInt(offset));
    hops.push({
      read_at: currentAddress,
      pointer,
      offset,
      next_address: nextAddress,
    });
    currentAddress = nextAddress;
  }

  if (finalDereference) {
    const { pointer } = await readPointerValue(bridge, currentAddress, pointerSize);
    return {
      base_address: baseAddress,
      pointer_size: pointerSize,
      hops,
      final_address: currentAddress,
      final_pointer: pointer,
    };
  }

  return {
    base_address: baseAddress,
    pointer_size: pointerSize,
    hops,
    final_address: currentAddress,
  };
}

export async function readCString(
  bridge: ReClassBridgeClient,
  address: string,
  maxLength: number,
  encoding: "utf8" | "utf16le",
): Promise<{ address: string; encoding: string; value: string }> {
  const buffer = await readMemory(bridge, address, maxLength);

  if (encoding === "utf16le") {
    let end = buffer.length;
    for (let index = 0; index + 1 < buffer.length; index += 2) {
      if (buffer[index] === 0 && buffer[index + 1] === 0) {
        end = index;
        break;
      }
    }

    return {
      address,
      encoding,
      value: buffer.subarray(0, end).toString("utf16le"),
    };
  }

  let end = buffer.indexOf(0);
  if (end < 0) {
    end = buffer.length;
  }

  return {
    address,
    encoding,
    value: buffer.subarray(0, end).toString("utf8"),
  };
}

export async function findClasses(
  bridge: ReClassBridgeClient,
  query: string,
): Promise<{ query: string; classes: ClassSummary[] }> {
  const response = await bridge.assertSuccess<GetClassesResponse>("get_classes");
  const normalized = query.trim().toLowerCase();
  const classes = response.classes.filter((entry) => {
    return entry.name.toLowerCase().includes(normalized) || entry.id.toLowerCase().includes(normalized);
  });

  return {
    query,
    classes,
  };
}

export async function describeClassLayout(
  bridge: ReClassBridgeClient,
  identifier: string,
): Promise<{
  id: string;
  name: string;
  address: string;
  size: number;
  node_count: number;
  nodes: Array<ClassNodeLayout & { end_offset: number }>;
}> {
  const response = await bridge.assertSuccess<GetClassResponse>("get_class", { id: identifier });
  return {
    id: response.class.id,
    name: response.class.name,
    address: response.class.address,
    size: response.class.size,
    node_count: response.class.node_count,
    nodes: response.class.nodes.map((node) => ({
      ...node,
      end_offset: node.offset + node.size,
    })),
  };
}

export async function createClassWithNodes(
  bridge: ReClassBridgeClient,
  name: string,
  nodes: NodeSpec[],
  address?: string,
  comment?: string,
): Promise<unknown> {
  const payload: Record<string, unknown> = {
    name,
    nodes,
  };

  if (address) {
    payload.address = address;
  }

  if (comment !== undefined) {
    payload.comment = comment;
  }

  return await bridge.assertSuccess("create_class_with_nodes", payload);
}

export async function appendNodes(
  bridge: ReClassBridgeClient,
  identifier: string,
  nodes: NodeSpec[],
): Promise<unknown> {
  return await bridge.assertSuccess("append_nodes", {
    id: identifier,
    nodes,
  });
}
