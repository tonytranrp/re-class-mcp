import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { BridgeError, ReClassBridgeClient } from "../bridge/ReClassBridgeClient.js";

const execFileAsync = promisify(execFile);
const DEFAULT_RECLASS_INSTALL_ROOT = "C:\\Users\\tonyi\\Downloads\\ReClass.NET";

export type ReClassPlatform = "x64" | "x86";

export interface ReClassAutomationOptions {
  autoLaunch: boolean;
  reClassInstallRoot?: string;
  platform: ReClassPlatform;
  launchTimeoutMs: number;
  launchPollMs: number;
  restartExisting: boolean;
  attachProcessName?: string;
  attachProcessId?: number;
}

export interface ReClassDoctorReport {
  bridgeReady: boolean;
  autoLaunch: boolean;
  resolvedInstallRoot: string;
  resolvedExecutable: string;
  processRunning: boolean;
  platform: ReClassPlatform;
  launchTimeoutMs: number;
  launchPollMs: number;
}

export interface EnsureBridgeResult extends ReClassDoctorReport {
  launched: boolean;
  attached: boolean;
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function escapePowerShell(value: string): string {
  return value.replace(/'/g, "''");
}

async function runPowerShell(script: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    { windowsHide: true },
  );

  return stdout.trim();
}

export function resolveReClassInstallRoot(preferred?: string): string {
  return preferred ?? process.env.RECLASS_INSTALL_DIR ?? DEFAULT_RECLASS_INSTALL_ROOT;
}

export function resolveReClassExecutable(
  installRoot: string,
  platform: ReClassPlatform,
): string {
  return `${installRoot}\\${platform}\\ReClass.NET.exe`;
}

async function assertFileExists(path: string): Promise<void> {
  await access(path, fsConstants.F_OK);
}

export async function isBridgeReachable(bridge: ReClassBridgeClient): Promise<boolean> {
  try {
    await bridge.assertSuccess("ping");
    return true;
  } catch (error) {
    if (error instanceof BridgeError) {
      return false;
    }

    throw error;
  }
}

async function isReClassRunning(executablePath: string): Promise<boolean> {
  const normalizedPath = escapePowerShell(executablePath);
  const script =
    `$matches = Get-CimInstance Win32_Process -Filter "Name = 'ReClass.NET.exe'" ` +
    `| Where-Object { $_.ExecutablePath -eq '${normalizedPath}' }; ` +
    `if ($matches) { 'running' }`;

  const output = await runPowerShell(script);
  return output.includes("running");
}

async function stopReClass(executablePath: string): Promise<void> {
  const normalizedPath = escapePowerShell(executablePath);
  const script =
    `Get-CimInstance Win32_Process -Filter "Name = 'ReClass.NET.exe'" ` +
    `| Where-Object { $_.ExecutablePath -eq '${normalizedPath}' } ` +
    `| ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;

  await runPowerShell(script);
}

export async function launchReClass(executablePath: string): Promise<void> {
  await assertFileExists(executablePath);

  const child = spawn(executablePath, [], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
}

async function waitForBridge(
  bridge: ReClassBridgeClient,
  timeoutMs: number,
  pollMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await isBridgeReachable(bridge)) {
      return true;
    }

    await sleep(pollMs);
  }

  return await isBridgeReachable(bridge);
}

async function autoAttachIfRequested(
  bridge: ReClassBridgeClient,
  options: ReClassAutomationOptions,
): Promise<boolean> {
  if (options.attachProcessId === undefined && !options.attachProcessName) {
    return false;
  }

  const payload: Record<string, unknown> = {};
  if (options.attachProcessId !== undefined) {
    payload.process_id = String(options.attachProcessId);
  }
  if (options.attachProcessName) {
    payload.process_name = options.attachProcessName;
  }

  await bridge.assertSuccess("attach_process", payload);
  return true;
}

export async function collectDoctorReport(
  bridge: ReClassBridgeClient,
  options: ReClassAutomationOptions,
): Promise<ReClassDoctorReport> {
  const resolvedInstallRoot = resolveReClassInstallRoot(options.reClassInstallRoot);
  const resolvedExecutable = resolveReClassExecutable(resolvedInstallRoot, options.platform);
  const bridgeReady = await isBridgeReachable(bridge);
  const processRunning = await isReClassRunning(resolvedExecutable);

  return {
    bridgeReady,
    autoLaunch: options.autoLaunch,
    resolvedInstallRoot,
    resolvedExecutable,
    processRunning,
    platform: options.platform,
    launchTimeoutMs: options.launchTimeoutMs,
    launchPollMs: options.launchPollMs,
  };
}

export async function ensureBridgeReady(
  bridge: ReClassBridgeClient,
  options: ReClassAutomationOptions,
): Promise<EnsureBridgeResult> {
  const report = await collectDoctorReport(bridge, options);
  let launched = false;

  if (!report.bridgeReady) {
    if (!options.autoLaunch) {
      throw new BridgeError(
        "ReClass bridge is not reachable and auto-launch is disabled for this MCP server.",
      );
    }

    if (options.restartExisting && report.processRunning) {
      await stopReClass(report.resolvedExecutable);
    }

    const shouldLaunch = options.restartExisting || !report.processRunning;
    if (shouldLaunch) {
      await launchReClass(report.resolvedExecutable);
      launched = true;
    }

    const ready = await waitForBridge(bridge, options.launchTimeoutMs, options.launchPollMs);
    if (!ready) {
      throw new BridgeError(
        `ReClass bridge did not come online within ${options.launchTimeoutMs}ms after checking ${report.resolvedExecutable}.`,
      );
    }
  }

  const attached = await autoAttachIfRequested(bridge, options);
  const nextReport = await collectDoctorReport(bridge, options);

  return {
    ...nextReport,
    launched,
    attached,
  };
}
