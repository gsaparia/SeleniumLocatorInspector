using OpenQA.Selenium;
using OpenQA.Selenium.Chrome;
using OpenQA.Selenium.Edge;
using OpenQA.Selenium.Firefox;
using OpenQA.Selenium.Remote;
using SeleniumLocatorInspector.Properties;

namespace SeleniumLocatorInspector.Browser;

public sealed class BrowserManager : IDisposable
{
    private bool _hookedToExistingSession;

    public IWebDriver? Driver { get; private set; }
    public bool IsHooked => _hookedToExistingSession;

    public void Start(BrowserType browser, string url)
    {
        Stop();
        _hookedToExistingSession = false;

        Driver = browser switch
        {
            BrowserType.Edge => CreateEdge(),
            BrowserType.Chrome => CreateChrome(),
            BrowserType.Firefox => CreateFirefox(),
            _ => throw new ArgumentOutOfRangeException(nameof(browser))
        };

        Driver.Manage().Window.Maximize();

        if (!string.IsNullOrWhiteSpace(url))
            Driver.Navigate().GoToUrl(url);
    }

    public bool HookToFirstExistingDriver(out ExistingWebDriverSession? hookedSession, out string message)
    {
        hookedSession = null;
        message = string.Empty;

        Stop();

        var sessions = WebDriverDiscovery.FindFirstSessions();
        if (sessions.Count == 0)
        {
            message = "No running WebDriver session was found for msedgedriver, chromedriver, or geckodriver.";
            return false;
        }

        var session = sessions[0];

        try
        {
            Driver = AttachToExistingSession(session);
            _hookedToExistingSession = true;
            hookedSession = session;
            message = $"Hooked to {session.BrowserName} WebDriver (PID {session.ProcessId}, port {session.Port}).";
            return true;
        }
        catch (Exception ex)
        {
            Driver = null;
            _hookedToExistingSession = false;
            message = $"Found {session.DriverName}, but could not hook to session {session.SessionId}: {ex.Message}";
            return false;
        }
    }

    private static IWebDriver AttachToExistingSession(ExistingWebDriverSession session)
    {
        if (session.Capabilities.ValueKind != System.Text.Json.JsonValueKind.Object)
            throw new InvalidOperationException("The existing WebDriver did not return its session capabilities.");
        // The executor supplies the original session handshake locally. No new
        // browser is launched and no external session is deleted or modified.
        var executor = new AttachedSessionExecutor(session.ServerUri, session.SessionId, session.Capabilities);
        DriverOptions options = session.BrowserName.Contains("firefox", StringComparison.OrdinalIgnoreCase)
            ? new FirefoxOptions()
            : session.BrowserName.Contains("edge", StringComparison.OrdinalIgnoreCase)
                ? new EdgeOptions() : new ChromeOptions();
        try { return new RemoteWebDriver(executor, options.ToCapabilities()); }
        catch { executor.Dispose(); throw; }
    }

    private static IWebDriver CreateEdge()
    {
        var options = new EdgeOptions { UseWebSocketUrl = true };
        options.AddArgument("--disable-popup-blocking");
        var folder = GetConfiguredDriverFolder("msedgedriver.exe");
        var service = EdgeDriverService.CreateDefaultService(folder, "msedgedriver.exe");
        return new EdgeDriver(service, options);
    }

    private static IWebDriver CreateChrome()
    {
        var options = new ChromeOptions { UseWebSocketUrl = true };
        options.AddArgument("--disable-popup-blocking");
        var folder = GetConfiguredDriverFolder("chromedriver.exe");
        var service = ChromeDriverService.CreateDefaultService(folder, "chromedriver.exe");
        return new ChromeDriver(service, options);
    }

    private static IWebDriver CreateFirefox()
    {
        var options = new FirefoxOptions { UseWebSocketUrl = true };
        var folder = GetConfiguredDriverFolder("geckodriver.exe");
        var service = FirefoxDriverService.CreateDefaultService(folder, "geckodriver.exe");
        return new FirefoxDriver(service, options);
    }

    private static string GetConfiguredDriverFolder(string executableName)
    {
        var configured = Settings.Default.WebDriversFolder?.Trim();
        if (string.IsNullOrWhiteSpace(configured))
            throw new InvalidOperationException("Set WebDriversFolder in Properties/Settings.settings before launching a browser.");

        var folder = Path.GetFullPath(Path.IsPathRooted(configured)
            ? configured
            : Path.Combine(AppContext.BaseDirectory, configured));

        if (!Directory.Exists(folder))
            throw new DirectoryNotFoundException($"WebDriversFolder does not exist: {folder}");

        var executablePath = Path.Combine(folder, executableName);
        if (!File.Exists(executablePath))
            throw new FileNotFoundException(
                $"{executableName} was not found in WebDriversFolder: {folder}", executablePath);

        return folder;
    }

    public void Stop()
    {
        if (_hookedToExistingSession)
        {
            // Detach without sending DELETE /session/{id}; the external test
            // session must remain alive after the inspector disconnects.
            // AttachedSessionExecutor intercepts Quit, so Dispose only closes
            // this inspector's HTTP resources, leaving the original session alive.
            try { Driver?.Dispose(); } catch { }
            Driver = null;
            _hookedToExistingSession = false;
            return;
        }

        try
        {
            Driver?.Quit();
        }
        catch
        {
            // Browser may already be closed.
        }
        finally
        {
            Driver = null;
        }
    }

    public void Dispose() => Stop();
}
