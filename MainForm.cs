using OpenQA.Selenium;
using SeleniumLocatorInspector.UI;
using SeleniumLocatorInspector.PageClasses;
using SeleniumLocatorInspector.Browser;
using SeleniumLocatorInspector.Inspector;
using SeleniumLocatorInspector.Network;

namespace SeleniumLocatorInspector;

public sealed class MainForm : Form
{
    private readonly BrowserManager _browser = new();
    private LocatorInspector? _inspector;

    private readonly ComboBox _browserCombo = new();
    private readonly TextBox _urlText = new();
    private readonly Button _launchButton = new();
    private readonly Button _hookButton = new();
    private readonly Button _pickButton = new();
    private readonly Button _rectangleButton = new();
    private readonly Button _networkButton = new();
    private NetworkTrafficForm? _networkForm;
    private readonly Button _stopButton = new();

    private readonly DataGridView _candidateList = new();
    private Form? _analysisForm;
    private Action<LocatorResult?>? _refreshAnalysis;
    private bool _analysisBusy;
    private bool _pollBusy;
    private bool _selectionPolling;
    private int _selectionVersion;
    private int _highlightVersion;
    private volatile bool _closing;
    private bool _shutdownComplete;
    private Task? _connectionTask;
    private readonly Label _pickerStatus = new() {Text="Select a parent-grid row to analyse its locators.",AutoSize=true,Margin=new Padding(12,8,0,0)};

    private readonly ContextMenuStrip _gridMenu = new();

    private readonly string _inspectorScript;
    private bool _ignoreGridSelection;

    public MainForm()
    {
        _inspectorScript = LoadInspectorScript();

        Text = "Selenium Locator Inspector";
        ClientSize = new Size(340, 388);
        Font = new Font("Segoe UI", 9F);
        FormBorderStyle = FormBorderStyle.FixedToolWindow;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;

        BuildUi();
        AppTheme.Register(this);
        AppTheme.Apply(_gridMenu);

        FormClosing += async (_, e) =>
        {
            if(_shutdownComplete)return;
            e.Cancel=true;
            if(_closing)return;
            _pickerStatus.Text="Closing browser connection…";
            _closing=true;_selectionPolling=false;
            var inspector=_inspector;_inspector=null;
            try
            {
                if(_connectionTask!=null)try{await _connectionTask;}catch{ /* Dispose any partially created driver below. */ }
                if(inspector!=null)await inspector.RunAsync(current=>{current.StopPicker();_browser.Dispose();return true;});
                else await Task.Run(()=>_browser.Dispose());
            }
            catch { /* Closing must also work after the session has failed. */ }
            finally {_shutdownComplete=true;Close();}
        };
        FormClosed += (_, _) => {_analysisForm?.Dispose();_networkForm?.Close();};

        var timer = new System.Windows.Forms.Timer
        {
            Interval = 250
        };

        timer.Tick += async (_, _) => await CheckForResultAsync();
        timer.Start();
        FormClosed += (_, _) => timer.Dispose();
    }

