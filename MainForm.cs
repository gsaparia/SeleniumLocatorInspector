using System.Text;
using OpenQA.Selenium;
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

    private readonly TextBox _elementText = new();
    private readonly TextBox _cssText = new();
    private readonly TextBox _xpathText = new();
    private readonly TextBox _shadowText = new();
    private readonly TextBox _frameText = new();
    private readonly TextBox _seleniumText = new();
    private readonly TextBox _stabilityText = new();
    private readonly DataGridView _candidateList = new();

    private readonly Button _copyCssButton = new();
    private readonly Button _copyXPathButton = new();
    private readonly Button _copySeleniumButton = new();

    private readonly ContextMenuStrip _gridMenu = new();

    private readonly string _inspectorScript;
    private bool _ignoreGridSelection;

    public MainForm()
    {
        _inspectorScript = LoadInspectorScript();

        Text = "Selenium Locator Inspector";
        Width = 1250;
        Height = 900;
        StartPosition = FormStartPosition.CenterScreen;

        BuildUi();

        FormClosed += (_, _) => { _networkForm?.Close(); _browser.Dispose(); };

        var timer = new System.Windows.Forms.Timer
        {
            Interval = 250
        };

        timer.Tick += (_, _) => CheckForResult();
        timer.Start();
    }

    private void BuildUi()
    {
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 6,
            Padding = new Padding(10)
        };

        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 45));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 45));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 110));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 150));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 110));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        Controls.Add(root);

        var browserPanel = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoSize = true
        };

        browserPanel.Controls.Add(new Label
        {
            Text = "Browser:",
            AutoSize = true,
            Padding = new Padding(0, 8, 0, 0)
        });

        _browserCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        _browserCombo.Items.AddRange(["Edge", "Chrome", "Firefox"]);
        _browserCombo.SelectedIndex = 0;
        _browserCombo.Width = 100;
        browserPanel.Controls.Add(_browserCombo);

        browserPanel.Controls.Add(new Label
        {
            Text = "URL:",
            AutoSize = true,
            Padding = new Padding(15, 8, 0, 0)
        });

        _urlText.Width = 500;
        _urlText.Text = "https://example.com";
        browserPanel.Controls.Add(_urlText);

        root.Controls.Add(browserPanel, 0, 0);

        var buttons = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill
        };

        ConfigureButton(_launchButton, "Launch Browser", LaunchBrowser);
        ConfigureButton(_hookButton, "Hook To WebDriver", HookToWebDriver);
        ConfigureButton(_pickButton, "🎯 Pick Element", PickElement);
        ConfigureButton(_rectangleButton, "▭ Select Rectangle", SelectRectangle);
        ConfigureButton(_stopButton, "Stop", StopBrowser);
        ConfigureButton(_networkButton, "Analyse Network Traffic", AnalyseNetworkTraffic);

        buttons.Controls.Add(_launchButton);
        buttons.Controls.Add(_hookButton);
        buttons.Controls.Add(_pickButton);
        buttons.Controls.Add(_rectangleButton);
        buttons.Controls.Add(_networkButton);
        buttons.Controls.Add(_stopButton);

        root.Controls.Add(buttons, 0, 1);

        var basic = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 5
        };

        basic.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 150));
        basic.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        AddReadOnlyRow(basic, 0, "Element", _elementText);
        AddReadOnlyRowWithCopy(basic, 1, "CSS", _cssText, _copyCssButton, "Copy CSS", () => CopyText(GetFirstLine(_cssText.Text)));
        AddReadOnlyRowWithCopy(basic, 2, "XPath", _xpathText, _copyXPathButton, "Copy XPath", () => CopyText(GetFirstLine(_xpathText.Text)));
        AddReadOnlyRow(basic, 3, "Shadow DOM", _shadowText);
        AddReadOnlyRow(basic, 4, "Iframe", _frameText);

        root.Controls.Add(basic, 0, 2);

        var seleniumPanel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 3
        };

        seleniumPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 150));
        seleniumPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        seleniumPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 80));

        seleniumPanel.Controls.Add(new Label
        {
            Text = "Selenium C#",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft
        }, 0, 0);

        _seleniumText.Multiline = true;
        _seleniumText.ReadOnly = true;
        _seleniumText.ScrollBars = ScrollBars.Both;
        _seleniumText.Dock = DockStyle.Fill;
        seleniumPanel.Controls.Add(_seleniumText, 1, 0);

        _copySeleniumButton.Text = "Copy";
        _copySeleniumButton.AutoSize = true;
        _copySeleniumButton.Click += (_, _) => CopyText(_seleniumText.Text);
        seleniumPanel.Controls.Add(_copySeleniumButton, 2, 0);
        root.Controls.Add(seleniumPanel, 0, 3);

        var stabilityPanel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2
        };

        stabilityPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 150));
        stabilityPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        stabilityPanel.Controls.Add(new Label
        {
            Text = "Stability",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft
        }, 0, 0);

        _stabilityText.Multiline = true;
        _stabilityText.ReadOnly = true;
        _stabilityText.ScrollBars = ScrollBars.Vertical;
        _stabilityText.Dock = DockStyle.Fill;
        stabilityPanel.Controls.Add(_stabilityText, 1, 0);

        root.Controls.Add(stabilityPanel, 0, 4);

        ConfigureGrid();
        root.Controls.Add(_candidateList, 0, 5);
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

    private static void AddReadOnlyRowWithCopy(
        TableLayoutPanel table,
        int row,
        string label,
        TextBox textBox,
        Button copyButton,
        string buttonText,
        Action copyAction)
    {
        table.Controls.Add(new Label
        {
            Text = label,
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft
        }, 0, row);

        var panel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2
        };

        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 80));

        textBox.ReadOnly = true;
        textBox.Dock = DockStyle.Fill;

        copyButton.Text = buttonText;
        copyButton.Dock = DockStyle.Fill;
        copyButton.Click += (_, _) => copyAction();

        panel.Controls.Add(textBox, 0, 0);
        panel.Controls.Add(copyButton, 1, 0);

        table.Controls.Add(panel, 1, row);
    }

    private static void AddReadOnlyRow(TableLayoutPanel table, int row, string label, TextBox textBox)
    {
        table.Controls.Add(new Label
        {
            Text = label,
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft
        }, 0, row);

        textBox.ReadOnly = true;
        textBox.Dock = DockStyle.Fill;
        table.Controls.Add(textBox, 1, row);
    }

    private static string GetFirstLine(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        return value.Split(["\r\n", "\n"], StringSplitOptions.None)[0].Trim();
    }

    private static void CopyText(string text)
    {
        if (!string.IsNullOrWhiteSpace(text))
            Clipboard.SetText(text);
    }

    private void HookToWebDriver(object? sender, EventArgs e)
    {
        _networkForm?.Close();
        try
        {
            if (_browser.HookToFirstExistingDriver(out var session, out var message))
            {
                _inspector = new LocatorInspector(_browser.Driver!);

                if (session != null)
                {
                    var browserName = session.BrowserName.ToLowerInvariant();
                    _browserCombo.SelectedIndex = browserName.Contains("edge") || browserName.Contains("microsoft")
                        ? 0
                        : browserName.Contains("firefox")
                            ? 2
                            : 1;

                    try
                    {
                        _urlText.Text = _browser.Driver.Url;
                    }
                    catch
                    {
                        // Ignore URL read failures from the attached session.
                    }
                }

                MessageBox.Show(this, message, "Hook To WebDriver", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            else
            {
                MessageBox.Show(this, message, "Hook To WebDriver", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "Hook To WebDriver", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void LaunchBrowser(object? sender, EventArgs e)
    {
        _networkForm?.Close();
        try
        {
            var type = _browserCombo.SelectedIndex switch
            {
                0 => BrowserType.Edge,
                1 => BrowserType.Chrome,
                2 => BrowserType.Firefox,
                _ => BrowserType.Edge
            };

            _browser.Start(type, _urlText.Text.Trim());
            _inspector = new LocatorInspector(_browser.Driver!);

            ClearDisplay();

            MessageBox.Show(
                "Browser started.\r\n\r\nUse 'Pick Element' to click one element, or 'Select Rectangle' to drag over multiple elements.",
                "Selenium Locator Inspector",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Unable to start browser", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void PickElement(object? sender, EventArgs e)
    {
        if (!EnsureBrowser()) return;

        try
        {
            _inspector!.StartPicker(_inspectorScript);
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Unable to start picker", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void SelectRectangle(object? sender, EventArgs e)
    {
        if (!EnsureBrowser()) return;

        try
        {
            _inspector!.StartRectangleSelector(_inspectorScript);
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Unable to start rectangle selection", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
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

    private void StopBrowser(object? sender, EventArgs e)
    {
        _networkForm?.Close();
        _inspector?.StopPicker();
        _browser.Stop();
        _inspector = null;
        ClearDisplay();
    }

    private void CheckForResult()
    {
        if (_inspector == null) return;

        try
        {
            var result = _inspector.GetSelectedResult();
            if (result == null) return;

            if (result.IsRectangleSelection)
            {
                DisplayRectangleResults(result.RectangleResults);
            }
            else
            {
                DisplaySingleResult(result);
                PopulateGrid([result]);
            }

            // Important: Driver is IWebDriver, not IJavaScriptExecutor.
            // Clear the browser-side result through LocatorInspector.
            _inspector.ClearSelectedResult();
        }
        catch
        {
            // Browser may be navigating or closed.
        }
    }

    private void DisplayRectangleResults(List<LocatorResult> results)
    {
        _candidateList.Rows.Clear();

        if (results.Count == 0)
        {
            ClearDetailFields();
            _elementText.Text = "Rectangle selection: no visible elements found.";
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
        _elementText.Text =
            $"{result.TagName}  |  {result.Text}";

        _cssText.Text =
            $"{result.Css}\r\n" +
            (result.CssUnique ? "✓ Unique" : "⚠ Not unique");

        _xpathText.Text =
            $"{result.XPath}\r\n" +
            (result.XPathUnique ? "✓ Unique" : "⚠ Not unique");

        _shadowText.Text = result.InsideShadowDom
            ? string.Join(" → ", result.ShadowPath) + " → shadowRoot"
            : "No";

        _frameText.Text = result.InsideIframe
            ? string.Join(" → ", result.FramePath)
            : "No";

        _seleniumText.Text = result.SeleniumCode;

        var stability = new StringBuilder();
        stability.Append("Rating: ");
        stability.AppendLine(result.Stability?.Rating ?? "Unknown");

        if (result.Stability?.Positive?.Count > 0)
        {
            stability.AppendLine();
            stability.AppendLine("Positive:");
            foreach (var item in result.Stability.Positive)
                stability.AppendLine("✓ " + item);
        }

        if (result.Stability?.Warnings?.Count > 0)
        {
            stability.AppendLine();
            stability.AppendLine("Warnings:");
            foreach (var item in result.Stability.Warnings)
                stability.AppendLine("⚠ " + item);
        }

        _stabilityText.Text = stability.ToString();
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

    private void ShowLocatorAnalysis(LocatorResult? result)
    {
        if (result == null) return;
        using var dialog = new Form
        {
            Text = $"Locator Analysis — <{result.TagName}>",
            Width = 1200,
            Height = 650,
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
        grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Recommendation", Width = 190 });
        grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Matches", Width = 70 });
        grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Scope / marker", Width = 180 });
        grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Execution", Width = 180 });
        grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Resilience", Width = 185 });
        grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Dependencies / risks", Width = 320 });
        grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Item container locator", Width = 420 });
        grid.Columns[8].DisplayIndex = 0;
        grid.Columns[9].DisplayIndex = 2;
        // Preserve the analyser's recommendation order, including uniqueness.
        var allCandidates = result.DetailedCandidates.ToList();
        void AddCandidateRow(LocatorCandidate candidate)
        {
            var i = grid.Rows.Add(candidate.Score, candidate.Unique ? "Yes" : "No",
                candidate.Visible ? "Yes" : "No", candidate.Clickable ? "Yes" : "No",
                candidate.Category, candidate.Type, candidate.Value, candidate.Rationale,
                candidate.Recommendation, candidate.Matches, candidate.Scope,
                candidate.Execution, candidate.Resilience, candidate.Risk, candidate.ContainerLocator);
            grid.Rows[i].Tag = candidate;
            if (candidate.Recommendation.Contains("Best overall", StringComparison.Ordinal))
                grid.Rows[i].DefaultCellStyle.BackColor = Color.Honeydew;
            foreach (DataGridViewCell cell in grid.Rows[i].Cells)
                cell.ToolTipText = candidate.Rationale + Environment.NewLine + candidate.Risk;
        }
        foreach (var candidate in allCandidates) AddCandidateRow(candidate);
        var bottom = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 44, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(8) };
        var copy = new Button { Text = "Copy Selected Locator", AutoSize = true };
        copy.Click += (_, _) => { if (grid.CurrentRow?.Tag is LocatorCandidate c) CopyText(c.Value); };
        var close = new Button { Text = "Close", AutoSize = true };
        close.Click += (_, _) => dialog.Close();
        var copyContainer = new Button { Text = "Copy Item Container", AutoSize = true,
            Enabled = grid.CurrentRow?.Tag is LocatorCandidate initial && initial.ContainerLocator.Length > 0 };
        copyContainer.Click += (_, _) => {
            if (grid.CurrentRow?.Tag is LocatorCandidate c && c.ContainerLocator.Length > 0)
                CopyText(c.ContainerLocator);
        };
        grid.SelectionChanged += (_, _) => {
            copyContainer.Enabled = grid.CurrentRow?.Tag is LocatorCandidate c && c.ContainerLocator.Length > 0;
        };
        bottom.Controls.Add(close); bottom.Controls.Add(copy); bottom.Controls.Add(copyContainer);

        var testPanel = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 76,
            Padding = new Padding(8, 6, 8, 4),
            ColumnCount = 2,
            RowCount = 2
        };
        testPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        testPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 125));
        testPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));
        testPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 25));
        var locatorInput = new TextBox
        {
            Dock = DockStyle.Fill,
            PlaceholderText = "Enter a CSS selector or XPath",
            Text = (grid.CurrentRow?.Tag as LocatorCandidate)?.Value ?? ""
        };
        var testButton = new Button { Text = "Test Locator", Dock = DockStyle.Fill };
        var testStatus = new Label { Dock = DockStyle.Fill, AutoEllipsis = true,
            Text = "Enter a locator and click Test Locator." };
        testPanel.Controls.Add(locatorInput, 0, 0);
        testPanel.Controls.Add(testButton, 1, 0);
        testPanel.Controls.Add(testStatus, 0, 1);
        testPanel.SetColumnSpan(testStatus, 2);
        testButton.Click += (_, _) => {
            var locator = locatorInput.Text.Trim();
            if (locator.Length == 0)
            {
                testStatus.Text = "Enter a CSS selector or XPath first.";
                return;
            }
            try
            {
                var test = _inspector!.TestLocator(locator, result.SelectionIndex, _inspectorScript);
                testStatus.ForeColor = test.Error == null ? System.Drawing.SystemColors.ControlText : System.Drawing.Color.DarkRed;
                testStatus.Text = test.Error == null
                    ? $"Matches: {test.Count} | Selected element: {(test.SelectedElementMatched ? "Yes" : "No")} | Visible: {(test.Visible ? "Yes" : "No")} | Clickable: {(test.Clickable ? "Yes" : "No")}"
                    : $"Invalid locator: {test.Error}";
            }
            catch (Exception ex)
            {
                testStatus.ForeColor = System.Drawing.Color.DarkRed;
                testStatus.Text = $"Unable to test locator: {ex.Message}";
            }
        };
        locatorInput.KeyDown += (_, e) => {
            if (e.KeyCode != System.Windows.Forms.Keys.Enter) return;
            e.SuppressKeyPress = true;
            testButton.PerformClick();
        };

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
            var search = filterInput.Text.Trim();
            var previous = grid.CurrentRow?.Tag as LocatorCandidate;
            var matches = allCandidates.Where(c => search.Length == 0 ||
                c.Value.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                c.Type.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                c.Category.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                c.Rationale.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                c.Recommendation.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                c.Scope.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                c.ContainerLocator.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                c.Execution.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                c.Resilience.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                c.Risk.Contains(search, StringComparison.OrdinalIgnoreCase)).ToList();
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
        grid.SelectionChanged += (_, _) => {
            if (filteringRows || !grid.Focused || grid.CurrentRow?.Tag is not LocatorCandidate candidate) return;
            locatorInput.Text = candidate.Value;
            try { _inspector?.HighlightLocator(candidate.Value, _inspectorScript); }
            catch (Exception ex) { MessageBox.Show(dialog, ex.Message, "Unable to highlight locator"); }
        };
        grid.CellDoubleClick += (_, _) => { if (grid.CurrentRow?.Tag is LocatorCandidate c) CopyText(c.Value); };
        dialog.Controls.Add(grid); dialog.Controls.Add(bottom);
        dialog.Controls.Add(filterPanel); dialog.Controls.Add(testPanel);
        if (result.DetailedCandidates.Count == 0)
            MessageBox.Show(this, "No detailed locator candidates were generated for this element.", "Locator Analysis");
        dialog.ShowDialog(this);
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

    private void SelectGridRow(int rowIndex)
    {
        if (rowIndex < 0 || rowIndex >= _candidateList.Rows.Count) return;

        var result = _candidateList.Rows[rowIndex].Tag as LocatorResult;
        if (result == null) return;

        DisplaySingleResult(result);
        _inspector?.HighlightSelection(result.SelectionIndex);
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
        _elementText.Clear();
        _cssText.Clear();
        _xpathText.Clear();
        _shadowText.Clear();
        _frameText.Clear();
        _seleniumText.Clear();
        _stabilityText.Clear();
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
