import SwiftUI

@main
struct ClawControlApp: App {
    @StateObject private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .task {
                    await model.start()
                }
        }
    }
}
