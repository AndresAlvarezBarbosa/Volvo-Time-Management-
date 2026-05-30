# TM.app — Xcode project

A native macOS app that hosts the Data Viz dashboard via WKWebView. The web bundle (HTML / JSX / CSS / data.json) ships inside the app bundle; the Swift host loads it from disk so it works fully offline.

## What changed in this revision

1. **Blank-screen fix.** `TM.entitlements` previously sandboxed the app *and* set `com.apple.security.network.client = false`. Combined with React/Babel being loaded from `unpkg.com`, that meant the page never had React available and rendered blank. The libs are now **vendored locally** under `WebApp/vendor/` and the entitlement is on; the app no longer needs an internet connection to render.
2. **Excel upload.** A new **File → Open Excel… (⌘O)** menu (and an in-app "Open Excel…" button, top-right) lets the user pick any `.xlsx`. The file is read by the Swift host, base64-encoded, and handed to the web view; SheetJS parses it in-page and the dashboard re-renders against the new data without a reload.
3. Removed the `web.setValue(false, forKey: "drawsBackground")` line in `ContentView.swift`. With React absent it had been making the empty webview transparent, which compounded the blank look.

## Layout

```
TM-Xcode/
├── TM.xcodeproj/
│   └── project.pbxproj
├── TM/
│   ├── TMApp.swift            # @main SwiftUI entry, adds File → Open Excel… (⌘O)
│   ├── ContentView.swift      # WKWebView host + Swift↔JS bridge for .xlsx ingest
│   ├── Info.plist
│   ├── TM.entitlements        # sandbox + user-selected read-only + network client
│   ├── Assets.xcassets/…
│   └── WebApp/                # ← folder reference (blue icon) — copied wholesale
│       ├── Data Viz.html
│       ├── viz.css
│       ├── data.json          # bundled default dataset (loaded on first launch)
│       ├── design-canvas.jsx
│       ├── tweaks-panel.jsx
│       ├── data-utils.jsx     # DataProvider now accepts runtime data swaps
│       ├── search-bar.jsx
│       ├── excel-ingest.jsx   # NEW — base64 .xlsx → records via SheetJS
│       ├── artboards/…
│       └── vendor/            # NEW — vendored libs (offline-safe)
│           ├── react.production.min.js
│           ├── react-dom.production.min.js
│           ├── babel.min.js
│           └── xlsx.full.min.js
└── README.md
```

## Build

1. Copy this folder to your Mac. Open `TM.xcodeproj` in Xcode 15+.
2. The `WebApp/` folder is added as a **folder reference** (blue icon) — every file inside, including `vendor/` and `excel-ingest.jsx`, is automatically copied into the `.app` bundle's `Resources/WebApp/` at build time.
3. Set your Team in **Signing & Capabilities** → build & run (⌘R).

If you ever re-add the WebApp folder by accident as a *group* (yellow icon) the dashboard will fail to find `vendor/*` paths. The fix is in the in-app error message: delete the reference, drag the `WebApp/` folder back in, choose **"Create folder references"**.

## Using the Excel uploader

- **File → Open Excel… (⌘O)** or click the orange "Open Excel…" pill in the top right.
- Pick any `.xlsx`. The Swift host reads it under the user-selected sandbox grant (no fileSystem entitlement needed) and hands it to the web view.
- SheetJS parses the workbook. Sheet detection is permissive:
  - One sheet → treated as records; employee/WBS summaries derived automatically.
  - Multiple sheets → sheets named "Records / Time / Logs / Data", "Employees / People", "WBS / Projects" are each picked up.
- Column headers are matched case-insensitively against common aliases (e.g. `Personnel Number`, `PERNR`, `Employee ID` → `pn`; `Date`, `Posting Date`, `Work Date` → `date`; etc.). See `FIELD_ALIASES` in `excel-ingest.jsx` to extend.
- A toast in the top right reports record count or any parse error.

## Updating the bundled default data

Replace `TM/WebApp/data.json` and rebuild. To regenerate it from a fresh `.xlsx`, see the parsing script in the original web project — or just run the new in-app uploader and inspect `window.dispatchEvent('tm:data', …)` payloads in the Web Inspector if you need to capture the JSON.

## Going further (optional next steps)

- Persist the most recently opened `.xlsx` to `~/Library/Application Support/TM/` so it loads on next launch (instead of falling back to the bundled `data.json`).
- Add brand / period filter chips to the title bar that `postMessage` into the webview.
- Wire ⌘F to focus the in-page search bar via `evaluateJavaScript` (already done — see `tmFocusSearch`).
- Replace WKWebView with a SwiftUI Charts re-implementation panel-by-panel if you want full native fidelity.
