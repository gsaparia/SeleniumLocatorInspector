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


## v28 — Compact toolbox and unified Locator Analysis

The main Selenium Locator Inspector is a compact fixed toolbox containing browser/URL controls, Launch Browser, Hook To WebDriver, Locator Analysis, Analyse Network Traffic and Stop. The old element/CSS/XPath/shadow/frame detail fields, Selenium code/stability fields and their copy buttons have been removed from that window. Existing copy commands remain available from the parent grid context menu.

Locator Analysis opens before picking and stays reusable:

- Pick Element and Select Rectangle are at the top of Locator Analysis.
- The original element grid is the parent grid, sized for five rows plus scrollbars. Clicking or navigating a parent row updates the detailed locator grid in the same window. Rectangle results fill the parent grid.
- Close hides the analysis window; the toolbox button reopens the same window with its results. Closing the toolbox disposes it. Browser changes/Stop clear stale results.
- Locator rows are sorted by locator character length, shortest first (then ordinal text/type for ties). Recommendation ranking itself is retained. Recommended CSS and XPath rows are green.
- Execution, Resilience, Dependencies/risks and Recommendation columns are removed. Scores, match/visibility information, locator basis, reason and container references remain.
- During JavaScript execution both windows disable their actions and result polling pauses, avoiding competing driver calls.

The JavaScript tester now runs against the first matched original element when several match; zero matches still report an error. `elements` exposes all matches for custom scripts, while the example helpers act on `element` (the first match). Results identify when multiple elements matched.

Get text prefers non-empty rendered text, falls back to textContent and then open-shadow/slot text. Input/textarea values and selected option labels are also supported. This fixes a blank rendered-text value suppressing available div text.

Verification: JavaScript syntax checks and **85 production JS/lxml checks** passed, including first-match actions, div fallbacks, shadow text and control values. Browser integration fixtures were updated but not run here. A Windows UI smoke test checks toolbox contents, parent-grid ownership/five-row viewport, shortest-first rows, green recommendations, refresh, clear and reopen behaviour:

```powershell
dotnet run --project Verification/WindowsUi/WindowsUi.csproj
```

Windows/.NET compilation, UI layout/rendering and Chromium integration were not executable in this environment; the included Windows smoke test is unrun. Existing network behaviour is retained, and its verification project excludes the separate Windows UI test sources.


## Light and dark themes (v29)

Select **Theme → Light** or **Dark** in the toolbox, Locator Analysis, Network Traffic or Resend Request window. Light uses the Professional Light design with white/slate surfaces and blue actions. Dark uses the Developer Dark design with charcoal/navy surfaces and cyan actions. The selection applies immediately across open windows, and newly opened windows inherit it. It is saved for the current Windows user in the .NET user settings and restored on the next launch; the default is Light. `Theme` is a user-scoped string in `Properties/Settings.settings`. `WebDriversFolder` remains unchanged.

The toolbox has full-width action buttons. Locator Analysis keeps the five-row parent grid, gives the locator grid the main workspace, and places locator/JavaScript testing below it. Recommended CSS/XPath rows remain green, and test metrics retain green/red status colours across theme changes. Network Traffic has a request filter, request count, four full-width detail tabs, a resizable split between grid and body, content-type labels and syntax colours for captured text. Its filter also applies to subsequently captured/imported requests without changing row indices or recorded data. Media preview/download, HAR import/export and request replay remain available. The Resend Request editor uses the same theme.

Syntax colours are a lightweight display aid, not a complete language parser. For large bodies, colouring is bounded to the first 150,000 characters; all content remains available to read and copy. Native scrollbars, file dialogs and some system control borders follow Windows rendering. This is a native WinForms implementation of the prototypes.

### Validation for v29

- Production locator fixture checks: `node Verification/locator-quality.cjs`.
- Windows UI/theme smoke checks (requires Windows): `dotnet run --project Verification/WindowsUi/WindowsUi.csproj`. These check live changes across toolbox, analysis, network and replay windows; selector synchronization; retained selections/body bytes; theme-aware recommendation/error colours; and request filtering during incoming updates. The tests switch themes without saving over your preference.
- Optional browser checks: `node Verification/locator-analysis.browser.cjs` (requires Playwright and its Chromium installation).


## v30 — Create Page Class

Open **Locator Analysis → Create Page Class** to analyse the current page; picking an element first is unnecessary. Review the C# code, analysed relationships and review notes. Set the class and namespace, then use Update Code, Copy C# or Save .cs. Reanalyse Page refreshes the snapshot. The preview follows the selected light/dark theme.

The analyser uses the flattened DOM and validates generated locators against their original elements. It identifies label/container relationships, associated fields and control types. GetText(label) and SetText(label, value) support text fields, native dropdowns, checkboxes and radio groups. For example, SetText("Gender", "Male") selects the associated option by caption. Duplicate field captions are qualified by section. Unsupported/custom controls are exposed as individual properties with review notes.

