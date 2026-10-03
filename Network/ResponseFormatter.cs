using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace SeleniumLocatorInspector.Network;

internal static class ResponseFormatter
{
    private static readonly Regex HtmlTokens = new(
        @"(?is)<!--.*?-->|<script\b[^>]*>.*?</script\s*>|<style\b[^>]*>.*?</style\s*>|<![^>]*>|</?[^>]+>|[^<]+",
        RegexOptions.Compiled);
    private static readonly HashSet<string> VoidTags = new(StringComparer.OrdinalIgnoreCase)
    { "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr" };

    private static readonly Regex CssRule = new(
        @"(?s)(?:^|[;}\s])[.#@a-zA-Z][^{}]{0,200}\{[^{}]*[\w-]+\s*:\s*[^{}]+[;}]",
        RegexOptions.Compiled);
    private static readonly Regex JavaScriptStart = new(
        @"^(?:async\s+)?(?:function\b|class\b|const\b|let\b|var\b|import\b|export\b|\(\s*function\b)",
        RegexOptions.Compiled);

    public static string HeaderType(string headers)
    {
        foreach (var line in headers.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
        {
            var separator = line.IndexOf(':');
            if (separator > 0 && line[..separator].Trim().Equals("Content-Type", StringComparison.OrdinalIgnoreCase))
                return line[(separator + 1)..].Split(';')[0].Trim().ToLowerInvariant();
        }
        return "";
    }

    public static string DetectType(string body, string declaredType, string url)
    {
        var type = declaredType.Split(';')[0].Trim().ToLowerInvariant();
        var path = Uri.TryCreate(url, UriKind.Absolute, out var uri) ? uri.AbsolutePath.ToLowerInvariant() : "";
        if (IsJsonObjectOrArray(body)) return "application/json";
        // Preserve explicit non-generic content types, especially media.
        if (type.Length > 0 && type is not ("text/plain" or "application/octet-stream")) return type;
        if (path.EndsWith(".css")) return "text/css";
        if (path.EndsWith(".js") || path.EndsWith(".mjs")) return "text/javascript";
        if (path.EndsWith(".html") || path.EndsWith(".htm")) return "text/html";
        if (IsUnavailable(body)) return type;
        var sample = body.TrimStart('\uFEFF', ' ', '\t', '\r', '\n');
        if (sample.StartsWith("<") && (sample.StartsWith("<!doctype", StringComparison.OrdinalIgnoreCase) ||
            sample.StartsWith("<html", StringComparison.OrdinalIgnoreCase))) return "text/html";
        if (JavaScriptStart.IsMatch(sample) || sample.StartsWith("!function", StringComparison.Ordinal) ||
            sample.StartsWith("window.", StringComparison.Ordinal) || (sample.Contains("=>") && sample.Contains('{')))
            return "text/javascript";
        if (sample.StartsWith("@media", StringComparison.OrdinalIgnoreCase) ||
            sample.StartsWith("@supports", StringComparison.OrdinalIgnoreCase) ||
            sample.StartsWith("@keyframes", StringComparison.OrdinalIgnoreCase) ||
            sample.StartsWith("@import", StringComparison.OrdinalIgnoreCase) || CssRule.IsMatch(sample))
            return "text/css";
        return type;
    }

    private static bool IsUnavailable(string value) =>
        string.IsNullOrWhiteSpace(value) || value.StartsWith("Body unavailable:", StringComparison.Ordinal) ||
        value.StartsWith("Body pending.", StringComparison.Ordinal) || value.StartsWith("Binary body", StringComparison.Ordinal);

    private static bool IsJsonObjectOrArray(string value)
    {
        if (IsUnavailable(value)) return false;
        var trimmed = value.AsSpan().Trim();
        if (trimmed.Length > 0 && trimmed[0] == '\uFEFF') trimmed = trimmed[1..].TrimStart();
        if (trimmed.Length < 2 || (trimmed[0] != '{' && trimmed[0] != '[')) return false;
        try
        {
            using var document = JsonDocument.Parse(trimmed.ToString());
            return document.RootElement.ValueKind is JsonValueKind.Object or JsonValueKind.Array;
        }
        catch (JsonException) { return false; }
    }

    public static string Format(string text, string mime, string url)
    {
        if (IsUnavailable(text)) return text;
        var type = DetectType(text, mime, url);
        try
        {
            if (type == "application/json" || type.EndsWith("+json", StringComparison.Ordinal))
            {
                using var doc = JsonDocument.Parse(text.TrimStart('\uFEFF'));
                return JsonSerializer.Serialize(doc.RootElement, new JsonSerializerOptions { WriteIndented = true });
            }
            if (type.Contains("html")) return FormatHtml(text);
            if (type.Contains("javascript") || type.Contains("ecmascript")) return FormatBraces(text, false);
            if (type.Contains("css")) return FormatBraces(text, true);
        }
        catch { /* Incomplete content is displayed without changing its captured bytes. */ }
        return text;
    }

    private static string FormatHtml(string html)
    {
        var lines = new List<string>();
        var depth = 0;
        foreach (Match match in HtmlTokens.Matches(html))
        {
            var token = match.Value.Trim();
            if (token.Length == 0) continue;
            var lower = token.ToLowerInvariant();
            if (lower.StartsWith("<script") || lower.StartsWith("<style"))
            {
                var first = token.IndexOf('>');
                var last = token.LastIndexOf('<');
                if (first >= 0 && last > first)
                {
                    Add(token[..(first + 1)]);
                    depth++;
                    var code = FormatBraces(token[(first + 1)..last].Trim(), lower.StartsWith("<style"));
                    foreach (var line in code.Split('\n')) if (!string.IsNullOrWhiteSpace(line)) Add(line.Trim());
                    depth--;
                    Add(token[last..]);
                    continue;
                }
            }
            if (lower.StartsWith("</")) depth = Math.Max(0, depth - 1);
            Add(token);
            if (lower.StartsWith('<') && !lower.StartsWith("</") && !lower.StartsWith("<!") &&
                !lower.EndsWith("/>") && !VoidTags.Contains(TagName(lower))) depth++;
        }
        return lines.Count == 0 ? html : string.Join(Environment.NewLine, lines);

        void Add(string value) => lines.Add(new string(' ', Math.Min(depth, 40) * 2) + value);
    }

    private static string TagName(string token)
    {
        var start = 1;
        var end = start;
        while (end < token.Length && (char.IsLetterOrDigit(token[end]) || token[end] == '-')) end++;
        return token[start..end];
    }

    // Indent braces and semicolons outside quoted strings, comments and JS regexes.
    // This is a display formatter: captured bytes are kept intact for Save.
    private static string FormatBraces(string input, bool css)
    {
        var output = new StringBuilder();
        var depth = 0;
        var quote = '\0';
        var escaped = false;
        var lineComment = false;
        var blockComment = false;
        var regex = false;
        var regexClass = false;
        var prev = '\0';
        var lineStart = true;
        void Append(char c)
        {
            if (lineStart && c is not ('\n' or '\r'))
            {
                output.Append(' ', Math.Min(depth, 40) * 2);
                lineStart = false;
            }
            output.Append(c);
            if (c == '\n') lineStart = true;
        }
        void Break()
        {
            while (output.Length > 0 && output[output.Length - 1] == ' ') output.Length--;
            if (output.Length > 0 && output[output.Length - 1] != '\n') output.Append('\n');
            lineStart = true;
        }
        for (var i = 0; i < input.Length; i++)
        {
            var c = input[i];
            var next = i + 1 < input.Length ? input[i + 1] : '\0';
            if (c == '\r') continue;
            if (quote != '\0' || regex)
            {
                Append(c);
                if (escaped) escaped = false;
                else if (c == '\\') escaped = true;
                else if (regex)
                {
                    if (c == '[') regexClass = true;
                    else if (c == ']') regexClass = false;
                    else if (c == '/' && !regexClass) regex = false;
                }
                else if (c == quote) quote = '\0';
                continue;
            }
            if (lineComment)
            {
                Append(c);
                if (c == '\n') lineComment = false;
                continue;
            }
            if (blockComment)
            {
                Append(c);
                if (c == '*' && next == '/') { Append('/'); i++; blockComment = false; }
                continue;
            }
            if (c == '/' && next == '*') { Append('/'); Append('*'); i++; blockComment = true; continue; }
            if (!css && c == '/' && next == '/') { Append('/'); Append('/'); i++; lineComment = true; continue; }
            if (!css && c == '/' && "=(:,!?[{;".Contains(prev)) { Append(c); regex = true; continue; }
            if (c is '\'' or '"' or '`') { Append(c); quote = c; prev = c; continue; }
            if (char.IsWhiteSpace(c))
            {
                if (!lineStart && output.Length > 0 && output[output.Length - 1] != ' ') Append(' ');
                continue;
            }
            if (c == '{') { Append(c); Break(); depth++; }
            else if (c == '}') { Break(); depth = Math.Max(0, depth - 1); Append(c); Break(); }
            else if (c == ';') { Append(c); Break(); }
            else Append(c);
            prev = c;
        }
        return output.ToString().TrimEnd();
    }
}
