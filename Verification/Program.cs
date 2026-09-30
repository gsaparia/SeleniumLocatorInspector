using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using SeleniumLocatorInspector.Network;

static void Check(bool ok, string name)
{
    if (!ok) throw new Exception("FAILED: " + name);
    Console.WriteLine("PASS: " + name);
}

var headers = HttpCapture.Headers("X-Test: one\r\nX-Test: two\r\n:authority: localhost");
Check(headers.Count == 3 && headers[2].Key == ":authority", "Repeated and pseudo headers parsed");
try { HttpCapture.Headers("bad header: value", true); throw new Exception("Validation did not reject invalid header"); }
catch (FormatException) { Console.WriteLine("PASS: Header validation"); }
var binary = HttpCapture.Body([0, 255, 1], "application/octet-stream");
Check(HttpCapture.IsBinary(binary), "Binary preservation");
var entry = new NetworkEntry("one", "one", "https://example.test/path?a=1&a=2#fragment", "POST", "Complete",
    201, "application/json", 24, 1700000000000, "Content-Type: text/plain\r\nX-Test: one\r\nX-Test: two",
    "Content-Type: text/plain", "", "test");
var json = new CapturedBody("{\"ok\":true}", Encoding.UTF8.GetBytes("{\"ok\":true}"));
var file = Path.Combine(Path.GetTempPath(), Guid.NewGuid() + ".har");
try
{
    await HarExporter.SaveAsync(file, [(entry, [json, json]), (entry with { Key = "two" }, [binary, binary]),
        (entry with { Key = "three", Status = null, State = "Failed" }, [new("not collected", null), new("not collected", null)])]);
    using var har = JsonDocument.Parse(await File.ReadAllTextAsync(file));
    var entries = har.RootElement.GetProperty("log").GetProperty("entries");
    Check(entries.GetArrayLength() == 3, "HAR includes every row");
    var request = entries[0].GetProperty("request");
    Check(!request.GetProperty("url").GetString()!.Contains('#') && request.GetProperty("queryString").GetArrayLength() == 2,
        "HAR query parameters and fragment handling");
    Check(entries[0].GetProperty("response").GetProperty("content").GetProperty("mimeType").GetString() == "application/json",
        "HAR JSON inference");
    var content = entries[1].GetProperty("response").GetProperty("content");
    Check(Convert.FromBase64String(content.GetProperty("text").GetString()!).SequenceEqual(binary.Bytes!) &&
        content.GetProperty("encoding").GetString() == "base64", "HAR binary round trip");
    Check(!entries[2].GetProperty("response").GetProperty("content").TryGetProperty("text", out _),
        "HAR missing bodies never exported as payload");
    var imported = await HarImporter.LoadAsync(file);
    Check(imported.Count == 3 && imported[0].Entry.Status == 201 && imported[0].Bodies[1].DisplayText == json.DisplayText,
        "HAR import request/response JSON round trip");
    Check(imported[1].Bodies[1].Bytes!.SequenceEqual(binary.Bytes!) && HttpCapture.IsBinary(imported[1].Bodies[1]),
        "HAR import base64 media round trip");
    Check(imported[2].Bodies[1].Bytes == null && imported[2].Entry.State == "Failed", "HAR import missing bodies and failed rows");
    Check(imported[0].Entry.Key != (await HarImporter.LoadAsync(file))[0].Entry.Key, "Repeated HAR imports have independent row IDs");
    await File.WriteAllTextAsync(file, "{\"log\":{\"entries\":{}}}");
    try { await HarImporter.LoadAsync(file); throw new Exception("Invalid HAR accepted"); }
    catch (InvalidDataException) { Console.WriteLine("PASS: Invalid HAR rejected"); }

}
finally { File.Delete(file); }

// The only request sent by this verification targets its own local test server.
var listener = new TcpListener(IPAddress.Loopback, 0);
listener.Start();
var port = ((IPEndPoint)listener.LocalEndpoint).Port;
var server = Task.Run(async () =>
{
    using var connection = await listener.AcceptTcpClientAsync();
    await using var stream = connection.GetStream();
    var bytes = new List<byte>();
    var one = new byte[1];
    while (await stream.ReadAsync(one) == 1)
    {
        bytes.Add(one[0]);
        if (bytes.Count >= 4 && bytes.TakeLast(4).SequenceEqual(new byte[] { 13, 10, 13, 10 })) break;
    }
    var requestHeaders = Encoding.ASCII.GetString(bytes.ToArray());
    var size = int.Parse(HttpCapture.Header(requestHeaders, "Content-Length"));
    var body = new byte[size];
    await stream.ReadExactlyAsync(body);
    Check(requestHeaders.StartsWith("POST /replay ") && HttpCapture.Header(requestHeaders, "X-Edited") == "yes",
        "Edited method, URL and headers reach server");
    Check(Encoding.UTF8.GetString(body) == "edited body", "Edited body and recalculated Content-Length reach server");
    var response = Encoding.ASCII.GetBytes("HTTP/1.1 302 Found\r\nLocation: /must-not-follow\r\nContent-Type: application/json\r\nContent-Length: 11\r\nConnection: close\r\n\r\n{\"ok\":true}");
    await stream.WriteAsync(response);
});
try
{
    var replay = await RequestReplay.SendAsync("POST", "http://127.0.0.1:" + port + "/replay",
        "X-Edited: yes\r\nContent-Type: text/plain\r\nContent-Length: 999", Encoding.UTF8.GetBytes("edited body"), CancellationToken.None);
    await server.WaitAsync(TimeSpan.FromSeconds(10));
    Check(replay.Entry.Status == 302 && replay.Entry.State == "Complete", "Redirect response retained without following it");
    Check(replay.Bodies[1].DisplayText == "{\"ok\":true}", "Replay response captured");
    using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
    var failure = await RequestReplay.SendAsync("GET", "http://127.0.0.1:" + port + "/cancel", "", null, cancelled.Token);
    Check(failure.Entry.State == "Failed" && failure.Bodies[1].Bytes == null, "Cancelled replay records failure without fake payload");
}
finally { listener.Stop(); }

