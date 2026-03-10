using ReClassNET.Plugins;

namespace ReClassMcp.Contracts
{
    public interface IRuntimeComponent
    {
        void Start(IPluginHost host, string pluginDirectory, string configPath);

        void Stop();

        string GetStatusJson();
    }
}