When detected, repeated cards/table rows produce GetRow(searchText, optionalContainerName), with relative properties such as Price and Image. Searches cover currently loaded rows. Detected menus produce OpenMenu(menuItem), including parent hover paths. Independent controls receive properties. Ambiguous matches fail instead of silently choosing an element.

The exported single C# file includes its flattened-DOM resolver and requires **.NET 8+, Selenium.WebDriver and Selenium.Support**. Element wrappers resolve fresh original elements and use native Selenium actions in their owning frame, restoring the default frame afterward. Accessible same-origin frames and open shadow roots are supported; inaccessible cross-origin frames and closed shadow roots require separate handling. Paging, virtual scrolling and custom widget interaction require review. Page-class analysis does not record field values.

### Validation for v30

Application sources, Windows UI test sources and eight generated page classes passed direct C# compiler checks. There were 81 DOM-analysis/resolver checks, 57 generator checks and 85 existing locator checks. Live Windows UI and Selenium browser execution remain unverified in this environment.

Run the analyser fixtures with Node and jsdom installed:

```sh
node Verification/page-class-analysis.cjs
node Verification/locator-quality.cjs
```

Run the generator checks against the included metadata fixtures:

```sh
dotnet run --project Verification/PageClasses/PageClasses.csproj -- Verification/PageClasses/Fixtures generated-pages
```

The existing Windows UI verification project includes the new preview and toolbar checks.


## v31 — Reusable component identities, tables and explicit paging

Create Page Class now recognizes linked/Bootstrap product cards, product wrappers, room cards and conservative repeated-sibling schemas, in addition to existing framework repeaters. It validates common child selectors across every loaded item and prioritizes stable test hooks and meaningful container scopes over bare tag uniqueness.

Exports include Item(name, container), ItemLocator(name, container), ContainerNames and named container helpers. Exact names distinguish Pliers from Long Nose Pliers. PageRow exposes analysed properties, Cell(column) and ClickAction(caption). GetRow(searchText) remains the original substring fallback. GetRowByColumn and GetRowByColumns use header relationships and support composite keys; reordered columns do not change their meaning. Native thead td headers are supported, merged/multi-level headers are flagged, and table rows do not create duplicate nested repeaters.

Detected pagers add PagerNames, NextPage, PreviousPage and, when a numbered pattern exists, GoToPage. Paging is explicit. Disabled parent containers are checked and actions execute once. Controls absent at a boundary are inferred with review warnings. The preview lists templates, sample counts and evidence. Hidden dialogs, date pickers, sliders and positional fallbacks receive review notes.

Read **PageClassQualityAssessment.md** for the seven-site assessment, locator examples, generated API usage, live observations and remaining gaps. The browser inspection covered six sites; Applitools was unavailable and its proposed table pattern was tested only with a constructed fixture. The generated Selenium classes were not executed against the live sites.

Validation: application and Windows UI test projects build; generated page-class sources compile. DOM/resolver fixtures, generator checks, runtime XPath-escaping checks and existing locator regressions pass. Native Windows UI rendering and generated Selenium browser execution remain unverified. Existing WebView2/nullable build warnings remain.

```sh
npm install jsdom@26
node Verification/page-class-analysis.cjs
node Verification/page-component-quality.cjs
node Verification/locator-quality.cjs
dotnet run --project Verification/PageClasses/PageClasses.csproj -- Verification/PageClasses/Fixtures generated-pages
```

The last command emits standalone source files. Compile them in a .NET 8 project referencing Selenium.WebDriver and Selenium.Support. Do not include the generated files directly in the inspector project. The supplied fixtures are constructed metadata for reproducible checks, not captured complete live pages.


## v32 — Reusable components and editable relationship review

Flattened DOM analysis remains the first step. The analyser now recognizes native and div-based ARIA tables/cells, cleans hidden sort-menu text from column captions, preserves empty schemas, and reports columns unique only within the loaded sample. Composite row lookup continues to reject multiple matches.

Custom ARIA listbox choices and autocomplete fields have scoped generated interactions. Optional OrangeHRM DOM adapters recognize its non-ARIA dropdowns, autocomplete wrappers, date inputs, pagination icons and attendance widgets. Nameless radio groups use their captioned owner; compound names and paired From/To dates retain their group. Cards can use paragraph captions. Named sections and read-only widget values are exported.

Generated APIs include `SetChoice`, `GetChoice`, `SelectSuggestion`, `SetDate`, `SetDateRange`, `Section(name)`, `OpenTab`, `WaitFor`, `PageRow.SetSelected` and `PageRow.DateCell`. A parameterized `Login(username,password,readyLocator)` is generated when a unique username/email field, password field and login action are recognized. No credentials are embedded. Existing `GetText`, `SetText`, `GetRow`, `Item`, column-key lookup and paging remain available.

