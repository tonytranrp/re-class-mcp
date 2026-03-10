# Codex Setup

## Purpose

This repo is designed to replace the old Python-based ReClass MCP entry in `~/.codex/config.toml`.

The replacement command can be local, GitHub-backed, or npm-backed.

## Local Install

Build first:

```powershell
npm install
npm run build
```

Then replace the Codex MCP entry:

```powershell
node .\dist\cli.js install-codex --mode local --auto-launch --platform x64
```

That writes a block like this:

```toml
[mcp_servers.reclass]
command = 'C:\Program Files\nodejs\node.exe'
args = ['C:\path\to\re-class-mcp\dist\cli.js', 'stdio', '--host', '127.0.0.1', '--port', '27016', '--timeout', '10000', '--platform', 'x64', '--launch-timeout', '20000', '--launch-poll', '500', '--auto-launch']
startup_timeout_sec = 60.0
```

## GitHub Install

If the repo is on GitHub:

```powershell
node .\dist\cli.js install-codex --mode github --github-repo tonytranrp/re-class-mcp --auto-launch --platform x64
```

That produces an `npx -y github:...` based MCP entry.

## npm Install

If the package is published later:

```powershell
node .\dist\cli.js install-codex --mode npm --package-name re-class-mcp --auto-launch --platform x64
```

## Notes

- `install-codex` replaces the existing `[mcp_servers.reclass]` block instead of appending duplicates.
- If `config.toml` already exists, a `.bak` backup is written when the block changes.
- A running Codex session does not reload MCP config in place. Restart Codex after running `install-codex`.
