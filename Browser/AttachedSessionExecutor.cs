using System.Text.Json;
using OpenQA.Selenium;
using OpenQA.Selenium.Remote;

namespace SeleniumLocatorInspector.Browser;

/// <summary>Attaches using the existing handshake and blocks session deletion.</summary>
internal sealed class AttachedSessionExecutor : HttpCommandExecutor
{
    private readonly Response _handshake;
    private readonly string _sessionId;

    public AttachedSessionExecutor(Uri server, string sessionId, JsonElement capabilities)
        : base(server, TimeSpan.FromSeconds(10))
    {
        _sessionId = sessionId;
        _handshake = Response.FromJson(JsonSerializer.Serialize(new {
            value = new { sessionId, capabilities }
        }));
    }

    public override Response Execute(Command commandToExecute) =>
        ExecuteAsync(commandToExecute).GetAwaiter().GetResult();

    public override Task<Response> ExecuteAsync(Command commandToExecute)
    {
        if (commandToExecute.Name == DriverCommand.NewSession) return Task.FromResult(_handshake);
        if (commandToExecute.Name == DriverCommand.Quit)
            return Task.FromResult(Response.FromJson(JsonSerializer.Serialize(new { sessionId = _sessionId, value = (object?)null })));
        return base.ExecuteAsync(commandToExecute);
    }
}