In Create Page Class → Analysed relationships:

- Click **any cell in a row** to highlight matching original elements in the browser.
- Double-click **Locator** or press **F2** to edit. Edits regenerate C# and are retained by Copy C# / Save .cs.
- Relative row/section children are evaluated against every matching flattened parent, then mapped to originals for highlighting.
- Choice option rows may match zero until the dropdown is opened. Page templates retain `{page}` and highlight the owning pager until a parameter is supplied by generated code.
- Reanalyse Page intentionally replaces the snapshot and local edits. Locator syntax/match errors appear in the status area; edited relationships still require review.

Examples:

```csharp
page.SetChoice("Gender", "Female");
page.SelectSuggestion("Employee Name", "Person A");
page.SetDateRange("Date of Application", from, to, "yyyy-MM-dd");
page.Section("Personal Details").ClickAction("Save");
page.Section("Time at Work").GetText("State");
page.OpenTab("Contact Details", expectedHeading: "Contact Details");
page.GetRowByColumns(new Dictionary<string,string>
    { ["Id"] = employeeId, ["Last Name"] = lastName }, "Employee Information");
```

Use names reported by the current analysis; examples are not fixed identifiers for all websites. Custom date formats must match the application. Native date inputs require ISO format. DateCell takes a date and the **displayed** period start, rather than guessing a month/year from changing weekday headers.

### v32 verification

- 82 page-class DOM checks; 165 existing reusable-component checks.
- 63 new generic component/highlighting checks; 24 OrangeHRM pattern checks.
- Existing locator-quality checks, including upgrading an already installed older inspector.
- Generated C# source compilation, generator assertions and runtime XPath-escaping checks.
- WinForms application and Windows smoke-test project cross-compiled successfully. The smoke test now covers all-cell highlighting callbacks and edited locator persistence.

The Windows UI smoke executable was not run in this Linux environment. Browser interactions through generated C# were not tested end to end here. Cross-origin frames, closed shadow roots, virtual scrolling, canvas chart data, file uploads and unrecognized controls remain explicit adapter/review boundaries. Analysis does not navigate or save business data automatically.


## v33 — Relationship filtering, red validation errors and CSS suggestions

In **Create Page Class → Analysed relationships**:

- The filter textbox updates the grid as you type. Search is case insensitive and includes locator, key/name, type, evidence, CSS suggestion and validation text. Clearing it restores rows and retains locator edits.
- After committing a locator edit (Enter or leave the cell), browser validation checks XPath/CSS syntax and highlights matches. Invalid selectors show a red row, red status message and error text in the validation column. Correcting them clears the error. Valid syntax with zero current matches is reported separately.
- Click a row to populate its **CSS suggestion (verified)** column. The suggested selector must match exactly the same elements in the current flattened DOM, within each parent for relative children. Stable test/name/id/accessible attributes are preferred over broad tag selectors. Use **Copy CSS suggestion** to copy the selected row's alternative.
- When no simple stable CSS alternative matches, the status explains that XPath should be retained. Snapshot equivalence does not guarantee equivalent meaning after the page changes. XPath remains preferable for label/text relationships and required for the existing parameterized row/key predicate APIs.
- Direct generated element lookups, relative element lookups and choice-option selection now support CSS. CSS suggestions do not automatically overwrite your locator. Page templates are syntax checked with page 1 substituted for `{page}`; a zero match is not a syntax error.

v33 verification: 19 new selector validation/CSS checks, 63 reusable-component/highlighting checks, 85 locator-quality checks, 82 page-class DOM checks, 165 component checks, 24 OrangeHRM pattern checks, 306 generator checks and 156 runtime XPath escaping checks. All 39 emitted page classes compile. The application and Windows UI smoke-test project compile; native Windows UI execution was not available in this Linux environment.


## v34 — Picker and rectangle-selection responsiveness

### Cause of the freeze

The 250 ms WinForms timer executed `GetSelectedResult()` synchronously on the UI thread. The `ExecuteScript` line must wait for a response from the browser. If page JavaScript, DOM flattening or locator generation is busy, the entire inspector message loop waits with it. Rectangle selection previously generated all intersecting elements' locators in one JavaScript task, delaying browser commands further. The timer also continued polling when no selection was active.

### Fix

