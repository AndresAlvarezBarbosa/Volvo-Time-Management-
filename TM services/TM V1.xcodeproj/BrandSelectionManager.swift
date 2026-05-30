import Foundation
import Combine

// MARK: - Brand Model

// Define the structure for a brand.
struct Brand: Identifiable, Codable {
    let id = UUID()
    let name: String
}

// MARK: - Brand Manager

// Singleton to manage brands and the selected brand
class BrandManager: ObservableObject {
    @Published var brands: [Brand] = []
    @Published var selectedBrand: Brand?
    
    // MARK: - Initialization
    
    init() {
        loadSampleBrands()
        // Ensure the first brand is selected if available
        if brands.isEmpty {
            selectedBrand = nil
        } else if selectedBrand == nil {
            selectedBrand = brands[0]
        }
    }
    
    // MARK: - Sample Data Loading
    // This is a placeholder. Replace with your actual data loading logic (e.g., from JSON, API).
    private func loadSampleBrands() {
        // Example sample brands
        brands = [
            Brand(name: "Brand A"),
            Brand(name: "Brand B"),
            Brand(name: "Brand C"),
            Brand(name: "Brand D")
        ]
    }
    
    // MARK: - Brand Selection
    func selectBrand(_ brand: Brand?) {
        self.selectedBrand = brand
    }
    
    // MARK: - Brand Filtering
    func filterData<T: Codable>(_ data: [T], byBrand brandName: String?) -> [T] {
        // This method should be adapted based on your actual data structures
        // For now, returning all data since we don't know the data structure
        return data
    }
}
