using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Newtonsoft.Json.Linq;
using ReClassNET;
using ReClassNET.Memory;
using ReClassNET.Nodes;
using ReClassNET.Plugins;
using ReClassNET.Project;

namespace ReClassMcp.Runtime
{
    internal sealed class CommandDispatcher
    {
        private readonly IPluginHost host;
        private readonly ReClassMcpRuntime runtime;

        public CommandDispatcher(IPluginHost host, ReClassMcpRuntime runtime)
        {
            this.host = host ?? throw new ArgumentNullException(nameof(host));
            this.runtime = runtime ?? throw new ArgumentNullException(nameof(runtime));
        }

        public JObject Execute(string command, JObject args)
        {
            try
            {
                switch ((command ?? string.Empty).Trim().ToLowerInvariant())
                {
                    case "ping":
                        return Success(new JObject { ["message"] = "pong" });
                    case "get_status":
                        return runtime.BuildStatus();
                    case "get_runtime_status":
                        return runtime.BuildStatus();
                    case "restart_bridge":
                        return runtime.RestartBridgeFromCommand();
                    case "get_process_info":
                        return GetProcessInfo();
                    case "list_processes":
                        return ListProcesses();
                    case "attach_process":
                        return AttachProcess(args);
                    case "detach_process":
                        return DetachProcess();
                    case "read_memory":
                        return ReadMemory(args);
                    case "write_memory":
                        return WriteMemory(args);
                    case "get_modules":
                        return GetModules();
                    case "get_sections":
                        return GetSections();
                    case "parse_address":
                        return ParseAddress(args);
                    case "get_classes":
                        return GetClasses();
                    case "get_class":
                        return GetClass(args);
                    case "get_nodes":
                        return GetNodes(args);
                    case "create_class":
                        return CreateClass(args);
                    case "delete_class":
                        return DeleteClass(args);
                    case "rename_class":
                        return RenameClass(args);
                    case "set_class_address":
                        return SetClassAddress(args);
                    case "set_class_comment":
                        return SetClassComment(args);
                    case "add_node":
                        return AddNode(args);
                    case "rename_node":
                        return RenameNode(args);
                    case "set_comment":
                        return SetNodeComment(args);
                    case "change_node_type":
                        return ChangeNodeType(args);
                    case "list_node_types":
                        return ListNodeTypes();
                    default:
                        return Error($"Unknown command: {command}");
                }
            }
            catch (Exception ex)
            {
                return Error(ex.Message);
            }
        }

        private JObject GetProcessInfo()
        {
            if (!host.Process.IsValid)
            {
                return Error("No process attached.");
            }

            var process = host.Process.UnderlayingProcess;
            return Success(new JObject
            {
                ["id"] = process.Id.ToInt64(),
                ["name"] = process.Name,
                ["path"] = process.Path ?? string.Empty,
                ["is_valid"] = host.Process.IsValid,
            });
        }

        private JObject ListProcesses()
        {
            var processes = new JArray(
                Program.CoreFunctions
                    .EnumerateProcesses()
                    .OrderBy(process => process.Name, StringComparer.OrdinalIgnoreCase)
                    .Select(process => new JObject
                    {
                        ["id"] = process.Id.ToInt64(),
                        ["name"] = process.Name,
                        ["path"] = process.Path ?? string.Empty,
                    }));

            return Success(new JObject { ["processes"] = processes });
        }

        private JObject AttachProcess(JObject args)
        {
            var processId = args["process_id"]?.ToObject<long?>();
            var processName = args["process_name"]?.ToString();

            var target = Program.CoreFunctions
                .EnumerateProcesses()
                .FirstOrDefault(process =>
                    (processId.HasValue && process.Id.ToInt64() == processId.Value) ||
                    (!string.IsNullOrWhiteSpace(processName) &&
                     string.Equals(process.Name, processName, StringComparison.OrdinalIgnoreCase)));

            if (target == null)
            {
                return Error("Process not found. Provide process_id or process_name.");
            }

            InvokeOnMainThread(() => host.MainWindow.AttachToProcess(target));

            return Success(new JObject
            {
                ["id"] = target.Id.ToInt64(),
                ["name"] = target.Name,
                ["path"] = target.Path ?? string.Empty,
                ["is_valid"] = host.Process.IsValid,
            });
        }

