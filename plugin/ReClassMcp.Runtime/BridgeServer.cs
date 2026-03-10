using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace ReClassMcp.Runtime
{
    internal sealed class BridgeServer
    {
        private readonly string bindAddress;
        private readonly int port;
        private readonly CommandDispatcher dispatcher;

        private TcpListener listener;
        private volatile bool isRunning;

        public BridgeServer(string bindAddress, int port, CommandDispatcher dispatcher)
        {
            this.bindAddress = bindAddress;
            this.port = port;
            this.dispatcher = dispatcher ?? throw new ArgumentNullException(nameof(dispatcher));
        }

        public void Start()
        {
            listener = new TcpListener(ResolveBindAddress(), port);
            listener.Start();
            isRunning = true;

            while (isRunning)
            {
                try
                {
                    var client = listener.AcceptTcpClient();
                    var clientThread = new Thread(() => HandleClient(client))
                    {
                        IsBackground = true,
                        Name = "ReClassMcp Runtime Client",
                    };
                    clientThread.Start();
                }
                catch (SocketException) when (!isRunning)
                {
                    break;
                }
                catch (ObjectDisposedException) when (!isRunning)
                {
                    break;
                }
            }
        }

        public void Stop()
        {
            isRunning = false;
            listener?.Stop();
        }

        private IPAddress ResolveBindAddress()
        {
            if (string.IsNullOrWhiteSpace(bindAddress) ||
                string.Equals(bindAddress, "localhost", StringComparison.OrdinalIgnoreCase))
            {
                return IPAddress.Loopback;
            }

            return IPAddress.TryParse(bindAddress, out var address) ? address : IPAddress.Loopback;
        }

        private void HandleClient(TcpClient client)
        {
            var utf8NoBom = new UTF8Encoding(false);

            using (client)
            using (var stream = client.GetStream())
            using (var reader = new StreamReader(stream, utf8NoBom))
            using (var writer = new StreamWriter(stream, utf8NoBom) { AutoFlush = true })
            {
                client.ReceiveTimeout = 30000;
                client.SendTimeout = 30000;

                while (isRunning && client.Connected)
                {
                    try
                    {
                        var line = reader.ReadLine();
                        if (line == null)
                        {
                            break;
                        }

                        if (string.IsNullOrWhiteSpace(line))
                        {
                            continue;
                        }

                        writer.WriteLine(ProcessRequest(line));
                    }
                    catch (IOException)
                    {
                        break;
                    }
                    catch (Exception ex)
                    {
                        writer.WriteLine(new JObject
                        {
                            ["success"] = false,
                            ["error"] = ex.Message,
                        }.ToString(Formatting.None));
                    }
                }
            }
        }

        private string ProcessRequest(string requestJson)
        {
            try
            {
                var request = JObject.Parse(requestJson);
                var command = request["command"]?.ToString();
                var args = request["args"] as JObject ?? new JObject();
                if (string.IsNullOrWhiteSpace(command))
                {
                    return JsonConvert.SerializeObject(new
                    {
                        success = false,
                        error = "Missing 'command' field",
                    });
                }

                return dispatcher.Execute(command, args).ToString(Formatting.None);
            }
            catch (JsonException ex)
            {
                return JsonConvert.SerializeObject(new
                {
                    success = false,
                    error = $"Invalid JSON: {ex.Message}",
                });
            }
            catch (Exception ex)
            {
                return JsonConvert.SerializeObject(new
                {
                    success = false,
                    error = ex.Message,
                });
            }
        }
    }
}
