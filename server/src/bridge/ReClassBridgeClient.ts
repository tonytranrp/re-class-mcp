import net from "node:net";

export interface BridgeClientOptions {
  host: string;
  port: number;
  timeoutMs: number;
}

export interface BridgeRequest {
  command: string;
  args?: Record<string, unknown>;
}

export interface BridgeResponse {
  success: boolean;
  error?: string;
  [key: string]: unknown;
}

export class BridgeError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "BridgeError";
  }
}

export class ReClassBridgeClient {
  public constructor(private readonly options: BridgeClientOptions) {}

  public async send<T extends BridgeResponse>(
    command: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    const response = await this.exchange({ command, args });
    return response as T;
  }

  public async assertSuccess<T extends BridgeResponse>(
    command: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    const response = await this.send<T>(command, args);
    if (!response.success) {
      throw new BridgeError(response.error ?? `Command failed: ${command}`);
    }
    return response;
  }

  private async exchange(request: BridgeRequest): Promise<BridgeResponse> {
    const payload = JSON.stringify(request) + "\n";

    return await new Promise<BridgeResponse>((resolve, reject) => {
      const socket = net.createConnection({
        host: this.options.host,
        port: this.options.port,
      });

      let settled = false;
      let buffer = "";

      const finish = (callback: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        socket.destroy();
        callback();
      };

      socket.setTimeout(this.options.timeoutMs);

      socket.on("connect", () => {
        socket.write(payload, "utf8");
      });

      socket.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex < 0) {
          return;
        }

        const rawLine = buffer.slice(0, newlineIndex).trim();
        finish(() => {
          if (!rawLine) {
            reject(new BridgeError("Bridge returned an empty response."));
            return;
          }

          try {
            resolve(JSON.parse(rawLine) as BridgeResponse);
          } catch (error) {
            reject(new BridgeError(`Bridge returned invalid JSON: ${String(error)}`));
          }
        });
      });

      socket.on("timeout", () => {
        finish(() => {
          reject(
            new BridgeError(
              `Bridge timed out after ${this.options.timeoutMs}ms while waiting for ${request.command}.`,
            ),
          );
        });
      });

      socket.on("error", (error) => {
        finish(() => {
          reject(new BridgeError(`Bridge connection failed: ${error.message}`));
        });
      });

      socket.on("close", () => {
        if (!settled) {
          finish(() => {
            reject(new BridgeError("Bridge connection closed before a response was received."));
          });
        }
      });
    });
  }
}

export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
