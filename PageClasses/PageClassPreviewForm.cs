using System.Text;
using SeleniumLocatorInspector.UI;
using SeleniumLocatorInspector.Inspector;

namespace SeleniumLocatorInspector.PageClasses;

public sealed class PageClassPreviewForm : Form
{
    private PageAnalysis _analysis;
    private readonly Func<Task<PageAnalysis>> _reanalyse;
    private readonly Func<string,string?,Task<int>>? _highlight;
    private readonly Func<string,string?,Task<RelationshipReview>>? _review;
    private readonly TextBox _relationshipFilter = new() { Width=340, PlaceholderText="Filter relationships or locators…" };
    private readonly Label _filterCount = new() { AutoSize=true, Margin=new Padding(12,7,0,0) };
    private bool _populating;
    private bool _highlightBusy;
    private RelationshipBinding? _pendingHighlight;
    private readonly Label _relationshipStatus = new() { Dock=DockStyle.Bottom, Height=30, Padding=new Padding(8,5,0,0), Text="Click any row cell to highlight. Double-click the Locator cell or press F2 to edit; changes update C#." };
    private sealed record RelationshipBinding(Func<string> Get,Action<string> Set,Func<(string Locator,string? Relative)> Resolve)
    {
        public bool? Valid { get; set; }
        public string Error { get; set; } = "";
    }
    private readonly TextBox _className = new() { Width=220 };
    private readonly TextBox _namespace = new() { Width=220, Text="GeneratedPages" };
    private readonly CodeViewer _code = new() { Dock=DockStyle.Fill };
    private readonly DataGridView _report = new() { Dock=DockStyle.Fill, ReadOnly=false, AllowUserToAddRows=false,
        AllowUserToDeleteRows=false, RowHeadersVisible=false, AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.Fill };
    private readonly TextBox _warnings = new() { Dock=DockStyle.Fill, Multiline=true, ReadOnly=true, ScrollBars=ScrollBars.Both };
    private readonly Label _summary = new() { Dock=DockStyle.Top, Height=46, Padding=new Padding(10,7,10,0) };
    public PageClassPreviewForm(PageAnalysis analysis,Func<Task<PageAnalysis>> reanalyse,Func<string,string?,Task<int>>? highlight=null,Func<string,string?,Task<RelationshipReview>>? review=null)
    {
        _analysis=analysis; _reanalyse=reanalyse; _highlight=highlight; _review=review;
        Text="Create Page Class — review and export";
        Size=new Size(1350,850); MinimumSize=new Size(950,650);
        StartPosition=FormStartPosition.CenterParent;
        var slug=Uri.TryCreate(analysis.Url,UriKind.Absolute,out var uri) ? uri.AbsolutePath.Trim('/').Split('/').LastOrDefault() : null;
        _className.Text=PageClassGenerator.Identifier(string.IsNullOrWhiteSpace(slug) ? analysis.Title : slug)+"Page";
        var bar=new FlowLayoutPanel { Dock=DockStyle.Top,AutoSize=true,Padding=new Padding(8),WrapContents=true };
        bar.Controls.Add(new Label { Text="Class",AutoSize=true,Margin=new Padding(0,8,8,0) }); bar.Controls.Add(_className);
        bar.Controls.Add(new Label { Text="Namespace",AutoSize=true,Margin=new Padding(10,8,8,0) }); bar.Controls.Add(_namespace);
        var generate=new Button { Text="Update Code",AutoSize=true };
        var copy=new Button { Text="Copy C#",AutoSize=true };
        var save=new Button { Text="Save .cs",AutoSize=true };
        var refresh=new Button { Text="Reanalyse Page",AutoSize=true };
        bar.Controls.AddRange([generate,copy,save,refresh]); bar.Controls.Add(AppTheme.CreateSelector());
        var tabs=new TabControl { Dock=DockStyle.Fill };
        var codeTab=new TabPage("C# code"); codeTab.Controls.Add(_code);
        var reportTab=new TabPage("Analysed relationships"); reportTab.Controls.Add(_report); reportTab.Controls.Add(_relationshipStatus);
        var filterBar=new FlowLayoutPanel {Dock=DockStyle.Top,Height=44,Padding=new Padding(8,5,8,5),WrapContents=false};
        var copyCss=new Button {Text="Copy CSS suggestion",AutoSize=true};
        filterBar.Controls.AddRange([_relationshipFilter,copyCss,_filterCount]);
        reportTab.Controls.Add(filterBar);
        _relationshipFilter.TextChanged+=(_,_)=>ApplyFilter();
        copyCss.Click+=(_,_)=>
        {
            var css=Convert.ToString(_report.CurrentRow?.Cells["Css"].Value);
            if(!string.IsNullOrWhiteSpace(css)){Clipboard.SetText(css);SetStatus("CSS copied. Equivalence is verified for the current snapshot; keep XPath for text-based and parameterized row keys.",null);}
        };
        var warningsTab=new TabPage("Review notes"); warningsTab.Controls.Add(_warnings);
        tabs.TabPages.AddRange([codeTab,reportTab,warningsTab]);
        Controls.Add(tabs); Controls.Add(_summary); Controls.Add(bar);
        _report.Columns.Add("Kind","Kind"); _report.Columns.Add("Name","Name / key");
        _report.Columns.Add("Type","Control type"); _report.Columns.Add("Evidence","Association / evidence"); _report.Columns.Add("Locator","Locator");
        _report.Columns.Add("Css","CSS suggestion (verified)");
        _report.Columns.Add("Validation","Locator validation");
        _report.Columns["Css"].FillWeight=120;
        _report.Columns["Validation"].FillWeight=100;
        foreach(DataGridViewColumn column in _report.Columns)column.ReadOnly=column.Name!="Locator";
        _report.EditMode=DataGridViewEditMode.EditOnKeystrokeOrF2;
        _report.Columns[4].FillWeight=220; _report.RowTemplate.Height=28;
        _report.CellClick+=async (_,e)=>
        {
            if(e.RowIndex>=0&&!_populating&&_report.Rows[e.RowIndex].Tag is RelationshipBinding binding)await HighlightAsync(binding);
        };
        _report.CellDoubleClick+=(_,e)=>
        {
            if(e.RowIndex>=0&&e.ColumnIndex==4)_report.BeginEdit(true);
        };
        _report.CellValidating+=(_,e)=>
        {
            if(e.ColumnIndex==4&&string.IsNullOrWhiteSpace(Convert.ToString(e.FormattedValue)))
            { e.Cancel=true; SetStatus("Locator cannot be empty.",false); }
        };
        _report.CellEndEdit+=async (_,e)=>
        {
            if(_populating||e.RowIndex<0||e.ColumnIndex!=4||_report.Rows[e.RowIndex].Tag is not RelationshipBinding binding)return;
            binding.Set(Convert.ToString(_report.Rows[e.RowIndex].Cells[4].Value)?.Trim()??"");
            binding.Valid=null;binding.Error="";
            _report.Rows[e.RowIndex].Cells["Css"].Value="";
            _report.Rows[e.RowIndex].Cells["Validation"].Value="Checking…";
            AppTheme.Row(_report.Rows[e.RowIndex],RowTone.Normal);
            GenerateCode();await HighlightAsync(binding);ApplyFilter();
        };
        generate.Click+=(_,_)=>GenerateCode();
        copy.Click+=(_,_)=> { if(GenerateCode()) Clipboard.SetText(_code.Text); };
        save.Click+=(_,_)=>
        {
            if(!GenerateCode()) return;
            using var dialog=new SaveFileDialog { Filter="C# source|*.cs",DefaultExt="cs",AddExtension=true,FileName=_className.Text.Trim()+".cs" };
            if(dialog.ShowDialog(this)!=DialogResult.OK) return;
            try { File.WriteAllText(dialog.FileName,_code.Text,new UTF8Encoding(false)); }
            catch(Exception ex) { MessageBox.Show(this,ex.Message,"Save page class",MessageBoxButtons.OK,MessageBoxIcon.Error); }
        };
        refresh.Click+=async (_,_)=>
        {
            Enabled=false;
            try { _analysis=await _reanalyse(); PopulateReport(); GenerateCode(); }
            catch(Exception ex) { MessageBox.Show(this,ex.Message,"Page analysis",MessageBoxButtons.OK,MessageBoxIcon.Error); }
            finally { if(!IsDisposed) Enabled=true; }
        };
        AppTheme.Primary(save); AppTheme.Register(this);
        PopulateReport(); GenerateCode();
    }
    private bool GenerateCode()
    {
        try { _report.EndEdit(); _code.Text=PageClassGenerator.Generate(_analysis,_className.Text.Trim(),_namespace.Text.Trim()); return true; }
        catch(Exception ex) { MessageBox.Show(this,ex.Message,"C# generation",MessageBoxButtons.OK,MessageBoxIcon.Error); return false; }
    }
    private void PopulateReport()
    {
        _summary.Text=$"{_analysis.Fields.Count} fields • {_analysis.Elements.Count} element properties • {_analysis.Repeaters.Count} repeated containers • {_analysis.Menus.Count} menu items • {_analysis.Pagers.Count} pagers • {_analysis.Sections.Count} sections • {_analysis.Coverage.Unresolved} controls need review\r\nSnapshot: {_analysis.Url}";
        _populating=true;
        try
        {
            _report.Rows.Clear();
            void Add(string kind,string name,string type,string evidence,Func<string> get,Action<string> set,Func<(string,string?)>? resolve=null)
            {
                var index=_report.Rows.Add(kind,name,type,evidence,get(),"","Not checked");
                _report.Rows[index].Tag=new RelationshipBinding(get,set,resolve??(()=> (get(),null)));
            }
            foreach(var f in _analysis.Fields)
            {
                Add("Field",f.Key,f.Kind,f.Evidence,()=>f.Locator,v=>f.Locator=v);
                if(f.OptionLocator.Length>0)Add("Choice options",f.Key,f.Kind,"Options appear after opening the choice",()=>f.OptionLocator,v=>f.OptionLocator=v);
                foreach(var o in f.Options)Add("Radio option",f.Key+" / "+o.Label,"radio","Caption → option label → control",()=>o.Locator,v=>o.Locator=v);
            }
            foreach(var e in _analysis.Elements)Add("Property",e.Name,e.Kind,e.Evidence,()=>e.Locator,v=>e.Locator=v);
            foreach(var r in _analysis.Repeaters)
            {
                Add("Repeated container",r.Name,r.Kind,r.Evidence,()=>r.Locator,v=>
                {
                    var old=r.Locator;r.Locator=v;
                    foreach(var pager in _analysis.Pagers)for(var i=0;i<pager.RowLocators.Count;i++)if(pager.RowLocators[i]==old)pager.RowLocators[i]=v;
                });
                if(r.KeyLocator.Length>0)Add("Parameterized key",r.Name,"relative name key",$"{r.SampleCount} loaded items checked; Item(name, container)",()=>r.KeyLocator,v=>r.KeyLocator=v,()=> (r.Locator,r.KeyLocator));
                foreach(var child in r.Children)Add("Row property",r.Name+" / "+child.Name,child.Kind,"Relative to every currently matched row",()=>child.Locator,v=>child.Locator=v,()=> (r.Locator,child.Locator));
            }
            foreach(var section in _analysis.Sections)
            {
                Add("Section",section.Name,section.Kind,section.Evidence,()=>section.Locator,v=>section.Locator=v);
                foreach(var child in section.Children)Add("Section value",section.Name+" / "+child.Name,child.Kind,child.Evidence,()=>child.Locator,v=>child.Locator=v,()=> (section.Locator,child.Locator));
            }
            foreach(var pager in _analysis.Pagers)
            {
                Add("Pager",pager.Name,"paging",pager.Evidence,()=>pager.Locator,v=>pager.Locator=v);
                if(pager.NextLocator.Length>0)Add("Next page",pager.Name,"paging","NextPage operation",()=>pager.NextLocator,v=>pager.NextLocator=v);
                if(pager.PreviousLocator.Length>0)Add("Previous page",pager.Name,"paging","PreviousPage operation",()=>pager.PreviousLocator,v=>pager.PreviousLocator=v);
                if(pager.CurrentLocator.Length>0)Add("Current page",pager.Name,"paging","Selected page state",()=>pager.CurrentLocator,v=>pager.CurrentLocator=v);
                if(pager.PageTemplate.Length>0)Add("Page template",pager.Name,"paging","{page} is supplied to GoToPage; validation uses page 1 as a sample",()=>pager.PageTemplate,v=>pager.PageTemplate=v,()=> (pager.PageTemplate.Replace("{page}","'1'"),null));
            }
            foreach(var menu in _analysis.Menus)for(var step=0;step<menu.Path.Count;step++)
            {
                var index=step;
                Add("Menu step",menu.Key+" / "+(index+1),index<menu.Actions.Count?menu.Actions[index]:index==menu.Path.Count-1?"click":"hover",menu.CaptionPath,()=>menu.Path[index],v=>menu.Path[index]=v);
            }
        }
        finally {_populating=false;}
        _warnings.Text="Review generated relationships before adding the class to your framework.\r\n"+
            "The class includes its own flattened resolver; methods reacquire controls and enter their owning accessible frame for native WebDriver actions.\r\n"+
            "Operations start and end in the main browser context. Cross-origin frames and closed shadow roots are outside this analysis.\r\n"+
            "Item uses exact name keys; GetRowByColumns supports composite table keys. Paging is explicit through NextPage/PreviousPage/GoToPage when detected. Virtual scrolling requires dedicated handling. Recognized custom choices use scoped adapters. Other widgets, file uploads, canvas data and virtual scrolling require dedicated handling. Date format must match the application.\r\n"+
            "Required packages: Selenium.WebDriver and Selenium.Support. Target .NET 8 or newer.\r\n\r\n"+
            (_analysis.Warnings.Count==0 ? "No additional analysis warnings." : string.Join("\r\n",_analysis.Warnings.Select(w=>"• "+w)));
        AppTheme.Apply(_report);ApplyFilter();
    }
    private void ApplyFilter()
    {
        if(_populating)return;
        var previous=_report.CurrentCell;
        _report.CurrentCell=null;
        _report.ClearSelection();
        var text=_relationshipFilter.Text.Trim();var shown=0;
        foreach(DataGridViewRow row in _report.Rows)
        {
            row.Visible=text.Length==0||row.Cells.Cast<DataGridViewCell>().Any(c=>Convert.ToString(c.Value)?.Contains(text,StringComparison.OrdinalIgnoreCase)==true);
            if(row.Visible)shown++;
        }
        if(previous!=null&&previous.OwningRow.Visible)_report.CurrentCell=previous;
        _filterCount.Text=$"{shown} / {_report.Rows.Count} shown";
    }
    private void SetStatus(string message,bool? success)
    {
        _relationshipStatus.Text=message;AppTheme.Status(_relationshipStatus,success);
    }
    private async Task HighlightAsync(RelationshipBinding binding)
    {
        if(_highlight==null&&_review==null){SetStatus("Browser validation/highlighting is unavailable in this preview.",null);return;}
        _pendingHighlight=binding;
        if(_highlightBusy)return;
        _highlightBusy=true;
        try
        {
            while(_pendingHighlight is { } next)
            {
                _pendingHighlight=null;
                var query=next.Resolve();var edited=next.Get();
                RelationshipReview result;
                try
                {
                    result=_review!=null?await _review(query.Locator,query.Relative)
                        :new RelationshipReview {Valid=true,Count=await _highlight!(query.Locator,query.Relative),CssNote="CSS suggestions require browser review."};
                }
                catch(Exception ex){result=new RelationshipReview {Valid=false,Error="Locator validation: "+ex.Message};}
                if(IsDisposed)break;
                if(next.Get()!=edited||next.Resolve()!=query)continue;
                var row=_report.Rows.Cast<DataGridViewRow>().FirstOrDefault(r=>ReferenceEquals(r.Tag,next));
                if(row==null)continue;
                next.Valid=result.Valid;next.Error=result.Error;
                row.Cells["Css"].Value=result.Css;
                row.Cells["Css"].ToolTipText=result.CssNote;
                row.Cells["Validation"].Value=result.Valid?$"Valid • {result.Count} match(es)":result.Error;
                row.ErrorText=result.Valid?"":result.Error;
                row.Cells["Locator"].ErrorText=row.ErrorText;
                AppTheme.Row(row,result.Valid?RowTone.Normal:RowTone.Error);
                SetStatus(result.Valid?$"{result.Count} matching element(s). {result.CssNote}":result.Error,result.Valid?null:false);
            }
        }
        finally{_highlightBusy=false;}
    }
}