        private JObject DetachProcess()
        {
            InvokeOnMainThread(() => Program.RemoteProcess.Close());
            return Success(new JObject { ["is_valid"] = host.Process.IsValid });
        }

        private JObject ReadMemory(JObject args)
        {
            if (!host.Process.IsValid)
            {
                return Error("No process attached.");
            }

            var addressText = RequireString(args, "address");
            var size = RequireInt(args, "size");
            if (size <= 0 || size > 0x10000)
            {
                return Error("Size must be between 1 and 65536 bytes.");
            }

            var address = ResolveAddress(addressText);
            var data = host.Process.ReadRemoteMemory(address, size);
            return Success(new JObject
            {
                ["address"] = FormatAddress(address),
                ["size"] = size,
                ["data"] = BitConverter.ToString(data).Replace("-", string.Empty),
            });
        }

        private JObject WriteMemory(JObject args)
        {
            if (!runtime.CurrentConfig.WriteEnabled)
            {
                return Error("Writes are disabled by runtime config.");
            }

            if (!host.Process.IsValid)
            {
                return Error("No process attached.");
            }

            var address = ResolveAddress(RequireString(args, "address"));
            var data = ParseHexBytes(RequireString(args, "data"));
            var success = host.Process.WriteRemoteMemory(address, data);

            return success
                ? Success(new JObject { ["address"] = FormatAddress(address), ["size"] = data.Length })
                : Error("Failed to write memory.");
        }

        private JObject GetModules()
        {
            if (!host.Process.IsValid)
            {
                return Error("No process attached.");
            }

            var modules = new JArray(
                host.Process.Modules.Select(module => new JObject
                {
                    ["name"] = module.Name,
                    ["path"] = module.Path ?? string.Empty,
                    ["start"] = FormatAddress(module.Start),
                    ["end"] = FormatAddress(module.End),
                    ["size"] = module.Size.ToInt64(),
                }));

            return Success(new JObject { ["modules"] = modules });
        }

        private JObject GetSections()
        {
            if (!host.Process.IsValid)
            {
                return Error("No process attached.");
            }

            var sections = new JArray(
                host.Process.Sections.Select(section => new JObject
                {
                    ["name"] = section.Name,
                    ["category"] = section.Category.ToString(),
                    ["protection"] = section.Protection.ToString(),
                    ["type"] = section.Type.ToString(),
                    ["module"] = section.ModuleName ?? string.Empty,
                    ["start"] = FormatAddress(section.Start),
                    ["end"] = FormatAddress(section.End),
                    ["size"] = section.Size.ToInt64(),
                }));

            return Success(new JObject { ["sections"] = sections });
        }

        private JObject ParseAddress(JObject args)
        {
            var address = ResolveAddress(RequireString(args, "formula"));
            return Success(new JObject
            {
                ["address"] = FormatAddress(address),
                ["decimal"] = address.ToInt64(),
            });
        }

        private JObject GetClasses()
        {
            var project = GetCurrentProject();
            if (project == null)
            {
                return Error("No project loaded.");
            }

            var classes = new JArray(project.Classes.Select(classNode => SerializeClass(classNode)));
            return Success(new JObject { ["classes"] = classes });
        }

        private JObject GetClass(JObject args)
        {
            var project = GetCurrentProject();
            if (project == null)
            {
                return Error("No project loaded.");
            }

            var identifier = RequireIdentifier(args);
            var classNode = FindClass(project, identifier);
            return classNode == null
                ? Error($"Class not found: {identifier}")
                : Success(new JObject { ["class"] = SerializeClass(classNode, true) });
        }

        private JObject GetNodes(JObject args)
        {
            var classNode = FindClassFromArgs(args);
            if (classNode == null)
            {
                return Error($"Class not found: {RequireClassReference(args)}");
            }

            return Success(new JObject { ["nodes"] = SerializeNodes(classNode.Nodes) });
        }

