using System.Globalization;
using System.Text;
using System.Text.Json;

namespace SeleniumLocatorInspector.Network;

internal sealed record ImportedCapture(NetworkEntry Entry, CapturedBody[] Bodies);

internal static class HarImporter
{
    public static async Task<IReadOnlyList<ImportedCapture>> LoadAsync(string path)
    {
        if (new FileInfo(path).Length > 128 * 1024 * 1024)
            throw new InvalidDataException("HAR files larger than 128 MiB are not supported.");
        await using var stream = File.OpenRead(path);
        using var doc = await JsonDocument.ParseAsync(stream, new JsonDocumentOptions { MaxDepth = 128 });
        var log = Object(doc.RootElement, "log");
        if (!log.TryGetProperty("entries", out var entries) || entries.ValueKind != JsonValueKind.Array)
            throw new InvalidDataException("The HAR must contain a log.entries array.");
        if (entries.GetArrayLength() > 50000) throw new InvalidDataException("HAR files are limited to 50,000 entries.");
        var results = new List<ImportedCapture>();
        var importId = Guid.NewGuid().ToString("N");
        foreach (var item in entries.EnumerateArray())
        {
            try { results.Add(ReadEntry(item, "har:" + importId + ":" + results.Count, Path.GetFileName(path))); }
            catch (Exception ex) when (ex is FormatException or InvalidDataException or ArgumentException or OverflowException)
            { throw new InvalidDataException("HAR entry " + (results.Count + 1) + ": " + ex.Message, ex); }
        }
        return results;
    }

    private static ImportedCapture ReadEntry(JsonElement item, string key, string source)
    {
        var request = Object(item, "request");
        var response = Object(item, "response");
        var url = Text(request, "url");
        var method = Text(request, "method");
        if (url.Length == 0 || method.Length == 0) throw new InvalidDataException("Request URL and method are required.");
        var requestHeaders = Headers(request);
        var responseHeaders = Headers(response);
        if (HttpCapture.Header(requestHeaders, "Cookie").Length == 0 && request.TryGetProperty("cookies", out var cookies) && cookies.ValueKind == JsonValueKind.Array)
        {
            var values = cookies.EnumerateArray().Select(c => Text(c, "name") + "=" + Text(c, "value")).ToArray();
            if (values.Length > 0) requestHeaders = Append(requestHeaders, "Cookie", string.Join("; ", values));
        }
        CapturedBody requestBody;
        if (request.TryGetProperty("postData", out var post) && post.ValueKind == JsonValueKind.Object)
        {
            var type = Text(post, "mimeType");
            if (HttpCapture.Header(requestHeaders, "Content-Type").Length == 0 && type.Length > 0)
                requestHeaders = Append(requestHeaders, "Content-Type", type);
            if (post.TryGetProperty("text", out var text) && text.ValueKind == JsonValueKind.String)
                requestBody = Decode(text.GetString() ?? "", Text(post, "_encoding") is { Length: > 0 } encoding ? encoding : Text(post, "encoding"),
                    HttpCapture.Header(requestHeaders, "Content-Type"));
            else if (type.StartsWith("application/x-www-form-urlencoded", StringComparison.OrdinalIgnoreCase) &&
                post.TryGetProperty("params", out var parameters) && parameters.ValueKind == JsonValueKind.Array)
            {
                var value = string.Join("&", parameters.EnumerateArray().Select(p => Uri.EscapeDataString(Text(p, "name")) + "=" + Uri.EscapeDataString(Text(p, "value"))));
                requestBody = new(value.Length == 0 ? "(Empty body)" : value, Encoding.UTF8.GetBytes(value));
            }
            else requestBody = new("Body unavailable: HAR postData does not contain a replayable body.", null);
        }
        else requestBody = Number(request, "bodySize") == 0
            ? new("(Empty body)", []) : new("Body unavailable: request body was not included in the HAR.", null);
        var content = response.TryGetProperty("content", out var c) && c.ValueKind == JsonValueKind.Object ? c : default;
        var mime = Text(content, "mimeType");
        if (HttpCapture.Header(responseHeaders, "Content-Type").Length == 0 && mime.Length > 0)
            responseHeaders = Append(responseHeaders, "Content-Type", mime);
        var responseBody = content.ValueKind == JsonValueKind.Object && content.TryGetProperty("text", out var bodyText) && bodyText.ValueKind == JsonValueKind.String
            ? Decode(bodyText.GetString() ?? "", Text(content, "encoding"), HttpCapture.Header(responseHeaders, "Content-Type"))
            : new CapturedBody("Body unavailable: response body was not included in the HAR.", null);
        var status = Number(response, "status");
        if (status is < 0 or > 999 || (status.HasValue && status.Value != Math.Truncate(status.Value))) throw new InvalidDataException("Invalid HTTP status.");
        var started = DateTimeOffset.TryParse(Text(item, "startedDateTime"), CultureInfo.InvariantCulture,
            DateTimeStyles.None, out var date) ? (double?)date.ToUnixTimeMilliseconds() : null;
        var duration = Number(item, "time");
        if (duration < 0) duration = null;
        var failure = Text(item, "_error");
        if ((status is null or 0) && failure.Length == 0) failure = Text(response, "comment");
        return new(new NetworkEntry(key, key, url, method, status is > 0 ? "Complete" : "Failed",
            status is > 0 ? (int)status.Value : null, mime, duration, started,
            requestHeaders, responseHeaders, failure, "HAR: " + source), [requestBody, responseBody]);
    }

    private static CapturedBody Decode(string text, string encoding, string contentType)
    {
        if (encoding.Length > 0 && !encoding.Equals("base64", StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("Unsupported body encoding: " + encoding);
        if (encoding.Length > 0) return HttpCapture.Body(Convert.FromBase64String(text), contentType);
        var charset = System.Text.RegularExpressions.Regex.Match(contentType, "charset\\s*=\\s*[\"']?([^;\\s\"']+)",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        var decoder = charset.Success ? Encoding.GetEncoding(charset.Groups[1].Value,
            EncoderFallback.ExceptionFallback, DecoderFallback.ExceptionFallback) : new UTF8Encoding(false, true);
        return new(text.Length == 0 ? "(Empty body)" : text, decoder.GetBytes(text));
    }

    private static string Headers(JsonElement owner)
    {
        if (!owner.TryGetProperty("headers", out var headers) || headers.ValueKind != JsonValueKind.Array) return "";
        return string.Join(Environment.NewLine, headers.EnumerateArray().Select(h => Text(h, "name") + ": " + Text(h, "value")));
    }
    private static string Append(string headers, string name, string value) =>
        (headers.Length == 0 ? "" : headers + Environment.NewLine) + name + ": " + value;
    private static JsonElement Object(JsonElement owner, string name) =>
        owner.ValueKind == JsonValueKind.Object && owner.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Object
            ? value : throw new InvalidDataException("Missing HAR object: " + name);
    private static string Text(JsonElement owner, string name) => owner.ValueKind == JsonValueKind.Object &&
        owner.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : "";
    private static double? Number(JsonElement owner, string name) => owner.ValueKind == JsonValueKind.Object &&
        owner.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var number) && double.IsFinite(number) ? number : null;
}
