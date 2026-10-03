using System.Text.Json;
using OpenQA.Selenium;
using SeleniumLocatorInspector.PageClasses;

namespace SeleniumLocatorInspector.Inspector;

public sealed class LocatorInspector
{
    private readonly InspectorCommandQueue _commands = new();
    private readonly IWebDriver _driver;
    private readonly IJavaScriptExecutor _js;

    public LocatorInspector(IWebDriver driver)
    {
        _driver = driver;
        _js = (IJavaScriptExecutor)driver;
    }

    public Task<T> RunAsync<T>(Func<LocatorInspector,T> command) => _commands.RunAsync(()=>command(this));
    public Task<SelectionPacket?> PollAsync() => _commands.TryRunAsync(GetSelectionPacket);

    private SelectionPacket GetSelectionPacket()
    {
        // Consume once in the same browser task. A separate clear command could
        // accidentally erase a newer selection produced between the two calls.
        var json=_js.ExecuteScript("const result=window.__seleniumLocatorResult||null; const json=JSON.stringify({result,status:window.__seleniumLocatorInspector?.selectionStatus||{phase:'idle'}}); if(result)window.__seleniumLocatorResult=null; return json;") as string;
        return JsonSerializer.Deserialize<SelectionPacket>(json??"{}",new JsonSerializerOptions {PropertyNameCaseInsensitive=true})??new SelectionPacket();
    }

    public PageAnalysis AnalysePage(string inspectorScript)
    {
        _js.ExecuteScript(inspectorScript);
        _js.ExecuteScript(PageClassGenerator.ReadResource("page-class-analyser.js"));
        var json = _js.ExecuteScript("return JSON.stringify(window.__seleniumLocatorInspector.analysePage());") as string;
        return JsonSerializer.Deserialize<PageAnalysis>(json ?? "{}",
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new PageAnalysis();
    }

    public void StartPicker(string script)
    {
        _js.ExecuteScript(script);
        _js.ExecuteScript("window.__seleniumLocatorInspector.start();");
    }

    public void StartRectangleSelector(string script)
    {
        _js.ExecuteScript(script);
        _js.ExecuteScript("window.__seleniumLocatorInspector.startRectangleSelection();");
    }

    public void StopPicker()
    {
        try
        {
            _js.ExecuteScript("window.__seleniumLocatorInspector.stop(); window.__seleniumLocatorInspector.stopRectangleSelection();");
        }
        catch
        {
        }
    }

    public void ClearSelectedResult()
    {
        try
        {
            _js.ExecuteScript("window.__seleniumLocatorResult = null;");
        }
        catch
        {
        }
    }

    public void HighlightSelection(int index)
    {
        try
        {
            _js.ExecuteScript(
                "window.__seleniumLocatorInspector.highlightSelection(arguments[0]);",
                index);
        }
        catch
        {
        }
    }

    public int HighlightLocator(string locator, string inspectorScript)
    {
        if (string.IsNullOrWhiteSpace(locator)) return 0;
        // Reinstall after navigation. Pass the locator as an argument, never JS source.
        _js.ExecuteScript(inspectorScript);
        return Convert.ToInt32(_js.ExecuteScript(
            "return window.__seleniumLocatorInspector.highlightLocator(arguments[0]);", locator));
    }

    public int HighlightRelationship(string locator,string? relative,string inspectorScript)
    {
        _js.ExecuteScript(inspectorScript);
        return Convert.ToInt32(_js.ExecuteScript("return window.__seleniumLocatorInspector.highlightRelationship(arguments[0],arguments[1]);",locator,relative));
    }

    public RelationshipReview ReviewRelationship(string locator,string? relative,string inspectorScript)
    {
        _js.ExecuteScript(inspectorScript);
        var json=_js.ExecuteScript("return JSON.stringify(window.__seleniumLocatorInspector.reviewRelationship(arguments[0],arguments[1]));",locator,relative) as string;
        return JsonSerializer.Deserialize<RelationshipReview>(json??"{}",new JsonSerializerOptions {PropertyNameCaseInsensitive=true})??new RelationshipReview();
    }

    public LocatorTestResult TestLocator(string locator, int selectionIndex, string inspectorScript)
    {
        // Selenium passes the locator as data; it is never interpolated into JavaScript.
        _js.ExecuteScript(inspectorScript);
        var json = _js.ExecuteScript(
            "return JSON.stringify(window.__seleniumLocatorInspector.testLocator(arguments[0], arguments[1]));",
            locator, selectionIndex) as string;

        return JsonSerializer.Deserialize<LocatorTestResult>(json ?? "{}",
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new LocatorTestResult();
    }

    public LocatorJavaScriptResult TestJavaScript(string locator, string script, string inspectorScript)
    {
        _js.ExecuteScript(inspectorScript);
        var json = _js.ExecuteAsyncScript(
            "var done = arguments[arguments.length - 1]; " +
            "window.__seleniumLocatorInspector.executeLocatorJavaScript(arguments[0], arguments[1])" +
            ".then(function(result) { done(JSON.stringify(result)); }, " +
            "function(error) { done(JSON.stringify({ success:false, error:String(error) })); });",
            locator, script) as string;
        return JsonSerializer.Deserialize<LocatorJavaScriptResult>(json ?? "{}",
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new LocatorJavaScriptResult();
    }

    public LocatorResult? GetSelectedResult()
    {
        var json = _js.ExecuteScript(
            "return JSON.stringify(window.__seleniumLocatorResult || null);") as string;

        if (string.IsNullOrWhiteSpace(json) || json == "null")
            return null;

        return JsonSerializer.Deserialize<LocatorResult>(
            json,
            new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });
    }
}

public sealed class LocatorTestResult
{
    public int Count { get; set; }
    public double? Width { get; set; }
    public double? Height { get; set; }
    public string DimensionsOf { get; set; } = "";
    public bool SelectedElementMatched { get; set; }
    public bool Visible { get; set; }
    public bool Clickable { get; set; }
    public string? Error { get; set; }
}

public sealed class LocatorJavaScriptResult
{
    public bool Success { get; set; }
    public int Count { get; set; }
    public string Result { get; set; } = "";
    public string? Error { get; set; }
}

public sealed class RelationshipReview
{
    public bool Valid { get; set; }
    public int Count { get; set; }
    public string Error { get; set; } = "";
    public string Css { get; set; } = "";
    public string CssNote { get; set; } = "";
}

public sealed class SelectionPacket
{
    public LocatorResult? Result { get; set; }
    public SelectionProgress Status { get; set; } = new();
}
public sealed class SelectionProgress
{
    public string Phase { get; set; } = "idle";
    public int Completed { get; set; }
    public int Total { get; set; }
    public string Error { get; set; } = "";
}
