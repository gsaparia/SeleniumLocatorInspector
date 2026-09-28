# Selenium Locator Inspector

Windows Forms / .NET 8 desktop tool for inspecting Selenium locators in Edge, Chrome and Firefox.

## Features

- Pick a single element by clicking it in the browser.
- Repeated `Pick Element` operations are supported.
- Generates CSS and XPath locators.
- Generates multiple locator candidates with stability scoring.
- Supports open Shadow DOM traversal.
- Detects iframe ancestry.
- Generates Selenium C# code.
- Candidate results are displayed in a `DataGridView`.
- Clicking a grid row highlights the corresponding browser element.
- Right-click a grid row to copy CSS, XPath, the best locator, or Selenium C#.
- `Ctrl+C` copies the best locator from the selected grid row.
- Rectangle selection: click `Select Rectangle`, drag a rectangle in the browser, and the grid is populated with all visible elements whose bounding rectangles intersect the selection.
- Rectangle-selected elements can be clicked in the grid to highlight them in the browser.

## Requirements

- Windows
- .NET 8 SDK
- Edge, Chrome, or Firefox installed

## Run

```powershell
dotnet restore
dotnet build
dotnet run
```

Set `WebDriversFolder` in `Properties/Settings.settings` to the directory containing your WebDriver executables. The default `WebDrivers` is relative to the application's output folder (`bin/Debug/net8.0-windows/WebDrivers` when running a Debug build). Put `msedgedriver.exe`, `chromedriver.exe`, and/or `geckodriver.exe` in that directory for the browsers you plan to launch. An absolute folder path also works. Browser launch checks the selected executable and uses its explicit driver service; it does not use Selenium Manager. Hooking to an existing WebDriver session does not require this folder.

## Locator analysis (v6)

Double-click a selected element in the main grid to open Locator Analysis. Selecting a locator row highlights all matching live elements using a flattened copy of the current DOM and a mapping back to the originals. Accessible iframe contents and open shadow roots are included. Cross-origin frames and closed shadow roots cannot be inspected. Copy Selected Locator copies the selected expression.

Container suggestions combine labels, text and stable container attributes with attributes or text on the target. Candidates that do not resolve to the selected element are omitted. Visible and Clickable columns in both grids reflect the selected element as resolved by the row's locator at inspection time. Clickable is a best-effort hit test at the current viewport position, not a promise that a click will succeed after page state changes.

## Network traffic (v7)

Launch Edge, Chrome or Firefox, then click **Analyse Network Traffic** and **Start recording**. Network events appear as they happen. Click **Reload page** to capture a page load; select a row for its request and response headers, status, elapsed time and errors. **Stop recording** ends capture without closing the browser. Only traffic after Start recording is available. Response bodies are not collected. The inspector requests the standard BiDi WebSocket capability when launching a browser; a previously created hooked WebDriver session without this capability cannot be recorded and displays an explanation.

## Network details (v8)

A request row with a status other than 200 is shown in red, including 2xx values other than 200 and redirects. Failed requests without an HTTP response are also red. The detail area has four tabs: Request headers, Request body, Response headers, and Response body. Bodies are collected with WebDriver BiDi `network.addDataCollector` and read with `network.getData` when those commands are implemented by the browser. The collector caps each body at 512 KiB; unavailable data is labeled rather than invented. Binary content is shown as base64. Select a completed request while recording to retrieve its body; retrieved bodies remain visible after Stop recording.

## Network window layout and preview (v9)

The request grid and four detail tabs fill the width of the window and share its height through a draggable splitter. A reported HTTP status other than 200 is red (empty statuses remain neutral). The Response body tab formats JSON, HTML, JavaScript and CSS for reading while preserving captured bytes. Image, audio, video and PDF responses with supported file types preview in the tab using WebView2 and can be saved from the same captured bytes. The Microsoft Edge WebView2 Runtime is needed for embedded preview; the Save button still works without it. Body collection requires browser support for WebDriver BiDi data collection and is limited to 16 MiB per request; unavailable or oversized bodies are labeled.

## Network body type detection (v10)

