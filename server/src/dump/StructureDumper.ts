import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { ReClassBridgeClient } from "../bridge/ReClassBridgeClient.js";
import {
  describeClassLayout,
  findClasses,
  type ClassNodeLayout,
  type ClassSummary,
} from "../bridge/ReClassHelpers.js";
import { clampConcurrency, mapWithConcurrency } from "../util/parallel.js";

export type DumpFormat = "json" | "markdown" | "cpp";

export interface DumpStructureOptions {
  format?: DumpFormat | undefined;
  outputPath?: string | undefined;
  includeContent?: boolean | undefined;
}

export interface DumpStructuresOptions {
  identifiers?: string[] | undefined;
  query?: string | undefined;
  format?: DumpFormat | undefined;
  outputDir?: string | undefined;
  includeContent?: boolean | undefined;
  concurrency?: number | undefined;
}

function sanitizeIdentifier(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `_${cleaned}`;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
}

function cppTypeForNode(node: ClassNodeLayout): string {
  switch (node.type) {
    case "Int8Node":
      return "std::int8_t";
    case "Int16Node":
      return "std::int16_t";
    case "Int32Node":
      return "std::int32_t";
    case "Int64Node":
      return "std::int64_t";
    case "UInt8Node":
      return "std::uint8_t";
    case "UInt16Node":
      return "std::uint16_t";
    case "UInt32Node":
      return "std::uint32_t";
    case "UInt64Node":
      return "std::uint64_t";
    case "FloatNode":
      return "float";
    case "DoubleNode":
      return "double";
    case "PointerNode":
    case "FunctionPtrNode":
    case "VirtualMethodTableNode":
      return "std::uintptr_t";
    case "BoolNode":
      return "bool";
    default:
      return `std::array<std::byte, 0x${node.size.toString(16).toUpperCase()}>`;
  }
}

function renderCpp(layout: Awaited<ReturnType<typeof describeClassLayout>>): string {
  const lines = [
    "#pragma once",
    "#include <array>",
    "#include <cstddef>",
    "#include <cstdint>",
    "",
    `struct ${sanitizeIdentifier(layout.name)} {`,
  ];

  let currentOffset = 0;
  for (const node of layout.nodes) {
    if (node.offset > currentOffset) {
      const paddingSize = node.offset - currentOffset;
      lines.push(
        `    /*0x${currentOffset.toString(16).toUpperCase().padStart(4, "0")}*/ std::array<std::byte, 0x${paddingSize
          .toString(16)
          .toUpperCase()}> pad_${currentOffset.toString(16).toUpperCase().padStart(4, "0")};`,
      );
    }

    const fieldName = sanitizeIdentifier(node.name.length > 0 ? node.name : `field_${node.offset.toString(16)}`);
    const commentSuffix = node.comment.length > 0 ? ` // ${node.comment}` : "";
    lines.push(
      `    /*0x${node.offset.toString(16).toUpperCase().padStart(4, "0")}*/ ${cppTypeForNode(node)} ${fieldName};${commentSuffix}`,
    );
    currentOffset = node.end_offset;
  }

  if (layout.size > currentOffset) {
    const paddingSize = layout.size - currentOffset;
    lines.push(
      `    /*0x${currentOffset.toString(16).toUpperCase().padStart(4, "0")}*/ std::array<std::byte, 0x${paddingSize
        .toString(16)
        .toUpperCase()}> pad_${currentOffset.toString(16).toUpperCase().padStart(4, "0")};`,
    );
  }

  lines.push(`}; // size = 0x${layout.size.toString(16).toUpperCase()}`);
  return `${lines.join("\n")}\n`;
}

