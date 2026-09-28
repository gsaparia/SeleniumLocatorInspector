using System.Text.Json;
using OpenQA.Selenium;

namespace SeleniumLocatorInspector.Inspector;

public sealed class LocatorInspector
{
    private readonly IWebDriver _driver;
    private readonly IJavaScriptExecutor _js;

    public LocatorInspector(IWebDriver driver)
    {
        _driver = driver;
        _js = (IJavaScriptExecutor)driver;
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
            _js.ExecuteScript("window.__seleniumLocatorInspector.stop();");
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
    public bool SelectedElementMatched { get; set; }
    public bool Visible { get; set; }
    public bool Clickable { get; set; }
    public string? Error { get; set; }
}
