> Historical assessment of the pre-v32 generator. See README.md → v32 for implemented component recognition, interaction adapters and verification results.

# Page-class quality assessment — v31

The useful improvement is a change in abstraction: identify a business component, parameterize its identity, then locate its children relative to it. A unique XPath alone is not proof of a reusable page object. V31 improves this model while keeping the flattened DOM as the basis of analysis and runtime resolution.

## Evidence and limits

On 3 October 2026, six of the supplied sites loaded in the browser. Their DOM structures were inspected. Representative bank, product and room XPath counts were checked using the browser locator API. Toolshop and Demoblaze were moved to another catalogue page and the replacement product names were observed. DemoWebShop was changed to four items per page, revealing its pager.

The Applitools browser page returned “Site Unavailable,” including after one reload. Its indexed public page showed the transaction table and column names. Its example below is a proposed pattern tested against a constructed fixture, not verified against the live DOM. The other examples are grounded in observed DOM structure; this does not mean the exported Selenium class was executed against those live sites.

Automated checks use reduced, constructed fixtures based on those patterns, alongside regression fixtures. They exercise the production analyser, original-element resolver and C# generator. Application and generated-source builds are separate validation. Native Windows UI rendering and live execution of generated Selenium classes remain unverified.

## Self-assessment of v30

| Weakness | Consequence | Change in v31 |
| --- | --- | --- |
| GetRow searches all row text with a substring | “Pliers” also matches “Long Nose Pliers”; prices and action text can become accidental keys | Exact Item(name, container) plus parameterized ItemLocator |
| Card recognition mainly relies on product-item or framework repeat attributes | Bootstrap cards, linked cards, room cards and product wrappers are missed | Additional card families and conservative repeated-sibling schema inference |
| First-item child selection can choose a record-specific attribute | Child selector disappears in the next card | Choose a selector that matches exactly once in every sampled item |
| Headers mainly use th and a fixed column index | Bank td headers are missed; reordering columns changes the meaning | Detect thead td/th and resolve the current column from header text |
| ng-repeat inside a table is independently recognized | Account spans and rows can produce duplicate models | Table owns its rows; nested table repeaters are excluded |
| Duplicate product overlays are not modeled | Price/action locator is ambiguous | Scope to a common primary representation, verified across the family |
| Shortest unique root can be a bare tag | A new list or section breaks //ul | Prefer stable hooks, meaningful captions and classes before bare tags |
| No pager abstraction | Each suite invents its own paging | Explicit NextPage, PreviousPage and GoToPage when a pager is detected |
| Menu wrapper and inner native action can both be emitted | Duplicate menu entries, or clicking a noninteractive wrapper | Prefer the native link/button; include native toggle buttons |

There is no numerical “confidence” score claiming future resilience. The preview reports the basis, sampled count, common child selectors and review warnings instead.

## Site-by-site analysis

### 1. Applitools — transactions and dashboard values

The public page exposes a transaction table with Status, Date, Description, Category and Amount. Description is a useful initial key, but two payments may share a description. A composite Description + Date key is stronger. The dashboard also exposes read-only label/value metrics, which remain a future improvement rather than generic input fields.

Proposed header relationship:

```xpath
//table[.//thead/tr/th[normalize-space(.)='Description']]/tbody/tr[
  td[count(ancestor::table[1]/thead/tr/th[normalize-space(.)='Description']/preceding-sibling::*)+1]
    [normalize-space(.)='Starbucks coffee']
]
```

V31 checks that the referenced header exists exactly once before returning a column. It will not silently return column one when a header disappears. Merged and multi-level headers are flagged for review.

```csharp
var row = page.GetRowByColumns(new Dictionary<string, string>
{
    ["Description"] = "Starbucks coffee",
    ["Date"] = "Today 1:52am"
}, "Recent Transactions");
string amount = row.Cell("Amount").Text;
```

The live DOM and exact table markup could not be verified here.

### 2. DemoWebShop Accessories — product cards, view settings and boundary paging

The inspected page currently contained TCP training products, rather than the older accessory catalogue. Each product-item has a product-title link, actual-price, image and an Add to cart input. Product IDs and href values identify individual records; they should not be copied into the reusable family.

