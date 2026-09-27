using System.Net.WebSockets;
using System.IO.Compression;
using System.Text;
using System.Text.Json;
using OpenQA.Selenium;

namespace SeleniumLocatorInspector.Network;

public sealed record CapturedBody(string DisplayText, byte[]? Bytes);

public sealed record NetworkEntry(
    string Key, string Id, string Url, string Method, string State,
    int? Status, string MimeType, double? DurationMs, double? StartedAt,
    string RequestHeaders, string ResponseHeaders, string Error, string Context);

/// <summary>Owns one BiDi connection; does not take control of the WebDriver session.</summary>
public sealed class NetworkRecorder : IAsyncDisposable
{
    private readonly Dictionary<string, NetworkEntry> _entries = new();
    private readonly ClientWebSocket _socket = new();
    private readonly CancellationTokenSource _stop = new();
    private Task? _reader;
    private readonly SemaphoreSlim _sendLock = new(1, 1);
    private readonly Dictionary<int, TaskCompletionSource<JsonElement>> _pending = new();
    private int _nextCommand = 2;
    private readonly Dictionary<string, string> _collectors = new();
    public bool CanReadRequestBody => _collectors.ContainsKey("request");
    public bool CanReadResponseBody => _collectors.ContainsKey("response");
    public event Action<NetworkEntry>? Updated;
    public event Action<string>? Disconnected;

