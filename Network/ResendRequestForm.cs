using System.Drawing;
using System.Text;
using System.Windows.Forms;

namespace SeleniumLocatorInspector.Network;

internal sealed class ResendRequestForm : Form
{
    private readonly TextBox _method = new() { Text = "GET", Dock = DockStyle.Fill };
    private readonly TextBox _url = new() { Dock = DockStyle.Fill };
    private readonly TextBox _headers = Editor();
    private readonly TextBox _body = Editor();
    private readonly CheckBox _base64 = new() { Text = "Body is base64", AutoSize = true };
    private readonly CheckBox _includeBody = new() { Text = "Include request body", AutoSize = true };
    private readonly Label _status = new() { AutoSize = true };
    private readonly Button _send = new() { Text = "Send request", AutoSize = true };
    private readonly Button _cancel = new() { Text = "Cancel request", AutoSize = true, Enabled = false };
    private readonly CapturedBody _original;
    private bool _bodyEdited;
    private CancellationTokenSource? _sending;
    public event Action<ReplayResult>? RequestSent;

    private static TextBox Editor() => new() { Multiline = true, Dock = DockStyle.Fill,
        ScrollBars = ScrollBars.Both, WordWrap = false, MaxLength = int.MaxValue, Font = new Font(FontFamily.GenericMonospace, 9) };

    public ResendRequestForm(NetworkEntry entry, CapturedBody body)
    {
        _original = body;
        Text = "Resend Request";
        Size = new Size(1000, 720);
        MinimumSize = new Size(700, 520);
        StartPosition = FormStartPosition.CenterParent;
        _method.Text = entry.Method;
        _url.Text = entry.Url;
        // HTTP/2 pseudo headers have no equivalent editable HTTP/1 header.
        _headers.Text = string.Join(Environment.NewLine, HttpCapture.Headers(entry.RequestHeaders)
            .Where(h => !h.Key.StartsWith(':')).Select(h => h.Key + ": " + h.Value));
        _base64.Checked = HttpCapture.IsBinary(body);
        _includeBody.Checked = body.Bytes is { Length: > 0 };
        _body.Text = body.Bytes is not { Length: > 0 } ? "" : _base64.Checked
            ? Convert.ToBase64String(body.Bytes) : body.DisplayText;
        _body.TextChanged += (_, _) => _bodyEdited = true;
        _base64.CheckedChanged += (_, _) => _bodyEdited = true;
        _includeBody.CheckedChanged += (_, _) => _body.Enabled = _includeBody.Checked;
        _body.Enabled = _includeBody.Checked;
        _status.Text = body.Bytes == null ? "Original body unavailable. Supply a body if the request requires one." : "Ready to send.";

        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 5, Padding = new Padding(8) };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 58));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 45));
        var address = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2 };
        address.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 100));
        address.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        address.Controls.Add(_method, 0, 0); address.Controls.Add(_url, 1, 0);
        layout.Controls.Add(address, 0, 0);
        layout.Controls.Add(new Label { Dock = DockStyle.Fill, Text =
            "Sends from the desktop app using the headers below. Cookies must be included in the Cookie header.\r\nContent-Length and Transfer-Encoding are recalculated. Redirects are shown without following them." }, 0, 1);
        var tabs = new TabControl { Dock = DockStyle.Fill };
        var headersTab = new TabPage("Request headers"); headersTab.Controls.Add(_headers);
        var bodyTab = new TabPage("Request body"); bodyTab.Controls.Add(_body);
        tabs.TabPages.Add(headersTab); tabs.TabPages.Add(bodyTab);
        layout.Controls.Add(tabs, 0, 2);
        var options = new FlowLayoutPanel { Dock = DockStyle.Fill };
        options.Controls.Add(_includeBody); options.Controls.Add(_base64);
        layout.Controls.Add(options, 0, 3);
        var actions = new FlowLayoutPanel { Dock = DockStyle.Fill };
        actions.Controls.Add(_send); actions.Controls.Add(_cancel); actions.Controls.Add(_status);
        layout.Controls.Add(actions, 0, 4);
        Controls.Add(layout);
        _send.Click += async (_, _) => await SendAsync();
        _cancel.Click += (_, _) => _sending?.Cancel();
        FormClosing += (_, e) =>
        {
            if (_sending == null) return;
            _sending.Cancel();
            e.Cancel = true; // Retain the dialog until the cancelled result reaches the grid.
        };
    }

    private async Task SendAsync()
    {
        try
        {
            byte[]? bytes = null;
            if (_includeBody.Checked)
            {
                if (!_bodyEdited && _original.Bytes != null) bytes = _original.Bytes;
                else if (_base64.Checked) bytes = Convert.FromBase64String(_body.Text);
                else
                {
                    var contentType = HttpCapture.Header(_headers.Text, "Content-Type");
                    var charset = System.Text.RegularExpressions.Regex.Match(contentType,
                        "charset\\s*=\\s*[\"']?([^;\\s\"']+)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                    var encoding = charset.Success ? Encoding.GetEncoding(charset.Groups[1].Value,
                        EncoderFallback.ExceptionFallback, DecoderFallback.ExceptionFallback) : new UTF8Encoding(false, true);
                    bytes = encoding.GetBytes(_body.Text);
                    if (HttpCapture.Header(_headers.Text, "Content-Encoding").Length > 0)
                        throw new FormatException("Remove Content-Encoding before sending an edited text body, or provide encoded bytes in base64.");
                }
            }
            _sending = new CancellationTokenSource();
            _send.Enabled = false; _cancel.Enabled = true;
            _method.Enabled = _url.Enabled = _headers.Enabled = _body.Enabled = _base64.Enabled = _includeBody.Enabled = false;
            _status.Text = "Sending…";
            var result = await RequestReplay.SendAsync(_method.Text, _url.Text, _headers.Text, bytes, _sending.Token);
            if (IsDisposed) return;
            RequestSent?.Invoke(result);
            _status.Text = result.Entry.Error.Length > 0 ? result.Entry.Error : "Response: " + result.Entry.Status + " — added to Network Traffic.";
        }
        catch (Exception ex)
        {
            if (!IsDisposed) MessageBox.Show(this, ex.Message, "Resend Request", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            _sending?.Dispose(); _sending = null;
            if (!IsDisposed)
            {
                _send.Enabled = true; _cancel.Enabled = false;
                _method.Enabled = _url.Enabled = _headers.Enabled = _base64.Enabled = _includeBody.Enabled = true;
                _body.Enabled = _includeBody.Checked;
            }
        }
    }
}