The grid has separate Request type and Response type columns. Valid JSON objects or arrays override an incorrect `text/plain` type after the body is captured. Request and response bodies both use the formatter for JSON, CSS, JavaScript and HTML. Explicit `text/css` and `text/javascript` are formatted even when the URL has no file extension; generic text can also be recognized by content and a matching file extension. If the browser does not provide a body, the displayed type remains based on its headers. Body formatting changes only the display, not the captured bytes used by Save media.

## Deep parent relationship locators (v11)

Locator Analysis now climbs from the selected element through successive ancestors until it finds a locator that uniquely identifies the element. It combines stable parent attributes, nearby label or heading text, or a unique container tag with the target's attributes, text, and intermediate child path. Matching CSS and XPath expressions appear in the existing locator grid under **Deep parent relationship**. Each suggestion is checked against the flattened DOM and retained only when it resolves to the selected element alone. If no stable relationship is unique, the inspector can use sibling positions as a lower scored fallback.

## Reusable container analysis (v12)

The locator grid also suggests XPath expressions scoped to stable container classes. It pairs a container with target text, attributes, or input value and can qualify that container by a heading or label on the same branch as the target. This covers both a product link inside a product grid and an Add to cart button inside a product card identified by its title, as well as a Books link in a named Categories sidebar. Only expressions uniquely resolving to the selected element appear in this new set of suggestions.

## Deep parent text and part relationships (v13)

Deep parent analysis now recognizes the `part` attribute and combines an identifying parent attribute with nearby descendant text. For example, a terms checkbox may yield `.//div[@part='checkbox-container'][.//*[normalize-space(.)='I have read and agree to the terms.']]//input`. It considers text inside open shadow roots using the existing flattened DOM, keeps analyzing higher ancestors after finding a unique locator, and includes text-qualified parent suggestions when they uniquely match the selected element. As with other locators, wording changes on a website can require an updated text-based expression.

## Child text with target role (v14)

Child element text analysis now combines exact descendant text with the selected element's own role, test attribute, part, accessible label, stable class, or tag. A button-like element containing a child reading "Create images" can yield `//div[@role='button'][.//*[normalize-space(.)='Create images']]`. The element's actual tag and role are used, so pages with a `<button role="menuitemradio">` receive a corresponding expression. Text in accessible open shadow roots is considered through the flattened DOM, and only locators that uniquely match the selected element are added by this analysis.

## Flattened DOM first (v16)

Selecting an element now creates one flattened copy of the accessible documents before any CSS, XPath, main grid, or Locator Analysis candidates are generated. All scoring, uniqueness checks, container and child text analysis use the selected element's clone in that copy. A reverse map connects each clone to its live element for Visible and Clickable checks. Rectangle selections share one snapshot across their rows. Selecting a locator later builds a fresh flattened copy and highlights the matching live elements, avoiding a stale mapping after page changes. Synthetic frame wrapper elements are excluded from locator results.

## Test Locator (v17)

Pick Element and Select Rectangle each run the supplied `flattenMultiFrameDOM` approach as soon as selection starts. Locator Analysis includes a text field and **Test Locator** button. Enter a CSS selector or XPath and click the button (or press Enter) to run `findAllOriginal` against a fresh flattened copy of the current page. The matching live elements are highlighted, and the window reports the match count, whether the inspected element matched, visibility, clickability, or an invalid locator error. Selecting a generated locator row fills the test field with that locator. CSS class selectors beginning with `.` are distinguished from relative XPath expressions beginning with `.//`.

## Locator Analysis filter (v18)

The Locator Analysis window has a filter above its candidate grid. It filters rows while typing, ignoring case and matching locator, type, locator basis, and explanation text. A count shows how many rows remain. Filtering preserves a selected row when it still matches and does not replace text typed in the separate Test Locator field.

## Expanded locator strategies (v19)

Locator Analysis adds locators from the nearest meaningful text inside a shared container, explicit `label[for]` and `aria-labelledby` references, combined target attributes, direct sibling text, named product cards and table rows, and CSS `:has()` relationships when supported by the browser. All are checked against the same flattened DOM and mapped to the selected original element. Candidate scoring favors unique, short, semantic relationships and demotes ambiguous, long, absolute, or positional paths. CSS and XPath structural fallbacks now stop at a short unique path or identifying ancestor where possible. Repeated query results are cached for the duration of an analysis, and the main stability rating considers both grids. Generated looking IDs and classes are filtered more thoroughly, and CSS attribute strings escape control characters.
