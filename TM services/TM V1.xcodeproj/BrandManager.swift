import Foundation
import Combine
import SwiftUI

// MARK: - Brand Model

// Define the structure for a brand.
struct Brand: Identifiable, Codable {
    let id = UUID()
    let name: String
    let employeeColor: Color // Color for employees from this brand
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
        // Updated sample brands with color information
        brands = [
            Brand(name: "Milti-Brand", employeeColor: .primary),
            Brand(name: "Mack", employeeColor: .black),
            Brand(name: "VTNA", employeeColor: .primary)
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
    
    // MARK: - Get Color for Brand
    func getEmployeeColor(for brandName: String?) -> Color {
        guard let brandName = brandName else {
            return .primary
        }
        
        if let brand = brands.first(where: { $0.name == brandName }) {
            return brand.employeeColor
        }
        
        return .primary
    }
}
