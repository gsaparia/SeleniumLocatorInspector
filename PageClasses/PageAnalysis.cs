namespace SeleniumLocatorInspector.PageClasses;

public sealed class PageAnalysis
{
    public string Title { get; set; } = "";
    public string Url { get; set; } = "";
    public List<PageField> Fields { get; set; } = [];
    public List<PageElementInfo> Elements { get; set; } = [];
    public List<PageRepeater> Repeaters { get; set; } = [];
    public List<PageMenu> Menus { get; set; } = [];
    public List<PagePager> Pagers { get; set; } = [];
    public List<string> Warnings { get; set; } = [];
    public List<PageSection> Sections { get; set; } = [];
    public PageCoverage Coverage { get; set; } = new();
}
public sealed class PageField
{
    public string Key { get; set; } = "";
    public string Label { get; set; } = "";
    public string Section { get; set; } = "";
    public string Kind { get; set; } = "";
    public string Locator { get; set; } = "";
    public string Evidence { get; set; } = "";
    public string OptionLocator { get; set; } = "";
    public string Group { get; set; } = "";
    public bool ReadOnly { get; set; }
    public List<string> Aliases { get; set; } = [];
    public List<PageOption> Options { get; set; } = [];
}
public sealed class PageOption
{
    public string Label { get; set; } = "";
    public string Locator { get; set; } = "";
}
public sealed class PageElementInfo
{
    public string Kind { get; set; } = "";
    public string Name { get; set; } = "";
    public string Locator { get; set; } = "";
    public string Evidence { get; set; } = "";
}
public sealed class PageRepeater
{
    public string Name { get; set; } = "";
    public string Kind { get; set; } = "";
    public string KeyLocator { get; set; } = "";
    public bool KeyNormalize { get; set; } = true;
    public bool Matrix { get; set; }
    public string TableLocator { get; set; } = "";
    public List<string> KeyColumns { get; set; } = [];
    public int SampleCount { get; set; }
    public string Evidence { get; set; } = "";
    public string Locator { get; set; } = "";
    public List<PageElementInfo> Children { get; set; } = [];
}
public sealed class PagePager
{
    public string Name { get; set; } = "";
    public string Locator { get; set; } = "";
    public string NextLocator { get; set; } = "";
    public string PreviousLocator { get; set; } = "";
    public string PageTemplate { get; set; } = "";
    public string CurrentLocator { get; set; } = "";
    public List<string> RowLocators { get; set; } = [];
    public string Evidence { get; set; } = "";
}
public sealed class PageMenu
{
    public string Key { get; set; } = "";
    public string Section { get; set; } = "";
    public string CaptionPath { get; set; } = "";
    public List<string> Path { get; set; } = [];
    public List<string> Actions { get; set; } = [];
}

public sealed class PageSection
{
    public List<PageElementInfo> Children { get; set; } = [];
    public string Name { get; set; } = "";
    public string Kind { get; set; } = "";
    public string Locator { get; set; } = "";
    public string Evidence { get; set; } = "";
}
public sealed class PageCoverage
{
    public int SupportedFields { get; set; }
    public int LocatorOnly { get; set; }
    public int Unresolved { get; set; }
    public int LoadedRows { get; set; }
}
