namespace SeleniumLocatorInspector.Network;

public sealed record CapturedBody(string DisplayText, byte[]? Bytes);

public sealed record NetworkEntry(
    string Key, string Id, string Url, string Method, string State,
    int? Status, string MimeType, double? DurationMs, double? StartedAt,
    string RequestHeaders, string ResponseHeaders, string Error, string Context);

