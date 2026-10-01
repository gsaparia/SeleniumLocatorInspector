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


## v20 — HAR export and request replay

- **Download Har** saves all current grid rows to a UTF-8 HAR 1.2 file, including available request/response bodies. Export while recording for the best body coverage. Missing bodies and unavailable detailed timings are marked. Binary responses use base64; binary requests use the `_encoding` extension.
- **Resend Request** opens the selected request for editing: method, URL, headers and body. Click **Send request** to send it and add the result to the grid, including response headers/body. The dialog supports base64 for binary bodies and cancellation.
- Replay uses the desktop HTTP client. Include needed cookies or authorization in the editable headers; browser cookies are not automatically added. Redirects are not followed. Content-Length/Transfer-Encoding are recalculated and HTTP/2 pseudo headers are omitted. Unedited captured bodies retain their original bytes. Edited text uses the declared charset, or UTF-8.
- Responses are limited to 16 MiB; oversized/cancelled/failed requests remain visible with an explanation. HAR files contain the captured headers and bodies, including any credentials they contain.

Build on Windows with .NET 8: `dotnet build SeleniumLocatorInspector.csproj`.

Network verification (no external traffic): `dotnet run --project Verification/NetworkTools.csproj`. Covers HAR JSON/binary/missing bodies and a local loopback server for edited requests, recalculated lengths, redirects and cancellation.

## v21 — HAR import and recording in hooked sessions

- **Import Har** appends requests from a `.har` file to the grid. Headers and available bodies appear in the four detail tabs, with existing pretty printing, media preview/download, status colouring, export and resend support. Files can be analysed without connecting a browser: open **Analyse Network Traffic**, then **Import Har**. Imported files do not start recording or send requests.
- HAR import preserves separate rows for repeated imports. Handles ordinary text, JSON, base64 response content, binary request extensions and URL-encoded `postData.params`. Missing bodies and multipart bodies without exact bytes are marked unavailable. Invalid files leave current rows intact. Limits: 128 MiB/file, 50,000 entries.
- **Hook To WebDriver** now attaches directly using the original session ID and original capabilities. It does not create/delete a temporary browser session. Detaching/closing the inspector leaves the external session running.
- Recording uses the original session's BiDi endpoint when available, with DevTools fallback if the BiDi connection fails. Hooked Chrome/Edge sessions created without BiDi use a separate DevTools connection discovered from their existing `debuggerAddress`. The recording label identifies **BiDi** or **DevTools (current tab)**. DevTools records the selected page target and its reported requests; separate tabs, worker targets and out-of-process frame targets are not automatically attached. Select the desired WebDriver window before starting recording. Only future traffic is captured; use **Reload page** after **Start recording**.
- Firefox sessions without BiDi cannot have it enabled after creation. For an external Firefox session, set `new FirefoxOptions { UseWebSocketUrl = true }` before creating its FirefoxDriver, then hook it. Sessions without either a BiDi endpoint or a reachable Chrome/Edge debugging endpoint show an actionable message.
- DevTools tracks redirects as separate rows, associates out-of-order wire headers with their correct redirect hop, and retains request data and response bodies where the browser exposes them. Upload-file bodies and evicted/redirect response bodies may be unavailable. It does not enable interception, disable caching, change cookies, or consume another client's performance logs.

Verification now also covers HAR import/export round trips and CDP event fixtures for early/late headers, redirects, timestamps and body ownership. Run `dotnet run --project Verification/NetworkTools.csproj` with .NET 8. Build/UI testing requires Windows and .NET 8; this delivery was checked statically in an environment without the .NET SDK.


## v22 — Keep bodies after Stop Recording

- Completed/failed live requests now retrieve and cache their request and response bodies automatically, regardless of which rows are selected. Body collection runs with six concurrent request pairs to avoid flooding the browser.
- **Stop recording** freezes the displayed capture, shows **Saving captured bodies…**, and finishes collecting completed rows before closing the recording connection. Available data remains usable in the detail tabs, media preview/download, HAR export and Resend Request after stopping. Failed reads retain the browser's specific explanation; retries preserve bytes already collected successfully.
- Rows still in progress at the stop click explain that their response had not completed. Late events from an old recording cannot add rows to a new recording.
- Verification includes delayed body reads, unselected completed rows, binary/media retention and HAR export after stop: `dotnet run --project Verification/NetworkTools.csproj`. Source checks passed here; the .NET SDK and Windows UI were unavailable for compilation and live testing.


## v23 — Meaningful locator recommendations

The existing flattened-DOM analyser now compares container identity, control identity and uniqueness rather than choosing the first nearby text or relying on uniqueness alone.

