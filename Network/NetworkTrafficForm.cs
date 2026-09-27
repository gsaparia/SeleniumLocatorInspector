using System.Drawing;
using System.Windows.Forms;
using OpenQA.Selenium;
using Microsoft.Web.WebView2.WinForms;

namespace SeleniumLocatorInspector.Network;

public sealed class NetworkTrafficForm : Form
{
    private readonly IWebDriver _driver;
    private NetworkRecorder? _recorder;
    private readonly DataGridView _grid = new();
    private readonly TabControl _detailTabs = new() { Dock = DockStyle.Fill };
    private readonly WebView2 _mediaPreview = new() { Dock = DockStyle.Fill, Visible = false };
    private readonly Button _saveMedia = new() { Text = "Save media…", AutoSize = true, Enabled = false };
    private readonly List<string> _previewFiles = new();
    private readonly string _previewDirectory = Path.Combine(Path.GetTempPath(), "SeleniumLocatorInspector", Guid.NewGuid().ToString("N"));
    private readonly TextBox _requestHeaders = CreateDetailBox();
    private readonly TextBox _requestBody = CreateDetailBox();
    private readonly TextBox _responseHeaders = CreateDetailBox();
    private readonly TextBox _responseBody = CreateDetailBox();
    private int _selectionVersion;

    private static TextBox CreateDetailBox() => new()
    {
        ReadOnly = true, Multiline = true, ScrollBars = ScrollBars.Both,
        WordWrap = false, Dock = DockStyle.Fill,
        Font = new Font(FontFamily.GenericMonospace, 9)
    };
    private readonly Label _state = new() { AutoSize = true, Text = "Not recording" };
    private readonly Button _start = new() { Text = "Start recording", AutoSize = true };
    private readonly Button _stop = new() { Text = "Stop recording", AutoSize = true, Enabled = false };
    private readonly Dictionary<string, int> _rows = new();
    private readonly Dictionary<string, NetworkEntry> _items = new();
    private readonly Dictionary<string, CapturedBody[]> _bodyCache = new();
    private readonly Dictionary<string, Task<CapturedBody[]>> _bodyFetches = new();

    public NetworkTrafficForm(IWebDriver driver)
    {
        _driver = driver;
        Text = "Network Traffic";
        Width = 1200;
        Height = 750;
        StartPosition = FormStartPosition.CenterParent;

        var bar = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 44, Padding = new Padding(6) };
        var reload = new Button { Text = "Reload page", AutoSize = true };
        var clear = new Button { Text = "Clear", AutoSize = true };
        var copy = new Button { Text = "Copy URL", AutoSize = true };
        bar.Controls.AddRange([_start, _stop, reload, clear, copy, _state]);
        _start.Click += async (_, _) => await StartRecordingAsync();
        _stop.Click += async (_, _) => await StopRecordingAsync();
        reload.Click += (_, _) => { try { _driver.Navigate().Refresh(); } catch (Exception ex) { ShowError(ex); } };
        clear.Click += (_, _) => { _rows.Clear(); _items.Clear(); _bodyCache.Clear(); _bodyFetches.Clear(); _grid.Rows.Clear(); ClearDetails(); };
        copy.Click += (_, _) => { if (Selected() is { } entry) Clipboard.SetText(entry.Url); };

