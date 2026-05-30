import SwiftUI

struct LaborHoursView: View {
    @ObservedObject var brandManager: BrandManager
    @State private var laborEntries: [SampleLaborEntry] = []

    init(brandManager: BrandManager) {
        self.brandManager = brandManager
        self._laborEntries = State(initialValue: generateSampleData())
    }

    var body: some View {
        List {
            ForEach(filteredEntries) { entry in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(entry.employeeName)
                            .font(.headline)
                        Spacer()
                        Text("\(entry.hours, specifier: "%.1f") hrs")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    Text("\(entry.date, style: .date)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text(entry.notes)
                        .font(.caption)
                }
                .padding(.vertical, 2)
            }
        }
        .padding(.all, 5)
        .listStyle(PlainListStyle())
    }

    private var filteredEntries: [SampleLaborEntry] {
        guard let selectedBrand = brandManager.selectedBrand else {
            return laborEntries
        }
        return laborEntries.filter { $0.brandName == selectedBrand.name }
    }
}

// MARK: - Sample Data Generation

struct SampleLaborEntry: Identifiable, Codable {
    let id = UUID()
    let brandName: String
    let employeeName: String
    let date: Date
    let hours: Double
    let notes: String
}

func generateSampleData() -> [SampleLaborEntry] {
    let sampleBrands = ["Milti-Brand", "Mack", "VTNA"]
    var entries: [SampleLaborEntry] = []
    let baseDate = Date().addingTimeInterval(-7 * 24 * 60 * 60)

    for i in 0..<20 {
        let date = Calendar.current.date(byAdding: .day, value: i % 7, to: baseDate)!
        let brandName = sampleBrands.randomElement() ?? "Milti-Brand"
        let entry = SampleLaborEntry(
            employeeName: "Employee \(Int.random(in: 1...50))",
            date: date,
            hours: Double.random(in: 1...10),
            notes: "Note \(i)."
        )
        entries.append(entry)
    }
    return entries
}