- Meaningful container markers: associated labels, referenced ARIA text, legends, headings and record text take priority. Hidden markers, prices, counters, timestamps and validation/status messages are rejected or downgraded. A descriptive div/span remains usable when semantic labels are absent.
- Repeated fields: a local field relationship is tried first; a named outer section is added when the field relationship is ambiguous. Example: `//section[.//h2[normalize-space(.)='Billing']]//div[.//label[normalize-space(.)='Email address']]//input` (actual generated text predicates also normalize non-breaking spaces).
- Original DOM roots are checked before treating matching IDs as label/ARIA associations, avoiding false associations across frames and shadow components.
- Stable class tokens tolerate additional classes. Editable field values and structural/index-based paths receive lower scores. Generated-looking attributes and text/localization dependencies are explained.
- Detailed results show recommendations, match counts, scope/marker, execution mode, resilience and dependencies. Best overall is highlighted; these fields also participate in the live filter. Visibility/clickability are evaluated against the locator's actual original-element matches.
- The highest ranked unique candidates feed the main CSS/XPath results and generated Selenium code. Code uses the best overall candidate and its execution context; flattened-only and shadow relationships use `findAllOriginal` with an exactly-one-match guard. Native frame candidates include the frame path.
- Up to 12 leading unique candidates are tested against four inert DOM-copy mutations: extra classes, reordered siblings, a neutral wrapper and removed transient IDs/classes. These checks influence ranking without changing the live page. They are heuristic checks, not proof of stability across application versions or states.

Verification performed for this delivery:

- `node --check JavaScript/locator-inspector.js` and verification script syntax checks passed.
- `node Verification/locator-quality.cjs` passed 20 checks against production scoring, relationship generation, recommendation/code consistency and Python/lxml XPath fixtures. Requires Node and Python with lxml.
- `node Verification/locator-analysis.browser.cjs` is included for real Chromium integration tests covering fields, actions, record rows, shadow DOM, frames, clone isolation and recommendation consistency. Requires Playwright and its Chromium installation. This script was **not run here**, because a browser executable was unavailable.
- The Windows WinForms/.NET 8 build and interactive UI were **not tested here**, because the .NET SDK and Windows runtime were unavailable. Existing network verification remains `dotnet run --project Verification/NetworkTools.csproj`.

Limitations: closed shadow roots and inaccessible cross-origin frames cannot be inspected by this JavaScript flattening approach. Text-based locators depend on language/copy. Locator quality is inferred from the current accessible DOM; virtualized/unrendered records and future rerenders require validation in the target application. Resolver-generated Selenium code requires the inspector JavaScript to be installed in the current browser context, including after navigation.


## v24 — Repeater identity and children

Implements the item-first strategy demonstrated with the Bose speaker: identify one repeated product by its name, then locate a price, image or another child within that item.

- Detects repeating-template attribute presence (`ng-repeat`, `data-ng-repeat`, `x-ng-repeat`, `v-for`, `data-repeat`) rather than coupling the locator to framework expression values. Other list/row/card and repeated sibling patterns remain supported.
- Builds and verifies the container independently. A candidate is added only when both the container and selected target uniquely match. Selecting the item itself generates the container expression.
- Product names, headings and record text provide identity; prices, numeric counters, transient status/action text and markers belonging to nested repeated items are excluded from repeater identity.
- Children use stable attributes, class tokens or a unique tag, so price amounts and image URLs need not become locator dependencies. Class tokens tolerate extra classes and avoid substring collisions.
- Injection upgrades an older inspector already installed in a hooked browser and cleans its old listeners; reinjecting v24 preserves its current state.
- The grid exposes the separate **Item container locator**, supports filtering it, and provides **Copy Item Container**. The existing locator still selects the chosen element for testing and highlighting.
- Verified repeater relationships influence ranking; when equally ranked, a repeater attribute is preferred to a plain tag. Stable test attributes remain preferred. Existing flattening, frame/shadow mapping and network features are retained.

Representative generated relationships (text predicates additionally normalize non-breaking spaces):

```xpath
//li[@ng-repeat][.//a[normalize-space(.)='Bose Soundlink Bluetooth Speaker III']]
//li[@ng-repeat][.//a[normalize-space(.)='Bose Soundlink Bluetooth Speaker III']]//a[contains(concat(' ',normalize-space(@class),' '),' productPrice ')]
//li[@ng-repeat][.//a[normalize-space(.)='Bose Soundlink Bluetooth Speaker III']]//img
```

Duplicate names may require another scope or identity; this strategy does not claim that a name alone is unique when it is repeated. The analyser's other scoped strategies remain available.

