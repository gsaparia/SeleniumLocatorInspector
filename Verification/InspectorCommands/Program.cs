using System.Diagnostics;
using System.Reflection;
using OpenQA.Selenium;
using SeleniumLocatorInspector.Inspector;

var queue=new InspectorCommandQueue();var checks=0;
void Check(bool value,string message){if(!value)throw new Exception(message);checks++;}
var callerThread=Environment.CurrentManagedThreadId;
using var release=new ManualResetEventSlim();
var entered=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
var stopwatch=Stopwatch.StartNew();int commandThread=0,reads=0;
var blocked=queue.RunAsync(()=>
{
    commandThread=Environment.CurrentManagedThreadId;entered.SetResult();
    if(!release.Wait(TimeSpan.FromSeconds(5)))throw new TimeoutException("Test transport did not release.");
    return new Packet("ready");
});
Check(stopwatch.ElapsedMilliseconds<500,"Starting a blocked command returns immediately to caller");
await entered.Task.WaitAsync(TimeSpan.FromSeconds(2));
Check(commandThread!=callerThread,"WebDriver work is dispatched away from initiating thread");
try
{
    for(var i=0;i<20;i++)Check(await queue.TryRunAsync(()=>{reads++;return new Packet("poll");})==null,"Busy polling skips without enqueuing another command");
    Check(!blocked.IsCompleted&&reads==0,"No polling RPC overlaps a blocked WebDriver operation");
}
finally {release.Set();}
Check((await blocked).State=="ready","Blocked command eventually completes");
Check((await queue.TryRunAsync(()=>new Packet("poll")))!.State=="poll","Polling resumes after release");
int active=0,maximum=0;
var tasks=Enumerable.Range(0,8).Select(index=>queue.RunAsync(()=>
{
    var count=Interlocked.Increment(ref active);maximum=Math.Max(maximum,count);
    Thread.Sleep(10);Interlocked.Decrement(ref active);return index;
})).ToArray();
await Task.WhenAll(tasks);Check(maximum==1,"Concurrent user operations share one command stream");
try{await queue.RunAsync<Packet>(()=>throw new InvalidOperationException("session failure"));throw new Exception("Expected failure");}
catch(InvalidOperationException){checks++;}
Check((await queue.TryRunAsync(()=>new Packet("recovered")))!.State=="recovered","Exceptions release the command gate");
var driver=DispatchProxy.Create<IInspectorTestDriver,FakeDriverProxy>();
var fake=(FakeDriverProxy)(object)driver;
var inspector=new LocatorInspector(driver);
var firstPoll=inspector.PollAsync();await fake.Entered.Task.WaitAsync(TimeSpan.FromSeconds(2));
Check(!firstPoll.IsCompleted,"Inspector polling returns before a blocked ExecuteScript completes");
Check(await inspector.PollAsync()==null&&fake.Calls==1,"A second timer tick does not dispatch overlapping ExecuteScript");
fake.Release.Set();
var packet=await firstPoll;Check(packet!.Result?.TagName=="input","Actual inspector parses one consumed result packet");
Check(fake.LastScript.Contains("if(result)window.__seleniumLocatorResult=null"),"Result consumed atomically with read");
Check((await inspector.PollAsync())!.Result==null,"Consumed result is not delivered twice");
fake.FailNext=true;
try{await inspector.PollAsync();throw new Exception("Expected session error");}catch(WebDriverException){checks++;}
Check(await inspector.PollAsync()!=null,"Real inspector polling gate recovers after transport failure");
fake.Release.Dispose();
Console.WriteLine($"Passed {checks} blocked-command/non-overlap checks.");
internal sealed record Packet(string State);

public interface IInspectorTestDriver : IWebDriver,IJavaScriptExecutor { }
public class FakeDriverProxy : DispatchProxy
{
    public readonly ManualResetEventSlim Release=new();
    public readonly TaskCompletionSource Entered=new(TaskCreationOptions.RunContinuationsAsynchronously);
    public int Calls;
    public string LastScript="";
    public bool FailNext;
    protected override object? Invoke(MethodInfo? method,object?[]? args)
    {
        if(method?.Name!="ExecuteScript")return null;
        Calls++;LastScript=(string)args![0]!;
        if(FailNext){FailNext=false;throw new WebDriverException("Timed out waiting for browser");}
        if(Calls==1){Entered.SetResult();if(!Release.Wait(TimeSpan.FromSeconds(5)))throw new TimeoutException("Release test driver");}
        return Calls==1?"{\"result\":{\"tagName\":\"input\"},\"status\":{\"phase\":\"ready\"}}":"{\"result\":null,\"status\":{\"phase\":\"idle\"}}";
    }
}
