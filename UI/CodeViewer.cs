using System.Runtime.InteropServices;
using System.Text.RegularExpressions;

namespace SeleniumLocatorInspector.UI;

/// <summary>Read-only body/header viewer. Colours affect display only, never captured bytes.</summary>
public sealed class CodeViewer : RichTextBox
{
    private bool _colouring;
    private static readonly Regex Tokens = new(
        "(?<comment>/\\*[\\s\\S]*?\\*/|^[ \\t]*//[^\\r\\n]*|<!--[\\s\\S]*?-->)|" +
        "(?<string>\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*')|" +
        "(?<keyword>\\b(?:true|false|null|undefined|return|const|let|var|function|if|else|class|new|async|await)\\b)|" +
        "(?<number>(?<![\\w])[-+]?\\b\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?\\b)|" +
        "(?<tag></?[A-Za-z][^>\\r\\n]*>)",
        RegexOptions.Multiline, TimeSpan.FromMilliseconds(100));

    public CodeViewer()
    {
        ReadOnly = true;
        DetectUrls = false;
        WordWrap = false;
        MaxLength = int.MaxValue;
        ScrollBars = RichTextBoxScrollBars.Both;
        BorderStyle = BorderStyle.None;
        AppTheme.Editor(this);
        AppTheme.Changed += ThemeChanged;
        Disposed += (_, _) => AppTheme.Changed -= ThemeChanged;
    }

    protected override void OnTextChanged(EventArgs e)
    {
        base.OnTextChanged(e);
        ColourTokens();
    }
    private void ThemeChanged(object? sender, EventArgs e) => ColourTokens();

    private void ColourTokens()
    {
        if (_colouring || IsDisposed) return;
        _colouring = true;
        var start = SelectionStart;
        var length = SelectionLength;
        var hasHandle = IsHandleCreated;
        var firstLine = hasHandle ? (int)SendMessage(Handle, 0x00CE, IntPtr.Zero, IntPtr.Zero) : 0;
        if (hasHandle) SendMessage(Handle, 0x000B, IntPtr.Zero, IntPtr.Zero);
        try
        {
            SelectAll();
            SelectionColor = AppTheme.Palette.Text;
            var text = Text;
            // Bound UI work on very large captures; the complete body is still displayed.
            if (text.Length > 150_000) text = text[..150_000];
            foreach (Match token in Tokens.Matches(text))
            {
                Select(token.Index, token.Length);
                var dark = AppTheme.Mode == ThemeMode.Dark;
                SelectionColor = token.Groups["comment"].Success ? AppTheme.Palette.Muted
                    : token.Groups["string"].Success ? ColorTranslator.FromHtml(dark ? "#B8E6A3" : "#087C58")
                    : token.Groups["number"].Success ? ColorTranslator.FromHtml(dark ? "#D8B4FE" : "#7C3AED")
                    : AppTheme.Palette.Accent;
            }
        }
        catch (RegexMatchTimeoutException) { /* Keep readable plain text for pathological input. */ }
        finally
        {
            Select(Math.Min(start, TextLength), Math.Min(length, Math.Max(0, TextLength - start)));
            if (hasHandle)
            {
                var current = (int)SendMessage(Handle, 0x00CE, IntPtr.Zero, IntPtr.Zero);
                SendMessage(Handle, 0x00B6, IntPtr.Zero, (IntPtr)(firstLine - current));
                SendMessage(Handle, 0x000B, (IntPtr)1, IntPtr.Zero);
                Invalidate();
            }
            _colouring = false;
        }
    }

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern IntPtr SendMessage(IntPtr handle, int message, IntPtr wParam, IntPtr lParam);
}
