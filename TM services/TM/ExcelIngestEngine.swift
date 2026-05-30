// ExcelIngestEngine.swift
// Excel ingestion pipeline using CoreXLSX.
// Parses "Actuals", "Employee Loggs", "WBS Records" sheets into typed
// Swift models and produces web-compatible JSON for the dashboard.

import Foundation
import CoreXLSX

// MARK: - Models

struct Actual: Identifiable {
    let id: UUID
    let personnelNumber: String
    let date: Date
    let hours: Double
    let activityType: String
    let wbs: String
    let shortId: String
    let employeeName: String

    var deduplicationKey: String {
        let dateStr = Actual.keyFormatter.string(from: date)
        return "\(personnelNumber)|\(dateStr)|\(hours)|\(wbs)"
    }

    fileprivate static let keyFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MM/dd/yyyy"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()
}

struct Employee: Identifiable {
    let id: UUID
    let personnelNumber: String
    let name: String
    let department: String?
    let role: String?
    let manager: String?
}

struct WBSRecord: Identifiable {
    let id: UUID
    let wbsCode: String
    let description: String?
    let projectName: String?
    let category: String?
}

// MARK: - Results

struct IngestionResult {
    let actuals: [Actual]
    let employees: [Employee]
    let wbsRecords: [WBSRecord]
    let metadata: IngestionMetadata
}

struct IngestionMetadata {
    let totalRowsProcessed: Int
    let rowsSkipped: Int
    let parseErrors: [String]
    let timestamp: Date
}

// MARK: - Cell helpers

private let dateFormatterMMddyyyy: DateFormatter = {
    let f = DateFormatter()
    f.dateFormat = "MM/dd/yyyy"
    f.locale = Locale(identifier: "en_US_POSIX")
    return f
}()

private let isoDateFormatter: DateFormatter = {
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd"
    f.locale = Locale(identifier: "en_US_POSIX")
    return f
}()

