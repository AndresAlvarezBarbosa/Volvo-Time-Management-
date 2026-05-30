// TMApp.swift
// Native macOS shell for the TM data-viz dashboard.

import SwiftUI

@main
struct TMApp: App {
    var body: some Scene {
        WindowGroup("TM · Labor Logs") {
            ContentView()
                .frame(minWidth: 1100, minHeight: 720)
        }
        .windowStyle(.titleBar)
        .windowToolbarStyle(.unified(showsTitle: true))
        .defaultSize(width: 1440, height: 900)
        .commands {
            // File → Open Excel… (⌘O) — primary entry point for ingesting an .xlsx
            CommandGroup(replacing: .newItem) {
                Button("Open Excel…") {
                    NotificationCenter.default.post(name: .tmOpenXlsx, object: nil)
                }
                .keyboardShortcut("o", modifiers: .command)
            }
            // ⌘F → focus the in-page search bar
            CommandGroup(replacing: .textEditing) {
                Button("Find…") {
                    NotificationCenter.default.post(name: .tmFocusSearch, object: nil)
                }
                .keyboardShortcut("f", modifiers: .command)
            }
            // ⌘R → reload the dashboard
            CommandGroup(after: .windowArrangement) {
                Button("Reload Dashboard") {
                    NotificationCenter.default.post(name: .tmReload, object: nil)
                }
                .keyboardShortcut("r", modifiers: .command)
            }
            // ⌘G → switch to Gantt chart view (optional)
            CommandGroup(after: .windowArrangement) {
                Button("Gantt Chart") {
                    NotificationCenter.default.post(name: .tmShowGantt, object: nil)
                }
                .keyboardShortcut("g", modifiers: .command)
            }
        }
    }
}

extension Notification.Name {
    static let tmFocusSearch = Notification.Name("tmFocusSearch")
    static let tmReload      = Notification.Name("tmReload")
    static let tmOpenXlsx    = Notification.Name("tmOpenXlsx")
    static let tmShowGantt   = Notification.Name("tmShowGantt")
}