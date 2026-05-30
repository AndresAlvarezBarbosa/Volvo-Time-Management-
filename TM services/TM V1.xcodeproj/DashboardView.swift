import SwiftUI

// MARK: - Base Dashboard View for reusing brand menu

struct DashboardView<Content: View>: View {
    @ObservedObject var brandManager: BrandManager
    let content: () -> Content
    
    var body: some View {
        VStack(spacing: 0) {
            // Brand Selection Menu - Shared across all pages
            BrandMenuView(brandManager: brandManager)
                .padding(.bottom, 8)
                .padding(.top, 4)
            
            // Main content view
            content()
        }
    }
}
