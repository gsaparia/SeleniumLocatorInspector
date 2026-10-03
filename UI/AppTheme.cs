using System.Configuration;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using SeleniumLocatorInspector.Properties;

namespace SeleniumLocatorInspector.UI;

public enum ThemeMode { Light, Dark }
public enum RowTone { Normal, Recommended, Error }

public sealed record ThemePalette(Color Background, Color Surface, Color Header, Color Text,
    Color Muted, Color Border, Color Accent, Color AccentText, Color Selection,
    Color Success, Color SuccessBackground, Color Error, Color ErrorBackground)
{
    private static Color Hex(string value) => ColorTranslator.FromHtml(value);
    public static ThemePalette Light { get; } = new(Hex("#F4F7FB"), Color.White, Hex("#EEF3F8"),
        Hex("#10263D"), Hex("#64748B"), Hex("#D8E2EF"), Hex("#006ADC"), Color.White,
        Hex("#DBEBFD"), Hex("#166534"), Hex("#ECF9EF"), Hex("#B91C1C"), Hex("#FEE2E2"));
    public static ThemePalette Dark { get; } = new(Hex("#101B26"), Hex("#172736"), Hex("#223747"),
        Hex("#E6EDF3"), Hex("#A4B8C9"), Hex("#304659"), Hex("#44DFF0"), Hex("#08212C"),
        Hex("#164B6C"), Hex("#9EE8AD"), Hex("#1B3E2E"), Hex("#FF8F91"), Hex("#4C252B"));
}

/// <summary>Shared styling and per-user preference; never changes browser page styles.</summary>
public static class AppTheme
{
    private sealed class ControlStyle
    {
        public bool Installed;
        public bool Primary;
        public bool Editor;
        public bool Muted;
        public bool? Success;
    }
    private sealed class RowStyle { public RowTone Tone; }
    private static readonly ConditionalWeakTable<Control, ControlStyle> Styles = new();
    private static readonly ConditionalWeakTable<DataGridViewRow, RowStyle> Rows = new();
    private static readonly HashSet<Form> Windows = new();
    private static readonly Font UiFont = new("Segoe UI", 9F);
    private static readonly Font CodeFont = new("Consolas", 9.5F);
    public static ThemeMode Mode { get; private set; } = ReadPreference();
    public static ThemePalette Palette => Mode == ThemeMode.Dark ? ThemePalette.Dark : ThemePalette.Light;
    public static event EventHandler? Changed;

    private static ThemeMode ReadPreference()
    {
        try { return Settings.Default.Theme == "Dark" ? ThemeMode.Dark : ThemeMode.Light; }
        catch (ConfigurationErrorsException) { return ThemeMode.Light; }
    }

    public static bool SetMode(ThemeMode mode, bool save = true)
    {
        Mode = mode;
        foreach (var form in Windows.ToArray())
            if (!form.IsDisposed) Apply(form);
        Changed?.Invoke(null, EventArgs.Empty);
        if (!save) return true;
        try { Settings.Default.Theme = mode.ToString(); Settings.Default.Save(); return true; }
        catch (Exception ex) when (ex is ConfigurationErrorsException or IOException or UnauthorizedAccessException)
        { return false; } // Keep the selected theme usable even on a read-only profile.
    }

    public static void Register(Form form)
    {
        if (!Windows.Add(form)) return;
        form.Font = UiFont;
        form.HandleCreated += (_, _) => ApplyTitleBar(form);
        form.Disposed += (_, _) => Windows.Remove(form);
        Apply(form);
    }

    public static void Primary(Button button) { Styles.GetValue(button, _ => new ControlStyle()).Primary = true; Apply(button); }
    public static void Editor(Control editor) { Styles.GetValue(editor, _ => new ControlStyle()).Editor = true; Apply(editor); }
    public static void Muted(Control label) { Styles.GetValue(label, _ => new ControlStyle()).Muted = true; Apply(label); }
    public static void Status(Control control, bool? success)
    { Styles.GetValue(control, _ => new ControlStyle()).Success = success; Apply(control); }
    public static void Row(DataGridViewRow row, RowTone tone)
    { Rows.GetValue(row, _ => new RowStyle()).Tone = tone; ApplyRow(row); }

