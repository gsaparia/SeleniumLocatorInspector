using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;

namespace SeleniumLocatorInspector.Network;

/// <summary>Maps CDP clocks, redirects and out-of-order wire headers to independent entries.</summary>
internal sealed class CdpCaptureState
{
    private sealed class Hop(NetworkEntry entry, double? started)
    {
        public NetworkEntry Entry = entry;
        public double? Started = started;
        public bool? HasExtraInfo;
    }
    private sealed record ExtraInfo(string Headers, int? Status);
    private readonly string _prefix = "cdp:" + Guid.NewGuid().ToString("N") + ":";
    private readonly Dictionary<string, List<Hop>> _hops = new();
    private readonly Dictionary<string, Queue<ExtraInfo>> _extra = new();
    private readonly Dictionary<string, int> _nextExtra = new();
    private readonly ConcurrentDictionary<string, CapturedBody> _requests = new();
    private readonly ConcurrentDictionary<string, bool> _hasPostData = new();
    private readonly ConcurrentDictionary<string, string> _activeKeys = new();
    public bool IsCurrent(NetworkEntry entry) => _activeKeys.TryGetValue(entry.Id, out var key) && key == entry.Key;
    public bool HasPostData(NetworkEntry entry) => _hasPostData.TryGetValue(entry.Key, out var value) && value;
    public bool TryRequestBody(NetworkEntry entry, out CapturedBody? body) => _requests.TryGetValue(entry.Key, out body);

    public IReadOnlyList<NetworkEntry> Process(JsonElement root)
    {
        var method = Text(root, "method");
        if (!root.TryGetProperty("params", out var data) || data.ValueKind != JsonValueKind.Object) return [];
        var id = Text(data, "requestId");
        if (id.Length == 0) return [];
        var output = new List<NetworkEntry>();
        _hops.TryGetValue(id, out var hops);
        var old = hops?.LastOrDefault();
        var stamp = Number(data, "timestamp");
        if (method is "Network.requestWillBeSentExtraInfo" or "Network.responseReceivedExtraInfo")
        {
            var side = method == "Network.requestWillBeSentExtraInfo" ? "request" : "response";
            var queueKey = id + ":" + side;
            if (!_extra.TryGetValue(queueKey, out var queue)) _extra[queueKey] = queue = new();
            queue.Enqueue(new(Headers(data), Number(data, "statusCode") is { } code ? (int)code : null));
        }
        else if (method == "Network.requestWillBeSent" && data.TryGetProperty("request", out var request))
        {
            if (old != null && data.TryGetProperty("redirectResponse", out var redirect))
            {
                old.Entry = WithResponse(old.Entry, redirect) with { State = "Complete", DurationMs = Duration(old, stamp) };
                old.HasExtraInfo = Flag(data, "redirectHasExtraInfo");
                output.Add(old.Entry);
            }
            hops ??= new List<Hop>();
            _hops[id] = hops;
            var key = _prefix + id + ":" + hops.Count;
            var entry = new NetworkEntry(key, id, Text(request, "url"), Text(request, "method"), "Pending",
                null, "", null, Number(data, "wallTime") is { } wall ? wall * 1000 : null,
                Headers(request), "", "", Text(data, "frameId"));
            hops.Add(new(entry, stamp)); _activeKeys[id] = key;
            _hasPostData[key] = Flag(request, "hasPostData");
            if (request.TryGetProperty("postDataEntries", out var chunks) && chunks.ValueKind == JsonValueKind.Array &&
                chunks.GetArrayLength() > 0 && chunks.EnumerateArray().All(c => Text(c, "bytes").Length > 0))
            {
                try
                {
                    var raw = chunks.EnumerateArray().SelectMany(c => Convert.FromBase64String(Text(c, "bytes"))).ToArray();
                    _requests[key] = HttpCapture.Body(raw, HttpCapture.Header(entry.RequestHeaders, "Content-Type"));
                    _hasPostData[key] = true;
                }
                catch (FormatException) { /* Query post data if event bytes are incomplete. */ }
            }
            else if (request.TryGetProperty("postData", out var post) && post.ValueKind == JsonValueKind.String &&
                !HttpCapture.Header(entry.RequestHeaders, "Content-Type").StartsWith("multipart/", StringComparison.OrdinalIgnoreCase))
            {
                var text = post.GetString() ?? "";
                _requests[key] = new(text.Length == 0 ? "(Empty body)" : text, Encoding.UTF8.GetBytes(text));
                _hasPostData[key] = true;
            }
            output.Add(entry);
        }
        else if (old != null)
        {
            if (method == "Network.responseReceived" && data.TryGetProperty("response", out var response))
            {
                old.Entry = WithResponse(old.Entry, response) with { State = "Receiving" };
                old.HasExtraInfo = Flag(data, "hasExtraInfo");
                output.Add(old.Entry);
            }
            else if (method is "Network.loadingFinished" or "Network.loadingFailed")
            {
                old.Entry = old.Entry with { State = method == "Network.loadingFinished" ? "Complete" : "Failed",
                    DurationMs = Duration(old, stamp), Error = Text(data, "errorText") };
                // Failed requests may have wire request headers but no response.
                old.HasExtraInfo ??= _extra.TryGetValue(id + ":request", out var q) && q.Count > 0;
                output.Add(old.Entry);
            }
        }
        if (hops != null)
        {
            DrainExtra(id, "request", hops, output);
            DrainExtra(id, "response", hops, output);
        }
        return output.GroupBy(e => e.Key).Select(g => g.Last()).ToArray();
    }

