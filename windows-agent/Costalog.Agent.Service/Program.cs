using Costalog.Agent.Service;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddWindowsService(options =>
{
    options.ServiceName = "AGENTE COSTALOG";
});
builder.Services.AddSingleton(new HttpClient { Timeout = TimeSpan.FromSeconds(20) });
builder.Services.AddSingleton<AgentWorker>();
builder.Services.AddHostedService(provider => provider.GetRequiredService<AgentWorker>());
await builder.Build().RunAsync();
