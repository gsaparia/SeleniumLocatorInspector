using System.Text.Json;
using System.Text.Encodings.Web;
using SeleniumLocatorInspector.PageClasses;

if(args.Length!=2) throw new ArgumentException("Pass analysis fixture directory and generated source directory.");
Directory.CreateDirectory(args[1]);
var count=0;
void Check(bool condition,string message) { if(!condition) throw new Exception(message); count++; }
foreach(var path in Directory.GetFiles(args[0],"*.json"))
{
    var page=JsonSerializer.Deserialize<PageAnalysis>(File.ReadAllText(path),new JsonSerializerOptions {PropertyNameCaseInsensitive=true})!;
    var name=PageClassGenerator.Identifier(Path.GetFileNameWithoutExtension(path))+"Page";
    var source=PageClassGenerator.Generate(page,name);
    Check(source.Contains("public sealed class "+name),"Class named correctly");
    Check(source.Contains("public PageRow GetRow(")== (page.Repeaters.Count>0),"GetRow only for repeated data");
    Check(source.Contains("public void OpenMenu(")== (page.Menus.Count>0),"OpenMenu only for menus");
    Check(source.Contains("public bool NextPage(")==(page.Pagers.Count>0),"Paging methods only when observed/inferred from a pager");
    Check(source.Contains("public PageRow Item(")==(page.Repeaters.Count>0),"Exact item lookup available for repeated components");
    Check(!source.Contains("window.__seleniumLocatorInspector"),"Export independent of inspector installation");
    Check(source.Contains("DefaultContent()"),"Frame context restored");
    foreach(var field in page.Fields) Check(source.Contains(JsonSerializer.Serialize(field.Locator,new JsonSerializerOptions {Encoder=JavaScriptEncoder.UnsafeRelaxedJsonEscaping})),"Field locator retained without code injection");
    File.WriteAllText(Path.Combine(args[1],name+".cs"),source);
}
foreach(var invalid in new[]{"class","if","while","bad-name",""})
{
    try { PageClassGenerator.Generate(new PageAnalysis(),invalid); throw new Exception("Invalid class accepted: "+invalid); }
    catch(ArgumentException) { count++; }
}
try { PageClassGenerator.Generate(new PageAnalysis(),"GoodPage","Bad.namespace"); throw new Exception("Keyword namespace accepted"); }
catch(ArgumentException) { count++; }
var awkward=new PageAnalysis {Url="https://example.test/\"quote",Elements=[new(){Name="PageRuntime",Kind="button:",Locator="//button[.='@@CLASS@@']"},new(){Name="PageRuntime",Kind="button:",Locator="//button[.='second']"}],Fields=[new(){Key="Quotes \"and\" apostrophes ' \n",Kind="text",Locator="//input[@name=\"mixed'quote\"]"}]};
var escaped=PageClassGenerator.Generate(awkward,"EscapedPage");
Check(escaped.Contains("@@CLASS@@"),"Template tokens in page text remain literal data");
File.WriteAllText(Path.Combine(args[1],"EscapedPage.cs"),escaped);
Console.WriteLine($"Passed {count} generator checks; emitted source files for compiler validation.");
