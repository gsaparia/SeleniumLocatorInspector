using System.Text;

namespace SeleniumLocatorInspector.Network;

internal static class HttpCapture
{
    static HttpCapture() => Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
    public static List<KeyValuePair<string, string>> Headers(string text, bool validate = false)
    {
        var result = new List<KeyValuePair<string, string>>();
        foreach (var line in text.Replace("\r\n", "\n").Split('\n'))
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            var colon = line.IndexOf(':', line.StartsWith(':') ? 1 : 0);
            if (colon <= 0)
            {
                if (validate) throw new FormatException("Each header must be on its own line: Name: Value");
                continue;
            }
            var name = line[..colon].Trim();
            var value = line[(colon + 1)..].Trim();
            if (validate && (name.Any(c => !char.IsAsciiLetterOrDigit(c) && !"!#$%&'*+-.^_`|~".Contains(c)) || value.Contains('\r') || value.Contains('\0')))
                throw new FormatException("Invalid header: " + name);
            result.Add(new(name, value));
        }
        return result;
    }

    public static string Header(string text, string name) => Headers(text)
        .FirstOrDefault(h => h.Key.Equals(name, StringComparison.OrdinalIgnoreCase)).Value ?? "";

    public static bool IsBinary(CapturedBody body) => body.Bytes != null &&
        body.DisplayText.StartsWith("Binary body (base64):", StringComparison.Ordinal);

    public static CapturedBody Body(byte[] bytes, string contentType)
    {
        if (bytes.Length == 0) return new("(Empty body)", bytes);
        try
        {
            var mime = contentType.Split(';')[0].Trim();
            if (mime.StartsWith("image/", StringComparison.OrdinalIgnoreCase) ||
                mime.StartsWith("audio/", StringComparison.OrdinalIgnoreCase) ||
                mime.StartsWith("video/", StringComparison.OrdinalIgnoreCase) || mime == "application/pdf")
                throw new DecoderFallbackException();
            var charset = System.Text.RegularExpressions.Regex.Match(contentType, "charset\\s*=\\s*[\"']?([^;\\s\"']+)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            var encoding = charset.Success ? Encoding.GetEncoding(charset.Groups[1].Value,
                EncoderFallback.ExceptionFallback, DecoderFallback.ExceptionFallback) : new UTF8Encoding(false, true);
            var text = encoding.GetString(bytes);
            if (text.Any(c => char.IsControl(c) && c is not ('\r' or '\n' or '\t')))
                throw new DecoderFallbackException();
            return new(text, bytes);
        }
        catch (Exception ex) when (ex is ArgumentException or DecoderFallbackException)
        { return new("Binary body (base64):" + Environment.NewLine + Convert.ToBase64String(bytes), bytes); }
    }
}
