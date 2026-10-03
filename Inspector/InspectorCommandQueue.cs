namespace SeleniumLocatorInspector.Inspector;

// Owns one inspector's command stream. Never holds the UI thread while waiting
// for WebDriver and never abandons an in-flight command to launch another one.
public sealed class InspectorCommandQueue
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    public async Task<T> RunAsync<T>(Func<T> command)
    {
        await _gate.WaitAsync().ConfigureAwait(false);
        try { return await Task.Run(command).ConfigureAwait(false); }
        finally { _gate.Release(); }
    }
    public async Task<T?> TryRunAsync<T>(Func<T> command) where T : class
    {
        if (!await _gate.WaitAsync(0).ConfigureAwait(false)) return null;
        try { return await Task.Run(command).ConfigureAwait(false); }
        finally { _gate.Release(); }
    }
}
