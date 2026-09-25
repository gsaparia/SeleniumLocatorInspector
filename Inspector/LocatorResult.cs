using System.Collections.Generic;

namespace SeleniumLocatorInspector.Inspector;

public sealed class LocatorResult
{
    public string TagName { get; set; } = "";
    public string Text { get; set; } = "";
    public string Css { get; set; } = "";
    public string XPath { get; set; } = "";
    public bool CssUnique { get; set; }
    public bool XPathUnique { get; set; }
    public bool InsideShadowDom { get; set; }
    public bool InsideIframe { get; set; }
    public List<string> ShadowPath { get; set; } = [];
    public List<string> FramePath { get; set; } = [];
    public List<LocatorCandidate> Candidates { get; set; } = [];
    public LocatorStability Stability { get; set; } = new();
    public string SeleniumCode { get; set; } = "";

    // Used by rectangle selection to identify the corresponding browser element.
    public int SelectionIndex { get; set; } = -1;
    public bool IsRectangleSelection { get; set; }
    public List<LocatorResult> RectangleResults { get; set; } = [];
}

public sealed class LocatorCandidate
{
    public string Type { get; set; } = "";
    public string Value { get; set; } = "";
    public int Score { get; set; }
    public bool Unique { get; set; }
}

public sealed class LocatorStability
{
    public string Rating { get; set; } = "";
    public List<string> Positive { get; set; } = [];
    public List<string> Warnings { get; set; } = [];
}