    public async Task StartAsync(IWebDriver driver)
    {
        var url = (driver as IHasCapabilities)?.Capabilities.GetCapability("webSocketUrl")?.ToString();
        if (string.IsNullOrWhiteSpace(url))
            throw new InvalidOperationException("This WebDriver session has no BiDi WebSocket. Relaunch the browser using this version of the inspector, then try again.");

        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        await _socket.ConnectAsync(new Uri(url), timeout.Token);
        var subscribe = JsonSerializer.Serialize(new
        {
            id = 1,
            method = "session.subscribe",
            @params = new { events = new[] { "network.beforeRequestSent", "network.responseStarted", "network.responseCompleted", "network.fetchError" } }
        });
        await _socket.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(subscribe)), WebSocketMessageType.Text, true, timeout.Token);
        // Confirm support before presenting the window as recording.
        while (true)
        {
            using var reply = await ReceiveAsync(timeout.Token);
            if (reply.RootElement.TryGetProperty("id", out var id) && id.GetInt32() == 1)
            {
                if (reply.RootElement.TryGetProperty("error", out var error))
                    throw new InvalidOperationException("BiDi network subscription failed: " + error.GetString() + " — " + GetString(reply.RootElement, "message"));
                break;
            }
            Process(reply.RootElement);
        }
        // Body collection is optional in browser implementations. Set up the
        // collector before reporting recording as started.
        await TryAddCollectorAtStartupAsync(new[] { "request", "response" }, timeout.Token);
        _reader = ReadLoopAsync();
    }

    private async Task TryAddCollectorAtStartupAsync(string[] dataTypes, CancellationToken token)
    {
        var id = _nextCommand++;
        await SendRawAsync(new { id, method = "network.addDataCollector", @params = new {
            dataTypes, maxEncodedDataSize = 16777216 } }, token);
        while (true)
        {
            using var reply = await ReceiveAsync(token);
            var root = reply.RootElement;
            if (root.TryGetProperty("id", out var replyId) && replyId.GetInt32() == id)
            {
                if (root.TryGetProperty("result", out var result) &&
                    result.TryGetProperty("collector", out var collector))
                {
                    foreach (var dataType in dataTypes) _collectors[dataType] = collector.GetString() ?? "";
                }
                else if (dataTypes.Length > 1)
                {
                    // Some browsers support response collection but not request.
                    await TryAddCollectorAtStartupAsync(new[] { "response" }, token);
                }
                return;
            }
            Process(root);
        }
    }

    private async Task SendRawAsync(object command, CancellationToken token)
    {
        var bytes = new ArraySegment<byte>(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(command)));
        await _sendLock.WaitAsync(token);
        try { await _socket.SendAsync(bytes, WebSocketMessageType.Text, true, token); }
        finally { _sendLock.Release(); }
    }

    public async Task<CapturedBody> GetBodyAsync(NetworkEntry entry, string dataType)
    {
        if (!_collectors.TryGetValue(dataType, out var collector))
            return new("Body collection is not supported by this browser session.", null);
        if (entry.State is not ("Complete" or "Failed"))
            return new("Body pending. Select the request again after it completes.", null);
        var id = Interlocked.Increment(ref _nextCommand);
        var pending = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        lock (_pending) _pending[id] = pending;
        try
        {
            await SendRawAsync(new { id, method = "network.getData", @params = new { dataType, collector, request = entry.Id } }, _stop.Token);
            var response = await pending.Task.WaitAsync(TimeSpan.FromSeconds(5), _stop.Token);
            if (response.TryGetProperty("error", out var error))
                return new("Body unavailable: " + error.GetString() + ".", null);
            if (!response.TryGetProperty("result", out var result) ||
                !result.TryGetProperty("bytes", out var bytes))
                return new("Body unavailable: the browser did not return data.", null);
            var value = GetString(bytes, "value");
            if (GetString(bytes, "type") == "string") return new(value.Length == 0 ? "(Empty body)" : value, Encoding.UTF8.GetBytes(value));
            if (GetString(bytes, "type") == "base64")
            {
                var raw = Convert.FromBase64String(value);
                var mime = dataType == "response" ? entry.MimeType : entry.RequestHeaders;
                if (mime.Contains("image/", StringComparison.OrdinalIgnoreCase) ||
                    mime.Contains("audio/", StringComparison.OrdinalIgnoreCase) ||
                    mime.Contains("video/", StringComparison.OrdinalIgnoreCase) ||
                    mime.Contains("application/pdf", StringComparison.OrdinalIgnoreCase))
                    return new("Binary body (base64):" + Environment.NewLine + value, raw);
                try { return new(DecodeText(raw, dataType == "response" ? entry.ResponseHeaders : entry.RequestHeaders), raw); }
                catch (Exception ex) when (ex is DecoderFallbackException or InvalidDataException or IOException)
                { return new("Binary body (base64):" + Environment.NewLine + value, raw); }
            }
            return new("Body unavailable: unrecognized data encoding.", null);
        }
        catch (TimeoutException) { return new("Body unavailable: the browser did not respond in time.", null); }
        catch (OperationCanceledException) { return new("Body unavailable: recording stopped.", null); }
        catch (Exception ex) { return new("Body unavailable: " + ex.Message, null); }
        finally { lock (_pending) _pending.Remove(id); }
    }

    private static string DecodeText(byte[] bytes, string headers)
    {
        // Some drivers return encoded wire bytes. Decode for display while
        // retaining the exact bytes returned by BiDi for saving media.
        if (bytes.Length >= 2 && bytes[0] == 0x1f && bytes[1] == 0x8b)
        {
            using var source = new MemoryStream(bytes);
            using var gzip = new GZipStream(source, CompressionMode.Decompress);
            bytes = ReadLimited(gzip);
        }
        else if (headers.Contains("Content-Encoding: br", StringComparison.OrdinalIgnoreCase))
        {
            try { return new UTF8Encoding(false, true).GetString(bytes); }
            catch (DecoderFallbackException)
            {
                using var source = new MemoryStream(bytes);
                using var brotli = new BrotliStream(source, CompressionMode.Decompress);
                bytes = ReadLimited(brotli);
            }
        }
        if (bytes.Length >= 2 && bytes[0] == 0xff && bytes[1] == 0xfe)
            return new UnicodeEncoding(false, true, true).GetString(bytes);
        if (bytes.Length >= 2 && bytes[0] == 0xfe && bytes[1] == 0xff)
            return new UnicodeEncoding(true, true, true).GetString(bytes);
        if (headers.Contains("charset=iso-8859-1", StringComparison.OrdinalIgnoreCase) ||
            headers.Contains("charset=latin1", StringComparison.OrdinalIgnoreCase))
            return Encoding.Latin1.GetString(bytes);
        return new UTF8Encoding(false, true).GetString(bytes);
    }

    private static byte[] ReadLimited(Stream input)
    {
        using var result = new MemoryStream();
        var buffer = new byte[8192];
        int count;
        while ((count = input.Read(buffer, 0, buffer.Length)) > 0)
        {
            if (result.Length + count > 20 * 1024 * 1024)
                throw new InvalidDataException("Decompressed body exceeds the display limit.");
            result.Write(buffer, 0, count);
        }
        return result.ToArray();
    }

    private async Task ReadLoopAsync()
    {
        try
        {
            while (!_stop.IsCancellationRequested && _socket.State == WebSocketState.Open)
            {
                using var message = await ReceiveAsync(_stop.Token);
                if (message.RootElement.TryGetProperty("id", out var commandId))
                {
                    TaskCompletionSource<JsonElement>? waiter;
                    lock (_pending) _pending.TryGetValue(commandId.GetInt32(), out waiter);
                    waiter?.TrySetResult(message.RootElement.Clone());
                }
                else Process(message.RootElement);
            }
        }
        catch (OperationCanceledException) when (_stop.IsCancellationRequested) { }
        catch (Exception ex) { Disconnected?.Invoke(ex.Message); }
    }

    private async Task<JsonDocument> ReceiveAsync(CancellationToken token)
    {
        using var bytes = new MemoryStream();
        var buffer = new byte[16384];
        while (true)
        {
            var part = await _socket.ReceiveAsync(new ArraySegment<byte>(buffer), token);
            if (part.MessageType == WebSocketMessageType.Close)
                throw new IOException("The browser closed its BiDi connection.");
            if (part.MessageType != WebSocketMessageType.Text)
                throw new IOException("Unexpected BiDi WebSocket message type.");
            bytes.Write(buffer, 0, part.Count);
            if (bytes.Length > 25 * 1024 * 1024)
                throw new IOException("BiDi event exceeded the 25 MB size limit.");
            if (part.EndOfMessage) return JsonDocument.Parse(bytes.ToArray());
        }
    }

    private void Process(JsonElement root)
    {
        var method = GetString(root, "method");
        if (!method.StartsWith("network.", StringComparison.Ordinal) ||
            !root.TryGetProperty("params", out var data) ||
            !data.TryGetProperty("request", out var request)) return;

        var id = GetString(request, "request");
        if (id.Length == 0) return;
        var redirect = GetString(data, "redirectCount");
        var key = id + ":" + redirect;
        _entries.TryGetValue(key, out var old);
        var response = data.TryGetProperty("response", out var value) ? value : default;
        var stamp = GetNumber(data, "timestamp");
        var started = old?.StartedAt ?? stamp;
        var duration = (method is "network.responseCompleted" or "network.fetchError") && stamp.HasValue && started.HasValue
            ? Math.Max(0, stamp.Value - started.Value) : old?.DurationMs;
        var status = GetNumber(response, "status");
        var entry = new NetworkEntry(
            key, id,
            GetString(request, "url") is { Length: > 0 } u ? u : old?.Url ?? "",
            GetString(request, "method") is { Length: > 0 } m ? m : old?.Method ?? "",
            method switch
            {
                "network.beforeRequestSent" => "Pending",
                "network.responseStarted" => "Receiving",
                "network.responseCompleted" => "Complete",
                "network.fetchError" => "Failed",
                _ => old?.State ?? "Pending"
            },
            status.HasValue ? (int)status.Value : old?.Status,
            GetString(response, "mimeType") is { Length: > 0 } mime ? mime : old?.MimeType ?? "",
            duration, started,
            Headers(request) is { Length: > 0 } reqHeaders ? reqHeaders : old?.RequestHeaders ?? "",
            Headers(response) is { Length: > 0 } resHeaders ? resHeaders : old?.ResponseHeaders ?? "",
            GetString(data, "errorText") is { Length: > 0 } failure ? failure : old?.Error ?? "",
            GetString(data, "context") is { Length: > 0 } context ? context : old?.Context ?? "");
        _entries[key] = entry;
        Updated?.Invoke(entry);
    }

    private static string GetString(JsonElement element, string property) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(property, out var value)
            ? value.ToString() : "";

    private static double? GetNumber(JsonElement element, string property) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var number) ? number : null;

    private static string Headers(JsonElement element)
    {
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty("headers", out var headers) ||
            headers.ValueKind != JsonValueKind.Array) return "";
        var lines = new List<string>();
        foreach (var header in headers.EnumerateArray())
        {
            var value = header.TryGetProperty("value", out var v) ? v : default;
            lines.Add(GetString(header, "name") + ": " +
                (value.ValueKind == JsonValueKind.Object ? GetString(value, "value") : value.ToString()));
        }
        return string.Join(Environment.NewLine, lines);
    }

    public async ValueTask DisposeAsync()
    {
        _stop.Cancel();
        _socket.Dispose();
        if (_reader != null)
        {
            try { await _reader; } catch { }
        }
        lock (_pending)
        {
            foreach (var waiter in _pending.Values) waiter.TrySetCanceled();
            _pending.Clear();
        }
        _sendLock.Dispose();
        _stop.Dispose();
    }
}
