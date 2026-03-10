#!/usr/bin/env node

import { startFromCli } from "./index.js";

void startFromCli(process.argv.slice(2)).catch((error: unknown) => {
  console.error("[re-class-mcp] fatal:", error);
  process.exit(1);
});
