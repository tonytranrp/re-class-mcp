using System;
using System.Drawing;
using System.IO;
using ReClassNET.Plugins;

namespace ReClassMcpBootstrap
{
    public sealed class ReClassMcpBootstrapExt : Plugin
    {
        private HotReloadRuntimeHost runtimeHost;

        public override Image Icon => null;

        public override bool Initialize(IPluginHost host)
        {
            if (host == null)
            {
                throw new ArgumentNullException(nameof(host));
            }

            try
            {
                var pluginDirectory = Path.GetDirectoryName(GetType().Assembly.Location) ?? AppDomain.CurrentDomain.BaseDirectory;
                runtimeHost = new HotReloadRuntimeHost(host, pluginDirectory);
                runtimeHost.Start();
                return true;
            }
            catch (Exception ex)
            {
                host.Logger.Log(ex);
                runtimeHost?.Dispose();
                runtimeHost = null;
                return false;
            }
        }

        public override void Terminate()
        {
            runtimeHost?.Dispose();
            runtimeHost = null;
        }
    }
}
