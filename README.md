# re-class-mcp

`re-class-mcp` is a cleaned-up ReClass.NET MCP stack with:

- a FastMCP TypeScript server for Codex/Claude/Desktop MCP clients
- a rebuilt ReClass.NET bridge plugin for `ReClass.NET 1.2.x`
- hot-swappable runtime loading from a tiny bootstrap plugin
- live process attach/list/detach support
- stable loopback TCP bridge defaults on `127.0.0.1:27016`

## What Changed

The old one-piece plugin/server setup had three practical problems:

1. it assumed a newer ReClass API surface than `ReClass.NET 1.2.0`
2. it hardcoded `27015`, which often collides on Windows systems
3. changing bridge code required replacing the loaded plugin DLL

This repo fixes those by:

- pinning the bridge to `ReClass.NET 1.2.x` behavior
- using a configurable bridge port with a sane default of `27016`
- splitting the plugin into:
  - `ReClassMcpBootstrap.dll`: the actual ReClass.NET plugin entrypoint
  - `ReClassMcp.Runtime`: shadow-loaded and restartable while ReClass stays open
- matching ReClass.NET's legacy `...Ext` plugin naming convention so the bootstrap is actually discovered by `1.2.0`

## Layout

- `server/`
  FastMCP server and CLI
- `plugin/ReClassMcp.Contracts`
  Shared contracts between bootstrap and runtime
- `plugin/ReClassMcp.Bootstrap`
  ReClass.NET plugin entrypoint and hot-swap loader
- `plugin/ReClassMcp.Runtime`
  TCP bridge and ReClass command dispatcher
- `scripts/build-plugin.ps1`
  Builds plugin projects against an installed ReClass.NET copy

## Install

### 1. Build the server

```powershell
npm install
npm run build
```

### 2. Build the plugin

By default the build script targets `C:\Users\tonyi\Downloads\ReClass.NET`.

```powershell
npm run plugin:build:x64
```

The installer also disables the legacy `ReClassMCP.dll` plugin artifacts in the target `Plugins` folder so the old bridge does not double-load beside the new bootstrap after a ReClass restart.

Or override the install root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-plugin.ps1 -Configuration Release -Platform x64 -ReClassInstallRoot "D:\Tools\ReClass.NET"
```

### 3. Start the MCP server

```powershell
npx tsx .\server\src\cli.ts stdio
```

After `npm run build`, the committed CLI entry is:

```powershell
node .\dist\cli.js stdio
```

## Codex MCP Add

Local example:

```powershell
codex mcp add reclass -- node C:\Users\tonyi\OneDrive\Documents\GitHub\re-class-mcp\dist\cli.js stdio --host 127.0.0.1 --port 27016
```

Public-repo-ready pattern once the repo is published:

```powershell
codex mcp add reclass -- npx -y github:YOUR_GITHUB_USER/re-class-mcp stdio --host 127.0.0.1 --port 27016
```

If you later publish to npm, the command becomes:

```powershell
codex mcp add reclass -- npx -y re-class-mcp stdio --host 127.0.0.1 --port 27016
```

## Plugin Runtime Config

The plugin writes `Plugins\ReClassMcp.runtime.json` on first start:

```json
{
  "bindAddress": "127.0.0.1",
  "port": 27016,
  "autoStartBridge": true,
  "writeEnabled": true
}
```

Editing this file reloads the bridge listener without restarting ReClass.NET.

## Hot Reload Model

The runtime DLL is byte-loaded by the bootstrap plugin instead of being held open as the active plugin assembly.

That means:

- config changes reload immediately
- runtime DLL changes can be picked up without replacing the bootstrap plugin DLL
- old runtime assemblies remain loaded for the current ReClass session, so repeated development reloads trade memory for convenience

That tradeoff is deliberate. It keeps the development loop fast without pretending the .NET Framework plugin host can truly unload a loaded assembly from the default AppDomain.

## Exposed MCP Surface

Core tools:

- `is_connected`
- `get_status`
- `get_runtime_status`
- `get_process_info`
- `list_processes`
- `attach_process`
- `detach_process`
- `read_memory`
- `write_memory`
- `get_modules`
- `get_sections`
- `parse_address`
- `get_classes`
- `get_class`
- `get_nodes`
- `create_class`
- `delete_class`
- `rename_class`
- `set_class_address`
- `set_class_comment`
- `add_node`
- `rename_node`
- `set_comment`
- `change_node_type`
- `list_node_types`
- `restart_bridge`

## Status

This repo was seeded from a live-tested recovery on:

- `ReClass.NET 1.2.0.0`
- `Minecraft.Windows.exe 1.21.130`

The `ClientInstance` reverse-engineering notes for that build can be carried into `docs/` as the next pass.
