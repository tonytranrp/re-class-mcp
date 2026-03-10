using System;
using System.IO;
using System.Threading;
using Newtonsoft.Json;
using ReClassNET.Logger;

namespace ReClassMcp.Runtime
{
    internal sealed class PluginConfig
    {
        public string BindAddress { get; set; } = "127.0.0.1";

        public int Port { get; set; } = 27016;

        public bool AutoStartBridge { get; set; } = true;

        public bool WriteEnabled { get; set; } = true;
    }

    internal sealed class PluginConfigManager : IDisposable
    {
        private readonly string configPath;
        private readonly ILogger logger;
        private readonly object sync = new object();

        private FileSystemWatcher watcher;
        private Timer reloadTimer;

        public PluginConfigManager(string configPath, ILogger logger)
        {
            this.configPath = configPath ?? throw new ArgumentNullException(nameof(configPath));
            this.logger = logger;
        }

        public PluginConfig Current { get; private set; }

        public string ConfigPath => configPath;

        public event Action<PluginConfig> ConfigChanged;

        public PluginConfig LoadOrCreate()
        {
            lock (sync)
            {
                Current = LoadInternal();
                return Current;
            }
        }

        public void StartWatching()
        {
            if (watcher != null)
            {
                return;
            }

            var directory = Path.GetDirectoryName(configPath);
            var fileName = Path.GetFileName(configPath);
            if (string.IsNullOrWhiteSpace(directory) || string.IsNullOrWhiteSpace(fileName))
            {
                return;
            }

            reloadTimer = new Timer(_ => ReloadFromDisk(), null, Timeout.Infinite, Timeout.Infinite);
            watcher = new FileSystemWatcher(directory, fileName)
            {
                NotifyFilter = NotifyFilters.CreationTime | NotifyFilters.FileName | NotifyFilters.LastWrite | NotifyFilters.Size,
            };
            watcher.Changed += OnConfigFileChanged;
            watcher.Created += OnConfigFileChanged;
            watcher.Renamed += OnConfigFileChanged;
            watcher.EnableRaisingEvents = true;
        }

        public void Dispose()
        {
            if (watcher != null)
            {
                watcher.EnableRaisingEvents = false;
                watcher.Changed -= OnConfigFileChanged;
                watcher.Created -= OnConfigFileChanged;
                watcher.Renamed -= OnConfigFileChanged;
                watcher.Dispose();
                watcher = null;
            }

            reloadTimer?.Dispose();
            reloadTimer = null;
        }

        private void OnConfigFileChanged(object sender, FileSystemEventArgs e)
        {
            reloadTimer?.Change(250, Timeout.Infinite);
        }

        private void ReloadFromDisk()
        {
            PluginConfig nextConfig;
            lock (sync)
            {
                try
                {
                    nextConfig = LoadInternal();
                }
                catch (Exception ex)
                {
                    logger?.Log(LogLevel.Warning, $"[ReClassMcp.Runtime] Failed to reload config '{configPath}': {ex.Message}");
                    return;
                }

                Current = nextConfig;
            }

            ConfigChanged?.Invoke(nextConfig);
        }

        private PluginConfig LoadInternal()
        {
            if (!File.Exists(configPath))
            {
                var initialConfig = CreateDefaultConfig();
                WriteConfig(initialConfig);
                return initialConfig;
            }

            var json = File.ReadAllText(configPath);
            var configFromDisk = JsonConvert.DeserializeObject<PluginConfig>(json) ?? CreateDefaultConfig();
            return Normalize(configFromDisk);
        }

        private PluginConfig CreateDefaultConfig()
        {
            var config = new PluginConfig();

            var bindAddress = Environment.GetEnvironmentVariable("RECLASS_MCP_BIND");
            if (!string.IsNullOrWhiteSpace(bindAddress))
            {
                config.BindAddress = bindAddress;
            }

            var portValue = Environment.GetEnvironmentVariable("RECLASS_MCP_PORT");
            if (int.TryParse(portValue, out var port))
            {
                config.Port = port;
            }

            var writeEnabled = Environment.GetEnvironmentVariable("RECLASS_MCP_WRITE_ENABLED");
            if (bool.TryParse(writeEnabled, out var allowWrites))
            {
                config.WriteEnabled = allowWrites;
            }

            return Normalize(config);
        }

        private PluginConfig Normalize(PluginConfig config)
        {
            if (config == null)
            {
                config = new PluginConfig();
            }

            if (string.IsNullOrWhiteSpace(config.BindAddress))
            {
                config.BindAddress = "127.0.0.1";
            }

            if (config.Port <= 0 || config.Port > 65535)
            {
                config.Port = 27016;
            }

            return config;
        }

        private void WriteConfig(PluginConfig config)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(configPath) ?? ".");
            File.WriteAllText(configPath, JsonConvert.SerializeObject(config, Formatting.Indented));
        }
    }
}
