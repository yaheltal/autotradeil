import SwiftUI

extension View {
    /// Convenience: force RTL on a subtree. Already applied at root, but
    /// useful when a sheet/popover may otherwise inherit LTR.
    func rtl() -> some View {
        self.environment(\.layoutDirection, .rightToLeft)
    }
}
