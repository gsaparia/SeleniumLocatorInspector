using System.Text.Json;
using OpenQA.Selenium;

namespace SeleniumLocatorInspector.Network;

internal static class DevToolsEndpoint
{
    public static async Task<Uri> ResolveAsync(IWebDriver driver)
    {
        var caps = (driver as IHasCapabilities)?.Capabilities;
        var browser = caps?.GetCapability("browserName")?.ToString() ?? "";
        var address = "";
        foreach (var name in new[] { "goog:chromeOptions", "ms:edgeOptions" })
        {
            var value = caps?.GetCapability(name);
            if (value == null) continue;
            var options = JsonSerializer.SerializeToElement(value);
            if (options.ValueKind == JsonValueKind.Object && options.TryGetProperty("debuggerAddress", out var endpoint))
                address = endpoint.GetString() ?? "";
            if (address.Length > 0) break;
        }
        if (address.Length == 0)
            throw new InvalidOperationException(browser.Contains("firefox", StringComparison.OrdinalIgnoreCase)
                ? (!string.IsNullOrWhiteSpace(caps?.GetCapability("webSocketUrl")?.ToString())
                    ? "The Firefox BiDi endpoint could not connect and Firefox has no DevTools fallback. The endpoint may already be in use by another client. Use an available BiDi session, or import a HAR file."
                    : "This Firefox session was created without BiDi. Firefox cannot enable BiDi on an existing session. Create the external FirefoxDriver with FirefoxOptions { UseWebSocketUrl = true }, then hook again. You can still import HAR files.")
                : "The existing session exposes neither a BiDi WebSocket nor a Chrome/Edge debuggerAddress. Network recording requires one of these endpoints. Create the external driver with UseWebSocketUrl = true, or enable Chrome/Edge remote debugging.");
        if (!Uri.TryCreate("http://" + address.TrimEnd('/') + "/json/list", UriKind.Absolute, out var targetList))
            throw new InvalidOperationException("Invalid browser debuggerAddress: " + address);
        // These are local WebDriver debugger endpoints; bypass corporate HTTP proxies.
        using var handler = new HttpClientHandler { UseProxy = false };
        using var client = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(5) };
        using var response = await client.GetAsync(targetList);
        response.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        if (doc.RootElement.ValueKind != JsonValueKind.Array) throw new InvalidDataException("Invalid DevTools target list.");
        var targets = doc.RootElement.EnumerateArray().Where(t => Get(t, "type") == "page").ToArray();
        var handle = driver.CurrentWindowHandle;
        var targetId = handle.StartsWith("CDwindow-", StringComparison.Ordinal) ? handle[9..] : handle;
        var selected = targets.Where(t => Get(t, "id").Equals(targetId, StringComparison.OrdinalIgnoreCase)).ToArray();
        if (selected.Length == 0)
        {
            var url = driver.Url;
            selected = targets.Where(t => Get(t, "url") == url).ToArray();
        }
        if (selected.Length == 0 && targets.Length == 1) selected = targets;
        if (selected.Length != 1 || !Uri.TryCreate(Get(selected[0], "webSocketDebuggerUrl"), UriKind.Absolute, out var socket))
            throw new InvalidOperationException("Could not uniquely identify the hooked browser's current tab. Select one tab in WebDriver and try recording again.");
        if (socket.Scheme is not ("ws" or "wss")) throw new InvalidDataException("Invalid DevTools WebSocket URL.");
        return socket;
    }

    private static string Get(JsonElement element, string name) => element.TryGetProperty(name, out var value)
        && value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : "";
}