private func stringValue(from cell: Cell, sharedStrings: SharedStrings?) -> String? {
    if cell.type == .sharedString,
       let raw = cell.value,
       let index = Int(raw),
       let items = sharedStrings?.items,
       index >= 0, index < items.count {
        let item = items[index]
        if let text = item.text {
            return text.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if !item.richText.isEmpty {
            let combined = item.richText.compactMap(\.text).joined()
            return combined.isEmpty ? nil : combined.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return nil
    }
    if let inline = cell.inlineString, let text = inline.text {
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    if let value = cell.value {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
    return nil
}

private func doubleValue(from cell: Cell, sharedStrings: SharedStrings?) -> Double? {
    if let raw = cell.value, let d = Double(raw) { return d }
    if let s = stringValue(from: cell, sharedStrings: sharedStrings) {
        return Double(s.replacingOccurrences(of: ",", with: ""))
    }
    return nil
}

private func dateValue(from cell: Cell, sharedStrings: SharedStrings?) -> Date? {
    if cell.type != .sharedString,
       let raw = cell.value,
       let serial = Double(raw), serial > 1 {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let adjusted = serial > 59 ? serial - 1 : serial
        if let base = cal.date(from: DateComponents(year: 1899, month: 12, day: 31)) {
            return cal.date(byAdding: .day, value: Int(adjusted), to: base)
        }
    }
    if let s = stringValue(from: cell, sharedStrings: sharedStrings), !s.isEmpty {
        if let d = dateFormatterMMddyyyy.date(from: s) { return d }
        if let d = isoDateFormatter.date(from: String(s.prefix(10))) { return d }
        let df = DateFormatter()
        df.locale = Locale(identifier: "en_US_POSIX")
        for fmt in ["dd/MM/yyyy", "M/d/yyyy", "d-MMM-yyyy", "yyyy/MM/dd"] {
            df.dateFormat = fmt
            if let d = df.date(from: s) { return d }
        }
    }
    return nil
}

// MARK: - Header mapping

private func normalize(_ s: String) -> String {
    s.lowercased().unicodeScalars
        .filter { CharacterSet.alphanumerics.contains($0) }
        .map(String.init)
        .joined()
}

private typealias HeaderMap = [String: String]

private func buildHeaderMap(row: Row, sharedStrings: SharedStrings?, aliases: [String: [String]]) -> HeaderMap {
    var map = HeaderMap()
    var claimed = Set<String>()
    for cell in row.cells {
        let col = cell.reference.column.value
        guard let raw = stringValue(from: cell, sharedStrings: sharedStrings), !raw.isEmpty else { continue }
        let n = normalize(raw)
        for (canonical, aliasList) in aliases where !claimed.contains(canonical) {
            if aliasList.contains(n) {
                map[col] = canonical
                claimed.insert(canonical)
                break
            }
        }
    }
    return map
}

private func mappingReport(
    sheetName: String,
    headerRow: Row,
    sharedStrings: SharedStrings?,
    aliases: [String: [String]],
    headerMap: HeaderMap
) -> String {
    var mapped: [String] = []
    var unmapped: [String] = []

    for cell in headerRow.cells {
        guard let raw = stringValue(from: cell, sharedStrings: sharedStrings), !raw.isEmpty else { continue }
        let normalized = normalize(raw)
        let isMapped = aliases.values.contains { $0.contains(normalized) }
        if isMapped {
            mapped.append(raw)
        } else {
            unmapped.append(raw)
        }
    }

    let mappedCanonical = Array(Set(headerMap.values)).sorted().joined(separator: ", ")
    let unmappedPreview = unmapped.prefix(8).joined(separator: ", ")
    let unmappedSuffix = unmapped.count > 8 ? " …" : ""

    return "[Mapping \(sheetName)] mappedFields=[\(mappedCanonical)] mappedHeaders=\(mapped.count) unmappedHeaders=\(unmapped.count)" + (unmapped.isEmpty ? "" : " unmapped=[\(unmappedPreview)\(unmappedSuffix)]")
}

private func extractFields(row: Row, headerMap: HeaderMap) -> [String: Cell] {
    var fields = [String: Cell]()
    for cell in row.cells {
        if let canonical = headerMap[cell.reference.column.value] {
            fields[canonical] = cell
        }
    }
    return fields
}

private func columnIndex(_ columnName: String) -> Int {
    var value = 0
    for scalar in columnName.uppercased().unicodeScalars {
        let v = scalar.value
        guard v >= 65, v <= 90 else { continue }
        value = value * 26 + Int(v - 64)
    }
    return value
}

private func fallbackHeaderMap(row: Row, canonicalOrder: [String]) -> HeaderMap {
    let sortedCells = row.cells.sorted {
        columnIndex($0.reference.column.value) < columnIndex($1.reference.column.value)
    }

    var map = HeaderMap()
    for (idx, cell) in sortedCells.enumerated() where idx < canonicalOrder.count {
        map[cell.reference.column.value] = canonicalOrder[idx]
    }
    return map
}

// MARK: - Column aliases for each sheet type

private let actualsAliases: [String: [String]] = [
    "pn":       ["pn", "pernr", "personnelnumber", "employeeid", "empid",
                 "employeenumber", "persno", "perno"],
    "date":     ["date", "workdate", "postingdate", "logdate", "day",
                 "recorddate", "entrydate", "timedate"],
    "hours":    ["hours", "hrs", "duration", "qty", "quantity", "amount",
                 "hourslogged", "loggedhours", "totalhours", "hourstotal",
                 "hoursworked", "workhours"],
    "activity": ["activity", "activitytype", "attendancetype", "awart",
                 "wagetype", "attendanceabsencetype"],
    "wbs":      ["wbs", "wbselement", "wbscode", "projectcode", "wbsid",
                 "generalreceiver", "receiver", "receiverwbselement"],
    "shortId":  ["shortid", "short", "projshort", "wbsshort", "wbsname",
                 "projectid", "shortidentification"],
    "name":     ["name", "employee", "employeename", "fullname", "person",
                 "worker", "resource", "nameofemployeeorapplicant",
                 "employeeorapplicant", "nameofemployee"],
]

private let employeeAliases: [String: [String]] = [
    "pn":         ["pn", "pernr", "personnelnumber", "employeeid", "empid",
                   "persno", "perno"],
    "name":       ["name", "employee", "employeename", "fullname", "person",
                   "nameofemployee", "nameofemployeeorapplicant"],
    "department": ["brand", "brands", "brandname", "businessunit", "bu",
                   "company", "companycode", "org", "organization", "orgunit",
                   "division", "department", "dept", "team"],
    "role":       ["func", "function", "functionname", "functionalarea",
                   "role", "jobtitle", "position", "title"],
    "manager":    ["manager", "supervisor", "lead", "reportsto"],
    "status":     ["status", "employmentstatus"],
    "type":       ["type", "employeetype", "emptype"],
    "lastLogged": ["lastlogged", "lastlog", "lastentry", "lastdate",
                   "lastrecorddate", "lastloggeddate"],
]

private let wbsAliases: [String: [String]] = [
    "wbs":         ["wbs", "wbselement", "wbscode", "wbsid", "project", "projectcode", "projectid"],
    "shortId":     ["shortid", "short", "wbsshort", "shortidentification",
                    "description", "desc"],
    "activity":    ["activity", "activitytype"],
    "lastRecord":  ["lastrecord", "lastposting", "lastentry", "lastrecorddate"],
    "hoursTotal":  ["hourstotal", "totalhours", "hours", "hourslogged"],
    "type":        ["type", "billingtype", "wbstype"],
    "status":      ["status"],
    "project":     ["project", "projectname", "projname", "projecttitle", "engagement", "workstream"],
    "projectType": ["projecttype", "projkind", "projectcategory", "programtype"],
]

// MARK: - Row parsers

private func parseActualsRows(
    worksheet: Worksheet,
    sharedStrings: SharedStrings?,
    existingKeys: Set<String>
) -> (actuals: [Actual], webRecords: [[String: Any]], processed: Int, skipped: Int, errors: [String]) {

    let rows = worksheet.data?.rows ?? []
    guard rows.count > 1 else {
        return ([], [], 0, 0, ["Actuals sheet has no data rows"])
    }

    var headerMap = buildHeaderMap(row: rows[0], sharedStrings: sharedStrings, aliases: actualsAliases)
    NSLog("TM ActualsParser: headerMap = \(headerMap)")

    var errors = [mappingReport(sheetName: "Actuals", headerRow: rows[0], sharedStrings: sharedStrings, aliases: actualsAliases, headerMap: headerMap)]

    if !(headerMap.values.contains("date") && headerMap.values.contains("hours")) {
        let fallback = fallbackHeaderMap(row: rows[0], canonicalOrder: ["pn", "date", "hours", "activity", "wbs", "shortId", "name"])
        if fallback.values.contains("date") && fallback.values.contains("hours") {
            headerMap = fallback
            errors.append("[Mapping Actuals] using positional fallback mapping")
        }
    }

    guard headerMap.values.contains("date"), headerMap.values.contains("hours") else {
        let mapped = headerMap.values.sorted().joined(separator: ", ")
        return ([], [], 0, 0, errors + ["Actuals: missing required columns (date, hours). Mapped: [\(mapped)]"])
    }

    var actuals = [Actual]()
    var webRecords = [[String: Any]]()
    var processed = 0
    var skipped = 0

    for i in 1..<rows.count {
        processed += 1
        let fields = extractFields(row: rows[i], headerMap: headerMap)

        guard let pnCell = fields["pn"],
              let pn = stringValue(from: pnCell, sharedStrings: sharedStrings),
              !pn.isEmpty else {
            skipped += 1
            if errors.count < 20 { errors.append("Actuals row \(i + 1): missing personnel number") }
            continue
        }

        guard let dateCell = fields["date"],
              let date = dateValue(from: dateCell, sharedStrings: sharedStrings) else {
            skipped += 1
            if errors.count < 20 { errors.append("Actuals row \(i + 1): invalid or missing date") }
            continue
        }

        guard let hoursCell = fields["hours"],
              let hours = doubleValue(from: hoursCell, sharedStrings: sharedStrings),
              hours >= 0 else {
            skipped += 1
            if errors.count < 20 { errors.append("Actuals row \(i + 1): invalid or negative hours") }
            continue
        }

        let activity = fields["activity"].flatMap { stringValue(from: $0, sharedStrings: sharedStrings) } ?? ""
        let wbs = fields["wbs"].flatMap { stringValue(from: $0, sharedStrings: sharedStrings) } ?? ""
        let shortId = fields["shortId"].flatMap { stringValue(from: $0, sharedStrings: sharedStrings) } ?? ""
        let name = fields["name"].flatMap { stringValue(from: $0, sharedStrings: sharedStrings) } ?? ""

        let dateStr = dateFormatterMMddyyyy.string(from: date)
        let key = "\(pn)|\(dateStr)|\(hours)|\(wbs)"
        if existingKeys.contains(key) {
            skipped += 1
            continue
        }

        actuals.append(Actual(
            id: UUID(), personnelNumber: pn, date: date, hours: hours,
            activityType: activity, wbs: wbs, shortId: shortId, employeeName: name
        ))

        webRecords.append([
            "pn": pn,
            "date": isoDateFormatter.string(from: date),
            "hours": hours,
            "activity": activity,
            "wbs": wbs,
            "shortId": shortId,
            "name": name,
        ])
    }

    return (actuals, webRecords, processed, skipped, errors)
}

private func parseEmployeeRows(
    worksheet: Worksheet,
    sharedStrings: SharedStrings?
) -> (employees: [Employee], webEmployees: [[String: Any]], processed: Int, skipped: Int, errors: [String]) {

    let rows = worksheet.data?.rows ?? []
    guard rows.count > 1 else {
        return ([], [], 0, 0, ["Employee Loggs sheet has no data rows"])
    }

    var headerMap = buildHeaderMap(row: rows[0], sharedStrings: sharedStrings, aliases: employeeAliases)
    NSLog("TM EmployeeParser: headerMap = \(headerMap)")

    var employees = [Employee]()
    var webEmployees = [[String: Any]]()
    var processed = 0
    var skipped = 0
    var errors = [mappingReport(sheetName: "Employee Loggs", headerRow: rows[0], sharedStrings: sharedStrings, aliases: employeeAliases, headerMap: headerMap)]

    if !headerMap.values.contains("pn") {
        headerMap = fallbackHeaderMap(row: rows[0], canonicalOrder: ["pn", "name", "department", "role", "manager", "status", "type", "lastLogged"])
        errors.append("[Mapping Employee Loggs] using positional fallback mapping")
    }

    for i in 1..<rows.count {
        processed += 1
        let fields = extractFields(row: rows[i], headerMap: headerMap)

        guard let pnCell = fields["pn"],
              let pn = stringValue(from: pnCell, sharedStrings: sharedStrings),
              !pn.isEmpty else {
            skipped += 1
            if errors.count < 20 { errors.append("Employee row \(i + 1): missing personnel number") }
            continue
        }

        let name = fields["name"].flatMap { stringValue(from: $0, sharedStrings: sharedStrings) } ?? ""
        let department = fields["department"].flatMap { stringValue(from: $0, sharedStrings: sharedStrings) }
        let role = fields["role"].flatMap { stringValue(from: $0, sharedStrings: sharedStrings) }
        let manager = fields["manager"].flatMap { stringValue(from: $0, sharedStrings: sharedStrings) }
        let status = fields["status"].flatMap { stringValue(from: $0, sharedStrings: sharedStrings) }
        let type = fields["type"].flatMap { stringValue(from: $0, sharedStrings: sharedStrings) }

        var lastLoggedStr = ""
        if let llCell = fields["lastLogged"] {
            if let llDate = dateValue(from: llCell, sharedStrings: sharedStrings) {
                lastLoggedStr = isoDateFormatter.string(from: llDate)
            } else {
                lastLoggedStr = stringValue(from: llCell, sharedStrings: sharedStrings) ?? ""
            }
        }

        employees.append(Employee(
            id: UUID(), personnelNumber: pn, name: name,
            department: department, role: role, manager: manager
        ))

        webEmployees.append([
            "name": name,
            "pn": pn,
            "lastLogged": lastLoggedStr,
            "status": status ?? "Active",
            "brand": department ?? "Unknown",
            "type": type ?? "Employee",
            "func": role ?? "",
        ])
    }

    return (employees, webEmployees, processed, skipped, errors)
}

private func parseWBSRows(
    worksheet: Worksheet,
    sharedStrings: SharedStrings?
) -> (wbsRecords: [WBSRecord], webWBS: [[String: Any]], processed: Int, skipped: Int, errors: [String]) {

    let rows = worksheet.data?.rows ?? []
    guard rows.count > 1 else {
        return ([], [], 0, 0, ["WBS Records sheet has no data rows"])
    }

    var headerMap = buildHeaderMap(row: rows[0], sharedStrings: sharedStrings, aliases: wbsAliases)
    NSLog("TM WBSParser: headerMap = \(headerMap)")

    var records = [WBSRecord]()
    var webWBS = [[String: Any]]()
    var processed = 0
    var skipped = 0
    var errors = [mappingReport(sheetName: "WBS Records", headerRow: rows[0], sharedStrings: sharedStrings, aliases: wbsAliases, headerMap: headerMap)]

    if !headerMap.values.contains("wbs") {
        headerMap = fallbackHeaderMap(row: rows[0], canonicalOrder: ["wbs", "shortId", "activity", "lastRecord", "hoursTotal", "type", "status", "project", "projectType"])
        errors.append("[Mapping WBS Records] using positional fallback mapping")
    }

    for i in 1..<rows.count {
        processed += 1
        let fields = extractFields(row: rows[i], headerMap: headerMap)

        guard let wbsCell = fields["wbs"],
              let wbs = stringValue(from: wbsCell, sharedStrings: sharedStrings),
              !wbs.isEmpty else {
            skipped += 1
            if errors.count < 20 { errors.append("WBS row \(i + 1): missing WBS code") }
            continue
        }

        let shortId = fields["shortId"].flatMap { stringValue(from: $0, sharedStrings: sharedStrings) }
        let activity = fields["activity"].flatMap { stringValue(from: $0, sharedStrings: sharedStrings) }
        let hoursTotal = fields["hoursTotal"].flatMap { doubleValue(from: $0, sharedStrings: sharedStrings) }
        let type = fields["type"].flatMap { stringValue(from: $0, sharedStrings: sharedStrings) }
        let status = fields["status"].flatMap { stringValue(from: $0, sharedStrings: sharedStrings) }
        let project = fields["project"].flatMap { stringValue(from: $0, sharedStrings: sharedStrings) }
        let projectType = fields["projectType"].flatMap { stringValue(from: $0, sharedStrings: sharedStrings) }

        var lastRecordStr = ""
        if let lrCell = fields["lastRecord"] {
            if let lrDate = dateValue(from: lrCell, sharedStrings: sharedStrings) {
                lastRecordStr = isoDateFormatter.string(from: lrDate)
            } else {
                lastRecordStr = stringValue(from: lrCell, sharedStrings: sharedStrings) ?? ""
            }
        }

        records.append(WBSRecord(
            id: UUID(), wbsCode: wbs, description: shortId,
            projectName: project, category: type
        ))

        webWBS.append([
            "wbs": wbs,
            "shortId": shortId ?? "",
            "activity": activity ?? "",
            "lastRecord": lastRecordStr,
            "hoursTotal": hoursTotal ?? 0.0,
            "type": type ?? "Unknown",
            "status": status ?? "Active",
            "project": project ?? wbs,
            "projectType": projectType ?? "",
        ])
    }

    return (records, webWBS, processed, skipped, errors)
}

// MARK: - Ingestion Engine

final class ExcelIngestEngine {

    private var webRecords: [[String: Any]] = []
    private var webEmployees: [[String: Any]] = []
    private var webWBS: [[String: Any]] = []
    private var actuals: [Actual] = [] // Add this property

    func ingest(url: URL, existingKeys: Set<String> = []) -> IngestionResult {
        let accessed = url.startAccessingSecurityScopedResource()
        defer { if accessed { url.stopAccessingSecurityScopedResource() } }

        webRecords = []
        webEmployees = []
        webWBS = []

        func fail(_ msg: String) -> IngestionResult {
            IngestionResult(
                actuals: [], employees: [], wbsRecords: [],
                metadata: IngestionMetadata(
                    totalRowsProcessed: 0, rowsSkipped: 0,
                    parseErrors: [msg], timestamp: Date()
                )
            )
        }

        let fileData: Data
        do {
            fileData = try Data(contentsOf: url)
        } catch {
            return fail("Could not read file: \(error.localizedDescription)")
        }

        let file: XLSXFile
        do {
            file = try XLSXFile(data: fileData)
        } catch {
            return fail("Not a valid .xlsx file: \(error.localizedDescription)")
        }

        let sharedStrings = try? file.parseSharedStrings()

        // ── Step 1: Discover all worksheets ──────────────────────────
        // We try multiple CoreXLSX APIs in order, picking the first that works.
        // CoreXLSX relationship-based discovery can fail on files with
        // non-standard schema types, so we always fall back to probing
        // common worksheet paths directly.

        var sheets: [(name: String, path: String)] = []

        // Method A: parseWorksheetPathsAndNames — gives both names and paths
        if let workbook = try? file.parseWorkbooks().first,
           let items = try? file.parseWorksheetPathsAndNames(workbook: workbook),
           !items.isEmpty {
            for item in items {
                sheets.append((name: item.name ?? "", path: item.path))
            }
            NSLog("TM Engine [method A]: sheets = \(sheets.map(\.name))")
        }

        // Method B: correlate workbook sheet names with paths by index
        if sheets.isEmpty {
            let paths = (try? file.parseWorksheetPaths()) ?? []
            if !paths.isEmpty {
                var names: [String] = []
                if let workbook = try? file.parseWorkbooks().first {
                    names = workbook.sheets.items.map { $0.name ?? "" }
                }
                for (i, path) in paths.enumerated() {
                    let name = i < names.count ? names[i] : ""
                    sheets.append((name: name, path: path))
                }
                NSLog("TM Engine [method B]: sheets = \(sheets.map(\.name))")
            }
        }

        // Method C: probe common worksheet paths directly.
        // This bypasses the relationships XML entirely — works even when
        // CoreXLSX can't parse the .rels files (non-standard schema types, etc.)
        if sheets.isEmpty {
            NSLog("TM Engine [method C]: probing standard worksheet paths")
            // Get sheet names from workbook.xml if possible (parse the XML manually
            // since parseWorkbooks() may have also failed)
            var sheetNames: [String] = []
            if let workbook = try? file.parseWorkbooks().first {
                sheetNames = workbook.sheets.items.map { $0.name ?? "" }
            }

            for i in 1...20 {
                let path = "xl/worksheets/sheet\(i).xml"
                do {
                    let ws = try file.parseWorksheet(at: path)
                    if ws.data?.rows.isEmpty == false {
                        let name = (i - 1) < sheetNames.count ? sheetNames[i - 1] : ""
                        sheets.append((name: name, path: path))
                        NSLog("TM Engine [method C]: found sheet at \(path) name='\(name)'")
                    }
                } catch {
                    if i <= 4 { continue }
                    break
                }
            }
        }

        guard !sheets.isEmpty else {
            return fail("No worksheets found in workbook")
        }

        // ── Step 2: Match sheets to roles (actuals/employees/wbs) ────
        // First pass: match by sheet name.
        // Second pass: match unassigned sheets by header content.

        var actualsPath: String?
        var employeePath: String?
        var wbsPath: String?

        // Simple name matching
        for sheet in sheets {
            let lower = sheet.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if lower.isEmpty { continue }

            if actualsPath == nil && (lower == "actuals" || lower.contains("actual")) {
                actualsPath = sheet.path
                NSLog("TM Engine: matched '\(sheet.name)' → Actuals (by name)")
            } else if employeePath == nil && (lower == "employee loggs" || lower.contains("employee")) {
                employeePath = sheet.path
                NSLog("TM Engine: matched '\(sheet.name)' → Employees (by name)")
            } else if wbsPath == nil && (lower == "wbs records" || lower.contains("wbs")) {
                wbsPath = sheet.path
                NSLog("TM Engine: matched '\(sheet.name)' → WBS (by name)")
            }
        }

        // Header-based detection for any sheet not yet matched
        if actualsPath == nil || employeePath == nil || wbsPath == nil {
            let assigned = Set([actualsPath, employeePath, wbsPath].compactMap { $0 })

            for sheet in sheets {
                if assigned.contains(sheet.path) { continue }
                guard let ws = try? file.parseWorksheet(at: sheet.path),
                      let wsRows = ws.data?.rows, !wsRows.isEmpty else { continue }

                let headerRow = wsRows[0]
                let aScore = actualsPath == nil ? buildHeaderMap(row: headerRow, sharedStrings: sharedStrings, aliases: actualsAliases).count : 0
                let eScore = employeePath == nil ? buildHeaderMap(row: headerRow, sharedStrings: sharedStrings, aliases: employeeAliases).count : 0
                let wScore = wbsPath == nil ? buildHeaderMap(row: headerRow, sharedStrings: sharedStrings, aliases: wbsAliases).count : 0

                let best = max(aScore, eScore, wScore)
                guard best >= 2 else { continue }

                if aScore == best && actualsPath == nil {
                    actualsPath = sheet.path
                    NSLog("TM Engine: matched '\(sheet.name)' → Actuals (by headers, score:\(aScore))")
                } else if eScore == best && employeePath == nil {
                    employeePath = sheet.path
                    NSLog("TM Engine: matched '\(sheet.name)' → Employees (by headers, score:\(eScore))")
                } else if wScore == best && wbsPath == nil {
                    wbsPath = sheet.path
                    NSLog("TM Engine: matched '\(sheet.name)' → WBS (by headers, score:\(wScore))")
                }
            }
        }

        // ── Step 3: Parse each matched sheet ─────────────────────────

        var totalProcessed = 0
        var totalSkipped = 0
        var allErrors = [String]()
        var actuals = [Actual]()
        var employees = [Employee]()
        var wbsRecords = [WBSRecord]()

        if let path = actualsPath {
            do {
                let ws = try file.parseWorksheet(at: path)
                let r = parseActualsRows(worksheet: ws, sharedStrings: sharedStrings, existingKeys: existingKeys)
                actuals = r.actuals
                webRecords = r.webRecords
                totalProcessed += r.processed
                totalSkipped += r.skipped
                allErrors.append(contentsOf: r.errors)
            } catch {
                allErrors.append("Failed to parse Actuals: \(error.localizedDescription)")
            }
        } else {
            let names = sheets.map(\.name).joined(separator: ", ")
            allErrors.append("Sheet 'Actuals' not found. Sheets in file: [\(names)]")
        }

        if let path = employeePath {
            do {
                let ws = try file.parseWorksheet(at: path)
                let r = parseEmployeeRows(worksheet: ws, sharedStrings: sharedStrings)
                employees = r.employees
                webEmployees = r.webEmployees
                totalProcessed += r.processed
                totalSkipped += r.skipped
                allErrors.append(contentsOf: r.errors)
            } catch {
                allErrors.append("Failed to parse Employees: \(error.localizedDescription)")
            }
        } else {
            allErrors.append("Sheet 'Employee Loggs' not found")
        }

        if let path = wbsPath {
            do {
                let ws = try file.parseWorksheet(at: path)
                let r = parseWBSRows(worksheet: ws, sharedStrings: sharedStrings)
                wbsRecords = r.wbsRecords
                webWBS = r.webWBS
                totalProcessed += r.processed
                totalSkipped += r.skipped
                allErrors.append(contentsOf: r.errors)
            } catch {
                allErrors.append("Failed to parse WBS Records: \(error.localizedDescription)")
            }
        } else {
            allErrors.append("Sheet 'WBS Records' not found")
        }

        NSLog("TM Engine: \(actuals.count) actuals, \(employees.count) employees, \(wbsRecords.count) WBS")

        // Store actuals for Gantt chart generation
        self.actuals = actuals

        return IngestionResult(
            actuals: actuals, employees: employees, wbsRecords: wbsRecords,
            metadata: IngestionMetadata(
                totalRowsProcessed: totalProcessed,
                rowsSkipped: totalSkipped,
                parseErrors: allErrors,
                timestamp: Date()
            )
        )
    }

    // Add Gantt chart data generation methods
    func generateGanttTasks() -> [[String: Any]] {
        // Process actuals data to create timeline tasks
        var ganttTasks = [[String: Any]]()
        
        // Group actuals by WBS code for timeline visualization
        var wbsGroups: [String: [Actual]] = [:]
        
        for actual in actuals {
            let wbsCode = actual.wbs.isEmpty ? "Unassigned" : actual.wbs
            if wbsGroups[wbsCode] == nil {
                wbsGroups[wbsCode] = []
            }
            wbsGroups[wbsCode]?.append(actual)
        }
        
        // Create Gantt tasks from grouped data
        for (wbsCode, actuals) in wbsGroups {
            guard !actuals.isEmpty else { continue }
            
            // Find min and max dates for this WBS
            let startDate = actuals.min { $0.date < $1.date }?.date ?? Date()
            let endDate = actuals.max { $0.date < $1.date }?.date ?? Date()
            
            // Create Gantt task
            let ganttTask = [
                "id": "wbs_\(wbsCode)",
                "name": wbsCode,
                "start": startDate,
                "end": endDate,
                "duration": calculateDuration(startDate, endDate),
                "progress": 0.0, // Placeholder - could be calculated from actuals
                "resource": actuals.first?.employeeName ?? "Unassigned"
            ] as [String: Any]
            
            ganttTasks.append(ganttTask)
        }
        
        return ganttTasks
    }

    private func calculateDuration(_ startDate: Date, _ endDate: Date) -> Double {
        let calendar = Calendar.current
        let days = calendar.dateComponents([.day], from: startDate, to: endDate).day ?? 0
        return Double(days + 1) // Add 1 to include both start and end day
    }

    func webPayloadJSON() -> String? {
        let payload: [String: Any] = [
            "records": webRecords,
            "employees": webEmployees,
            "wbs": webWBS,
            "ganttTasks": generateGanttTasks() // Add Gantt chart data
        ]
        
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else {
            return nil
        }
        return json
    }
}

// MARK: - Post-Processing

func groupHoursByEmployee(_ data: [Actual]) -> [String: Double] {
    var result = [String: Double]()
    for a in data {
        let key = a.employeeName.isEmpty ? a.personnelNumber : a.employeeName
        result[key, default: 0] += a.hours
    }
    return result
}

func groupHoursByWBS(_ data: [Actual]) -> [String: Double] {
    var result = [String: Double]()
    for a in data where !a.wbs.isEmpty {
        result[a.wbs, default: 0] += a.hours
    }
    return result
}