// Pure event fixtures validate redirect clocks and wire headers that arrive out of order.
var capture = new CdpCaptureState();
IReadOnlyList<NetworkEntry> Event(string json)
{
    using var doc = JsonDocument.Parse(json);
    return capture.Process(doc.RootElement);
}
Event("""{"method":"Network.requestWillBeSentExtraInfo","params":{"requestId":"r","headers":{"Cookie":"first=1"}}}""");
var first = Event("""{"method":"Network.requestWillBeSent","params":{"requestId":"r","timestamp":10,"wallTime":1700000000,"request":{"url":"https://example.test/a","method":"GET","headers":{}}}}""")[0];
var redirected = Event("""{"method":"Network.requestWillBeSent","params":{"requestId":"r","timestamp":10.25,"wallTime":1700000000.25,"redirectHasExtraInfo":true,"redirectResponse":{"status":302,"mimeType":"text/html","headers":{"Location":"/b"}},"request":{"url":"https://example.test/b","method":"POST","headers":{"Content-Type":"application/json"},"hasPostData":true,"postData":"{\"edited\":true}"}}}""");
Check(redirected.Any(e => e.Key == first.Key && e.DurationMs == 250 && e.Status == 302 && e.RequestHeaders.Contains("first=1")),
    "CDP redirect duration and early request headers belong to first hop");
var second = redirected.Single(e => e.Url.EndsWith("/b"));
Event("""{"method":"Network.responseReceivedExtraInfo","params":{"requestId":"r","statusCode":302,"headers":{"Set-Cookie":"first=1"}}}""");
Event("""{"method":"Network.requestWillBeSentExtraInfo","params":{"requestId":"r","headers":{"Cookie":"second=2"}}}""");
Event("""{"method":"Network.responseReceivedExtraInfo","params":{"requestId":"r","statusCode":201,"headers":{"X-Wire":"second"}}}""");
var receiving = Event("""{"method":"Network.responseReceived","params":{"requestId":"r","hasExtraInfo":true,"response":{"status":201,"mimeType":"application/json","headers":{}}}}""").Single();
Check(receiving.Key == second.Key && receiving.RequestHeaders.Contains("second=2") && !receiving.RequestHeaders.Contains("first=1") &&
    receiving.ResponseHeaders.Contains("X-Wire: second") && !receiving.ResponseHeaders.Contains("Set-Cookie"), "CDP out-of-order headers isolated by redirect hop");
var completed = Event("""{"method":"Network.loadingFinished","params":{"requestId":"r","timestamp":10.75}}""").Single();
Check(completed.DurationMs == 500 && completed.State == "Complete" && capture.IsCurrent(completed) && !capture.IsCurrent(first),
    "CDP completion clock and redirect body ownership");
Check(capture.TryRequestBody(second, out var postBody) && postBody!.DisplayText == "{\"edited\":true}", "CDP POST body capture");
// Completed rows must survive a stop even if none were selected beforehand.
var retained = new Dictionary<string, CapturedBody[]>();
var connectionOpen = true;
var gate = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
var snapshots = Enumerable.Range(0, 10).Select(i => entry with { Key = "retain:" + i }).ToArray();
var retention = NetworkBodyRetention.PreserveAsync(snapshots,
    async row =>
    {
        await gate.Task;
        Check(connectionOpen, "Body read occurs before recorder is closed");
        return new[] { json, row.Key.EndsWith("0") ? binary : json };
    },
    (row, bodies) => retained[row.Key] = bodies);
Check(!retention.IsCompleted && retained.Count == 0, "Stop waits for unfinished body reads");
gate.SetResult(true);
await retention;
connectionOpen = false; // The form closes its recorder only after PreserveAsync returns.
Check(retained.Count == 10 && retained["retain:1"][1].DisplayText == json.DisplayText,
    "Every unselected completed response remains available after stop");
Check(retained["retain:0"][1].Bytes!.SequenceEqual(binary.Bytes!), "Media bytes remain available after stop");
file = Path.Combine(Path.GetTempPath(), Guid.NewGuid() + ".har");
try
{
    await HarExporter.SaveAsync(file, snapshots.Select(row => (row, retained[row.Key])).ToArray());
    var reloaded = await HarImporter.LoadAsync(file);
    Check(reloaded.Count == 10 && reloaded[0].Bodies[1].Bytes!.SequenceEqual(binary.Bytes!), "Post-stop HAR export retains captured bodies");
}
finally { File.Delete(file); }
Console.WriteLine("All network tool checks passed.");