```xpath
//div[contains(concat(' ',normalize-space(@class),' '),' product-item ')]
  [.//h2/a[.='TCP Coaching day']]
```

Relative children include the actual-price span, the title link, image and Add to cart action. View as, Sort by and Display are label/container-associated selects. Reducing Display to 4 exposed a pager with current page 1 in a span, a link to page 2 and Next. Previous was absent at the first-page boundary.

```csharp
page.SetText("Display", "4");
var product = page.Item("TCP Coaching day", "Products");
string price = product.Price.Text;
product.AddToCartButton.Click();
page.GoToPage(2); // available after analysing the page with its pager visible
```

Reanalyse after revealing controls that were not present in the original snapshot. A missing directional boundary gets an inferred scoped locator and an explicit warning; it is not described as observed.

### 3. XYZ Bank — exact composite rows and repeaters inside cells

The observed table uses td inside thead. Data rows use ng-repeat, and Account Number contains another ng-repeat for individual account spans. These are one customer table, not separate customer and account-card collections.

The combination First Name + Last Name is preferable to a whole-row text search. If that combination is duplicated, add Post Code or another business key. Sorting must not change the identity of the row.

```csharp
var customer = page.GetRowByColumns(new Dictionary<string, string>
{
    ["First Name"] = "Harry",
    ["Last Name"] = "Potter"
}, "Table");
string accounts = customer.Cell("Account Number").Text;
// Supported row action, shown as an example; no customer was deleted during inspection.
customer.ClickAction("Delete");
```

A representative composite XPath and the header-based Account Number cell each matched once in the live browser. A fixture reordered headers and their cells, and the column mapping still returned the correct value. Removing a header returned no match instead of another cell.

### 4. Practice Software Testing — linked product cards, filter controls and numbered pages

The product container itself is an a.card. Its full data-test value contains a generated product identity. The common children have useful stable hooks: product-name, product-price and compare-btn. Selectors should retain these common hooks while parameterizing the product name.

```xpath
//a[contains(concat(' ',normalize-space(@class),' '),' card ')]
  [.//*[@data-test='product-name'][normalize-space(.)='Combination Pliers']]
```

```csharp
var product = page.Item("Combination Pliers", "Products");
string price = product.Price.Text;
product.CompareButton.Click();
page.SetText("sort", "Price (Low - High)");
page.SetText("Hammer", "true");
page.GoToPage(2);
```

Labels support the filter checkboxes. The two-handle price slider is exposed as an element needing a dedicated interaction; the generator does not pretend SetText provides range-slider behavior. The numbered pager and its disabled parent li were observed. Moving to page 2 replaced the product list.

### 5. Automation Exercise — duplicate overlays and separate product regions

Blue Top appears both in Features Items and Recommended Items. Within a feature card, productinfo and its hover overlay repeat the name, price and Add to cart action. A name-only page-wide locator therefore has multiple reasons to be ambiguous.

The correct abstraction is region → product name → primary representation → child.

```xpath
//div[contains(concat(' ',normalize-space(@class),' '),' features_items ')]
//div[contains(concat(' ',normalize-space(@class),' '),' product-image-wrapper ')]
  [.//div[contains(concat(' ',normalize-space(@class),' '),' productinfo ')]/p[.='Blue Top']]
//div[contains(concat(' ',normalize-space(@class),' '),' productinfo ')]/h2
```

```csharp
var featured = page.Item("Blue Top", "Features Items");
string price = featured.Price.Text;
featured.AddToCartButton.Click();
```

The representative primary-price locator matched once in the live browser. V31 emits separate component families for features and recommendations. It does not use a global first-match shortcut to resolve duplicates.

### 6. Automation in Testing — room cards and date-picker controls

Room cards have a heading such as Single, Double or Suite, a price and Book now link. In the inspected page, several room images used the same alt text, so the heading is a stronger key than image alt. Booking links include date query parameters, which should not be frozen into the reusable locator.

```xpath
//section[@id='rooms']//div[contains(concat(' ',normalize-space(@class),' '),' room-card ')]
  [.//h5[.='Suite']]
```

