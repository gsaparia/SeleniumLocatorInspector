using System.Diagnostics;
using System.Management;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace SeleniumLocatorInspector.Browser;

public sealed record ExistingWebDriverSession(
    string DriverName,
    string BrowserName,
    int ProcessId,
    int Port,
    string SessionId,
    Uri ServerUri);

public static class WebDriverDiscovery
{
    private static readonly HttpClient Http = new()
    {
        Timeout = TimeSpan.FromMilliseconds(700)
    };

    private static readonly Dictionary<string, string> DriverToBrowser = new(StringComparer.OrdinalIgnoreCase)
    {
        ["msedgedriver"] = "Edge",
        ["chromedriver"] = "Chrome",
        ["geckodriver"] = "Firefox"
    };

    public static IReadOnlyList<ExistingWebDriverSession> FindFirstSessions()
    {
        var results = new List<ExistingWebDriverSession>();

        foreach (var processName in new[] { "msedgedriver", "geckodriver", "chromedriver" })
        {
            foreach (var process in Process.GetProcessesByName(processName))
            {
                try
                {
                    var commandLine = GetCommandLine(process.Id);
                    if (string.IsNullOrWhiteSpace(commandLine))
                        continue;

                    var port = ExtractPort(commandLine);
                    if (port <= 0)
                        continue;

                    var server = new Uri($"http://127.0.0.1:{port}");
                    var sessions = GetSessions(server);

                    foreach (var session in sessions)
                    {
                        results.Add(new ExistingWebDriverSession(
                            processName,
                            GetBrowserName(session),
                            process.Id,
                            port,
                            session.SessionId,
                            server));
                    }
                }
                catch
                {
                    // A driver can disappear while it is being inspected.
                }
                finally
                {
                    process.Dispose();
                }

                if (results.Count > 0)
                    return results;
            }
        }

        return results;
    }

    private static string GetCommandLine(int processId)
    {
        using var searcher = new ManagementObjectSearcher(
            $"SELECT CommandLine FROM Win32_Process WHERE ProcessId = {processId}");

        foreach (ManagementObject item in searcher.Get())
            return item["CommandLine"]?.ToString() ?? string.Empty;

        return string.Empty;
    }

    private static int ExtractPort(string commandLine)
    {
        var match = Regex.Match(commandLine, @"(?:--port|-p)\s*[= ]\s*(\d+)", RegexOptions.IgnoreCase);
        return match.Success && int.TryParse(match.Groups[1].Value, out var port) ? port : -1;
    }

    private static IReadOnlyList<SessionInfo> GetSessions(Uri server)
    {
        using var response = Http.GetAsync(new Uri(server, "sessions")).GetAwaiter().GetResult();
        if (!response.IsSuccessStatusCode)
            return Array.Empty<SessionInfo>();

        using var document = JsonDocument.Parse(response.Content.ReadAsStreamAsync().GetAwaiter().GetResult());
        if (!document.RootElement.TryGetProperty("value", out var value) || value.ValueKind != JsonValueKind.Array)
            return Array.Empty<SessionInfo>();

        var sessions = new List<SessionInfo>();
        foreach (var item in value.EnumerateArray())
        {
            if (!item.TryGetProperty("id", out var idElement))
                continue;

            var id = idElement.GetString();
            if (string.IsNullOrWhiteSpace(id))
                continue;

            sessions.Add(new SessionInfo(
                id,
                item.TryGetProperty("capabilities", out var caps) ? caps : default));
        }

        return sessions;
    }

    private static string GetBrowserName(SessionInfo session)
    {
        if (session.Capabilities.ValueKind == JsonValueKind.Object &&
            session.Capabilities.TryGetProperty("browserName", out var browser))
        {
            return browser.GetString() ?? "Unknown";
        }

        return "Unknown";
    }

    private sealed record SessionInfo(string SessionId, JsonElement Capabilities);
}
