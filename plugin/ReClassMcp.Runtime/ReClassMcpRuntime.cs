using System;
using System.Reflection;
using System.Threading;
using Newtonsoft.Json.Linq;
using ReClassMcp.Contracts;
using ReClassNET.Logger;
using ReClassNET.Plugins;

namespace ReClassMcp.Runtime
{
    public sealed class ReClassMcpRuntime : IRuntimeComponent
    {
        private readonly object sync = new object();

        private IPluginHost host;
        private string pluginDirectory;
        private PluginConfigManager configManager;
        private BridgeServer bridgeServer;
        private Thread bridgeThread;
        private DateTime startedUtc;

        internal PluginConfig CurrentConfig => configManager?.Current ?? new PluginConfig();

        internal bool IsBridgeRunning => bridgeThread != null && bridgeThread.IsAlive && bridgeServer != null;

        public void Start(IPluginHost host, string pluginDirectory, string configPath)
        {
            this.host = host ?? throw new ArgumentNullException(nameof(host));
            this.pluginDirectory = pluginDirectory ?? throw new ArgumentNullException(nameof(pluginDirectory));

            startedUtc = DateTime.UtcNow;

            configManager = new PluginConfigManager(configPath, host.Logger);
            configManager.ConfigChanged += OnConfigChanged;

            var config = configManager.LoadOrCreate();
            RestartBridge(config, false);
            configManager.StartWatching();
        }

        public void Stop()
        {
            lock (sync)
            {
                if (configManager != null)
                {
                    configManager.ConfigChanged -= OnConfigChanged;
                    configManager.Dispose();
                    configManager = null;
                }

                StopBridgeLocked();
            }
        }

        public string GetStatusJson()
        {
            return BuildStatus().ToString(Newtonsoft.Json.Formatting.None);
        }

        internal JObject RestartBridgeFromCommand()
        {
            RestartBridge(CurrentConfig, true);
            return BuildStatus();
        }

        internal JObject BuildStatus()
        {
            var process = host?.Process;
            var underlying = process?.UnderlayingProcess;
            var version = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.0.0.0";

            return new JObject
            {
                ["success"] = true,
                ["runtime_version"] = version,
                ["plugin_directory"] = pluginDirectory ?? string.Empty,
                ["config_path"] = configManager?.ConfigPath ?? string.Empty,
                ["started_utc"] = startedUtc.ToString("o"),
                ["bridge_running"] = IsBridgeRunning,
                ["bind_address"] = CurrentConfig.BindAddress,
                ["port"] = CurrentConfig.Port,
                ["auto_start_bridge"] = CurrentConfig.AutoStartBridge,
                ["write_enabled"] = CurrentConfig.WriteEnabled,
                ["attached"] = process?.IsValid ?? false,
                ["process_name"] = underlying?.Name ?? string.Empty,
                ["process_id"] = underlying != null ? underlying.Id.ToInt64() : 0,
            };
        }

        private void OnConfigChanged(PluginConfig config)
        {
            try
            {
                RestartBridge(config, true);
            }
            catch (Exception ex)
            {
                host?.Logger.Log(LogLevel.Warning, $"[ReClassMcp.Runtime] Config reload failed: {ex.Message}");
            }
        }

        private void RestartBridge(PluginConfig config, bool isReload)
        {
            lock (sync)
            {
                StopBridgeLocked();

                if (config == null || !config.AutoStartBridge)
                {
                    host?.Logger.Log(LogLevel.Information, "[ReClassMcp.Runtime] Bridge disabled by config.");
                    return;
                }

                var dispatcher = new CommandDispatcher(host, this);
                bridgeServer = new BridgeServer(config.BindAddress, config.Port, dispatcher);
                bridgeThread = new Thread(() => bridgeServer.Start())
                {
                    IsBackground = true,
                    Name = "ReClassMcp Runtime Bridge",
                };
                bridgeThread.Start();

                host?.Logger.Log(
                    LogLevel.Information,
                    isReload
                        ? $"[ReClassMcp.Runtime] Bridge reloaded on {config.BindAddress}:{config.Port}."
                        : $"[ReClassMcp.Runtime] Bridge started on {config.BindAddress}:{config.Port}.");
            }
        }

        private void StopBridgeLocked()
        {
            bridgeServer?.Stop();

            if (bridgeThread != null && bridgeThread.IsAlive)
            {
                bridgeThread.Join(1500);
            }

            bridgeThread = null;
            bridgeServer = null;
        }
    }
}