        private JObject CreateClass(JObject args)
        {
            var name = RequireString(args, "name");
            var address = args["address"]?.ToString();

            ClassNode classNode = null;
            InvokeOnMainThread(() =>
            {
                classNode = ClassNode.Create();
                classNode.Name = name;
                if (!string.IsNullOrWhiteSpace(address))
                {
                    classNode.AddressFormula = address;
                }

                host.MainWindow.Invalidate();
            });

            return classNode == null
                ? Error("Failed to create class.")
                : Success(new JObject { ["class"] = SerializeClass(classNode, true) });
        }

        private JObject DeleteClass(JObject args)
        {
            var project = GetCurrentProject();
            if (project == null)
            {
                return Error("No project loaded.");
            }

            var identifier = RequireIdentifier(args);
            var classNode = FindClass(project, identifier);
            if (classNode == null)
            {
                return Error($"Class not found: {identifier}");
            }

            try
            {
                InvokeOnMainThread(() =>
                {
                    project.Remove(classNode);
                    host.MainWindow.Invalidate();
                });
            }
            catch (ClassReferencedException ex)
            {
                return Error(
                    ex.Message,
                    new JObject
                    {
                        ["references"] = new JArray(ex.References.Select(reference => reference.Name)),
                    });
            }

            return Success(new JObject
            {
                ["id"] = GetClassIdentifier(classNode),
                ["name"] = classNode.Name,
            });
        }

        private JObject RenameClass(JObject args)
        {
            var classNode = RequireClassFromArgs(args);
            var newName = RequireString(args, "name");

            InvokeOnMainThread(() =>
            {
                classNode.Name = newName;
                host.MainWindow.Invalidate();
            });

            return Success(new JObject { ["class"] = SerializeClass(classNode, true) });
        }

        private JObject SetClassAddress(JObject args)
        {
            var classNode = RequireClassFromArgs(args);
            var address = RequireString(args, "address");

            InvokeOnMainThread(() =>
            {
                classNode.AddressFormula = address;
                host.MainWindow.Invalidate();
            });

            return Success(new JObject { ["class"] = SerializeClass(classNode, true) });
        }

        private JObject SetClassComment(JObject args)
        {
            var classNode = RequireClassFromArgs(args);
            var comment = args["comment"]?.ToString() ?? string.Empty;

            InvokeOnMainThread(() =>
            {
                classNode.Comment = comment;
                host.MainWindow.Invalidate();
            });

            return Success(new JObject { ["class"] = SerializeClass(classNode, true) });
        }

        private JObject AddNode(JObject args)
        {
            var classNode = RequireClassFromArgs(args);
            var nodeType = NodeTypeRegistry.Resolve(RequireString(args, "type"));
            if (nodeType == null)
            {
                return Error("Unknown node type.");
            }

            var nodeName = args["name"]?.ToString();
            BaseNode created = null;

            InvokeOnMainThread(() =>
            {
                created = BaseNode.CreateInstanceFromType(nodeType);
                if (!string.IsNullOrWhiteSpace(nodeName))
                {
                    created.Name = nodeName;
                }

                classNode.AddNode(created);
                host.MainWindow.Invalidate();
            });

            return created == null
                ? Error("Failed to add node.")
                : Success(new JObject { ["node"] = SerializeNode(created, classNode.FindNodeIndex(created)) });
        }

        private JObject RenameNode(JObject args)
        {
            var classNode = RequireClassFromArgs(args);
            var node = RequireNode(classNode, args);
            var name = RequireString(args, "name");

            InvokeOnMainThread(() =>
            {
                node.Name = name;
                host.MainWindow.Invalidate();
            });

            return Success(new JObject { ["node"] = SerializeNode(node, classNode.FindNodeIndex(node)) });
        }

        private JObject SetNodeComment(JObject args)
        {
            var classNode = RequireClassFromArgs(args);
            var node = RequireNode(classNode, args);
            var comment = args["comment"]?.ToString() ?? string.Empty;

            InvokeOnMainThread(() =>
            {
                node.Comment = comment;
                host.MainWindow.Invalidate();
            });

            return Success(new JObject { ["node"] = SerializeNode(node, classNode.FindNodeIndex(node)) });
        }

