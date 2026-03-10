# Plugin And Scripting System

## Goal

The MCP now supports two extension paths without rebuilding the server:

- `script_eval` / `script_run_file` for quick one-off automation
- `plugin_run` for named hot-reloaded plugin actions under `plugins/`

Both paths execute in worker threads and expose the same helper API.

## Worker API

Scripts and plugins receive `api` with these core helpers:

- `api.bridge(command, args)`
- `api.listClasses()`
- `api.getClass(identifier)`
- `api.readPointerValue(address, pointerSize?)`
- `api.followPointerChain(baseAddress, offsets, pointerSize?, finalDereference?)`
- `api.readCString(address, maxLength, encoding?)`
- `api.findClasses(query)`
- `api.describeClassLayout(identifier)`
- `api.createClassWithNodes(name, nodes, address?, comment?)`
- `api.appendNodes(identifier, nodes)`
- `api.readMemoryMany(requests, concurrency?)`
- `api.readMemoryManyDecoded(requests, concurrency?)`
- `api.dumpStructure(identifier, options?)`
- `api.dumpStructures(options)`

## Example Plugin

`plugins/structure-tools.mjs` shows the format:

```js
export default {
  name: "structure-tools",
  actions: {
    dumpClass: {
      async run({ api, args }) {
        return await api.dumpStructure(args.identifier, {
          format: args.format ?? "json",
        });
      },
    },
  },
};
```

## Hot Reload

The plugin directory is watched. Editing or replacing a plugin file updates the next `plugin_run` or `list_plugins` result without restarting the MCP server.

## Suggested Workflow

1. Put reusable helpers in `plugins/*.mjs`.
2. Use `script_eval` while iterating on quick ideas.
3. Move stable logic into a named plugin action.
4. Run `npm run smoke` after larger changes.

## Notes

- The worker sandbox is practical, not hardened. Treat plugin and script code as trusted local code.
- Worker threads are used for script/plugin execution so heavier tasks do not block the MCP server loop.
- Parallel helpers such as `read_memory_many`, `follow_pointer_chains_parallel`, and `dump_structures` use bounded concurrency on top of the bridge's threaded request handling.
