using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading;
using ReClassMcp.Contracts;
using ReClassNET.Logger;
using ReClassNET.Plugins;

namespace ReClassMcpBootstrap
{
    internal sealed class HotReloadRuntimeHost : IDisposable
    {
        private const string RuntimeAssemblyFileName = "ReClassMcp.Runtime.dll";
        private const string RuntimePdbFileName = "ReClassMcp.Runtime.pdb";
        private const string RuntimeConfigFileName = "ReClassMcp.runtime.json";

        private readonly IPluginHost host;
        private readonly string pluginDirectory;
        private readonly string runtimeAssemblyPath;
        private readonly string runtimeConfigPath;
        private readonly object sync = new object();

        private FileSystemWatcher watcher;
        private Timer reloadTimer;
        private IRuntimeComponent runtime;
        private ResolveEventHandler resolveHandler;
        private bool disposed;

        public HotReloadRuntimeHost(IPluginHost host, string pluginDirectory)
        {
            this.host = host ?? throw new ArgumentNullException(nameof(host));
            this.pluginDirectory = pluginDirectory ?? throw new ArgumentNullException(nameof(pluginDirectory));
            runtimeAssemblyPath = Path.Combine(pluginDirectory, RuntimeAssemblyFileName);
            runtimeConfigPath = Path.Combine(pluginDirectory, RuntimeConfigFileName);
        }

        public void Start()
        {
            lock (sync)
            {
                ThrowIfDisposed();

                resolveHandler = ResolveAssembly;
                AppDomain.CurrentDomain.AssemblyResolve += resolveHandler;

                LoadRuntimeLocked(false);
                StartWatcherLocked();
            }
        }

        public void Dispose()
        {
            lock (sync)
            {
                if (disposed)
                {
                    return;
                }

                disposed = true;

                if (watcher != null)
                {
                    watcher.EnableRaisingEvents = false;
                    watcher.Changed -= OnRuntimeArtifactChanged;
                    watcher.Created -= OnRuntimeArtifactChanged;
                    watcher.Renamed -= OnRuntimeArtifactChanged;
                    watcher.Dispose();
                    watcher = null;
                }

                reloadTimer?.Dispose();
                reloadTimer = null;

                StopRuntimeLocked();

                if (resolveHandler != null)
                {
                    AppDomain.CurrentDomain.AssemblyResolve -= resolveHandler;
                    resolveHandler = null;
                }
            }
        }

        private void StartWatcherLocked()
        {
            if (watcher != null)
            {
                return;
            }

            reloadTimer = new Timer(_ => ReloadRuntimeFromTimer(), null, Timeout.Infinite, Timeout.Infinite);
            watcher = new FileSystemWatcher(pluginDirectory)
            {
                NotifyFilter = NotifyFilters.CreationTime | NotifyFilters.FileName | NotifyFilters.LastWrite | NotifyFilters.Size,
                IncludeSubdirectories = false,
                Filter = "ReClassMcp.Runtime.*",
            };
            watcher.Changed += OnRuntimeArtifactChanged;
            watcher.Created += OnRuntimeArtifactChanged;
            watcher.Renamed += OnRuntimeArtifactChanged;
            watcher.EnableRaisingEvents = true;
        }

        private void OnRuntimeArtifactChanged(object sender, FileSystemEventArgs e)
        {
            if (!IsRuntimeArtifact(e.FullPath))
            {
                return;
            }

            reloadTimer?.Change(400, Timeout.Infinite);
        }

        private void ReloadRuntimeFromTimer()
        {
            lock (sync)
            {
                if (disposed)
                {
                    return;
                }

                try
                {
                    LoadRuntimeLocked(true);
                }
                catch (Exception ex)
                {
                    host.Logger.Log(LogLevel.Warning, $"[ReClassMcp.Bootstrap] Runtime reload failed: {ex.Message}");
                }
            }
        }

        private bool IsRuntimeArtifact(string path)
        {
            var fileName = Path.GetFileName(path);
            return string.Equals(fileName, RuntimeAssemblyFileName, StringComparison.OrdinalIgnoreCase) ||
                   string.Equals(fileName, RuntimePdbFileName, StringComparison.OrdinalIgnoreCase);
        }

        private void LoadRuntimeLocked(bool isReload)
        {
            StopRuntimeLocked();

            if (!File.Exists(runtimeAssemblyPath))
            {
                throw new FileNotFoundException($"Runtime assembly not found: {runtimeAssemblyPath}");
            }

            var assembly = LoadRuntimeAssembly(runtimeAssemblyPath);
            var runtimeType = assembly
                .GetTypes()
                .FirstOrDefault(type => !type.IsAbstract && typeof(IRuntimeComponent).IsAssignableFrom(type));

            if (runtimeType == null)
            {
                throw new InvalidOperationException("No runtime component implementing IRuntimeComponent was found.");
            }

            runtime = (IRuntimeComponent)Activator.CreateInstance(runtimeType);
            runtime.Start(host, pluginDirectory, runtimeConfigPath);

            var statusJson = runtime.GetStatusJson();
            host.Logger.Log(
                LogLevel.Information,
                isReload
                    ? $"[ReClassMcp.Bootstrap] Runtime reloaded. {statusJson}"
                    : $"[ReClassMcp.Bootstrap] Runtime loaded. {statusJson}");
        }

        private void StopRuntimeLocked()
        {
            if (runtime == null)
            {
                return;
            }

            try
            {
                runtime.Stop();
            }
            catch (Exception ex)
            {
                host.Logger.Log(LogLevel.Warning, $"[ReClassMcp.Bootstrap] Runtime stop failed: {ex.Message}");
            }
            finally
            {
                runtime = null;
            }
        }

        private Assembly LoadRuntimeAssembly(string assemblyPath)
        {
            var assemblyBytes = ReadAllBytesWithRetry(assemblyPath);
            var pdbPath = Path.Combine(Path.GetDirectoryName(assemblyPath) ?? pluginDirectory, RuntimePdbFileName);
            if (File.Exists(pdbPath))
            {
                var pdbBytes = ReadAllBytesWithRetry(pdbPath);
                return Assembly.Load(assemblyBytes, pdbBytes);
            }

            return Assembly.Load(assemblyBytes);
        }

        private static byte[] ReadAllBytesWithRetry(string path)
        {
            Exception lastError = null;
            for (var attempt = 0; attempt < 8; attempt++)
            {
                try
                {
                    return File.ReadAllBytes(path);
                }
                catch (IOException ex)
                {
                    lastError = ex;
                    Thread.Sleep(125);
                }
            }

            throw new IOException($"Unable to read '{path}'.", lastError);
        }

        private Assembly ResolveAssembly(object sender, ResolveEventArgs args)
        {
            var requestedName = new AssemblyName(args.Name).Name;
            if (string.IsNullOrWhiteSpace(requestedName))
            {
                return null;
            }

            var loadedAssembly = AppDomain.CurrentDomain
                .GetAssemblies()
                .FirstOrDefault(assembly => string.Equals(assembly.GetName().Name, requestedName, StringComparison.OrdinalIgnoreCase));

            if (loadedAssembly != null)
            {
                return loadedAssembly;
            }

            var candidatePath = Path.Combine(pluginDirectory, requestedName + ".dll");
            if (!File.Exists(candidatePath))
            {
                return null;
            }

            try
            {
                return Assembly.LoadFrom(candidatePath);
            }
            catch
            {
                return null;
            }
        }

        private void ThrowIfDisposed()
        {
            if (disposed)
            {
                throw new ObjectDisposedException(nameof(HotReloadRuntimeHost));
            }
        }
    }
}