        private JObject ChangeNodeType(JObject args)
        {
            var classNode = RequireClassFromArgs(args);
            var node = RequireNode(classNode, args);
            var type = NodeTypeRegistry.Resolve(RequireString(args, "type"));
            if (type == null)
            {
                return Error("Unknown node type.");
            }

            BaseNode replacement = null;
            InvokeOnMainThread(() =>
            {
                replacement = BaseNode.CreateInstanceFromType(type);
                classNode.ReplaceChildNode(node, replacement);
                host.MainWindow.Invalidate();
            });

            return replacement == null
                ? Error("Failed to replace node.")
                : Success(new JObject { ["node"] = SerializeNode(replacement, classNode.FindNodeIndex(replacement)) });
        }

        private JObject ListNodeTypes()
        {
            var nodeTypes = new JArray(NodeTypeRegistry.List().Select(entry =>
            {
                var node = BaseNode.CreateInstanceFromType(entry.Type);
                return new JObject
                {
                    ["name"] = entry.Name,
                    ["display_name"] = entry.DisplayName,
                    ["clr_type"] = entry.Type.Name,
                    ["default_size"] = node?.MemorySize ?? 0,
                };
            }));

            return Success(new JObject { ["node_types"] = nodeTypes });
        }

        private JObject SerializeClass(ClassNode classNode, bool includeNodes = false)
        {
            var value = new JObject
            {
                ["id"] = GetClassIdentifier(classNode),
                ["uuid"] = classNode.Uuid?.ToString() ?? string.Empty,
                ["name"] = classNode.Name ?? string.Empty,
                ["address"] = classNode.AddressFormula ?? string.Empty,
                ["size"] = classNode.MemorySize,
                ["node_count"] = classNode.Nodes.Count,
                ["comment"] = classNode.Comment ?? string.Empty,
            };

            if (includeNodes)
            {
                value["nodes"] = SerializeNodes(classNode.Nodes);
            }

            return value;
        }

        private JArray SerializeNodes(IReadOnlyList<BaseNode> nodes)
        {
            var result = new JArray();
            for (var index = 0; index < nodes.Count; index++)
            {
                result.Add(SerializeNode(nodes[index], index));
            }

            return result;
        }

        private JObject SerializeNode(BaseNode node, int index)
        {
            var value = new JObject
            {
                ["index"] = index,
                ["type"] = node.GetType().Name,
                ["name"] = node.Name ?? string.Empty,
                ["offset"] = node.Offset,
                ["size"] = node.MemorySize,
                ["comment"] = node.Comment ?? string.Empty,
                ["is_hidden"] = node.IsHidden,
            };

            if (node is BaseContainerNode container)
            {
                value["child_count"] = container.Nodes.Count;
            }

            if (node is BaseWrapperNode wrapper)
            {
                value["inner_type"] = wrapper.InnerNode?.GetType().Name ?? string.Empty;
                if (wrapper.ResolveMostInnerNode() is ClassNode innerClass)
                {
                    value["referenced_class"] = GetClassIdentifier(innerClass);
                }
            }

            return value;
        }

        private ClassNode FindClassFromArgs(JObject args)
        {
            var project = GetCurrentProject();
            if (project == null)
            {
                return null;
            }

            var identifier = RequireClassReference(args);
            return FindClass(project, identifier);
        }

        private ClassNode RequireClassFromArgs(JObject args)
        {
            var classNode = FindClassFromArgs(args);
            if (classNode == null)
            {
                throw new InvalidOperationException($"Class not found: {RequireClassReference(args)}");
            }

            return classNode;
        }

        private BaseNode RequireNode(ClassNode classNode, JObject args)
        {
            var index = RequireInt(args, "node_index");
            if (index < 0 || index >= classNode.Nodes.Count)
            {
                throw new InvalidOperationException($"Invalid node index: {index}");
            }

            return classNode.Nodes[index];
        }

        private ClassNode FindClass(ReClassNetProject project, string identifier)
        {
            return project.Classes.FirstOrDefault(classNode => ClassMatchesIdentifier(classNode, identifier));
        }

