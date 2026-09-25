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

Selenium Manager is used by Selenium 4 to locate the browser driver.