function renderMarkdown(layout: Awaited<ReturnType<typeof describeClassLayout>>): string {
  const header = [
    `# ${layout.name}`,
    "",
    `- id: \`${layout.id}\``,
    `- address: \`${layout.address}\``,
    `- size: \`0x${layout.size.toString(16).toUpperCase()}\``,
    "",
    "| Offset | Size | Type | Name | Comment |",
    "| --- | --- | --- | --- | --- |",
  ];

  const rows = layout.nodes.map((node) => {
    return `| \`0x${node.offset.toString(16).toUpperCase()}\` | \`0x${node.size
      .toString(16)
      .toUpperCase()}\` | \`${node.type}\` | \`${node.name}\` | ${node.comment.replace(/\|/g, "\\|")} |`;
  });

  return `${header.concat(rows).join("\n")}\n`;
}

function renderContent(
  layout: Awaited<ReturnType<typeof describeClassLayout>>,
  format: DumpFormat,
): string {
  switch (format) {
    case "markdown":
      return renderMarkdown(layout);
    case "cpp":
      return renderCpp(layout);
    case "json":
    default:
      return `${JSON.stringify(layout, null, 2)}\n`;
  }
}

function extensionForFormat(format: DumpFormat): string {
  switch (format) {
    case "markdown":
      return ".md";
    case "cpp":
      return ".hpp";
    case "json":
    default:
      return ".json";
  }
}

async function maybeWriteOutput(
  content: string,
  outputPath: string | undefined,
): Promise<string | undefined> {
  if (!outputPath) {
    return undefined;
  }

  const resolved = resolve(outputPath);
  await mkdir(dirname(resolved), { recursive: true });
  await writeFile(resolved, content, "utf8");
  return resolved;
}

export async function dumpStructure(
  bridge: ReClassBridgeClient,
  identifier: string,
  options: DumpStructureOptions = {},
): Promise<{
  identifier: string;
  format: DumpFormat;
  output_path?: string | undefined;
  content?: string | undefined;
  structure: Awaited<ReturnType<typeof describeClassLayout>>;
}> {
  const format = options.format ?? "json";
  const structure = await describeClassLayout(bridge, identifier);
  const content = renderContent(structure, format);
  const outputPath = await maybeWriteOutput(content, options.outputPath);

  return {
    identifier,
    format,
    output_path: outputPath,
    content: options.includeContent ?? !outputPath ? content : undefined,
    structure,
  };
}

async function collectIdentifiers(
  bridge: ReClassBridgeClient,
  options: DumpStructuresOptions,
): Promise<ClassSummary[]> {
  if (options.identifiers && options.identifiers.length > 0) {
    return options.identifiers.map((identifier) => ({
      id: identifier,
      uuid: identifier,
      name: identifier,
      address: "",
      size: 0,
      node_count: 0,
      comment: "",
    }));
  }

  if (options.query) {
    return (await findClasses(bridge, options.query)).classes;
  }

  throw new Error("Provide identifiers or query for dump_structures.");
}

export async function dumpStructures(
  bridge: ReClassBridgeClient,
  options: DumpStructuresOptions,
): Promise<{
  format: DumpFormat;
  output_dir?: string | undefined;
  entries: Array<{
    identifier: string;
    name: string;
    output_path?: string | undefined;
    content?: string | undefined;
  }>;
}> {
  const format = options.format ?? "json";
  const selected = await collectIdentifiers(bridge, options);
  const outputDir = options.outputDir ? resolve(options.outputDir) : undefined;

  if (outputDir) {
    await mkdir(outputDir, { recursive: true });
  }

  const entries = await mapWithConcurrency(
    selected,
    clampConcurrency(options.concurrency, 4, 16),
    async (classEntry) => {
      const outputPath = outputDir
        ? resolve(outputDir, `${sanitizeFileName(basename(classEntry.name || classEntry.id))}${extensionForFormat(format)}`)
        : undefined;
      const dumped = await dumpStructure(bridge, classEntry.id, {
        format,
        outputPath,
        includeContent: options.includeContent ?? !outputDir,
      });

      return {
        identifier: dumped.identifier,
        name: dumped.structure.name,
        output_path: dumped.output_path,
        content: dumped.content,
      };
    },
  );

  return {
    format,
    output_dir: outputDir,
    entries,
  };
}
