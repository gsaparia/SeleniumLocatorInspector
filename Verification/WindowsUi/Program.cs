using System.Reflection;
using SeleniumLocatorInspector;
using SeleniumLocatorInspector.Inspector;
using SeleniumLocatorInspector.UI;
using SeleniumLocatorInspector.Network;
using SeleniumLocatorInspector.PageClasses;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        var originalTheme = AppTheme.Mode;
        AppTheme.SetMode(ThemeMode.Light, save: false);
        using var toolbox = new MainForm();
        toolbox.Show();
        Application.DoEvents();
        Check(toolbox.ClientSize.Width <= 360, "Toolbox width");
        var controls = Descendants(toolbox).ToList();
        Check(!controls.OfType<DataGridView>().Any(), "No grid in toolbox");
        Check(!controls.OfType<Button>().Any(b => b.Text.Contains("Pick Element") || b.Text.Contains("Select Rectangle")), "Selection buttons moved");
        controls.OfType<Button>().Single(b => b.Text == "Locator Analysis").PerformClick();
        Application.DoEvents();
        var analysis = (Form)Field(toolbox, "_analysisForm")!;
        Check(analysis.Visible, "Empty analysis window opens");
        Check(Descendants(analysis).OfType<Button>().Any(b=>b.Text=="Create Page Class"), "Page class button available before selection");
        var parent = (DataGridView)Field(toolbox, "_candidateList")!;
        Check(parent.FindForm() == analysis, "Parent grid moved");
        var details = Descendants(analysis).OfType<DataGridView>().Single(g => g != parent);
        Check(!details.Columns.Cast<DataGridViewColumn>().Any(c => new[] { "Execution", "Resilience", "Recommendation", "Dependencies / risks" }.Contains(c.HeaderText)), "Removed columns");
        var a = new LocatorCandidate { Type = "CSS", Value = "input", Unique = true, Recommendation = "Best CSS" };
        var b = new LocatorCandidate { Type = "XPATH", Value = "//input[@name='email']", Unique = true, Recommendation = "Best XPath" };
        var c = new LocatorCandidate { Type = "XPATH", Value = "//input", Unique = true };
        var elements = Enumerable.Range(0, 8).Select(i => new LocatorResult {
            TagName = "input", Text = "Field " + i, Candidates = [a,b,c], DetailedCandidates = [b,c,a]
        }).ToList();
        Invoke(toolbox,"DisplayRectangleResults",elements);
        Application.DoEvents();
        Check(parent.Rows.Count == 8 && parent.DisplayedRowCount(false) == 5, "Five parent rows visible with overflow");
        var lengths = details.Rows.Cast<DataGridViewRow>().Select(r => ((LocatorCandidate)r.Tag!).Value.Length).ToArray();
        Check(lengths.SequenceEqual(lengths.Order()), "Locator rows shortest first");
        Check(details.Rows.Cast<DataGridViewRow>().Where(r => ((LocatorCandidate)r.Tag!).Recommendation.Length > 0)
            .All(r => r.DefaultCellStyle.ForeColor == AppTheme.Palette.Success), "CSS and XPath recommendations green");
        Invoke(toolbox,"SelectGridRow",1);
        Check(details.Rows.Count == 3, "Parent selection refreshes details");
        analysis.Hide();
        controls.OfType<Button>().Single(b => b.Text == "Locator Analysis").PerformClick();
        Check(ReferenceEquals(analysis,Field(toolbox,"_analysisForm")) && analysis.Visible, "Analysis reused on reopen");
        Invoke(toolbox,"ClearDisplay");
        Check(parent.Rows.Count == 0 && details.Rows.Count == 0, "Clear removes stale results in both grids");
        Invoke(toolbox, "DisplayRectangleResults", elements);
        using var network = new NetworkTrafficForm();
        network.Show();
        var requestGrid = (DataGridView)Field(network, "_grid")!;
        var entry = new NetworkEntry("theme-check", "1", "https://example.com/api/cart", "GET", "Complete",
            404, "application/json", 12, 0, "Accept: application/json", "Content-Type: application/json", "", "");
        var cache = (Dictionary<string, CapturedBody[]>)Field(network, "_bodyCache")!;
        var bytes = System.Text.Encoding.UTF8.GetBytes("{\"error\":\"missing\"}");
        cache[entry.Key] = [new("", []), new(System.Text.Encoding.UTF8.GetString(bytes), bytes)];
        Invoke(network, "UpdateRow", entry);
        var bodyViewer = (CodeViewer)Field(network, "_responseBody")!;
        var bodyBeforeTheme = bodyViewer.Text;
        var locatorBeforeTheme = details.CurrentRow;
        var networkSelection = requestGrid.CurrentRow;
        var selector = controls.OfType<ComboBox>().Single(cmb => cmb.Name == "ThemeSelector");
        // Use a no-save switch so the smoke test does not change the user's preference.
        AppTheme.SetMode(ThemeMode.Dark, save: false);
        Application.DoEvents();
        Check(selector.SelectedItem?.ToString() == "Dark", "Theme selectors synchronized");
        Check(toolbox.BackColor == ThemePalette.Dark.Background && analysis.BackColor == toolbox.BackColor && network.BackColor == toolbox.BackColor, "All open windows change theme");
        Check(requestGrid.Rows[0].DefaultCellStyle.ForeColor == ThemePalette.Dark.Error, "Network errors remain red in dark mode");
        Check(details.Rows.Cast<DataGridViewRow>().Where(r => ((LocatorCandidate)r.Tag!).Recommendation.Length > 0)
            .All(r => r.DefaultCellStyle.ForeColor == ThemePalette.Dark.Success), "Recommended locators stay green in dark mode");
        Check(ReferenceEquals(locatorBeforeTheme, details.CurrentRow) && ReferenceEquals(networkSelection, requestGrid.CurrentRow), "Theme switch retains selections");
        Check(bodyViewer.Text == bodyBeforeTheme && bodyViewer.Text.Contains("missing"), "Theme switch retains response body");
        Invoke(network, "UpdateRow", entry with { Key = "second", Url = "https://example.com/other", Status = 200, State = "Pending" });
        var filter = (TextBox)Field(network, "_filter")!;
        filter.Text = "cart";
        Check(requestGrid.Rows[0].Visible && !requestGrid.Rows[1].Visible, "Request filter preserves row index mapping");
        Invoke(network, "UpdateRow", entry with { Key = "second", Url = "https://example.com/cart", Status = 200, State = "Pending" });
        Check(requestGrid.Rows[1].Visible, "Updated requests are reevaluated by filter");
        using (var resend = (Form)Activator.CreateInstance(typeof(NetworkTrafficForm).Assembly.GetType("SeleniumLocatorInspector.Network.ResendRequestForm")!, entry, new CapturedBody("", []))!)
        {
            Check(resend.BackColor == ThemePalette.Dark.Background, "New resend window inherits dark theme");
            AppTheme.SetMode(ThemeMode.Light, save: false);
            Check(resend.BackColor == ThemePalette.Light.Background, "Open resend window switches live");
        }
        Check(requestGrid.Rows[0].DefaultCellStyle.ForeColor == ThemePalette.Light.Error, "Network errors remain red in light mode");
        Check(requestGrid.Rows.Count == 2 && cache[entry.Key][1].Bytes!.SequenceEqual(bytes), "Theme/filter changes preserve captures");
        var pageAnalysis = new PageAnalysis { Url="https://example.test/register", Fields=[new() { Key="Email",Kind="text",Locator="//input[@name='email']",Evidence="Associated label" }] };
        var highlighted=new List<string>();
        using (var preview = new PageClassPreviewForm(pageAnalysis,()=>Task.FromResult(pageAnalysis),review:(locator,relative)=>
        {
            highlighted.Add(locator);
            return Task.FromResult(locator=="//input[" ? new RelationshipReview {Valid=false,Error="Invalid XPath/CSS: bad predicate"} : new RelationshipReview {Valid=true,Count=1,Css="input[name=email]",CssNote="Verified CSS"});
        }))
        {
            preview.Show(); Application.DoEvents();
            Check(preview.BackColor==AppTheme.Palette.Background,"Page preview follows theme");
            var code=Descendants(preview).OfType<CodeViewer>().Single();
            Check(code.Text.Contains("class RegisterPage") && code.Text.Contains("GetText("),"Page preview generates C#");
            Check(Descendants(preview).OfType<Button>().Any(b=>b.Text=="Save .cs"),"Source export available");
            var relationships=Descendants(preview).OfType<DataGridView>().Single();
            Check(relationships.Rows.Count==1,"Relationship report populated");
            Check(!relationships.Columns[4].ReadOnly&&relationships.Columns[0].ReadOnly,"Only locator column editable");
            for(var column=0;column<relationships.Columns.Count;column++)
                typeof(DataGridView).GetMethod("OnCellClick",BindingFlags.Instance|BindingFlags.NonPublic)!.Invoke(relationships,[new DataGridViewCellEventArgs(column,0)]);
            Check(highlighted.Count==relationships.Columns.Count,"Clicking any cell highlights the row locator");
            relationships.Rows[0].Cells[4].Value="//input[@name='updated-email']";
            typeof(DataGridView).GetMethod("OnCellEndEdit",BindingFlags.Instance|BindingFlags.NonPublic)!.Invoke(relationships,[new DataGridViewCellEventArgs(4,0)]);
            Check(pageAnalysis.Fields[0].Locator.Contains("updated-email")&&code.Text.Contains("updated-email"),"Locator edit persists into generated code");
            var relationshipFilter=(TextBox)Field(preview,"_relationshipFilter")!;
            relationshipFilter.Text="missing-filter-value";
            Check(relationships.Rows.Cast<DataGridViewRow>().All(r=>!r.Visible),"Typing filters relationship rows");
            relationshipFilter.Clear();
            Check(relationships.Rows[0].Visible&&pageAnalysis.Fields[0].Locator.Contains("updated-email"),"Clearing filter restores edited rows");
            relationships.Rows[0].Cells[4].Value="//input[";
            typeof(DataGridView).GetMethod("OnCellEndEdit",BindingFlags.Instance|BindingFlags.NonPublic)!.Invoke(relationships,[new DataGridViewCellEventArgs(4,0)]);
            Check(relationships.Rows[0].DefaultCellStyle.ForeColor==AppTheme.Palette.Error&&relationships.Rows[0].ErrorText.Contains("Invalid"),"Invalid locator errors shown in red");
            Check(((Label)Field(preview,"_relationshipStatus")!).ForeColor==AppTheme.Palette.Error,"Error status red");
            relationships.Rows[0].Cells[4].Value="//input[@name='corrected']";
            typeof(DataGridView).GetMethod("OnCellEndEdit",BindingFlags.Instance|BindingFlags.NonPublic)!.Invoke(relationships,[new DataGridViewCellEventArgs(4,0)]);
            Check(relationships.Rows[0].ErrorText.Length==0&&Convert.ToString(relationships.Rows[0].Cells["Css"].Value)=="input[name=email]","Corrected locator clears error and shows CSS suggestion");
            AppTheme.SetMode(ThemeMode.Dark,save:false);
            Check(preview.BackColor==ThemePalette.Dark.Background && code.Text.Contains("class RegisterPage"),"Preview changes theme without losing code");
            preview.Close();
        }
        AppTheme.SetMode(originalTheme, save: false);
        network.Close();
        toolbox.Close();
        Console.WriteLine("Passed Windows UI and theme smoke checks.");
    }
    private static object? Field(object target,string name) => target.GetType().GetField(name,BindingFlags.Instance|BindingFlags.NonPublic)!.GetValue(target);
    private static void Invoke(object target,string name,params object[] args) => target.GetType().GetMethod(name,BindingFlags.Instance|BindingFlags.NonPublic)!.Invoke(target,args);
    private static IEnumerable<Control> Descendants(Control parent)
    {
        foreach (Control child in parent.Controls) { yield return child; foreach (var nested in Descendants(child)) yield return nested; }
    }
    private static void Check(bool condition,string name) { if (!condition) throw new Exception(name); }
}