    private void BuildUi()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 8, Padding = new Padding(14) };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 65));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        foreach (var height in new[] { 38, 38, 46, 46, 46, 46, 42, 38 }) root.RowStyles.Add(new RowStyle(SizeType.Absolute, height));
        Controls.Add(root);
        root.Controls.Add(new Label { Text = "Browser:", AutoSize = true, Margin = new Padding(0, 7, 0, 0) }, 0, 0);
        _browserCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        _browserCombo.Items.AddRange(["Edge", "Chrome", "Firefox"]);
        _browserCombo.SelectedIndex = 0;
        _browserCombo.Dock = DockStyle.Fill;
        root.Controls.Add(_browserCombo, 1, 0);
        root.Controls.Add(new Label { Text = "URL:", AutoSize = true, Margin = new Padding(0, 7, 0, 0) }, 0, 1);
        _urlText.Dock = DockStyle.Fill;
        _urlText.Text = "https://example.com";
        root.Controls.Add(_urlText, 1, 1);
        ConfigureButton(_launchButton, "Launch Browser", LaunchBrowser);
        ConfigureButton(_hookButton, "Hook To WebDriver", HookToWebDriver);
        ConfigureButton(_pickButton, "Pick Element", PickElement);
        ConfigureButton(_rectangleButton, "Select Rectangle", SelectRectangle);
        ConfigureButton(_stopButton, "Stop", StopBrowser);
        ConfigureButton(_networkButton, "Analyse Network Traffic", AnalyseNetworkTraffic);
        _launchButton.Dock = DockStyle.Fill;
        _hookButton.Dock = DockStyle.Fill;
        root.Controls.Add(_launchButton, 0, 2); root.SetColumnSpan(_launchButton, 2);
        root.Controls.Add(_hookButton, 0, 3); root.SetColumnSpan(_hookButton, 2);
        var analysis = new Button { Text = "Locator Analysis", Dock = DockStyle.Fill };
        analysis.Click += (_, _) => ShowLocatorAnalysis(GetGridResult());
        root.Controls.Add(analysis, 0, 4); root.SetColumnSpan(analysis, 2);
        _networkButton.Dock = DockStyle.Fill;
        root.Controls.Add(_networkButton, 0, 5); root.SetColumnSpan(_networkButton, 2);
        _stopButton.Dock = DockStyle.Fill;
        root.Controls.Add(_stopButton, 0, 6); root.SetColumnSpan(_stopButton, 2);
        root.Controls.Add(AppTheme.CreateSelector(), 0, 7); root.SetColumnSpan(root.GetControlFromPosition(0, 7)!, 2);
        AppTheme.Primary(_launchButton);
        AppTheme.Primary(_pickButton);
        ConfigureGrid();
    }

    private void ConfigureGrid()
    {
        _candidateList.Dock = DockStyle.Fill;
        _candidateList.AllowUserToAddRows = false;
        _candidateList.AllowUserToDeleteRows = false;
        _candidateList.AllowUserToResizeRows = false;
        _candidateList.ReadOnly = true;
        _candidateList.MultiSelect = false;
        _candidateList.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        _candidateList.RowHeadersVisible = false;
        _candidateList.AutoGenerateColumns = false;
        _candidateList.AutoSizeRowsMode = DataGridViewAutoSizeRowsMode.None;
        _candidateList.BackgroundColor = SystemColors.Window;
        _candidateList.ClipboardCopyMode = DataGridViewClipboardCopyMode.EnableWithoutHeaderText;

        _candidateList.Columns.Add(new DataGridViewTextBoxColumn
        {
            Name = "Number",
            HeaderText = "#",
            Width = 45,
            SortMode = DataGridViewColumnSortMode.NotSortable
        });

        _candidateList.Columns.Add(new DataGridViewTextBoxColumn
        {
            Name = "Element",
            HeaderText = "Element",
            Width = 180,
            SortMode = DataGridViewColumnSortMode.NotSortable
        });

        _candidateList.Columns.Add(new DataGridViewTextBoxColumn
        {
            Name = "Best",
            HeaderText = "Best",
            Width = 80,
            SortMode = DataGridViewColumnSortMode.NotSortable
        });

        _candidateList.Columns.Add(new DataGridViewTextBoxColumn
        {
            Name = "Score",
            HeaderText = "Score",
            Width = 65,
            SortMode = DataGridViewColumnSortMode.NotSortable
        });

        _candidateList.Columns.Add(new DataGridViewTextBoxColumn
        {
            Name = "Unique",
            HeaderText = "Unique",
            Width = 65,
            SortMode = DataGridViewColumnSortMode.NotSortable
        });

        _candidateList.Columns.Add(new DataGridViewTextBoxColumn
        {
            Name = "CSS",
            HeaderText = "CSS",
            Width = 380,
            SortMode = DataGridViewColumnSortMode.NotSortable
        });

        _candidateList.Columns.Add(new DataGridViewTextBoxColumn
        {
            Name = "XPath",
            HeaderText = "XPath",
            Width = 500,
            SortMode = DataGridViewColumnSortMode.NotSortable
        });

        _candidateList.Columns.Add(new DataGridViewTextBoxColumn { Name = "Visible", HeaderText = "Visible", Width = 65, SortMode = DataGridViewColumnSortMode.NotSortable });
        _candidateList.Columns.Add(new DataGridViewTextBoxColumn { Name = "Clickable", HeaderText = "Clickable", Width = 75, SortMode = DataGridViewColumnSortMode.NotSortable });

        _candidateList.CellClick += CandidateListCellClick;
        _candidateList.CellDoubleClick += (_, e) => { if (e.RowIndex >= 0) ShowLocatorAnalysis(_candidateList.Rows[e.RowIndex].Tag as LocatorResult); };
        _candidateList.CellMouseDown += CandidateListCellMouseDown;
        _candidateList.KeyDown += CandidateListKeyDown;

        _gridMenu.Items.Add("Copy CSS", null, (_, _) => CopyGridValue(5));
        _gridMenu.Items.Add("Copy XPath", null, (_, _) => CopyGridValue(6));
        _gridMenu.Items.Add("Copy Best Locator", null, (_, _) => CopyGridBestLocator());
        _gridMenu.Items.Add("Copy Selenium C#", null, (_, _) => CopyGridSelenium());
        _gridMenu.Items.Add("Show Locator Analysis", null, (_, _) => ShowLocatorAnalysis(GetGridResult()));
        _candidateList.ContextMenuStrip = _gridMenu;
    }

    private static void ConfigureButton(Button button, string text, EventHandler handler)
    {
        button.Text = text;
        button.AutoSize = true;
        button.Height = 32;
        button.Click += handler;
    }

    private static void CopyText(string text)
    {
        if (!string.IsNullOrWhiteSpace(text))
            Clipboard.SetText(text);
    }

    private void ConnectionButtons(bool enabled)
    {
        if(_closing)return;
        _hookButton.Enabled=enabled;_launchButton.Enabled=enabled;_stopButton.Enabled=enabled;
        _pickButton.Enabled=enabled;_rectangleButton.Enabled=enabled;
    }
    private async void HookToWebDriver(object? sender, EventArgs e)
    {
        if(_closing||_analysisBusy)return;
        _selectionPolling=false;++_selectionVersion;_analysisBusy=true;
        var previous=_inspector;_inspector=null;
        _networkForm?.Close();ConnectionButtons(false);SetPickerStatus("Connecting to WebDriver…",null);
        try
        {
            (bool Success,ExistingWebDriverSession? Session,string Message,string Url) Connect()
            {
                var success=_browser.HookToFirstExistingDriver(out var session,out var message);
                var url="";if(success)try{url=_browser.Driver?.Url??"";}catch{}
                return (success,session,message,url);
            }
            var operation=previous!=null?previous.RunAsync(_=>Connect()):Task.Run(Connect);
            _connectionTask=operation;
            var info=await operation;if(_closing)return;
            if(info.Success)
            {
                _inspector=new LocatorInspector(_browser.Driver!);ClearDisplay();
                if(info.Session!=null)
                {
                    var name=info.Session.BrowserName.ToLowerInvariant();
                    _browserCombo.SelectedIndex=name.Contains("edge")||name.Contains("microsoft")?0:name.Contains("firefox")?2:1;
                }
                if(info.Url.Length>0)_urlText.Text=info.Url;
            }
            SetPickerStatus(info.Message,info.Success?null:false);
            MessageBox.Show(this,info.Message,"Hook To WebDriver",MessageBoxButtons.OK,info.Success?MessageBoxIcon.Information:MessageBoxIcon.Warning);
        }
        catch(Exception ex){if(!_closing){SetPickerStatus(ex.Message,false);MessageBox.Show(this,ex.Message,"Hook To WebDriver",MessageBoxButtons.OK,MessageBoxIcon.Error);}}
        finally{_analysisBusy=false;_connectionTask=null;ConnectionButtons(true);}
    }
    private async void LaunchBrowser(object? sender, EventArgs e)
    {
        if(_closing||_analysisBusy)return;
        _selectionPolling=false;++_selectionVersion;_analysisBusy=true;
        var previous=_inspector;_inspector=null;
        var type=_browserCombo.SelectedIndex switch {0=>BrowserType.Edge,1=>BrowserType.Chrome,2=>BrowserType.Firefox,_=>BrowserType.Edge};
        var url=_urlText.Text.Trim();
        _networkForm?.Close();ConnectionButtons(false);SetPickerStatus("Launching browser…",null);
        try
        {
            var operation=previous!=null?previous.RunAsync(_=>{_browser.Start(type,url);return true;}):Task.Run(()=>{_browser.Start(type,url);return true;});
            _connectionTask=operation;
            await operation;if(_closing)return;
            _inspector=new LocatorInspector(_browser.Driver!);ClearDisplay();SetPickerStatus("Browser connected. Pick an element or select a rectangle.",null);
            MessageBox.Show(this,"Browser started.\r\n\r\nOpen 'Locator Analysis', then use 'Pick Element' or 'Select Rectangle'.","Selenium Locator Inspector",MessageBoxButtons.OK,MessageBoxIcon.Information);
        }
        catch(Exception ex){if(!_closing){SetPickerStatus(ex.Message,false);MessageBox.Show(this,ex.Message,"Unable to start browser",MessageBoxButtons.OK,MessageBoxIcon.Error);}}
        finally{_analysisBusy=false;_connectionTask=null;ConnectionButtons(true);}
    }

    private async void PickElement(object? sender, EventArgs e) => await StartSelectionAsync(false);
    private async void SelectRectangle(object? sender, EventArgs e) => await StartSelectionAsync(true);
    private async Task StartSelectionAsync(bool rectangle)
    {
        if(!EnsureBrowser()||_analysisBusy)return;
        var version=++_selectionVersion;
        _selectionPolling=false;
        _pickButton.Enabled=false;_rectangleButton.Enabled=false;
        SetPickerStatus("Preparing flattened DOM…",null);
        try
        {
            await RunInspectorAsync(inspector=>
            {
                if(rectangle)inspector.StartRectangleSelector(_inspectorScript);else inspector.StartPicker(_inspectorScript);
                return true;
            });
            if(_closing||version!=_selectionVersion)return;
            _selectionPolling=true;
            SetPickerStatus(rectangle?"Drag a rectangle in the browser.":"Pick an element in the browser.",null);
        }
        catch(Exception ex){if(!_closing)SetPickerStatus("Unable to start selection: "+ex.Message,false);}
        finally{if(!_closing&&version==_selectionVersion){_pickButton.Enabled=true;_rectangleButton.Enabled=true;}}
    }
    private Task<T> RunInspectorAsync<T>(Func<LocatorInspector,T> command)
    {
        var inspector=_inspector??throw new InvalidOperationException("Connect to a browser first.");
        return inspector.RunAsync(current=>
        {
            if(_closing||!ReferenceEquals(_inspector,current))throw new OperationCanceledException("The browser connection changed.");
            return command(current);
        });
    }
    private void SetPickerStatus(string message,bool? success)
    {
        if(_closing)return;
        _pickerStatus.Text=message;AppTheme.Status(_pickerStatus,success);
    }

    private bool EnsureBrowser()
    {
        if (_browser.Driver != null && _inspector != null)
            return true;

        MessageBox.Show("Launch a browser first.", "Locator Inspector");
        return false;
    }

    private void AnalyseNetworkTraffic(object? sender, EventArgs e)
    {
        if (_networkForm is { IsDisposed: false })
        {
            _networkForm.Activate();
            return;
        }
        _networkForm = new NetworkTrafficForm(_browser.Driver);
        _networkForm.Show(this);
    }

    private async void StopBrowser(object? sender, EventArgs e)
    {
        _networkForm?.Close();_selectionPolling=false;++_selectionVersion;
        var inspector=_inspector;_inspector=null;
        ClearDisplay();SetPickerStatus("Stopping browser…",null);
        _stopButton.Enabled=false;_launchButton.Enabled=false;_hookButton.Enabled=false;
        try
        {
            var operation=inspector!=null?inspector.RunAsync(current=>{current.StopPicker();_browser.Stop();return true;}):Task.Run(()=>{_browser.Stop();return true;});
            _connectionTask=operation;
            await operation;
            SetPickerStatus("Browser stopped.",null);
        }
        catch(Exception ex){SetPickerStatus("Unable to stop browser: "+ex.Message,false);}
        finally{_connectionTask=null;ConnectionButtons(true);}
    }
    private async Task CheckForResultAsync()
    {
        var inspector=_inspector;
        if(inspector==null||_closing||!_selectionPolling||_pollBusy||_analysisBusy)return;
        _pollBusy=true;var version=_selectionVersion;
        try
        {
            var packet=await inspector.PollAsync();
            if(packet==null||_closing||version!=_selectionVersion||!ReferenceEquals(inspector,_inspector)||!_selectionPolling)return;
            if(packet.Status.Phase=="idle"&&packet.Result==null){_selectionPolling=false;SetPickerStatus("Selection reset or page navigated. Start Pick Element or Select Rectangle again.",null);return;}
            if(packet.Status.Phase=="analysing")SetPickerStatus($"Analysing selection: {packet.Status.Completed} / {packet.Status.Total}…",null);
            if(packet.Status.Phase=="failed")
            {
                _selectionPolling=false;SetPickerStatus("Selection failed: "+packet.Status.Error,false);return;
            }
            var result=packet.Result;if(result==null)return;
            _selectionPolling=false;
            if(result.IsRectangleSelection)DisplayRectangleResults(result.RectangleResults);
            else{PopulateGrid([result]);DisplaySingleResult(result);}
            SetPickerStatus(packet.Status.Error.Length>0?"Selection completed with warnings: "+packet.Status.Error:"Selection ready.",packet.Status.Error.Length>0?false:null);
        }
        catch(Exception ex)
        {
            if(!_closing&&version==_selectionVersion){_selectionPolling=false;SetPickerStatus("Browser polling failed; retry Pick Element or Select Rectangle. "+ex.Message,false);}
        }
        finally{_pollBusy=false;}
    }

    private void DisplayRectangleResults(List<LocatorResult> results)
    {
        _candidateList.Rows.Clear();

        if (results.Count == 0)
        {
            ClearDetailFields();
            return;
        }

        PopulateGrid(results);
        DisplaySingleResult(results[0]);

        if (_candidateList.Rows.Count > 0)
        {
            _ignoreGridSelection = true;
            _candidateList.ClearSelection();
            _candidateList.Rows[0].Selected = true;
            _candidateList.CurrentCell = _candidateList.Rows[0].Cells[1];
            _ignoreGridSelection = false;
        }
    }

    private void DisplaySingleResult(LocatorResult result)
    {
        _refreshAnalysis?.Invoke(result);
    }

    private void PopulateGrid(IEnumerable<LocatorResult> results)
    {
        _candidateList.Rows.Clear();

        var number = 1;

        foreach (var result in results)
        {
            var best = result.Candidates.FirstOrDefault();
            var bestType = best?.Type ?? "";
            var score = best?.Score.ToString() ?? "";
            var unique = best == null ? "" : best.Unique ? "Yes" : "No";

            var rowIndex = _candidateList.Rows.Add(
                number++,
                $"{result.TagName} | {ShortText(result.Text, 80)}",
                bestType,
                score,
                unique,
                result.Css,
                result.XPath,
                result.Visible ? "Yes" : "No",
                result.Clickable ? "Yes" : "No");

            _candidateList.Rows[rowIndex].Tag = result;
        }
    }

    private static string ShortText(string value, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        var compact = value.Replace("\r", " ").Replace("\n", " ").Trim();
        return compact.Length <= max ? compact : compact[..max] + "…";
    }

    private async Task<PageAnalysis> AnalyseCurrentPageAsync()
    {
        if (_inspector == null) throw new InvalidOperationException("Launch a browser or Hook To WebDriver first.");
        if (_analysisBusy) throw new InvalidOperationException("Wait for the current inspector operation to finish.");
        _analysisBusy = true;
        var forms = new Form?[] { this, _analysisForm, _networkForm }.Where(f => f != null && !f.IsDisposed).Cast<Form>().ToArray();
        var enabled = forms.Select(f => f.Enabled).ToArray();
        foreach (var form in forms) form.Enabled = false;
        try { return await RunInspectorAsync(inspector=>inspector.AnalysePage(_inspectorScript)); }
        finally
        {
            _analysisBusy = false;
            for (var i = 0; i < forms.Length; i++) if (!forms[i].IsDisposed) forms[i].Enabled = enabled[i];
        }
    }

    private void ShowLocatorAnalysis(LocatorResult? result)
    {
        if (_analysisForm != null && !_analysisForm.IsDisposed)
        {
            if (result != null) _refreshAnalysis?.Invoke(result);
            _analysisForm.Show(); _analysisForm.Activate();
            return;
        }
        result ??= new LocatorResult();
        var dialog = new Form
        {
            Text = "Locator Analysis",
            Font = new Font("Segoe UI", 9F),
            Width = 1350,
            Height = 900,
            MinimumSize = new Size(900, 720),
            StartPosition = FormStartPosition.CenterParent,
            MinimizeBox = false,
            MaximizeBox = true
        };
        var grid = new DataGridView
        {
            Dock = DockStyle.Fill,
            ReadOnly = true,
            AllowUserToAddRows = false,
            AllowUserToDeleteRows = false,
            MultiSelect = false,
            SelectionMode = DataGridViewSelectionMode.FullRowSelect,
            RowHeadersVisible = false,
            AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.None,
            ClipboardCopyMode = DataGridViewClipboardCopyMode.EnableWithoutHeaderText
        };
        grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Score", Width = 65 });
        grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Unique", Width = 65 });
        grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Visible", Width = 65 });
        grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Clickable", Width = 75 });
        grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Locator basis", Width = 190 });
        grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Type", Width = 75 });
        grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Locator", Width = 480 });
        grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Reason / reusability", Width = 360 });
        grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Matches", Width = 70 });
        grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Scope / marker", Width = 180 });
        grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Item container locator", Width = 420 });
        grid.Columns[6].DisplayIndex = 0;
        foreach (DataGridViewColumn column in grid.Columns) column.SortMode = DataGridViewColumnSortMode.NotSortable;
        List<LocatorCandidate> ShortestFirst(LocatorResult selected) => selected.DetailedCandidates
            .OrderBy(c => c.Value.Length).ThenBy(c => c.Value, StringComparer.Ordinal).ThenBy(c => c.Type, StringComparer.Ordinal).ToList();
        var allCandidates = ShortestFirst(result);
        void AddCandidateRow(LocatorCandidate candidate)
        {
            var i = grid.Rows.Add(candidate.Score, candidate.Unique ? "Yes" : "No",
                candidate.Visible ? "Yes" : "No", candidate.Clickable ? "Yes" : "No",
                candidate.Category, candidate.Type, candidate.Value, candidate.Rationale,
                candidate.Matches, candidate.Scope, candidate.ContainerLocator);
            grid.Rows[i].Tag = candidate;
            if (candidate.Recommendation.Contains("Best CSS", StringComparison.Ordinal) ||
                candidate.Recommendation.Contains("Best XPath", StringComparison.Ordinal))
            {
                AppTheme.Row(grid.Rows[i], RowTone.Recommended);
            }
            foreach (DataGridViewCell cell in grid.Rows[i].Cells)
                cell.ToolTipText = candidate.Rationale;
        }
        foreach (var candidate in allCandidates) AddCandidateRow(candidate);
        var bottom = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 52, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(8, 4, 8, 4) };
        var copy = new Button { Text = "Copy Selected Locator", AutoSize = true };
        copy.Click += (_, _) => { if (grid.CurrentRow?.Tag is LocatorCandidate c) CopyText(c.Value); };
        var close = new Button { Text = "Close", AutoSize = true };
        close.Click += (_, _) => dialog.Hide();
        var copyContainer = new Button { Text = "Copy Item Container", AutoSize = true,
            Enabled = grid.CurrentRow?.Tag is LocatorCandidate initial && initial.ContainerLocator.Length > 0 };
        copyContainer.Click += (_, _) => {
            if (grid.CurrentRow?.Tag is LocatorCandidate c && c.ContainerLocator.Length > 0)
                CopyText(c.ContainerLocator);
        };
        grid.SelectionChanged += async (_, _) => {
            copyContainer.Enabled = grid.CurrentRow?.Tag is LocatorCandidate c && c.ContainerLocator.Length > 0;
        };
        bottom.Controls.Add(close); bottom.Controls.Add(copy); bottom.Controls.Add(copyContainer);

        var testPanel = new TableLayoutPanel
        {
            Dock = DockStyle.Top, Height = 235, Padding = new Padding(8, 6, 8, 4),
            ColumnCount = 2, RowCount = 5
        };
        testPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        testPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 140));
        foreach (var height in new[] { 32, 30, 72, 32, 55 })
            testPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, height));
        var locatorInput = new TextBox
        {
            Dock = DockStyle.Fill, PlaceholderText = "Enter a CSS selector or XPath",
            Text = (grid.CurrentRow?.Tag as LocatorCandidate)?.Value ?? ""
        };
        var testButton = new Button { Text = "Test Locator", Dock = DockStyle.Fill };
        var boldValueFont = new Font(dialog.Font, FontStyle.Bold);
        var dimensionTip = new ToolTip();
        var statusRow = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false, AutoScroll = true };
        Label Metric(string title)
        {
            statusRow.Controls.Add(new Label { Text = title + ":", AutoSize = true, Margin = new Padding(0, 4, 3, 0) });
            var value = new Label { Text = "—", AutoSize = true, Font = boldValueFont, Margin = new Padding(0, 4, 12, 0) };
            statusRow.Controls.Add(value);
            return value;
        }
        var countValue = Metric("Matches");
        var selectedValue = Metric("Selected element");
        var visibleValue = Metric("Visible");
        var clickableValue = Metric("Clickable");
        var widthValue = Metric("Width (px)");
        var heightValue = Metric("Height (px)");
        var testStatus = new Label { AutoSize = true, Margin = new Padding(0, 4, 0, 0) };
        statusRow.Controls.Add(testStatus);
        void ShowTest(LocatorTestResult test)
        {
            if(_closing||dialog.IsDisposed)return;
            countValue.Text = test.Count.ToString();
            AppTheme.Status(countValue, test.Count > 0);
            void YesNo(Label value, bool yes)
            {
                value.Text = yes ? "Yes" : "No";
                AppTheme.Status(value, yes);
            }
            YesNo(selectedValue, test.SelectedElementMatched);
            YesNo(visibleValue, test.Visible);
            YesNo(clickableValue, test.Clickable);
            widthValue.Text = test.Width?.ToString("0.##") ?? "—";
            heightValue.Text = test.Height?.ToString("0.##") ?? "—";
            dimensionTip.SetToolTip(widthValue, test.DimensionsOf + ": rendered bounding rectangle in CSS pixels.");
            dimensionTip.SetToolTip(heightValue, test.DimensionsOf + ": rendered bounding rectangle in CSS pixels.");
            AppTheme.Status(testStatus, false);
            testStatus.Text = test.Error == null ? "" : test.Error;
        }
        async Task RunLocatorTestAsync()
        {
            if (_inspector == null) { ShowTest(new LocatorTestResult { Error = "Launch a browser or Hook To WebDriver first." }); return; }
            var locator = locatorInput.Text.Trim();
            if (locator.Length == 0) { ShowTest(new LocatorTestResult { Error = "Enter a CSS selector or XPath first." }); return; }
            try { var index=result.SelectionIndex;ShowTest(await RunInspectorAsync(inspector=>inspector.TestLocator(locator,index,_inspectorScript))); }
            catch (Exception ex) { ShowTest(new LocatorTestResult { Error = "Unable to test locator: " + ex.Message }); }
        }
        testButton.Click += async (_, _) => await RunLocatorTestAsync();
        locatorInput.KeyDown += (_, e) => {
            if (e.KeyCode != System.Windows.Forms.Keys.Enter) return;
            e.SuppressKeyPress = true;
            testButton.PerformClick();
        };
        var javascriptInput = new TextBox
        {
            Dock = DockStyle.Fill, Multiline = true, ScrollBars = ScrollBars.Both, WordWrap = false,
            Text = "return getText();",
            PlaceholderText = "JavaScript using element, setValue, setChecked, selectValue or getText"
        };
        var javascriptButton = new Button { Text = "Test JavaScript", Dock = DockStyle.Fill };
        var javascriptOutput = new TextBox { Dock = DockStyle.Fill, Multiline = true, ReadOnly = true,
            ScrollBars = ScrollBars.Vertical, Text = "JavaScript runs against the first match of the Test Locator above; elements contains all matches." };
        var examples = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false, AutoScroll = true };
        examples.Controls.Add(new Label { AutoSize = true, Text = "JavaScript example:", Margin = new Padding(0, 5, 8, 0) });
        var action = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = 155 };
        action.Items.AddRange(new object[] { "Click", "Enter text", "Tick checkbox", "Untick checkbox", "Select dropdown", "Get text" });
        var scripts = new[] { "element.click();", "return setValue('your text');", "return setChecked(true);",
            "return setChecked(false);", "return selectValue('option-value');", "return getText();" };
        action.SelectedIndexChanged += (_, _) => { if (action.SelectedIndex >= 0) javascriptInput.Text = scripts[action.SelectedIndex]; };
        examples.Controls.Add(action);
        examples.Controls.Add(new Label { AutoSize = true, Text = "Edit the example, then click Test JavaScript. Use return to display a value.", Margin = new Padding(8, 5, 0, 0) });
        javascriptButton.Click += async (_, _) => {
            if (_inspector == null) { javascriptOutput.Text = "Launch a browser or Hook To WebDriver first."; AppTheme.Status(javascriptOutput, false); return; }
            var locator = locatorInput.Text.Trim();
            var script = javascriptInput.Text;
            if (locator.Length == 0 || string.IsNullOrWhiteSpace(script))
            { javascriptOutput.Text = "Enter a locator and JavaScript first."; AppTheme.Status(javascriptOutput, false); return; }
            AppTheme.Status(javascriptOutput, null);
            javascriptOutput.Text = "Running JavaScript…";
            _analysisBusy = true;
            dialog.Enabled = false;
            Enabled = false;
            try
            {
                var execution = await RunInspectorAsync(inspector=>inspector.TestJavaScript(locator,script,_inspectorScript));
                if(_closing||dialog.IsDisposed)return;
                AppTheme.Status(javascriptOutput, execution.Success);
                javascriptOutput.Text = execution.Success
                    ? (execution.Count > 1 ? $"First of {execution.Count} matches:\r\n{execution.Result}" : execution.Result)
                    : "JavaScript failed: " + execution.Error;
                await RunLocatorTestAsync();
            }
            catch (Exception ex) { if(!_closing&&!dialog.IsDisposed){AppTheme.Status(javascriptOutput, false);javascriptOutput.Text="Unable to run JavaScript: "+ex.Message;} }
            finally { _analysisBusy = false; Enabled = true; if (!dialog.IsDisposed) dialog.Enabled = true; }
        };
        testPanel.Controls.Add(locatorInput, 0, 0);
        testPanel.Controls.Add(testButton, 1, 0);
        testPanel.Controls.Add(statusRow, 0, 1); testPanel.SetColumnSpan(statusRow, 2);
        testPanel.Controls.Add(javascriptInput, 0, 2); testPanel.Controls.Add(javascriptButton, 1, 2);
        testPanel.Controls.Add(examples, 0, 3); testPanel.SetColumnSpan(examples, 2);
        testPanel.Controls.Add(javascriptOutput, 0, 4); testPanel.SetColumnSpan(javascriptOutput, 2);

        var filterPanel = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 40,
            Padding = new Padding(8, 4, 8, 4),
            ColumnCount = 3,
            RowCount = 1
        };
        filterPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 110));
        filterPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        filterPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 110));
        var filterLabel = new Label { Text = "Filter locators:", Dock = DockStyle.Fill,
            TextAlign = System.Drawing.ContentAlignment.MiddleLeft };
        var filterInput = new TextBox { Dock = DockStyle.Fill,
            PlaceholderText = "Filter by locator, type, basis, or reason" };
        var filterCount = new Label { Text = $"{allCandidates.Count} shown", Dock = DockStyle.Fill,
            TextAlign = System.Drawing.ContentAlignment.MiddleRight };
        filterPanel.Controls.Add(filterLabel, 0, 0);
        filterPanel.Controls.Add(filterInput, 1, 0);
        filterPanel.Controls.Add(filterCount, 2, 0);
        var filteringRows = false;
        filterInput.TextChanged += (_, _) => {
            if (filteringRows) return;
            var search = filterInput.Text.Trim();
            var previous = grid.CurrentRow?.Tag as LocatorCandidate;
            var matches = allCandidates.Where(c => search.Length == 0 ||
                c.Value.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                c.Type.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                c.Category.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                c.Rationale.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                c.Recommendation.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                c.Scope.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                c.ContainerLocator.Contains(search, StringComparison.OrdinalIgnoreCase)).ToList();
            filteringRows = true;
            grid.SuspendLayout();
            try
            {
                grid.Rows.Clear();
                foreach (var candidate in matches) AddCandidateRow(candidate);
                var previousIndex = matches.FindIndex(c => ReferenceEquals(c, previous));
                if (previousIndex >= 0)
                    grid.CurrentCell = grid.Rows[previousIndex].Cells[6];
                else
                {
                    grid.ClearSelection();
                    grid.CurrentCell = null;
                }
            }
            finally
            {
                grid.ResumeLayout();
                filteringRows = false;
            }
            filterCount.Text = $"{matches.Count} shown";
        };
        grid.SelectionChanged += async (_, _) => {
            if (filteringRows || !grid.Focused || grid.CurrentRow?.Tag is not LocatorCandidate candidate) return;
            locatorInput.Text = candidate.Value;
            try
            {
                var version=++_highlightVersion;
                if(_inspector!=null)await RunInspectorAsync(inspector=>version==_highlightVersion?inspector.HighlightLocator(candidate.Value,_inspectorScript):0);
            }
            catch (OperationCanceledException) { }
            catch (Exception ex) { if(!_closing&&!dialog.IsDisposed)MessageBox.Show(dialog, ex.Message, "Unable to highlight locator"); }
        };
        grid.CellDoubleClick += (_, _) => { if (grid.CurrentRow?.Tag is LocatorCandidate c) CopyText(c.Value); };
        _refreshAnalysis = selected => {
            result = selected ?? new LocatorResult();
            dialog.Text = selected == null ? "Locator Analysis — pick an element" : $"Locator Analysis — <{selected.TagName}>";
            allCandidates = ShortestFirst(result);
            filteringRows = true;
            try
            {
                filterInput.Clear();
                grid.Rows.Clear();
                foreach (var candidate in allCandidates) AddCandidateRow(candidate);
            }
            finally { filteringRows = false; }
            filterCount.Text = $"{grid.Rows.Count} shown";
            locatorInput.Text = result.Candidates.FirstOrDefault(c => c.Unique)?.Value ?? "";
            foreach (var value in new[] { countValue, selectedValue, visibleValue, clickableValue, widthValue, heightValue })
            { value.Text = "—"; AppTheme.Status(value, null); }
            testStatus.Text = "";
            copyContainer.Enabled = grid.CurrentRow?.Tag is LocatorCandidate current && current.ContainerLocator.Length > 0;
        };
        var selectionToolbar = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 40, WrapContents = false, Padding = new Padding(8, 3, 0, 0) };
        selectionToolbar.Controls.Add(_pickButton);
        selectionToolbar.Controls.Add(_rectangleButton);
        var createPageClass = new Button { Text = "Create Page Class", AutoSize = true };
        createPageClass.Click += async (_, _) =>
        {
            try
            {
                var analysis = await AnalyseCurrentPageAsync();
                if (dialog.IsDisposed) return;
                using var preview = new PageClassPreviewForm(analysis, AnalyseCurrentPageAsync, review: async (locator, relative) =>
                {
                    if (_inspector == null) throw new InvalidOperationException("Connect to a browser first.");
                    if (_analysisBusy) throw new InvalidOperationException("Wait for the current inspector operation.");
                    _analysisBusy = true;
                    try { return await RunInspectorAsync(inspector=>inspector.ReviewRelationship(locator,relative,_inspectorScript)); }
                    finally { _analysisBusy = false; }
                });
                preview.ShowDialog(dialog);
            }
            catch (Exception ex) { if(!_closing&&!dialog.IsDisposed)MessageBox.Show(dialog,ex.Message,"Create Page Class",MessageBoxButtons.OK,MessageBoxIcon.Error); }
        };
        selectionToolbar.Controls.Add(createPageClass);
        selectionToolbar.Controls.Add(AppTheme.CreateSelector());
        selectionToolbar.Controls.Add(_pickerStatus);
        _candidateList.Dock = DockStyle.Top;
        _candidateList.RowTemplate.Height = 24;
        foreach (DataGridViewRow row in _candidateList.Rows) row.Height = 24;
        _candidateList.ColumnHeadersHeight = 28;
        _candidateList.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.DisableResizing;
        void SizeParentGrid()
        {
            var availableWidth = _candidateList.ClientSize.Width - (_candidateList.Rows.Count > 5 ? SystemInformation.VerticalScrollBarWidth : 0) - 2;
            var scroll = _candidateList.Columns.GetColumnsWidth(DataGridViewElementStates.Visible) > availableWidth
                ? SystemInformation.HorizontalScrollBarHeight : 0;
            _candidateList.Height = _candidateList.ColumnHeadersHeight + 5 * _candidateList.RowTemplate.Height + scroll + 2;
        }
        _candidateList.SizeChanged += (_, _) => SizeParentGrid();
        _candidateList.RowsAdded += (_, _) => SizeParentGrid();
        _candidateList.RowsRemoved += (_, _) => SizeParentGrid();
        SizeParentGrid();
        _candidateList.ScrollBars = ScrollBars.Both;
        _candidateList.SelectionChanged += (_, _) => {
            if (!_ignoreGridSelection && _candidateList.Focused && _candidateList.CurrentRow != null)
                SelectGridRow(_candidateList.CurrentRow.Index);
        };
        // Give analysis the main area; keep all testing tools visible below it.
        var locatorSection = new Panel { Dock = DockStyle.Fill, Padding = new Padding(10, 0, 10, 8) };
        grid.RowTemplate.Height = 28;
        grid.ColumnHeadersHeight = 34;
        locatorSection.Controls.Add(grid);
        locatorSection.Controls.Add(filterPanel);
        var testSection = new Panel { Dock = DockStyle.Bottom, Height = 243, Padding = new Padding(10, 0, 10, 0) };
        testPanel.Dock = DockStyle.Fill;
        testSection.Controls.Add(testPanel);
        var parentTitle = new Label { Text = "Selected elements", Dock = DockStyle.Top, Height = 28,
            Padding = new Padding(12, 6, 0, 0), Font = new Font(dialog.Font, FontStyle.Bold) };
        selectionToolbar.Height = 46;
        dialog.Controls.Add(locatorSection);
        dialog.Controls.Add(testSection);
        dialog.Controls.Add(bottom);
        dialog.Controls.Add(_candidateList);
        dialog.Controls.Add(parentTitle);
        dialog.Controls.Add(selectionToolbar);
        AppTheme.Primary(testButton);
        AppTheme.Primary(javascriptButton);
        AppTheme.Editor(locatorInput);
        AppTheme.Editor(javascriptInput);
        AppTheme.Editor(javascriptOutput);
        AppTheme.Register(dialog);
        dialog.FormClosing += (_, e) => {
            if (e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; dialog.Hide(); }
        };
        dialog.FormClosed += (_, _) => { boldValueFont.Dispose(); dimensionTip.Dispose(); _refreshAnalysis = null; _analysisForm = null; };
        _analysisForm = dialog;
        _refreshAnalysis(result.TagName.Length > 0 ? result : null);
        dialog.Show(this);
    }

    private void CandidateListCellClick(object? sender, DataGridViewCellEventArgs e)
    {
        if (_ignoreGridSelection || e.RowIndex < 0) return;

        SelectGridRow(e.RowIndex);
    }

    private void CandidateListCellMouseDown(object? sender, DataGridViewCellMouseEventArgs e)
    {
        if (e.RowIndex < 0) return;

        if (e.Button == MouseButtons.Right)
        {
            _ignoreGridSelection = true;
            _candidateList.ClearSelection();
            _candidateList.Rows[e.RowIndex].Selected = true;
            _candidateList.CurrentCell = _candidateList.Rows[e.RowIndex].Cells[Math.Max(0, e.ColumnIndex)];
            _ignoreGridSelection = false;
        }
    }

    private void CandidateListKeyDown(object? sender, KeyEventArgs e)
    {
        if (e.KeyCode == System.Windows.Forms.Keys.C && e.Control)
        {
            CopyGridBestLocator();
            e.Handled = true;
        }
    }

    private async void SelectGridRow(int rowIndex)
    {
        if (rowIndex < 0 || rowIndex >= _candidateList.Rows.Count) return;

        var result = _candidateList.Rows[rowIndex].Tag as LocatorResult;
        if (result == null) return;

        DisplaySingleResult(result);
        try
        {
            var version=++_highlightVersion;
            if(_inspector!=null)await RunInspectorAsync(inspector=>{if(version==_highlightVersion)inspector.HighlightSelection(result.SelectionIndex);return true;});
        }
        catch(Exception ex){SetPickerStatus("Unable to highlight selection: "+ex.Message,false);}
    }

    private LocatorResult? GetGridResult()
    {
        if (_candidateList.CurrentRow?.Tag is LocatorResult current)
            return current;

        if (_candidateList.SelectedRows.Count > 0 &&
            _candidateList.SelectedRows[0].Tag is LocatorResult selected)
            return selected;

        return null;
    }

    private void CopyGridValue(int columnIndex)
    {
        if (_candidateList.CurrentRow == null) return;
        if (columnIndex < 0 || columnIndex >= _candidateList.Columns.Count) return;

        CopyText(Convert.ToString(_candidateList.Rows[_candidateList.CurrentRow.Index].Cells[columnIndex].Value) ?? "");
    }

    private void CopyGridBestLocator()
    {
        var result = GetGridResult();
        var best = result?.Candidates.FirstOrDefault();
        if (best != null)
            CopyText(best.Value);
    }

    private void CopyGridSelenium()
    {
        var result = GetGridResult();
        if (result != null)
            CopyText(result.SeleniumCode);
    }

    private void ClearDisplay()
    {
        ClearDetailFields();
        _candidateList.Rows.Clear();
    }

    private void ClearDetailFields()
    {
        _refreshAnalysis?.Invoke(null);
    }

    private static string LoadInspectorScript()
    {
        var assembly = typeof(MainForm).Assembly;

        using var stream = assembly.GetManifestResourceStream(
            "SeleniumLocatorInspector.JavaScript.locator-inspector.js");

        if (stream == null)
        {
            throw new InvalidOperationException(
                "Embedded locator-inspector.js was not found.");
        }

        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