    private void DrainExtra(string id, string side, List<Hop> hops, List<NetworkEntry> output)
    {
        var key = id + ":" + side;
        var next = _nextExtra.GetValueOrDefault(key);
        _extra.TryGetValue(key, out var queue);
        while (next < hops.Count)
        {
            var hop = hops[next];
            if (!hop.HasExtraInfo.HasValue) break;
            if (hop.HasExtraInfo == false) { next++; continue; }
            if (queue == null || queue.Count == 0) break;
            var extra = queue.Dequeue();
            hop.Entry = side == "request"
                ? hop.Entry with { RequestHeaders = Merge(hop.Entry.RequestHeaders, extra.Headers) }
                : hop.Entry with { ResponseHeaders = Merge(hop.Entry.ResponseHeaders, extra.Headers), Status = extra.Status ?? hop.Entry.Status };
            output.Add(hop.Entry); next++;
        }
        _nextExtra[key] = next;
    }
    private static double? Duration(Hop hop, double? stamp) => stamp.HasValue && hop.Started.HasValue
        ? Math.Max(0, (stamp.Value - hop.Started.Value) * 1000) : null;
    private static NetworkEntry WithResponse(NetworkEntry entry, JsonElement response) => entry with {
        Status = Number(response, "status") is { } status ? (int)status : entry.Status,
        MimeType = Text(response, "mimeType"), ResponseHeaders = Merge(entry.ResponseHeaders, Headers(response))
    };
    private static string Merge(string old, string extra)
    {
        if (extra.Length == 0) return old;
        var incoming = HttpCapture.Headers(extra);
        var names = incoming.Select(h => h.Key).ToHashSet(StringComparer.OrdinalIgnoreCase);
        return string.Join(Environment.NewLine, HttpCapture.Headers(old).Where(h => !names.Contains(h.Key))
            .Concat(incoming).Select(h => h.Key + ": " + h.Value));
    }
    private static string Headers(JsonElement owner) => owner.ValueKind == JsonValueKind.Object &&
        owner.TryGetProperty("headers", out var headers) && headers.ValueKind == JsonValueKind.Object
            ? string.Join(Environment.NewLine, headers.EnumerateObject().SelectMany(h => h.Value.ToString().Split('\n')
                .Select(v => h.Name + ": " + v.TrimEnd('\r')))) : "";
    private static bool Flag(JsonElement owner, string name) => owner.ValueKind == JsonValueKind.Object &&
        owner.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.True;
    private static string Text(JsonElement owner, string name) => owner.ValueKind == JsonValueKind.Object &&
        owner.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : "";
    private static double? Number(JsonElement owner, string name) => owner.ValueKind == JsonValueKind.Object &&
        owner.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var number) ? number : null;
}