        _grid.Dock = DockStyle.Fill;
        _grid.ReadOnly = true;
        _grid.AllowUserToAddRows = false;
        _grid.RowHeadersVisible = false;
        _grid.MultiSelect = false;
        _grid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        _grid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.None;
        _grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Method", Width = 75 });
        _grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Status", Width = 70 });
        _grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "State", Width = 90 });
        _grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Request type", Width = 140 });
        _grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Response type", Width = 140 });
        _grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Time (ms)", Width = 85 });
        _grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "URL", AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill });
        _grid.SelectionChanged += (_, _) => _ = ShowDetailsAsync();

        AddTab("Request headers", _requestHeaders);
        AddTab("Request body", _requestBody);
        AddTab("Response Header", _responseHeaders);
        AddResponseBodyTab();
        _saveMedia.Click += SaveMedia;
        var split = new SplitContainer
        {
            Dock = DockStyle.Fill, Orientation = Orientation.Horizontal,
            Size = new Size(1100, 650), SplitterDistance = 300,
            Panel1MinSize = 170, Panel2MinSize = 170
        };
        // Both panels fill the width. Each receives a share of available height
        // as the window changes size; the splitter remains draggable.
        double gridShare = 0.46;
        split.SplitterMoved += (_, _) =>
        {
            if (split.Height > 0) gridShare = (double)split.SplitterDistance / split.Height;
        };
        split.SizeChanged += (_, _) =>
        {
            var available = split.ClientSize.Height - split.SplitterWidth;
            if (available < split.Panel1MinSize + split.Panel2MinSize) return;
            split.SplitterDistance = Math.Clamp((int)(available * gridShare),
                split.Panel1MinSize, available - split.Panel2MinSize);
        };
        split.Panel1.Controls.Add(_grid);
        split.Panel2.Controls.Add(_detailTabs);
        Controls.Add(split);
        Controls.Add(bar);
        MinimumSize = new Size(850, 540);
        FormClosed += async (_, _) =>
        {
            await StopRecordingAsync();
            _mediaPreview.Dispose();
            foreach (var file in _previewFiles) { try { File.Delete(file); } catch { } }
            try { Directory.Delete(_previewDirectory); } catch { }
        };
    }

    public async Task StartRecordingAsync()
    {
        if (_recorder != null) return;
        _start.Enabled = false;
        _state.Text = "Connecting…";
        var recorder = new NetworkRecorder();
        recorder.Updated += entry =>
        {
            if (!IsHandleCreated || IsDisposed) return;
            try { BeginInvoke(() => UpdateRow(entry)); } catch (InvalidOperationException) { }
        };
        recorder.Disconnected += message =>
        {
            if (!IsHandleCreated || IsDisposed) return;
            try { BeginInvoke(() => { _state.Text = "Disconnected: " + message; _stop.Enabled = false; _ = StopRecordingAsync(); }); }
            catch (InvalidOperationException) { }
        };
        try
        {
            await recorder.StartAsync(_driver);
            if (IsDisposed) { await recorder.DisposeAsync(); return; }
            _recorder = recorder;
            _state.Text = "Recording future requests";
            _stop.Enabled = true;
        }
        catch (Exception ex)
        {
            await recorder.DisposeAsync();
            if (!IsDisposed) { _state.Text = "Not recording"; ShowError(ex); }
        }
        finally { if (!IsDisposed) _start.Enabled = _recorder == null; }
    }

    private async Task StopRecordingAsync()
    {
        var recorder = _recorder;
        _recorder = null;
        if (recorder != null) await recorder.DisposeAsync();
        if (!IsDisposed) { _start.Enabled = true; _stop.Enabled = false; _state.Text = "Stopped"; }
    }

    private void UpdateRow(NetworkEntry entry)
    {
        if (IsDisposed) return;
        _items[entry.Key] = entry;
        if (!_rows.TryGetValue(entry.Key, out var index))
        {
            index = _grid.Rows.Add();
            _grid.Rows[index].Tag = entry.Key;
            _rows[entry.Key] = index;
        }
        var row = _grid.Rows[index];
        row.SetValues(entry.Method, entry.Status?.ToString() ?? "", entry.State,
            "", "", entry.DurationMs?.ToString("0") ?? "", entry.Url);
        UpdateTypeCells(entry);
        var requestType = ResponseFormatter.HeaderType(entry.RequestHeaders);
        var requestHasBody = entry.Method is "POST" or "PUT" or "PATCH";
        if (entry.State == "Complete" &&
            (IsGenericType(entry.MimeType) || (requestHasBody && IsGenericType(requestType))))
            _ = FetchBodiesAsync(entry);
        var red = entry.State == "Failed" || (entry.Status.HasValue && entry.Status.Value != 200);
        row.DefaultCellStyle.ForeColor = red ? Color.Red : Color.Empty;
        row.DefaultCellStyle.SelectionForeColor = red ? Color.Red : Color.Empty;
        row.DefaultCellStyle.SelectionBackColor = red ? Color.MistyRose : Color.Empty;
        // Keep the status cell red even when row selection themes override a
        // DataGridViewRow's inherited foreground color.
        foreach (DataGridViewCell cell in row.Cells)
        {
            cell.Style.ForeColor = red ? Color.Red : Color.Empty;
            cell.Style.SelectionForeColor = red ? Color.Red : Color.Empty;
            cell.Style.SelectionBackColor = red ? Color.MistyRose : Color.Empty;
        }
        if (_grid.CurrentRow == row) _ = ShowDetailsAsync();
    }

    private static bool IsGenericType(string type) =>
        string.IsNullOrWhiteSpace(type) || type.StartsWith("text/plain", StringComparison.OrdinalIgnoreCase) ||
        type.StartsWith("application/octet-stream", StringComparison.OrdinalIgnoreCase);

    private void UpdateTypeCells(NetworkEntry entry)
    {
        if (!_rows.TryGetValue(entry.Key, out var index) || index >= _grid.Rows.Count) return;
        _bodyCache.TryGetValue(entry.Key, out var bodies);
        var declaredRequest = ResponseFormatter.HeaderType(entry.RequestHeaders);
        var declaredResponse = ResponseFormatter.HeaderType(entry.ResponseHeaders);
        _grid.Rows[index].Cells[3].Value = ResponseFormatter.DetectType(
            bodies?[0].DisplayText ?? "", declaredRequest, "");
        _grid.Rows[index].Cells[4].Value = ResponseFormatter.DetectType(
            bodies?[1].DisplayText ?? "", declaredResponse.Length > 0 ? declaredResponse : entry.MimeType, entry.Url);
    }

    private Task<CapturedBody[]> FetchBodiesAsync(NetworkEntry entry)
    {
        if (_bodyCache.TryGetValue(entry.Key, out var cached)) return Task.FromResult(cached);
        if (_bodyFetches.TryGetValue(entry.Key, out var existing)) return existing;
        var recorder = _recorder;
        if (recorder == null) return Task.FromResult(new[] {
            new CapturedBody("Body unavailable: recording has stopped.", null),
            new CapturedBody("Body unavailable: recording has stopped.", null) });
        var fetch = Task.WhenAll(recorder.GetBodyAsync(entry, "request"),
            recorder.GetBodyAsync(entry, "response"));
        _bodyFetches[entry.Key] = fetch;
        _ = FinishBodyFetchAsync(entry, fetch);
        return fetch;
    }

    private async Task FinishBodyFetchAsync(NetworkEntry entry, Task<CapturedBody[]> fetch)
    {
        try
        {
            var bodies = await fetch;
            if (IsDisposed || !_items.ContainsKey(entry.Key)) return;
            if (entry.State is "Complete" or "Failed") _bodyCache[entry.Key] = bodies;
            UpdateTypeCells(_items[entry.Key]);
        }
        catch { /* A closing browser may end an in-flight body query. */ }
        finally { _bodyFetches.Remove(entry.Key); }
    }

    private NetworkEntry? Selected() =>
        _grid.CurrentRow?.Tag is string key && _items.TryGetValue(key, out var entry) ? entry : null;

    private void AddTab(string title, TextBox content)
    {
        var tab = new TabPage(title);
        tab.Controls.Add(content);
        _detailTabs.TabPages.Add(tab);
    }

    private void ClearDetails()
    {
        ++_selectionVersion;
        _mediaPreview.Visible = false;
        _saveMedia.Enabled = false;
        _requestHeaders.Clear();
        _requestBody.Clear();
        _responseHeaders.Clear();
        _responseBody.Clear();
    }

    private async Task ShowDetailsAsync()
    {
        var version = ++_selectionVersion;
        var item = Selected();
        if (item == null) { ClearDetails(); return; }
        _mediaPreview.Visible = false;
        _saveMedia.Enabled = false;
        _requestHeaders.Text = item.RequestHeaders.Length > 0 ? item.RequestHeaders : "(No request headers available)";
        _responseHeaders.Text = item.ResponseHeaders.Length > 0 ? item.ResponseHeaders :
            item.State == "Failed" ? "(Request failed before a response)" : "(No response headers available yet)";
        if (_bodyCache.TryGetValue(item.Key, out var cached))
        {
            _requestBody.Text = ResponseFormatter.Format(cached[0].DisplayText,
                ResponseFormatter.HeaderType(item.RequestHeaders), "");
            _ = DisplayResponseAsync(item, cached[1], version);
            return;
        }
        _requestBody.Text = "Loading request body…";
        _responseBody.Text = "Loading response body…";
        var recorder = _recorder;
        if (recorder == null)
        {
            _requestBody.Text = "Body unavailable: recording has stopped.";
            _responseBody.Text = "Body unavailable: recording has stopped.";
            return;
        }
        var bodies = await FetchBodiesAsync(item);
        if (IsDisposed || version != _selectionVersion || Selected()?.Key != item.Key) return;
        _requestBody.Text = ResponseFormatter.Format(bodies[0].DisplayText,
            ResponseFormatter.HeaderType(item.RequestHeaders), "");
        await DisplayResponseAsync(item, bodies[1], version);
    }

    private void AddResponseBodyTab()
    {
        var page = new TabPage("Response body");
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 2 };
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        var actions = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft };
        actions.Controls.Add(_saveMedia);
        var content = new Panel { Dock = DockStyle.Fill };
        content.Controls.Add(_responseBody);
        content.Controls.Add(_mediaPreview);
        layout.Controls.Add(actions, 0, 0);
        layout.Controls.Add(content, 0, 1);
        page.Controls.Add(layout);
        _detailTabs.TabPages.Add(page);
    }

    private static string MediaExtension(NetworkEntry item)
    {
        var mime = item.MimeType.Split(';')[0].Trim().ToLowerInvariant();
        var ext = mime switch
        {
            "image/png" => ".png", "image/jpeg" => ".jpg", "image/gif" => ".gif",
            "image/webp" => ".webp", "image/bmp" => ".bmp",
            "audio/mpeg" => ".mp3", "audio/mp4" => ".m4a", "audio/ogg" => ".ogg",
            "audio/wav" or "audio/x-wav" => ".wav", "audio/webm" => ".webm",
            "video/mp4" => ".mp4", "video/webm" => ".webm", "video/ogg" => ".ogv",
            "application/pdf" => ".pdf", _ => ""
        };
        if (ext.Length > 0) return ext;
        var path = Uri.TryCreate(item.Url, UriKind.Absolute, out var url) ? url.AbsolutePath : "";
        ext = Path.GetExtension(path).ToLowerInvariant();
        return ext is ".png" or ".jpg" or ".jpeg" or ".gif" or ".webp" or ".bmp"
            or ".mp3" or ".m4a" or ".ogg" or ".wav" or ".mp4" or ".webm" or ".ogv" or ".pdf" ? ext : "";
    }

    private async Task DisplayResponseAsync(NetworkEntry item, CapturedBody body, int version)
    {
        if (IsDisposed || version != _selectionVersion) return;
        var ext = MediaExtension(item);
        _saveMedia.Enabled = ext.Length > 0 && body.Bytes != null;
        if (ext.Length == 0 || body.Bytes == null)
        {
            _mediaPreview.Visible = false;
            var responseType = ResponseFormatter.HeaderType(item.ResponseHeaders);
            _responseBody.Text = ResponseFormatter.Format(body.DisplayText,
                responseType.Length > 0 ? responseType : item.MimeType, item.Url);
            return;
        }
        _responseBody.Text = "Media preview unavailable. You can save the captured body above.";
        try
        {
            Directory.CreateDirectory(_previewDirectory);
            var path = Path.Combine(_previewDirectory, Guid.NewGuid().ToString("N") + ext);
            await File.WriteAllBytesAsync(path, body.Bytes);
            _previewFiles.Add(path);
            if (IsDisposed || version != _selectionVersion || Selected()?.Key != item.Key) return;
            _mediaPreview.Visible = true;
            _mediaPreview.BringToFront();
            await _mediaPreview.EnsureCoreWebView2Async();
            if (IsDisposed || version != _selectionVersion || Selected()?.Key != item.Key) return;
            _mediaPreview.Source = new Uri(path);
            _mediaPreview.Visible = true;
            _mediaPreview.BringToFront();
        }
        catch (Exception ex)
        {
            if (IsDisposed || version != _selectionVersion) return;
            _mediaPreview.Visible = false;
            _responseBody.Text = "Media preview unavailable: " + ex.Message +
                Environment.NewLine + "Use Save media to keep the captured response.";
        }
    }

    private void SaveMedia(object? sender, EventArgs e)
    {
        var item = Selected();
        if (item == null || !_bodyCache.TryGetValue(item.Key, out var bodies) ||
            bodies[1].Bytes == null) return;
        var ext = MediaExtension(item);
        if (ext.Length == 0) return;
        var original = Uri.TryCreate(item.Url, UriKind.Absolute, out var uri)
            ? Path.GetFileName(uri.AbsolutePath) : "";
        var saveName = string.IsNullOrWhiteSpace(original) ? "response" + ext : original;
        if (!string.Equals(Path.GetExtension(saveName), ext, StringComparison.OrdinalIgnoreCase))
            saveName = Path.GetFileNameWithoutExtension(saveName) + ext;
        using var dialog = new SaveFileDialog
        {
            FileName = saveName,
            DefaultExt = ext.TrimStart('.'),
            Filter = "Media files|*" + ext + "|All files|*.*"
        };
        if (dialog.ShowDialog(this) != DialogResult.OK) return;
        try { File.WriteAllBytes(dialog.FileName, bodies[1].Bytes); }
        catch (Exception ex) { ShowError(ex); }
    }

    private void ShowError(Exception exception) =>
        MessageBox.Show(this, exception.Message, "Network Traffic", MessageBoxButtons.OK, MessageBoxIcon.Error);
}
