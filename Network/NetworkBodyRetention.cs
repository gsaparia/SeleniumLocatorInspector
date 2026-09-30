namespace SeleniumLocatorInspector.Network;

internal static class NetworkBodyRetention
{
    /// <summary>All reads and saves finish before the caller may close the recording connection.</summary>
    public static async Task PreserveAsync(IReadOnlyList<NetworkEntry> entries,
        Func<NetworkEntry, Task<CapturedBody[]>> read,
        Action<NetworkEntry, CapturedBody[]> save)
    {
        foreach (var batch in entries.Chunk(8))
        {
            var bodies = await Task.WhenAll(batch.Select(read));
            for (var i = 0; i < batch.Length; i++) save(batch[i], bodies[i]);
        }
    }
}