Verification: production JavaScript syntax checks and **33** automated JS/lxml fixture checks passed, including the supplied product/container strategy, changing prices, extra classes and duplicate names. Browser integration fixtures now also cover product cards, prices and images, but were not executed here. The Windows/.NET build, interactive UI and live Advantage Shopping page remain unverified in this environment.


## v25 — Equivalent locator deduplication

Locator Analysis displays one row for equivalent generated XPath expressions. The canonical key unifies the outer document-root `.//` and `//` forms, insignificant syntax whitespace, and equivalent single/double-quoted string literals. It also removes exact CSS duplicates after trimming outer whitespace.

For example, these now produce one row:

```xpath
.//sec-view[.//label[normalize-space(.)='Email field is required']]//input
//sec-view[.//label[normalize-space(.)='Email field is required']]//input
```

Deduplication runs during candidate construction and again after ranking, before clone resilience checks. The ranked representative keeps its rationale and semantic evidence; item-container metadata is retained where available. Main results and generated code use the same reduced recommendation list. Injection upgrades older inspector scripts in hooked browsers.

This is conservative syntax equivalence: text within literals, predicate-relative `.//`, child-versus-descendant paths, distinct conditions, and distinct CSS/XPath strategies remain separate. Locators are not merged just because they currently match the same element.

Verification: JavaScript syntax checks and **49 automated production-JS/lxml checks** passed, including the reported selector pair, grouped forms, quote/whitespace variants, candidate construction/ranking, and preservation of genuinely different relationships. The browser integration script also checks that each analysis result has unique canonical locator keys. Windows/.NET compilation, UI and live-page browser validation remain unavailable in this environment.


## v26 — Locator test dimensions, JavaScript actions and simpler text XPath

- Matches is bold and green when greater than zero, red at zero. Selected element, Visible and Clickable values are bold and green for Yes, red for No.
- Test results include rendered width and height in CSS pixels (two decimal places). Dimensions refer to the selected match if present, otherwise the first match; their tooltip identifies which. No matches show no dimensions.
- The JavaScript textbox runs against the locator entered above it. Exactly one original element must match. Examples cover click, entering text, tick/untick, native dropdown values and get text. Returned values and exceptions appear in the result box; asynchronous scripts are supported. The UI remains responsive and disables other dialog actions during execution.
- Script variables: `element`, `elements` (the single match), `locator`, `setValue`, `setChecked`, `selectValue`, `getText`. Scripts execute in the matched element's document context. Examples:

```javascript
element.click();
return setValue('your text');
return setChecked(true);       // false to untick
return selectValue('option-value');
return getText();
```

`setValue` uses the native value setter and bubbles input/change events. `setChecked` clicks only if the checkbox needs changing. `selectValue` supports native select controls by option value; custom dropdowns can use editable JavaScript. These are browser JavaScript actions rather than WebDriver interaction commands.

Generated text XPath predicates no longer use `translate()`. Non-breaking spaces are preserved in string literals. Direct equality is preferred for clean text; `normalize-space()` is retained for XML whitespace where needed. Existing generated expressions are simplified only when the expression without normalization preserves the same current matched nodes. Both target locators and item-container locators are simplified before deduplication/ranking. This inference is based on the current DOM, and future whitespace changes can still affect a locator.

Verification: source syntax checks and **70 production JavaScript/lxml fixture checks** passed, including dimensions, action helpers, ambiguity rejection, read-only/disabled controls, asynchronous results, error handling and conditional text normalization. Chromium integration fixtures cover the new actions and text simplification but were not run here. Windows/.NET compilation, coloured UI rendering and live browser integration remain unverified in this environment.


## v27 — Shortest unique XPath per container/target family

For a shared container path and target tag, Locator Analysis keeps only the shortest unique XPath matching the selected element. For example:

```xpath
//sec-view[.//label[.='Email field is required']]//input
```

The longer `//input[@name='emailContactUs']` and `//input[@type='text']` variants within that same container are removed when the shorter locator is unique. If plain `//input` is ambiguous, the shortest unique qualified variant remains. Independent direct-attribute strategies, different container paths, and child/descendant relationships stay separate; CSS locators are unaffected.

Reduction runs after current-DOM match validation and deduplication, before resilience checks and final recommendations. Main results and generated Selenium code use the reduced list. This chooses length within a verified container family; future DOM changes may still require a more specific locator.

Verification: JavaScript syntax checks and **78 production-JS/lxml checks** passed, including the supplied three-locator example, ambiguous bases, scoped relationships and quoted slashes. A Chromium integration fixture checks the displayed family is reduced to the base locator. Windows/.NET compilation, UI and live-browser validation remain unverified here.
