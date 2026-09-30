using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace SeleniumLocatorInspector.Network;

/// <summary>A separate CDP connection; does not consume WebDriver logs or change browser settings.</summary>
internal sealed class CdpNetworkRecorder : IAsyncDisposable
{
    private readonly ClientWebSocket _socket = new();
    private readonly CancellationTokenSource _stop = new();
    private readonly SemaphoreSlim _sendLock = new(1, 1);
    private readonly Dictionary<int, TaskCompletionSource<JsonElement>> _pending = new();
    private readonly CdpCaptureState _state = new();
    private Task? _reader;
    private int _nextId;
    public event Action<NetworkEntry>? Updated;
    public event Action<string>? Disconnected;

    public async Task StartAsync(Uri endpoint)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        _socket.Options.Proxy = null;
        await _socket.ConnectAsync(endpoint, timeout.Token);
        _reader = ReadLoopAsync();
        var reply = await CommandAsync("Network.enable", new {
            maxTotalBufferSize = 64 * 1024 * 1024, maxResourceBufferSize = 16 * 1024 * 1024,
            maxPostDataSize = 16 * 1024 * 1024
        }, timeout.Token);
        if (reply.TryGetProperty("error", out var error))
            throw new InvalidOperationException("DevTools network recording failed: " + error);
    }

    public async Task<CapturedBody> GetBodyAsync(NetworkEntry entry, string dataType)
    {
        if (entry.State is not ("Complete" or "Failed")) return new("Body pending. Select the request again after it completes.", null);
        if (dataType == "request" && _state.TryRequestBody(entry, out var cached)) return cached!;
        if (!_state.IsCurrent(entry)) return new("Body unavailable: DevTools no longer retains this redirect hop.", null);
        if (dataType == "request" && !_state.HasPostData(entry)) return new("(Empty body)", []);
        if (dataType == "request" && HttpCapture.Header(entry.RequestHeaders, "Content-Type")
            .StartsWith("multipart/", StringComparison.OrdinalIgnoreCase))
            return new("Body unavailable: DevTools post-data text can omit uploaded files; exact multipart bytes were not captured.", null);
        try
        {
            var reply = await CommandAsync(dataType == "request" ? "Network.getRequestPostData" : "Network.getResponseBody",
                new { requestId = entry.Id }, _stop.Token);
            if (!_state.IsCurrent(entry)) return new("Body unavailable: request redirected while its body was being read.", null);
            if (reply.TryGetProperty("error", out var error)) return new("Body unavailable: " + error, null);
            if (!reply.TryGetProperty("result", out var result)) return new("Body unavailable: DevTools did not return data.", null);
            var property = dataType == "request" ? "postData" : "body";
            if (!result.TryGetProperty(property, out var value) || value.ValueKind != JsonValueKind.String)
                return new("Body unavailable: DevTools did not return body bytes.", null);
            var text = value.GetString() ?? "";
            var encoded = result.TryGetProperty("base64Encoded", out var flag) && flag.ValueKind == JsonValueKind.True;
            var bytes = encoded ? Convert.FromBase64String(text) : Encoding.UTF8.GetBytes(text);
            var type = dataType == "request" ? HttpCapture.Header(entry.RequestHeaders, "Content-Type")
                : HttpCapture.Header(entry.ResponseHeaders, "Content-Type");
            return encoded ? HttpCapture.Body(bytes, type.Length > 0 ? type : entry.MimeType)
                : new(text.Length == 0 ? "(Empty body)" : text, bytes);
        }
        catch (OperationCanceledException) { return new("Body unavailable: recording stopped or the request timed out.", null); }
        catch (Exception ex) { return new("Body unavailable: " + ex.Message, null); }
    }

    private async Task<JsonElement> CommandAsync(string method, object parameters, CancellationToken token)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token, _stop.Token);
        deadline.CancelAfter(TimeSpan.FromSeconds(5));
        var id = Interlocked.Increment(ref _nextId);
        var completion = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        lock (_pending) _pending[id] = completion;
        try
        {
            var payload = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { id, method, @params = parameters }));
            await _sendLock.WaitAsync(deadline.Token);
            try { await _socket.SendAsync(new ArraySegment<byte>(payload), WebSocketMessageType.Text, true, deadline.Token); }
            finally { _sendLock.Release(); }
            return await completion.Task.WaitAsync(deadline.Token);
        }
        finally { lock (_pending) _pending.Remove(id); }
    }

    private async Task ReadLoopAsync()
    {
        try
        {
            var buffer = new byte[16384];
            while (!_stop.IsCancellationRequested)
            {
                using var message = new MemoryStream();
                WebSocketReceiveResult part;
                do
                {
                    part = await _socket.ReceiveAsync(new ArraySegment<byte>(buffer), _stop.Token);
                    if (part.MessageType == WebSocketMessageType.Close) throw new IOException("The browser closed the DevTools connection.");
                    if (part.MessageType != WebSocketMessageType.Text) throw new IOException("Unexpected DevTools message type.");
                    message.Write(buffer, 0, part.Count);
                    if (message.Length > 25 * 1024 * 1024) throw new IOException("DevTools message exceeded the 25 MiB limit.");
                } while (!part.EndOfMessage);
                using var json = JsonDocument.Parse(message.ToArray());
                var root = json.RootElement;
                if (root.TryGetProperty("id", out var id))
                {
                    TaskCompletionSource<JsonElement>? completion;
                    lock (_pending) _pending.TryGetValue(id.GetInt32(), out completion);
                    completion?.TrySetResult(root.Clone());
                }
                else foreach (var entry in _state.Process(root)) Updated?.Invoke(entry);
            }
        }
        catch (Exception) when (_stop.IsCancellationRequested) { }
        catch (Exception ex) { Disconnected?.Invoke(ex.Message); }
        finally
        {
            lock (_pending) foreach (var completion in _pending.Values) completion.TrySetCanceled();
        }
    }

    public async ValueTask DisposeAsync()
    {
        _stop.Cancel();
        _socket.Dispose();
        if (_reader != null) { try { await _reader; } catch { } }
        // Closing this separate CDP connection removes its subscriptions. No
        // browser-wide disable, interception, cache or cookie commands are sent.
    }
}
