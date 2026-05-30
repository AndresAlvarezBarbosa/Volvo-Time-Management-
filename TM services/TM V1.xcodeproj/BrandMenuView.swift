import SwiftUI

// MARK: - Brand Selection Menu View

struct BrandMenuView: View {
    @ObservedObject var brandManager: BrandManager
    
    var body: some View {
        HStack(spacing: 12) {
            Text("Brand:")
                .font(.callout)
                .foregroundColor(.secondary)
            Picker("Select Brand", selection: $brandManager.selectedBrand) {
                Text("All Brands").tag(Brand?.none)
                ForEach(brandManager.brands) { brand in
                    Text(brand.name).tag(Brand?.some(brand))
                }
            }
            .pickerStyle(MenuPickerStyle())
            .frame(width: 150)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Color(.controlBackgroundColor))
        .cornerRadius(6)
    }
}

struct BrandMenuView_Previews: PreviewProvider {
    static var previews: some View {
        BrandMenuView(brandManager: BrandManager())
    }
}