    public static Control CreateSelector()
    {
        var panel = new FlowLayoutPanel { AutoSize = true, WrapContents = false, Margin = new Padding(8, 2, 0, 0) };
        panel.Controls.Add(new Label { Text = "Theme", AutoSize = true, Margin = new Padding(0, 7, 8, 0) });
        var combo = new ComboBox { Name = "ThemeSelector", Width = 95, DropDownStyle = ComboBoxStyle.DropDownList };
        combo.Items.AddRange(["Light", "Dark"]);
        combo.SelectedIndex = Mode == ThemeMode.Dark ? 1 : 0;
        var updating = false;
        EventHandler changed = (_, _) =>
        {
            updating = true;
            try { combo.SelectedIndex = Mode == ThemeMode.Dark ? 1 : 0; }
            finally { updating = false; }
        };
        Changed += changed;
        combo.Disposed += (_, _) => Changed -= changed;
        combo.SelectedIndexChanged += (_, _) =>
        {
            if (updating) return;
            if (!SetMode(combo.SelectedIndex == 1 ? ThemeMode.Dark : ThemeMode.Light))
                MessageBox.Show(combo.FindForm(), "The theme has changed for this session, but your preference could not be saved.", "Theme preference");
        };
        panel.Controls.Add(combo);
        Apply(panel);
        return panel;
    }

    public static void Apply(Control control)
    {
        if (control.IsDisposed) return;
        var p = Palette;
        var style = Styles.GetValue(control, _ => new ControlStyle());
        if (!style.Installed)
        {
            style.Installed = true;
            control.ControlAdded += (_, e) => { if (e.Control != null) Apply(e.Control); };
            if (control is Button button) button.EnabledChanged += (_, _) => Apply(button);
            if (control is TabControl tabs)
            {
                tabs.DrawMode = TabDrawMode.OwnerDrawFixed;
                tabs.SizeMode = TabSizeMode.Normal;
                tabs.Padding = new Point(18, 8);
                tabs.DrawItem += DrawTab;
            }
            if (control is ComboBox combo && combo.DropDownStyle == ComboBoxStyle.DropDownList)
            {
                combo.DrawMode = DrawMode.OwnerDrawFixed;
                combo.ItemHeight = 22;
                combo.DrawItem += DrawCombo;
            }
        }
        control.BackColor = control is Form or SplitContainer ? p.Background : p.Surface;
        control.ForeColor = style.Success.HasValue ? (style.Success.Value ? p.Success : p.Error)
            : style.Muted ? p.Muted : p.Text;
        if (style.Editor) control.Font = CodeFont;
        if (control is Button b)
        {
            b.FlatStyle = FlatStyle.Flat;
            b.UseVisualStyleBackColor = false;
            b.FlatAppearance.BorderSize = 1;
            b.FlatAppearance.BorderColor = style.Primary ? p.Accent : p.Border;
            b.FlatAppearance.MouseOverBackColor = style.Primary ? ControlPaint.Light(p.Accent, .1F) : p.Selection;
            b.FlatAppearance.MouseDownBackColor = p.Selection;
            b.BackColor = style.Primary && b.Enabled ? p.Accent : p.Header;
            b.ForeColor = !b.Enabled ? p.Muted : style.Primary ? p.AccentText : p.Text;
            b.Padding = new Padding(9, 3, 9, 3);
            b.MinimumSize = new Size(0, 30);
        }
        if (control is TextBox box) box.BorderStyle = BorderStyle.FixedSingle;
        if (control is RichTextBox rich) rich.BorderStyle = BorderStyle.None;
        if (control is DataGridView grid) ApplyGrid(grid);
        if (control is ToolStrip strip)
        {
            strip.Renderer = new ToolStripProfessionalRenderer(new ThemeColorTable());
            foreach (ToolStripItem item in strip.Items) item.ForeColor = p.Text;
        }
        if (control.ContextMenuStrip != null) Apply(control.ContextMenuStrip);
        if (control is Form form) ApplyTitleBar(form);
        foreach (Control child in control.Controls) Apply(child);
        control.Invalidate();
    }