        private bool ClassMatchesIdentifier(ClassNode classNode, string identifier)
        {
            if (classNode == null || string.IsNullOrWhiteSpace(identifier))
            {
                return false;
            }

            return string.Equals(classNode.Name, identifier, StringComparison.OrdinalIgnoreCase) ||
                   string.Equals(GetClassIdentifier(classNode), identifier, StringComparison.OrdinalIgnoreCase) ||
                   string.Equals(classNode.Uuid?.ToString(), identifier, StringComparison.OrdinalIgnoreCase);
        }

        private string GetClassIdentifier(ClassNode classNode)
        {
            return classNode?.Uuid?.ToHexString() ?? classNode?.Name ?? string.Empty;
        }

        private IntPtr ResolveAddress(string formula)
        {
            if (string.IsNullOrWhiteSpace(formula))
            {
                throw new InvalidOperationException("Address formula cannot be empty.");
            }

            if (host.Process.IsValid)
            {
                return host.Process.ParseAddress(formula);
            }

            return ParseLiteralAddress(formula);
        }

        private static IntPtr ParseLiteralAddress(string input)
        {
            var text = input.Trim();
            if (text.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
            {
                return (IntPtr)long.Parse(text.Substring(2), NumberStyles.HexNumber, CultureInfo.InvariantCulture);
            }

            return (IntPtr)long.Parse(text, CultureInfo.InvariantCulture);
        }

        private static byte[] ParseHexBytes(string text)
        {
            var normalized = new string(text.Where(character => !char.IsWhiteSpace(character)).ToArray());
            if (normalized.Length == 0 || normalized.Length % 2 != 0)
            {
                throw new InvalidOperationException("Hex data must contain an even number of digits.");
            }

            var data = new byte[normalized.Length / 2];
            for (var index = 0; index < data.Length; index++)
            {
                data[index] = byte.Parse(
                    normalized.Substring(index * 2, 2),
                    NumberStyles.HexNumber,
                    CultureInfo.InvariantCulture);
            }

            return data;
        }

        private static string RequireString(JObject args, string name)
        {
            var value = args[name]?.ToString();
            if (string.IsNullOrWhiteSpace(value))
            {
                throw new InvalidOperationException($"Missing '{name}' parameter.");
            }

            return value;
        }

        private static int RequireInt(JObject args, string name)
        {
            var token = args[name];
            if (token == null || !int.TryParse(token.ToString(), out var value))
            {
                throw new InvalidOperationException($"Missing or invalid '{name}' parameter.");
            }

            return value;
        }

        private static string RequireIdentifier(JObject args)
        {
            return RequireString(args, "id");
        }

        private static string RequireClassReference(JObject args)
        {
            var identifier = args["class_id"]?.ToString() ??
                             args["class_name"]?.ToString() ??
                             args["id"]?.ToString() ??
                             args["identifier"]?.ToString();

            if (string.IsNullOrWhiteSpace(identifier))
            {
                throw new InvalidOperationException("Missing class reference parameter.");
            }

            return identifier;
        }

        private JObject Success(JObject payload = null)
        {
            var result = new JObject { ["success"] = true };
            if (payload != null)
            {
                foreach (var property in payload.Properties())
                {
                    result[property.Name] = property.Value;
                }
            }

            return result;
        }

        private JObject Error(string message, JObject payload = null)
        {
            var result = new JObject
            {
                ["success"] = false,
                ["error"] = message,
            };

            if (payload != null)
            {
                foreach (var property in payload.Properties())
                {
                    result[property.Name] = property.Value;
                }
            }

            return result;
        }

        private void InvokeOnMainThread(Action action)
        {
            if (host.MainWindow.InvokeRequired)
            {
                host.MainWindow.Invoke(action);
            }
            else
            {
                action();
            }
        }

        private ReClassNetProject GetCurrentProject()
        {
            ReClassNetProject project = null;
            InvokeOnMainThread(() => project = host.MainWindow.CurrentProject);
            return project;
        }

        private static string FormatAddress(IntPtr address)
        {
            return $"0x{address.ToInt64():X}";
        }
    }
}
