# re-class-mcp

`re-class-mcp` is a rebuilt ReClass.NET MCP stack for Windows reverse-engineering workflows.

It combines:

- a FastMCP TypeScript server
- a `ReClass.NET 1.2.x` bootstrap plugin that stays loadable by the legacy host
- a byte-loaded runtime assembly that can be replaced without swapping the bootstrap DLL
- Codex install helpers that replace the old Python MCP entry cleanly
- optional ReClass auto-launch so the MCP server can bring the bridge online by itself

## What It Solves

The older ReClass MCP flow was fragile in four ways:

1. it assumed a different ReClass plugin surface than `1.2.0`
2. it collided with common `127.0.0.1:27015` usage on Windows
3. it required manual MCP config surgery to replace the server
4. it forced too much low-level bridge work for common tasks like pointer chasing or bulk class creation

This repo fixes that with:

- default bridge binding on `127.0.0.1:27016`
- a bootstrap/runtime split that survives runtime DLL replacement
- `install-codex` support for replacing `[mcp_servers.reclass]`
- launch/doctor commands for local validation
- higher-level MCP tools such as `ensure_reclass_ready`, `follow_pointer_chain`, `create_class_with_nodes`, and `describe_class_layout`

## Repo Layout

- `server/`
  FastMCP server, CLI, launch automation, and Codex config installer
- `plugin/ReClassMcp.Contracts`
  shared contracts between bootstrap and runtime
- `plugin/ReClassMcp.Bootstrap`
  the actual ReClass.NET plugin entrypoint
- `plugin/ReClassMcp.Runtime`
  hot-swappable runtime bridge and dispatcher
- `scripts/build-plugin.ps1`
  build, deploy, seed runtime config, and optionally start ReClass.NET
- `docs/`
  setup notes and live reverse-engineering dumps

## Quick Start

### 1. Build the MCP server

```powershell
npm install
npm run build
```

### 2. Build and deploy the plugin

Default install root is `C:\Users\tonyi\Downloads\ReClass.NET`.

```powershell
npm run plugin:install:x64
```

That deploy does four things:

- builds the contracts, runtime, and bootstrap DLLs
- copies them into `ReClass.NET\x64\Plugins`
- writes `ReClassMcp.runtime.json`
- starts `ReClass.NET.exe` so the bridge comes up immediately

For a build-only deploy:

```powershell
npm run plugin:build:x64
```

For both architectures:

```powershell
npm run plugin:build:all
```

### 3. Replace the old Codex MCP entry

Local repo install:

```powershell
npm run codex:install:local
```

GitHub-backed install:

```powershell
npm run codex:install:github
```

Manual command form:

```powershell
node .\dist\cli.js install-codex --mode local --auto-launch --platform x64
```

That rewrites the `[mcp_servers.reclass]` block in `~/.codex/config.toml` and replaces the legacy Python server entry.

### 4. Restart Codex

Codex needs a fresh session to pick up a changed MCP config. This repo updates the config for you, but the running Codex process still has to be restarted outside the current MCP session.

## CLI Commands

Serve over stdio:

```powershell
node .\dist\cli.js stdio --auto-launch --platform x64
```

Serve over HTTP stream:

```powershell
node .\dist\cli.js http --http-port 38116 --auto-launch
```

Check install and bridge state:

```powershell
node .\dist\cli.js doctor --platform x64
```

Launch ReClass and wait for the bridge:

```powershell
node .\dist\cli.js launch-reclass --platform x64
```

Replace Codex config entry:

```powershell
node .\dist\cli.js install-codex --mode github --github-repo tonytranrp/re-class-mcp --auto-launch
```

## Plugin Deploy Flags

`build-plugin.ps1` now supports:

- `-StartReClass`
- `-RestartReClass`
- `-BindAddress`
- `-BridgePort`
- `-AutoStartBridge`
- `-WriteEnabled`
- `-WaitForBridgeMs`

Example:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-plugin.ps1 `
  -Platform x64 `
  -StartReClass:$true `
  -RestartReClass:$true `
  -BridgePort 27016 `
  -WaitForBridgeMs 20000
```

## MCP Tools

Low-level bridge tools:

- `read_memory`
- `write_memory`
- `attach_process`
- `get_modules`
- `get_sections`
- `get_classes`
- `get_class`
- `add_node`
- `change_node_type`

Higher-level workflow tools:

- `doctor_reclass`
- `ensure_reclass_ready`
- `launch_reclass`
- `read_pointer_value`
- `follow_pointer_chain`
- `read_c_string`
- `find_classes`
- `describe_class_layout`
- `create_class_with_nodes`
- `append_nodes`

## Hot Reload Model

The bootstrap plugin is the only assembly ReClass.NET loads as a plugin entrypoint. The runtime DLL is read into memory as bytes and instantiated from there.

That means:

- runtime config edits hot-reload
- runtime DLL replacements hot-reload
- bootstrap DLL changes still require a ReClass restart
- already-loaded runtime assemblies are not unloaded from the default AppDomain

So this is a practical hot-reload development loop, not true full unload/reload of every managed assembly.

## Additional Docs

- [Codex setup](./docs/CODEX_SETUP.md)
- [Plugin deploy workflow](./docs/PLUGIN_DEPLOY.md)
- [Minecraft 1.21.130 ClientInstance dump](./docs/MINECRAFT_1_21_130_CLIENTINSTANCE_DUMP.hpp)