    private static void ApplyGrid(DataGridView grid)
    {
        var p = Palette;
        grid.BackgroundColor = p.Surface;
        grid.BorderStyle = BorderStyle.None;
        grid.GridColor = p.Border;
        grid.EnableHeadersVisualStyles = false;
        grid.CellBorderStyle = DataGridViewCellBorderStyle.SingleHorizontal;
        grid.ColumnHeadersBorderStyle = DataGridViewHeaderBorderStyle.Single;
        grid.ColumnHeadersDefaultCellStyle.BackColor = p.Header;
        grid.ColumnHeadersDefaultCellStyle.ForeColor = p.Text;
        grid.ColumnHeadersDefaultCellStyle.SelectionBackColor = p.Header;
        grid.ColumnHeadersDefaultCellStyle.SelectionForeColor = p.Text;
        grid.ColumnHeadersDefaultCellStyle.Padding = new Padding(6, 4, 6, 4);
        grid.DefaultCellStyle.BackColor = p.Surface;
        grid.DefaultCellStyle.ForeColor = p.Text;
        grid.DefaultCellStyle.SelectionBackColor = p.Selection;
        grid.DefaultCellStyle.SelectionForeColor = p.Text;
        grid.DefaultCellStyle.Padding = new Padding(5, 0, 5, 0);
        grid.AlternatingRowsDefaultCellStyle.BackColor = p.Background;
        grid.AlternatingRowsDefaultCellStyle.ForeColor = p.Text;
        foreach (DataGridViewRow row in grid.Rows) ApplyRow(row);
    }

    private static void ApplyRow(DataGridViewRow row)
    {
        var p = Palette;
        var tone = Rows.TryGetValue(row, out var s) ? s.Tone : RowTone.Normal;
        row.DefaultCellStyle.BackColor = tone == RowTone.Recommended ? p.SuccessBackground : Color.Empty;
        row.DefaultCellStyle.ForeColor = tone == RowTone.Recommended ? p.Success : tone == RowTone.Error ? p.Error : Color.Empty;
        row.DefaultCellStyle.SelectionForeColor = tone == RowTone.Recommended ? p.Success : tone == RowTone.Error ? p.Error : Color.Empty;
        row.DefaultCellStyle.SelectionBackColor = tone == RowTone.Error ? p.ErrorBackground : p.Selection;
        foreach (DataGridViewCell cell in row.Cells)
        {
            cell.Style.ForeColor = Color.Empty;
            cell.Style.SelectionForeColor = Color.Empty;
            cell.Style.SelectionBackColor = Color.Empty;
        }
    }

    private static void DrawTab(object? sender, DrawItemEventArgs e)
    {
        if (sender is not TabControl tabs || e.Index < 0) return;
        var p = Palette;
        var active = tabs.SelectedIndex == e.Index;
        using var brush = new SolidBrush(p.Surface);
        e.Graphics.FillRectangle(brush, e.Bounds);
        TextRenderer.DrawText(e.Graphics, tabs.TabPages[e.Index].Text, tabs.Font, e.Bounds,
            active ? p.Accent : p.Text, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
        if (!active) return;
        using var pen = new Pen(p.Accent, 3);
        e.Graphics.DrawLine(pen, e.Bounds.Left + 4, e.Bounds.Bottom - 2, e.Bounds.Right - 4, e.Bounds.Bottom - 2);
    }

    private static void DrawCombo(object? sender, DrawItemEventArgs e)
    {
        if (sender is not ComboBox combo) return;
        var p = Palette;
        using var brush = new SolidBrush((e.State & DrawItemState.Selected) != 0 ? p.Selection : p.Surface);
        e.Graphics.FillRectangle(brush, e.Bounds);
        var text = e.Index < 0 ? combo.Text : combo.GetItemText(combo.Items[e.Index]);
        TextRenderer.DrawText(e.Graphics, text, combo.Font, e.Bounds, combo.Enabled ? p.Text : p.Muted,
            TextFormatFlags.Left | TextFormatFlags.VerticalCenter);
        e.DrawFocusRectangle();
    }

    private sealed class ThemeColorTable : ProfessionalColorTable
    {
        public override Color ToolStripDropDownBackground => Palette.Surface;
        public override Color ImageMarginGradientBegin => Palette.Surface;
        public override Color ImageMarginGradientMiddle => Palette.Surface;
        public override Color ImageMarginGradientEnd => Palette.Surface;
        public override Color MenuItemSelected => Palette.Selection;
        public override Color MenuItemBorder => Palette.Border;
        public override Color MenuBorder => Palette.Border;
    }

    private static void ApplyTitleBar(Form form)
    {
        if (!form.IsHandleCreated || !OperatingSystem.IsWindows()) return;
        var dark = Mode == ThemeMode.Dark ? 1 : 0;
        try { DwmSetWindowAttribute(form.Handle, 20, ref dark, sizeof(int)); }
        catch (Exception ex) when (ex is DllNotFoundException or EntryPointNotFoundException) { }
    }
    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr window, int attribute, ref int value, int size);
}
