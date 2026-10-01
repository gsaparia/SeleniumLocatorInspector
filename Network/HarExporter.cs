using System.Text.Json;

namespace SeleniumLocatorInspector.Network;

internal static class HarExporter
{
    public static async Task SaveAsync(string path, IReadOnlyList<(NetworkEntry Entry, CapturedBody[] Bodies)> captures)
    {
        var entries = captures.OrderBy(c => c.Entry.StartedAt).Select(c => BuildEntry(c.Entry, c.Bodies)).ToArray();
        var document = new { log = new {
            version = "1.2", creator = new { name = "Selenium Locator Inspector", version = "27" },
            entries, comment = "Exports captured data only. HTTP versions, wire sizes and detailed timing phases are unavailable. Cookies remain in headers." } };
        await using var stream = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.None, 65536, true);
        await JsonSerializer.SerializeAsync(stream, document, new JsonSerializerOptions { WriteIndented = true });
    }

    private static object[] HeaderArray(string text) => HttpCapture.Headers(text)
        .Select(h => (object)new { name = h.Key, value = h.Value }).ToArray();

    private static object[] Query(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Query.Length <= 1) return [];
        return uri.Query[1..].Split('&').Select(part =>
        {
            var pieces = part.Split('=', 2);
            return (object)new { name = Uri.UnescapeDataString(pieces[0].Replace('+', ' ')),
                value = pieces.Length == 2 ? Uri.UnescapeDataString(pieces[1].Replace('+', ' ')) : "" };
        }).ToArray();
    }

    private static object BuildEntry(NetworkEntry entry, CapturedBody[] bodies)
    {
        var requestBody = bodies[0];
        var responseBody = bodies[1];
        var request = new Dictionary<string, object?> {
            ["method"] = entry.Method, ["url"] = entry.Url.Split('#')[0], ["httpVersion"] = "",
            ["cookies"] = Array.Empty<object>(), ["headers"] = HeaderArray(entry.RequestHeaders),
            ["queryString"] = Query(entry.Url), ["headersSize"] = -1,
            ["bodySize"] = requestBody.Bytes?.Length ?? -1
        };
        if (requestBody.Bytes is { Length: > 0 } requestBytes)
        {
            var post = new Dictionary<string, object?> {
                ["mimeType"] = ResponseFormatter.DetectType(requestBody.DisplayText, ResponseFormatter.HeaderType(entry.RequestHeaders), ""),
                ["text"] = HttpCapture.IsBinary(requestBody) ? Convert.ToBase64String(requestBytes) : requestBody.DisplayText
            };
            if (HttpCapture.IsBinary(requestBody)) { post["_encoding"] = "base64"; post["comment"] = "Binary request stored as base64 (extension)."; }
            request["postData"] = post;
        }
        if (requestBody.Bytes == null) request["comment"] = requestBody.DisplayText;
        var content = new Dictionary<string, object?> {
            ["size"] = responseBody.Bytes?.Length ?? 0,
            ["mimeType"] = ResponseFormatter.DetectType(responseBody.Bytes == null ? "" : responseBody.DisplayText,
                ResponseFormatter.HeaderType(entry.ResponseHeaders) is { Length: > 0 } type ? type : entry.MimeType, entry.Url)
        };
        if (responseBody.Bytes is { } responseBytes)
        {
            content["text"] = responseBytes.Length == 0 ? "" : HttpCapture.IsBinary(responseBody)
                ? Convert.ToBase64String(responseBytes) : responseBody.DisplayText;
            if (HttpCapture.IsBinary(responseBody)) content["encoding"] = "base64";
        }
        else content["comment"] = "Body not captured; size unknown. " + responseBody.DisplayText;
        var time = Math.Max(0, entry.DurationMs ?? 0);
        return new {
            startedDateTime = entry.StartedAt.HasValue
                ? DateTimeOffset.FromUnixTimeMilliseconds((long)entry.StartedAt.Value).ToString("O") : DateTimeOffset.UnixEpoch.ToString("O"),
            time, request,
            response = new { status = entry.Status ?? 0, statusText = "", httpVersion = "",
                cookies = Array.Empty<object>(), headers = HeaderArray(entry.ResponseHeaders), content,
                redirectURL = HttpCapture.Header(entry.ResponseHeaders, "Location"), headersSize = -1, bodySize = -1 },
            cache = new { },
            timings = new { blocked = -1, dns = -1, connect = -1, send = 0, wait = time, receive = 0,
                comment = "Only total elapsed time captured; assigned to wait. Individual phases unknown." },
            comment = entry.State + (entry.Error.Length > 0 ? ": " + entry.Error : "") +
                (entry.StartedAt == null ? "; start timestamp unavailable" : ""),
            _context = entry.Context
        };
    }
}
