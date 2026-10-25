import SwiftUI
import WebKit

@main
struct DopamineApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
                .ignoresSafeArea()
                .statusBarHidden(true)
                .preferredColorScheme(.dark)
        }
    }
}

struct RootView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.showsVerticalScrollIndicator = false
        webView.scrollView.showsHorizontalScrollIndicator = false
        webView.allowsBackForwardNavigationGestures = false

        if let www = Bundle.main.url(forResource: "www", withExtension: nil) {
            let index = www.appendingPathComponent("index.html")
            webView.loadFileURL(index, allowingReadAccessTo: www)
        }

        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
