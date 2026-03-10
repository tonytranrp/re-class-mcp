# Plugin Deploy Workflow

## Standard Deploy

Build and copy the plugin stack:

```powershell
npm run plugin:build:x64
```

Build, copy, write runtime config, and launch ReClass:

```powershell
npm run plugin:install:x64
```

## Script Flags

`scripts/build-plugin.ps1` accepts:

- `-Configuration`
- `-Platform`
- `-ReClassInstallRoot`
- `-DisableLegacyPlugin`
- `-StartReClass`
- `-RestartReClass`
- `-BindAddress`
- `-BridgePort`
- `-AutoStartBridge`
- `-WriteEnabled`
- `-WaitForBridgeMs`

## Runtime Config

The deploy script writes `Plugins\ReClassMcp.runtime.json`:

```json
{
  "bindAddress": "127.0.0.1",
  "port": 27016,
  "autoStartBridge": true,
  "writeEnabled": true
}
```

The runtime watches this file and reloads the bridge listener when it changes.

## Restart Behavior

- `-StartReClass:$true` launches ReClass after deploy.
- `-RestartReClass:$true` stops matching `ReClass.NET.exe` instances for the selected install root, then launches a fresh copy.
- If `-AutoStartBridge:$true`, the script waits for the TCP bridge and reports whether it came online.

## Hot Reload Boundary

You can replace `ReClassMcp.Runtime.dll` while ReClass stays open. You cannot replace the bootstrap plugin without restarting ReClass.NET because that assembly is the host plugin entrypoint.