```csharp
var room = page.Item("Suite", "Rooms"); // use the actual name listed in ContainerNames
string nightlyPrice = room.Price.Text;
room.BookNowButton.Click();
```

The representative Suite container matched once. Check In and Check Out have nearby labels but the rendered inputs do not carry the corresponding for IDs. Container text association can identify them. Date-picker formatting, calendar navigation and application-specific confirmation still require dedicated interactions. No booking or contact form was submitted.

### 7. Demoblaze — catalogue cards, repeated navigation captions and hidden dialogs

The catalogue is inside tbodyid, with nested card containers. Product titles are links inside h4.card-title; prices use h5. The navigation carousel also has Previous/Next, so a page-wide Next caption is an unsafe paging locator.

```xpath
//div[@id='tbodyid']//div[contains(concat(' ',normalize-space(@class),' '),' card ')]
  [.//h4/a[.='Samsung galaxy s6']]
```

```csharp
var product = page.Item("Samsung galaxy s6", "Products");
string price = product.Price.Text;
product.ProductLink.Click();
// On the catalogue page:
page.NextPage();
```

The catalogue pager was scoped separately from the carousel, and moving Next replaced the products. The Add to cart action is on the product detail page, so it is not invented as a catalogue-card child. Hidden Log in, Sign up and Contact dialogs need to be opened and analysed separately; their controls are not claimed as visible home-page fields.

## Runtime behavior and remaining gaps

- Each use resolves a fresh flattened snapshot, maps the clone to the original and performs native Selenium reads/actions in the owning accessible frame. It restores the main frame afterward.
- Exact Item keys use escaped XPath literals, including names containing both quote types. Ambiguous keys fail; add a composite key or narrower container.
- The original GetRow(searchText) remains an explicitly documented substring fallback. Prefer Item or GetRowByColumns when the model provides them.
- Relative row access is confined to the matched component. Generated per-record action properties are suppressed in favor of reusable row children.
- Paging is caller-controlled and checks disabled ancestors. It waits for changed nonempty loaded-row content when available. Identical page content, unreliable loading indicators and virtualized grids may need application-specific readiness logic. There is no automatic crawl, purchase, deletion or form submission during analysis.
- Sample validation proves the current loaded schema, not every future record. Optional children are omitted if they do not match once in every sampled item. One-card pages cannot prove a repeated sibling pattern.
- Cross-origin frames, closed shadow roots, lazy menus, hidden dialogs, virtual scrolling, complex grids and custom controls need further work. Dedicated component adapters and read-only label/value metrics are the next improvements; they are not included as completed capabilities.
- Stable-hook preference is balanced with locator length. Class-token normalization handles multi-class attributes. Text normalization is chosen for item keys when sampled whitespace requires it; semantic column-key matching intentionally normalizes caller values.

## Use and verification

Open Locator Analysis → Create Page Class. The Analysed relationships tab shows container identity templates, common child locators, sample counts and pager templates. Review notes disclose inference and unsupported patterns. Copy or save the standalone C# class, targeting .NET 8 with Selenium.WebDriver and Selenium.Support.

The supplied verification fixtures are intentionally constructed and contain no real user field values. Run the Node checks with jsdom installed, then generator checks and generated-source compilation. The README provides commands. The package preserves the existing light/dark UI and other inspector features.


## Inspected public pages

- [Applitools](https://demo.applitools.com/app.html): indexed public content only; browser unavailable.
- [DemoWebShop](https://demowebshop.tricentis.com/accessories): live DOM and page-size/pager observation.
- [XYZ Bank](https://www.globalsqa.com/angularJs-protractor/BankingProject/#/manager/list): live headers, nested repeaters and representative locator counts.
- [Toolshop](https://practicesoftwaretesting.com/): live card hooks, filters and page change.
- [Automation Exercise](https://www.automationexercise.com/): live duplicate representations and primary-price locator count.
- [Automation in Testing](https://automationintesting.online/): live room identity, locator count and date-label structure.
- [Demoblaze](https://www.demoblaze.com/): live cards, carousel/catalogue distinction and page change.
