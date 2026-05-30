import SwiftUI

// MARK: - Universal Page Wrapper

struct AppPageView<Content: View>: View {
    @ObservedObject var brandManager: BrandManager
    let content: () -> Content
    let pageTitle: String
    
    var body: some View {
        VStack(spacing: 0) {
            // Consistent brand menu at the top of each page
            BrandMenuView(brandManager: brandManager)
                .padding(.bottom, 12)
                .padding(.top, 8)
            
            // Page title
            Text(pageTitle)
                .font(.title2)
                .padding(.bottom, 12)
            
            // Page-specific content
            ScrollView {
                content()
            }
            .padding(.horizontal, 16)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
