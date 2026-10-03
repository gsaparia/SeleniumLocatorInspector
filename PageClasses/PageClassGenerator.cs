using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace SeleniumLocatorInspector.PageClasses;

public static class PageClassGenerator
{
    private static readonly HashSet<string> Reserved = new(StringComparer.Ordinal)
    { "class","namespace","event","string","public","private","internal","protected","new","base","this","void","return","int","bool","object","static","null","true","false","var","record","struct","interface","enum","delegate","operator","default","using","ref","out","in","params","async","await","GetText","SetText","GetRow","OpenMenu","PageElement","PageRow","FieldNames","AnalysisWarnings","AnalysedUrl","Fields","Rows","Menus","FieldSpec","RowSpec","MenuSpec","OptionSpec","ChildSpec","Query","Resolved","Box","PageRuntime","FindField","Same","Element","Container","Item","ItemLocator","GetRowByColumns","GetRowByColumn","PagerNames","NextPage","PreviousPage","GoToPage","Pagers","PagerSpec","Paging","ContainerNames","AnalysedRowLocators","RowsFingerprint","PageChanged","FindPager","MovePage","Cell","ClickAction","FindRow","XPathLiteral","EnsureUniqueRow" };
    static PageClassGenerator()
    {
        Reserved.UnionWith("SectionNames Section SectionSpec Sections PageSection SetChoice GetChoice SetDate SetDateRange SelectSuggestion OpenTab GetValue FieldsIn DateCell SetSelected SectionElement OptionLocator GetField SectionLocator Login WaitFor Tab PageInfo".Split(' '));
        Reserved.UnionWith("abstract as break byte case catch char checked const continue decimal do double else explicit extern finally fixed float for foreach goto if implicit is lock long override readonly sbyte sealed short sizeof stackalloc switch throw try typeof uint ulong unchecked unsafe ushort virtual volatile while get set init required file partial yield global when where with".Split(' '));
    }
    public static string Identifier(string text, string fallback = "Page")
    {
        var parts = Regex.Matches(text, "[A-Za-z0-9]+").Select(m => m.Value).ToArray();
        var result = string.Concat(parts.Select(p => char.ToUpperInvariant(p[0])+p[1..]));
        if(result.Length==0) result=fallback;
        if(char.IsDigit(result[0])) result="_"+result;
        if(Reserved.Contains(result)) result += "Element";
        return result;
    }
    private static readonly JsonSerializerOptions LiteralOptions = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
    private static string Literal(string value) => JsonSerializer.Serialize(value, LiteralOptions);
    private static string Strings(IEnumerable<string> values) => string.Join(", ", values.Select(Literal));
    public static string Generate(PageAnalysis page, string className, string nameSpace = "GeneratedPages")
    {
        if(!Regex.IsMatch(className, "^[A-Za-z_][A-Za-z0-9_]*$") || Reserved.Contains(className))
            throw new ArgumentException("Use a valid, non-reserved C# class name.");
        if(string.IsNullOrWhiteSpace(nameSpace) || nameSpace.Split('.').Any(p => !Regex.IsMatch(p,"^[A-Za-z_][A-Za-z0-9_]*$") || Reserved.Contains(p)))
            throw new ArgumentException("Use a valid C# namespace.");
        var used = new HashSet<string>(Reserved, StringComparer.Ordinal) { className };
        string Unique(string label, string suffix = "")
        {
            var stem=Identifier(label)+suffix; var name=stem; var index=2;
            while(!used.Add(name)) name=stem+index++;
            return name;
        }
        var fields=new StringBuilder();
        foreach(var f in page.Fields)
            fields.AppendLine($"        new FieldSpec({Literal(f.Key)}, {Literal(f.Kind)}, {Literal(f.Locator)}, {Literal(f.Section)}, {Literal(f.OptionLocator)}, {f.ReadOnly.ToString().ToLowerInvariant()}, new string[] {{ {Strings(f.Aliases)} }}, new OptionSpec[] {{ {string.Join(", ",f.Options.Select(o => $"new OptionSpec({Literal(o.Label)}, {Literal(o.Locator)})"))} }}),");
        var elements=new StringBuilder();
        foreach(var e in page.Elements)
        {
            var suffix=e.Kind.StartsWith("button") || Regex.IsMatch(e.Kind,@"^input:(submit|button|reset)$") ? "Button" : e.Kind.StartsWith("a:") ? "Link" : "Element";
            var property=Unique(e.Name,suffix);
            elements.AppendLine($"    public PageElement {property} => new PageElement(_runtime, new Query({Literal(e.Locator)}));");
        }
        var rows=new StringBuilder();
        if(page.Repeaters.Count>0)
        {
            rows.AppendLine("    private static readonly RowSpec[] Rows =\n    {");
            var analysedRows = new Dictionary<PageRepeater,string>();
            var rowNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach(var row in page.Repeaters)
            {
                var name=row.Name; var number=2; while(!rowNames.Add(name)) name=row.Name+" ("+number+++")";
                analysedRows[row]=name;
                rows.AppendLine($"        new RowSpec({Literal(name)}, {Literal(row.Locator)}, {Literal(row.Kind)}, {Literal(row.KeyLocator)}, {row.KeyNormalize.ToString().ToLowerInvariant()}, new ChildSpec[] {{ {string.Join(", ",row.Children.Select(c=>$"new ChildSpec({Literal(c.Name)}, {Literal(c.Locator)}, {Literal(c.Kind)})"))} }}),");
            }
            rows.AppendLine("    };");
            rows.AppendLine("""
    // Searches currently loaded, displayed rows/cards. Optional container disambiguates regions.
    public PageRow GetRow(string searchText,string? container = null)
    {
        if(string.IsNullOrWhiteSpace(searchText)) throw new ArgumentException("Provide row search text.");
        var scopes=Rows.Where(r=>container==null || Same(r.Name,container)).ToArray();
        if(scopes.Length==0) throw new ArgumentException("Unknown repeated container: "+container);
        var selected=_runtime.Wait.Until(_ =>
        {
            RowSpec? found=null;
            foreach(var scope in scopes)
            {
                var count=_runtime.Count(new Query(scope.Locator,searchText,DisplayOnly:true));
                if(count>1 || (count==1 && found!=null)) throw new InvalidOperationException("Multiple matching rows. Refine search text or container.");
                if(count==1) found=scope;
            }
            return found;
        })!;
        return new PageRow(_runtime,selected,new Query(selected.Locator,searchText,DisplayOnly:true));
    }
    public sealed class PageRow
    {
        private readonly PageRuntime _runtime;
        private readonly RowSpec _spec;
        private readonly Query _query;
        internal PageRow(PageRuntime runtime,RowSpec spec,Query query) { _runtime=runtime; _spec=spec; _query=query; }
        public PageElement Container => new PageElement(_runtime,_query);
        public PageElement Element(string relativeXPath) => new PageElement(_runtime,_query with { Relative=relativeXPath });
        public PageElement NamedElement(string name)
        {
            var child=_spec.Children.SingleOrDefault(c=>Same(c.Name,name))
                ?? throw new ArgumentException("No analysed row child named "+name+" in "+_spec.Name);
            return Element(child.Locator);
        }
        public string GetText(string name) => NamedElement(name).Text;
        public PageElement Cell(string columnName) => NamedElement(columnName);
        public void SetSelected(bool selected)
        {
            Element(".//input[@type='checkbox']").SetValue(selected.ToString());
        }
        // Week matrices: the caller supplies the displayed period start, avoiding guessed month/year.
        public PageElement DateCell(DateOnly date,DateOnly periodStart)
        {
            if(date<periodStart || date>periodStart.AddDays(6))throw new ArgumentOutOfRangeException(nameof(date));
            var day=date.Day.ToString(System.Globalization.CultureInfo.InvariantCulture);
            var weekday=date.ToString("ddd",System.Globalization.CultureInfo.InvariantCulture);
            var header="ancestor::table[1]/thead/tr/*[starts-with(normalize-space(.),"+XPathLiteral(day)+") and contains(normalize-space(.),"+XPathLiteral(weekday)+")]";
            return Element("./td[count("+header+"/preceding-sibling::*)+1][count("+header+")=1]");
        }
        public void ClickAction(string caption)
        {
            // Prefer analysed reusable action selectors; otherwise a caption scoped to this row.
            var name=caption.Replace(" ","")+"Button";
            var analysed=_spec.Children.SingleOrDefault(c=>Same(c.Name,name)&&c.Kind=="action");
            if(analysed!=null) { Element(analysed.Locator).Click(); return; }
            var text=XPathLiteral(caption.Trim());
            Element(".//button[normalize-space(.)="+text+"] | .//a[normalize-space(.)="+text+"] | .//input[@value="+text+"]").Click();
        }
""");
            var childNames=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var childIdentifiers=new HashSet<string>(new[]{"Container","Element","NamedElement","GetText","PageRow","Cell","ClickAction","DateCell","SetSelected"},StringComparer.Ordinal);
            foreach(var child in page.Repeaters.SelectMany(r=>r.Children))
            {
                if(!childNames.Add(child.Name)) continue;
                var stem=Identifier(child.Name); var name=stem; var number=2;
                while(!childIdentifiers.Add(name)) name=stem+number++;
                rows.AppendLine($"        public PageElement {name} => NamedElement({Literal(child.Name)});");
            }
            rows.AppendLine("    }");
            rows.AppendLine(ReadResource("page-components.txt"));
            foreach(var row in page.Repeaters.Where(r=>!string.IsNullOrEmpty(r.KeyLocator)))
            {
                var method=Unique(row.Name);
                rows.AppendLine($"    public PageRow {method}(string name) => Item(name, {Literal(analysedRows[row])});");
            }
        }
        var menus=new StringBuilder();
        if(page.Menus.Count>0)
        {
            menus.AppendLine("    private static readonly MenuSpec[] Menus =\n    {");
            foreach(var m in page.Menus) menus.AppendLine($"        new MenuSpec({Literal(m.Key)}, {Literal(m.CaptionPath)}, new string[] {{ {Strings(m.Path)} }}, new string[] {{ {Strings(m.Actions)} }}),");
            menus.AppendLine("    };");
            menus.AppendLine("""
    public void OpenMenu(string menuItem)
    {
        var matches=Menus.Where(m=>Same(m.Key,menuItem) || Same(m.CaptionPath,menuItem)).ToArray();
        if(matches.Length!=1) throw new ArgumentException("Unknown or ambiguous menu item. Use its qualified name: "+menuItem);
        var menu=matches[0];
        for(var i=0;i<menu.Path.Length;i++)
        {
            var click=i==menu.Path.Length-1 || i<menu.Actions.Length && menu.Actions[i]=="click";
            if(click)_runtime.Click(new Query(menu.Path[i])); else _runtime.Hover(new Query(menu.Path[i]));
        }
    }
""");
        }
        var paging=new StringBuilder();
        if(page.Pagers.Count>0)
        {
            paging.AppendLine("    private static readonly string[] AnalysedRowLocators = new string[] { "+Strings(page.Repeaters.Select(r=>r.Locator))+" };");
            paging.AppendLine("    public static IReadOnlyList<string> PagerNames { get; } = new string[] { "+Strings(page.Pagers.Select(p=>p.Name))+" };");
            paging.AppendLine("    private static readonly PagerSpec[] Pagers =\n    {");
            foreach(var p in page.Pagers) paging.AppendLine($"        new PagerSpec({Literal(p.Name)}, {Literal(p.Locator)}, {Literal(p.NextLocator)}, {Literal(p.PreviousLocator)}, {Literal(p.PageTemplate)}, {Literal(p.CurrentLocator)}, new string[] {{ {Strings(p.RowLocators)} }}),");
            paging.AppendLine("    };");
            paging.AppendLine(ReadResource("page-paging.txt"));
        }
        var login=new StringBuilder();
        var user=page.Fields.Where(f=>Regex.IsMatch(f.Label,@"^(user\s*name|email)$",RegexOptions.IgnoreCase)).ToArray();
        var password=page.Fields.Where(f=>Regex.IsMatch(f.Label,@"^password$",RegexOptions.IgnoreCase)).ToArray();
        var submit=page.Elements.Where(e=>Regex.IsMatch(e.Name,@"^(log\s*in|sign\s*in)$",RegexOptions.IgnoreCase)).ToArray();
        if(user.Length==1&&password.Length==1&&submit.Length==1)
        {
            login.AppendLine("    // Supply a post-login locator; credentials are caller parameters and never exported.");
            login.AppendLine("    public void Login(string username,string password,string readyLocator)");
            login.AppendLine("    {");
            login.AppendLine($"        SetText({Literal(user[0].Key)},username); SetText({Literal(password[0].Key)},password);");
            login.AppendLine($"        _runtime.Click(new Query({Literal(submit[0].Locator)}));");
            login.AppendLine("        WaitFor(readyLocator);");
            login.AppendLine("    }");
        }
        var sections=new StringBuilder();
        foreach(var section in page.Sections)sections.AppendLine($"        new SectionSpec({Literal(section.Name)}, {Literal(section.Kind)}, {Literal(section.Locator)}, new ChildSpec[] {{ {string.Join(", ",section.Children.Select(c=>$"new ChildSpec({Literal(c.Name)}, {Literal(c.Locator)}, {Literal(c.Kind)})"))} }}),");
        var substitutions=new Dictionary<string,string>
        {
            ["LOGIN"]=login.ToString(),["SECTIONS"]=sections.ToString(),["NAMESPACE"]=nameSpace,["CLASS"]=className,["URL"]=Literal(page.Url),["WARNINGS"]=Strings(page.Warnings),
            ["FIELD_NAMES"]=Strings(page.Fields.Select(f=>f.Key)),["FIELDS"]=fields.ToString(),["ELEMENTS"]=elements.ToString(),
            ["ROW_METHODS"]=rows.ToString(),["PAGING_METHODS"]=paging.ToString(),["MENU_METHODS"]=menus.ToString(),["RESOLVER"]=Literal(ReadResource("flattened-resolver.js"))
        };
        return Regex.Replace(ReadResource("page-class-template.txt"),"@@([A-Z_]+)@@",m=>substitutions[m.Groups[1].Value]);
    }
    public static string ReadResource(string name)
    {
        using var stream=typeof(PageClassGenerator).Assembly.GetManifestResourceStream("SeleniumLocatorInspector.PageClasses."+name)
            ?? throw new InvalidOperationException("Missing page-class resource: "+name);
        using var reader=new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