- Picker startup, locator tests, highlighting, result reads, connection operations and shutdown now dispatch WebDriver work away from the UI thread.
- Each inspector owns one serialized asynchronous command queue. Polling uses a non-queued try operation; it skips while any command is in flight. The timer also has an overlap guard and polls only while a picker/selection is active.
- Reading and clearing a ready result now happen in one browser command, preventing a separate clear from erasing a newer result.
- Browser selection analysis is deferred from click/mouseup handlers. Rectangle analysis yields between elements and shares one flattened DOM snapshot. No selected elements are silently capped or discarded.
- A generation token prevents stopped/replaced jobs from publishing stale results. Original selection indices survive partial failures.
- The Locator Analysis toolbar shows preparation, analysis progress, completion and driver/analysis errors. Navigation resets polling and asks you to pick again. Starting a new selection cancels an older browser analysis at its next yield.
- Connection replacement and shutdown wait for the existing command stream; they do not abandon an in-flight RPC and start a competing command. Closing during a connection attempt waits asynchronously and disposes the resulting/partially created session appropriately.

The flattened-first approach and the existing locator strategies are retained. The fix keeps the Windows UI responsive while waiting; it cannot make an unresponsive browser execute instantly. A single complex element's locator analysis remains synchronous inside its browser task, and WebDriver's own transport/session timeout still applies. On a very large selection, progress can take time; restart picking or use a narrower rectangle if appropriate.

### Verification

- **35 C# blocked-command/inspector checks**: simulated blocked ExecuteScript, asynchronous caller return, skipped overlapping polls, one command stream, atomic result consumption, and recovery after transport failures.
- **14 asynchronous browser-selection checks**: yields between elements, one snapshot, cancellation, replacement, progress, errors, partial results and preserved indices.
- Existing locator-quality, relationship/CSS, page-class and component checks pass.
- WinForms application and Windows UI smoke-test project compile successfully. Native Windows UI execution and reproduction against your particular WebDriver/page were not available in this Linux environment.

Run `dotnet run --project Verification/InspectorCommands/InspectorCommands.csproj` for blocked-driver tests. Run the jsdom checks with `NODE_PATH` pointing to jsdom@26. Windows native UI smoke tests remain in `Verification/WindowsUi`.


## v35 – rectangle selection of table cells

Rectangle selection previously included every intersecting ancestor, so a rectangle
around a cell could analyse the row, table, example panel and large page containers.
It now retains fully enclosed elements and partially enclosed leaf targets, excluding
partially enclosed ancestors. Small edge overlaps below 10% of the smaller rectangle
area are ignored. Tight rectangles inside a cell still select that cell; fully enclosed
containers remain available for analysis. Bounds are read once rather than again
while sorting.

The v34 fix yielded only between elements. v35 also yields during candidate generation,
parent/container analysis, candidate ranking and resilience checks, using approximately
8 ms work slices. The same algorithms and complete candidate set are retained.
A single native DOM or XPath operation can exceed that slice; it cannot be interrupted
mid-operation. Flattening remains the first step. WebDriver polling stays off the UI
thread and uses the existing serialized command queue. Starting another selection
cancels the previous generator and prevents stale results from being published.

New tests (install jsdom@26 and set NODE_PATH to its node_modules folder):
- `node Verification/rectangle-selection.cjs` – geometry, within-element yielding and cancellation.
- `node Verification/selection-production.cjs` – full production table-cell generation and identical synchronous/cooperative candidates.

Windows UI reproduction has not been run in the Linux build environment.


## v36 – v6 comparison and nonterminating clickability checks

Comparing v6 with v35 shows that the rectangle gesture itself used the same
overlap scan. v6 ran direct/text/attribute candidates and a smaller five-level
container analysis; it checked visibility/clickability of the selected target.
The modern analyser additionally explores deeper relationships, checks all
matching originals while ranking each candidate, and performs clone resilience
checks. Reverting only the rectangle gesture would not remove that workload.

A confirmed nontermination defect was found in `isClickable`: the loop assigned
`shadowRoot.elementFromPoint(...) || hit` back to `hit`. When the root returned
null or the host itself, the loop never advanced. This defect was also present
in v6, but modern all-match evaluation exercises it on more page elements.
The Windows/W3Schools-specific trigger has not been confirmed in this environment.

v36 reuses a guarded deep hit-test traversal for clickability and picking. It
stops on null, self, revisited hosts, unavailable APIs or exceptions, while still
descending through valid nested shadow roots. Candidate ranking now yields inside
the per-candidate and per-match evaluation loops. Visibility/clickability results
are cached per original element during one analysis and cleared at completion or
cancellation. Flattened DOM and all existing locator strategies are retained.

Verification:
- `node Verification/shadow-hit-test.cjs`
- Optional old-source reproduction: append the path to a v35 `locator-inspector.js`.
  The test runs that source in a disposable subprocess and asserts a hard timeout
  after entering the defective hit-test loop.
- `node Verification/selection-production.cjs` now exercises full production
  table-cell generation with a shadow overlay returning null, rather than stubbing
  out clickability. Synchronous/cooperative outputs must match and status caches
  must be released.

Native Windows application reproduction remains unverified.
