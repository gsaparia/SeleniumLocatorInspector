using System.Diagnostics;
using System.Net;
using System.Net.Http;
using System.Text;

namespace SeleniumLocatorInspector.Network;

internal sealed record ReplayResult(NetworkEntry Entry, CapturedBody[] Bodies);

internal static class RequestReplay
{
    public static async Task<ReplayResult> SendAsync(string method, string url, string headerText,
        byte[]? body, CancellationToken token)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https"))
            throw new FormatException("Enter an absolute HTTP or HTTPS URL.");
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token);
        deadline.CancelAfter(TimeSpan.FromSeconds(60));
        token = deadline.Token;
        using var message = new HttpRequestMessage(new HttpMethod(method.Trim()), uri);
        if (body != null) message.Content = new ByteArrayContent(body);
        foreach (var header in HttpCapture.Headers(headerText, validate: true))
        {
            // Transport framing is recalculated from the edited body.
            if (header.Key.Equals("Content-Length", StringComparison.OrdinalIgnoreCase) ||
                header.Key.Equals("Transfer-Encoding", StringComparison.OrdinalIgnoreCase)) continue;
            if (header.Key.StartsWith("Content-", StringComparison.OrdinalIgnoreCase))
            {
                message.Content ??= new ByteArrayContent([]);
                if (!message.Content.Headers.TryAddWithoutValidation(header.Key, header.Value))
                    throw new FormatException("Unsupported content header: " + header.Key);
            }
            else if (!message.Headers.TryAddWithoutValidation(header.Key, header.Value))
                throw new FormatException("Unsupported request header: " + header.Key);
        }
        using var handler = new HttpClientHandler {
            AllowAutoRedirect = false, UseCookies = false, AutomaticDecompression = DecompressionMethods.All
        };
        using var client = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(60) };
        var actualHeaders = HeaderText(message.Headers) +
            (message.Content == null ? "" : HeaderText(message.Content.Headers));
        var requestBody = HttpCapture.Body(body ?? [], HttpCapture.Header(actualHeaders, "Content-Type"));
        var started = DateTimeOffset.UtcNow;
        var watch = Stopwatch.StartNew();
        var key = "replay:" + Guid.NewGuid().ToString("N");
        int? status = null;
        var responseHeaders = "";
        var mime = "";
        CapturedBody responseBody;
        var error = "";
        try
        {
            using var response = await client.SendAsync(message, HttpCompletionOption.ResponseHeadersRead, token);
            status = (int)response.StatusCode;
            responseHeaders = HeaderText(response.Headers) + HeaderText(response.Content.Headers);
            mime = response.Content.Headers.ContentType?.ToString() ?? "";
            await using var stream = await response.Content.ReadAsStreamAsync(token);
            using var buffer = new MemoryStream();
            var chunk = new byte[8192];
            int count;
            while ((count = await stream.ReadAsync(chunk.AsMemory(), token)) > 0)
            {
                if (buffer.Length + count > 16 * 1024 * 1024)
                    throw new IOException("Response exceeds the 16 MiB capture limit; response body was not retained.");
                buffer.Write(chunk, 0, count);
            }
            responseBody = HttpCapture.Body(buffer.ToArray(), mime);
        }
        catch (Exception ex) when (ex is HttpRequestException or IOException or OperationCanceledException)
        {
            error = ex is OperationCanceledException ? "Request cancelled or timed out." : ex.Message;
            responseBody = new("Body unavailable: " + error, null);
        }
        watch.Stop();
        return new(new NetworkEntry(key, key, uri.AbsoluteUri, method.Trim(),
            error.Length == 0 ? "Complete" : "Failed", status, mime, watch.Elapsed.TotalMilliseconds,
            started.ToUnixTimeMilliseconds(), actualHeaders.TrimEnd(), responseHeaders.TrimEnd(), error,
            "Resent request (desktop HTTP client)"), [requestBody, responseBody]);
    }

    private static string HeaderText(System.Net.Http.Headers.HttpHeaders headers) =>
        string.Concat(headers.SelectMany(h => h.Value.Select(value => h.Key + ": " + value + Environment.NewLine)));
}
