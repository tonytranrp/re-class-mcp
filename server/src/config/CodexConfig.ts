import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { ReClassAutomationOptions } from "../runtime/ReClassAutomation.js";

export type CodexInstallMode = "local" | "github" | "npm";

export interface CodexInstallOptions extends ReClassAutomationOptions {
  configPath?: string | undefined;
  host: string;
  port: number;
  startupTimeoutSec: number;
  installMode: CodexInstallMode;
  githubRepo?: string | undefined;
  packageName?: string | undefined;
}

export interface InstalledServerEntry {
  configPath: string;
  command: string;
  args: string[];
  backupPath?: string | undefined;
}

function escapeTomlString(value: string): string {
  if (!value.includes("'")) {
    return `'${value}'`;
  }

  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');

  return `"${escaped}"`;
}

function resolveDefaultCodexConfigPath(): string {
  return resolve(process.env.USERPROFILE ?? process.env.HOME ?? ".", ".codex", "config.toml");
}

function buildCommandLine(options: CodexInstallOptions): { command: string; args: string[] } {
  const sharedArgs = [
    "stdio",
    "--host",
    options.host,
    "--port",
    String(options.port),
    "--timeout",
    "10000",
    "--platform",
    options.platform,
    "--launch-timeout",
    String(options.launchTimeoutMs),
    "--launch-poll",
    String(options.launchPollMs),
  ];

  if (options.autoLaunch) {
    sharedArgs.push("--auto-launch");
  }

  if (options.restartExisting) {
    sharedArgs.push("--restart-reclass");
  }

  if (options.reClassInstallRoot) {
    sharedArgs.push("--reclass-root", options.reClassInstallRoot);
  }

  if (options.attachProcessName) {
    sharedArgs.push("--attach-process", options.attachProcessName);
  }

  if (options.attachProcessId !== undefined) {
    sharedArgs.push("--attach-process-id", String(options.attachProcessId));
  }

  if (options.installMode === "github") {
    if (!options.githubRepo) {
      throw new Error("install-codex requires --github-repo when --mode github is selected.");
    }

    return {
      command: "npx",
      args: ["-y", `github:${options.githubRepo}`, ...sharedArgs],
    };
  }

  if (options.installMode === "npm") {
    return {
      command: "npx",
      args: ["-y", options.packageName ?? "re-class-mcp", ...sharedArgs],
    };
  }

  const localCliPath = resolve(process.cwd(), "dist", "cli.js");
  return {
    command: process.execPath,
    args: [localCliPath, ...sharedArgs],
  };
}

function renderServerBlock(
  command: string,
  args: string[],
  startupTimeoutSec: number,
): string {
  const renderedArgs = args.map((value) => escapeTomlString(value)).join(", ");

  return [
    "[mcp_servers.reclass]",
    `command = ${escapeTomlString(command)}`,
    `args = [${renderedArgs}]`,
    `startup_timeout_sec = ${startupTimeoutSec.toFixed(1)}`,
    "",
  ].join("\r\n");
}

function replaceServerBlock(configText: string, blockText: string): string {
  const normalized = configText.length === 0 ? "" : configText.replace(/\r?\n/g, "\r\n");
  const pattern = /^\[mcp_servers\.reclass\]\r?\n(?:.*\r?\n)*?(?=^\[|\z)/gms;
  const stripped = normalized.replace(pattern, "").trimEnd();
  return `${stripped}${stripped.length > 0 ? "\r\n\r\n" : ""}${blockText}`;
}

export async function installCodexServer(
  options: CodexInstallOptions,
): Promise<InstalledServerEntry> {
  const configPath = resolve(options.configPath ?? resolveDefaultCodexConfigPath());
  const { command, args } = buildCommandLine(options);

  await mkdir(dirname(configPath), { recursive: true });

  let currentConfig = "";
  let backupPath: string | undefined;
  try {
    currentConfig = await readFile(configPath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }

  const nextConfig = replaceServerBlock(
    currentConfig,
    renderServerBlock(command, args, options.startupTimeoutSec),
  );

  if (currentConfig.length > 0 && currentConfig !== nextConfig) {
    backupPath = `${configPath}.bak`;
    await copyFile(configPath, backupPath);
  }

  await writeFile(configPath, nextConfig, "utf8");

  const result: InstalledServerEntry = {
    configPath,
    command,
    args,
  };

  if (backupPath) {
    result.backupPath = backupPath;
  }

  return result;
}
