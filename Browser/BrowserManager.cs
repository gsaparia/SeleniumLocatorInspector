using System.Net.Http;
using System.Reflection;
using OpenQA.Selenium;
using OpenQA.Selenium.Chrome;
using OpenQA.Selenium.Edge;
using OpenQA.Selenium.Firefox;
using OpenQA.Selenium.Remote;

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
        // Selenium .NET creates a new session in RemoteWebDriver's constructor.
        // We immediately delete that temporary session and replace its internal
        // SessionId with the already-running WebDriver session.
        DriverOptions requestedOptions;

        if (session.BrowserName.Contains("firefox", StringComparison.OrdinalIgnoreCase))
        {
            requestedOptions = new FirefoxOptions();
        }
        else if (session.BrowserName.Contains("MicrosoftEdge", StringComparison.OrdinalIgnoreCase) ||
                 session.BrowserName.Contains("edge", StringComparison.OrdinalIgnoreCase))
        {
            requestedOptions = new EdgeOptions();
        }
        else
        {
            requestedOptions = new ChromeOptions();
        }

        var remote = new RemoteWebDriver(session.ServerUri, requestedOptions);

        var temporarySessionId = ((IHasSessionId)remote).SessionId?.ToString();
        if (!string.IsNullOrWhiteSpace(temporarySessionId))
        {
            DeleteSession(session.ServerUri, temporarySessionId);
        }

        SetSessionId(remote, session.SessionId);
        return remote;
    }

    private static void DeleteSession(Uri serverUri, string sessionId)
    {
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
        using var response = client.DeleteAsync(
            new Uri(serverUri, $"session/{sessionId}")).GetAwaiter().GetResult();
    }

    private static void SetSessionId(RemoteWebDriver driver, string sessionId)
    {
        // SessionId is intentionally encapsulated by Selenium. Reflection is
        // used here because Selenium .NET does not expose an official attach-to-
        // existing-session API for an already-created local driver session.
        var type = typeof(WebDriver);
        var field = type.GetProperty("SessionId", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic); ;

        if (field == null)
        {
            // Older/newer Selenium builds may keep it on RemoteWebDriver.
            field = typeof(RemoteWebDriver).GetProperty("SessionId", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
        }

        if (field == null)
            throw new NotSupportedException("Could not locate Selenium's internal sessionId field.");

        field.SetValue(driver, new SessionId(sessionId));
    }

    private static IWebDriver CreateEdge()
    {
        var options = new EdgeOptions { UseWebSocketUrl = true };
        options.AddArgument("--disable-popup-blocking");
        return new EdgeDriver(options);
    }

    private static IWebDriver CreateChrome()
    {
        var options = new ChromeOptions { UseWebSocketUrl = true };
        options.AddArgument("--disable-popup-blocking");
        return new ChromeDriver(options);
    }

    private static IWebDriver CreateFirefox()
    {
        var options = new FirefoxOptions { UseWebSocketUrl = true };
        return new FirefoxDriver(options);
    }

    public void Stop()
    {
        if (_hookedToExistingSession)
        {
            // Detach without sending DELETE /session/{id}; the external test
            // session must remain alive after the inspector disconnects.
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
