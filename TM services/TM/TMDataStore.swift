import Foundation
import SwiftData

@available(macOS 14.0, *)
@Model
final class TMActualEntity {
    @Attribute(.unique) var deduplicationKey: String
    var personnelNumber: String
    var date: Date
    var hours: Double
    var activityType: String
    var wbs: String
    var shortId: String
    var employeeName: String

    init(from actual: Actual) {
        self.deduplicationKey = actual.deduplicationKey
        self.personnelNumber = actual.personnelNumber
        self.date = actual.date
        self.hours = actual.hours
        self.activityType = actual.activityType
        self.wbs = actual.wbs
        self.shortId = actual.shortId
        self.employeeName = actual.employeeName
    }
}

@available(macOS 14.0, *)
@Model
final class TMEmployeeEntity {
    @Attribute(.unique) var personnelNumber: String
    var name: String
    var department: String?
    var role: String?
    var manager: String?

    init(from employee: Employee) {
        self.personnelNumber = employee.personnelNumber
        self.name = employee.name
        self.department = employee.department
        self.role = employee.role
        self.manager = employee.manager
    }
}

@available(macOS 14.0, *)
@Model
final class TMWBSRecordEntity {
    @Attribute(.unique) var wbsCode: String
    var recordDescription: String?
    var projectName: String?
    var category: String?

    init(from record: WBSRecord) {
        self.wbsCode = record.wbsCode
        self.recordDescription = record.description
        self.projectName = record.projectName
        self.category = record.category
    }
}

@available(macOS 14.0, *)
enum TMDataStore {
    private static let webISODateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return formatter
    }()

    private static let storeISODateFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static let container: ModelContainer? = makeContainer()

    static func makeContainer() -> ModelContainer? {
        let schema = Schema([TMActualEntity.self, TMEmployeeEntity.self, TMWBSRecordEntity.self])
        let config = ModelConfiguration(schema: schema)

        do {
            return try ModelContainer(for: schema, configurations: [config])
        } catch {
            NSLog("TM SwiftData: failed to create container: \(error.localizedDescription)")
            return nil
        }
    }

    static func existingActualKeys() -> Set<String> {
        guard let container else { return [] }
        let context = ModelContext(container)
        let items = (try? context.fetch(FetchDescriptor<TMActualEntity>())) ?? []
        return Set(items.map(\.deduplicationKey))
    }

    static func saveIngestionResult(_ result: IngestionResult) throws {
        guard let container else { return }
        let context = ModelContext(container)

        let existingActuals = (try? context.fetch(FetchDescriptor<TMActualEntity>())) ?? []
        let existingActualKeys = Set(existingActuals.map(\.deduplicationKey))
        for actual in result.actuals where !existingActualKeys.contains(actual.deduplicationKey) {
            context.insert(TMActualEntity(from: actual))
        }

        let existingEmployees = (try? context.fetch(FetchDescriptor<TMEmployeeEntity>())) ?? []
        var employeesByPN: [String: TMEmployeeEntity] = [:]
        for employee in existingEmployees {
            employeesByPN[employee.personnelNumber] = employee
        }

        for employee in result.employees {
            if let existing = employeesByPN[employee.personnelNumber] {
                existing.name = employee.name
                existing.department = employee.department
                existing.role = employee.role
                existing.manager = employee.manager
            } else {
                context.insert(TMEmployeeEntity(from: employee))
            }
        }

        let existingWBS = (try? context.fetch(FetchDescriptor<TMWBSRecordEntity>())) ?? []
        var wbsByCode: [String: TMWBSRecordEntity] = [:]
        for record in existingWBS {
            wbsByCode[record.wbsCode] = record
        }

        for record in result.wbsRecords {
            if let existing = wbsByCode[record.wbsCode] {
                existing.recordDescription = record.description
                existing.projectName = record.projectName
                existing.category = record.category
            } else {
                context.insert(TMWBSRecordEntity(from: record))
            }
        }

        try context.save()
    }

    static func webPayloadJSON() -> String? {
        guard let container else { return nil }
        let context = ModelContext(container)
        let actuals = (try? context.fetch(FetchDescriptor<TMActualEntity>())) ?? []
        let employees = (try? context.fetch(FetchDescriptor<TMEmployeeEntity>())) ?? []
        let wbsRecords = (try? context.fetch(FetchDescriptor<TMWBSRecordEntity>())) ?? []

        let records = actuals.map {
            [
                "pn": $0.personnelNumber,
                "date": webISODateFormatter.string(from: $0.date),
                "hours": $0.hours,
                "activity": $0.activityType,
                "wbs": $0.wbs,
                "shortId": $0.shortId,
                "name": $0.employeeName,
            ] as [String: Any]
        }

        let webEmployees = employees.map {
            [
                "name": $0.name,
                "pn": $0.personnelNumber,
                "lastLogged": "",
                "status": "Active",
                "brand": $0.department ?? "Unknown",
                "type": "Employee",
                "func": $0.role ?? "",
            ] as [String: Any]
        }

        let webWBS = wbsRecords.map {
            [
                "wbs": $0.wbsCode,
                "shortId": $0.recordDescription ?? "",
                "activity": "",
                "lastRecord": "",
                "hoursTotal": 0.0,
                "type": $0.category ?? "Unknown",
                "status": "Active",
                "project": $0.projectName ?? $0.wbsCode,
                "projectType": "",
            ] as [String: Any]
        }

        let payload: [String: Any] = [
            "records": records,
            "employees": webEmployees,
            "wbs": webWBS,
            "ganttTasks": generateGanttTasks(from: actuals),
        ]

        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else {
            return nil
        }
        return json
    }

    private static func generateGanttTasks(from actuals: [TMActualEntity]) -> [[String: Any]] {
        var wbsGroups: [String: [TMActualEntity]] = [:]

        for actual in actuals {
            let wbsCode = actual.wbs.isEmpty ? "Unassigned" : actual.wbs
            wbsGroups[wbsCode, default: []].append(actual)
        }

        return wbsGroups.compactMap { wbsCode, rows in
            guard !rows.isEmpty else { return nil }
            let startDate = rows.min { $0.date < $1.date }?.date ?? Date()
            let endDate = rows.max { $0.date < $1.date }?.date ?? Date()
            let totalHours = rows.reduce(0.0) { $0 + $1.hours }

            return [
                "id": "wbs_\(wbsCode)",
                "name": wbsCode,
                "start": storeISODateFormatter.string(from: startDate),
                "end": storeISODateFormatter.string(from: endDate),
                "duration": calculateDuration(startDate, endDate),
                "progress": 0.0,
                "resource": rows.first?.employeeName ?? "Unassigned",
                "totalHours": totalHours,
            ]
        }
    }

    private static func calculateDuration(_ startDate: Date, _ endDate: Date) -> Double {
        let days = Calendar.current.dateComponents([.day], from: startDate, to: endDate).day ?? 0
        return Double(days + 1)
    }
}
