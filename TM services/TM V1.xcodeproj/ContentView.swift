// ContentView.swift
// Hosts the dashboard in a WKWebView, loading the bundled WebApp folder from disk.
// Adds a Swift↔JS bridge so File → Open Excel… (or the in-page button) lets the
// user pick an .xlsx whose contents are pushed into the web view as base64 and
// parsed in-page via SheetJS.

import SwiftUI
import WebKit
import UniformTypeIdentifiers

struct ContentView: View {
    var body: some View {
        WebView()
            .ignoresSafeArea()
    }
}

struct WebView: NSViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> WKWebView {
        let cfg = WKWebViewConfiguration()
        if #available(macOS 11.0, *) {
            cfg.defaultWebpagePreferences.allowsContentJavaScript = true
        }
        // Allow file:// → file:// fetch so data.json and vendored scripts load.
        cfg.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        cfg.setValue(true, forKey: "allowUniversalAccessFromFileURLs")
        // Surface JS errors / enable Web Inspector when running from Xcode.
        cfg.preferences.setValue(true, forKey: "developerExtrasEnabled")

        // Register the JS→Swift message handler (window.webkit.messageHandlers.tmHost)
        cfg.userContentController.add(context.coordinator, name: "tmHost")

        let web = WKWebView(frame: .zero, configuration: cfg)
        web.navigationDelegate = context.coordinator
        // (Removed the previous `drawsBackground=false` hack — combined with a
        //  failed React render it produced a fully transparent/empty window.)

        if #available(macOS 13.3, *) {
            web.isInspectable = true
        }

        context.coordinator.webView = web
        loadDashboard(into: web)

        // Menu / keyboard shortcuts → web view actions
        NotificationCenter.default.addObserver(forName: .tmReload, object: nil, queue: .main) { _ in
            loadDashboard(into: web)
        }
        NotificationCenter.default.addObserver(forName: .tmFocusSearch, object: nil, queue: .main) { _ in
            web.evaluateJavaScript("document.querySelector('.sb-input')?.focus();", completionHandler: nil)
        }
        NotificationCenter.default.addObserver(forName: .tmOpenXlsx, object: nil, queue: .main) { _ in
            context.coordinator.presentOpenPanel()
        }

        return web
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {}

    /// Locate Data Viz.html inside the bundle, tolerating both folder-reference
    /// and group layouts.
    private func locateDashboard() -> (html: URL, root: URL)? {
        let bundle = Bundle.main
        let fm = FileManager.default

        // 1) Folder reference: Resources/WebApp/Data Viz.html
        if let folder = bundle.url(forResource: "WebApp", withExtension: nil),
           fm.fileExists(atPath: folder.appendingPathComponent("Data Viz.html").path) {
            return (folder.appendingPathComponent("Data Viz.html"), folder)
        }
        // 2) Direct lookup of the html file (works for either layout)
        if let html = bundle.url(forResource: "Data Viz", withExtension: "html") {
            return (html, html.deletingLastPathComponent())
        }
        // 3) Last resort: scan Resources/ for it
        if let resURL = bundle.resourceURL,
           let walker = fm.enumerator(at: resURL, includingPropertiesForKeys: nil) {
            for case let url as URL in walker where url.lastPathComponent == "Data Viz.html" {
                return (url, url.deletingLastPathComponent())
            }
        }
        return nil
    }

    private func loadDashboard(into web: WKWebView) {
        guard let (html, root) = locateDashboard() else {
            let listing = (try? FileManager.default.contentsOfDirectory(atPath: Bundle.main.resourcePath ?? ""))?.sorted().joined(separator: "\n") ?? "(empty)"
            web.loadHTMLString(errorHTML("""
                Could not find <code >Data Viz.html</code> in the app bundle.<br><br>
                <b >Fix:</b > in Xcode, delete the WebApp reference, then drag the <code >WebApp</code> folder back in choosing
                <i>"Create folder references"</i> (blue icon), not <i>"Create groups"</i>.<br><br>
                <b >Resources/ contents:</b><pre>\(listing)</pre>
            """), baseURL: nil)
            return
        }
        NSLog("TM: loading \(html.path), readAccess=\(root.path)")
        web.loadFileURL(html, allowingReadAccessTo: root)
    }

    private func errorHTML(_ msg: String) -> String {
        """
        <html><head><style>
          body{font-family:-apple-system,system-ui;background:#f0eee9;color:#222;padding:48px;line-height:1.5}
          h2{font-weight:500;margin:0 0 16px}
          code{background:#e7e3dc;padding:2px 6px;border-radius:4px;font-size:.95em}
          pre{background:#e7e3dc;padding:12px;border-radius:6px;font-size:12px;max-height:300px;overflow:auto}
        </style></head>
        <body>
          <h2>TM dashboard couldn't load</h2>
          <div>\(msg)</div>
        </body></html>
        """
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        weak var webView: WKWebView?

        // MARK: WKNavigationDelegate
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            NSLog("TM webview didFail: \(error.localizedDescription)")
        }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            NSLog("TM webview didFailProvisional: \(error.localizedDescription)")
        }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            NSLog("TM webview didFinish: \(webView.url?.absoluteString ?? "nil")")
        }

        // MARK: WKScriptMessageHandler — receives messages from window.webkit.messageHandlers.tmHost
        func userContentController(_ userContentController: WKUserContentController,
                                   didReceive message: WKScriptMessage) {
            guard message.name == "tmHost",
                  let body = message.body as? [String: Any],
                  let type = body["type"] as? String else { return }
            NSLog("TM: received bridge message: \(type)")
            switch type {
            case "openXlsx":
                presentOpenPanel()
            case "log":
                NSLog("TM[js]: \(body["msg"] ?? "")")
            case "gantt":
                // Handle Gantt chart requests
                NSLog("TM: Gantt chart request received")
            default:
                NSLog("TM[js]: unknown message type \(type)")
            }
        }

        // MARK: File picker
        func presentOpenPanel() {
            guard let web = webView else {
                NSLog("TM: presentOpenPanel — webView is nil")
                return
            }
            NSLog("TM: presentOpenPanel called")

            let panel = NSOpenPanel()
            panel.title = "Open Excel workbook"
            panel.prompt = "Open"
            panel.allowsMultipleSelection = false
            panel.canChooseFiles = true
            panel.canChooseDirectories = false
            var contentTypes: [UTType] = []
            if let xlsxType = UTType(filenameExtension: "xlsx") { contentTypes.append(xlsxType) }
            if let xlsType = UTType(filenameExtension: "xls") { contentTypes.append(xlsType) }
            if !contentTypes.isEmpty {
                panel.allowedContentTypes = contentTypes
            } else {
                panel.allowedFileTypes = ["xlsx", "xls"]
            }

            let handleFile: (URL) -> Void = { [weak self] url in
                guard let web = self?.webView else {
                    NSLog("TM: webView lost after panel")
                    return
                }
                let fileName = url.lastPathComponent
                NSLog("TM: ingesting \(fileName) via CoreXLSX")

                DispatchQueue.global(qos: .userInitiated).async {
                    let engine = ExcelIngestEngine()
                    let result = engine.ingest(url: url)

                    NSLog("TM Engine: \(result.actuals.count) actuals, \(result.employees.count) employees, \(result.wbsRecords.count) WBS — skipped \(result.metadata.rowsSkipped)")

                    guard !result.actuals.isEmpty else {
                        let msg = result.metadata.parseErrors.first ?? "No records found in workbook"
                        NSLog("TM: import failed — \(msg)")
                        DispatchQueue.main.async {
                            web.callAsyncJavaScript(
                                "window.tmToast && window.tmToast(msg, true);",
                                arguments: ["msg": msg],
                                in: nil, in: .page, completionHandler: nil
                            )
                        }
                        return
                    }

                    guard let jsonString = engine.webPayloadJSON() else {
                        NSLog("TM: failed to serialize payload JSON")
                        return
                    }

                    NSLog("TM: injecting \(jsonString.count) chars of JSON into web view")

                    DispatchQueue.main.async {
                        let js = """
                        const payload = JSON.parse(jsonStr);
                        window.dispatchEvent(new CustomEvent('tm:data', { detail: payload }));
                        window.tmToast && window.tmToast('Loaded ' + payload.records.length.toLocaleString() + ' records from "' + fName + '"');
                        return 'ok: ' + payload.records.length + ' records';
                        """
                        web.callAsyncJavaScript(
                            js,
                            arguments: ["jsonStr": jsonString, "fName": fileName],
                            in: nil,
                            in: .page
                        ) { jsResult in
                            switch jsResult {
                            case .success(let val):
                                NSLog("TM ingest result: \(String(describing: val))")
                            case .failure(let err):
                                NSLog("TM ingest JS error: \(err.localizedDescription)")
                            }
                        }
                    }
                }
            }

            if let window = web.window {
                panel.beginSheetModal(for: window) { result in
                    guard result == .OK, let url = panel.url else { return }
                    handleFile(url)
                }
            } else {
                panel.begin { result in
                    guard result == .OK, let url = panel.url else { return }
                    handleFile(url)
                }
            }
        }
    }
}