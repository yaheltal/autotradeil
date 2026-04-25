import SwiftUI

/// AutoTradeIL brand tokens.
///
/// Contrast policy (WCAG 2.2 AA — verified at use sites, NOT auto-checked):
///   - navy (#1a1a2e) on cream (#f8f8f6) = 15.9:1 (AAA) — body text default.
///   - gold (#e8b84b) on navy (#1a1a2e) = 8.5:1 (AAA) — gold buttons OK.
///   - gold (#e8b84b) on cream (#f8f8f6) = 1.9:1 (FAIL) — DO NOT USE.
///     Gold is reserved for icons/accents and as a button BACKGROUND with
///     navy text on top.
///   - ink (#1e1e32) on white = 14.7:1 (AAA).
extension Color {
    /// #1a1a2e — primary brand navy. Body text on cream/white.
    static let brandNavy = Color(red: 26 / 255, green: 26 / 255, blue: 46 / 255)

    /// #e8b84b — accent gold. Icon/accent only. Never body text on cream.
    static let brandGold = Color(red: 232 / 255, green: 184 / 255, blue: 75 / 255)

    /// #f8f8f6 — page background.
    static let brandCream = Color(red: 248 / 255, green: 248 / 255, blue: 246 / 255)

    /// #1e1e32 — softer secondary ink for body copy on white cards.
    static let brandInk = Color(red: 30 / 255, green: 30 / 255, blue: 50 / 255)

    /// Success / OK semantic.
    static let brandOk = Color(red: 34 / 255, green: 197 / 255, blue: 94 / 255)

    /// Danger semantic.
    static let brandDanger = Color(red: 220 / 255, green: 38 / 255, blue: 38 / 255)
}

/// Branded TextField wrapper with explicit Hebrew RTL alignment + visible
/// label requirement enforced by callers (placeholders alone fail WCAG 3.3.2,
/// per a11y-lead required change #6).
struct BrandTextFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .padding(12)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Color.brandNavy.opacity(0.2), lineWidth: 1)
            )
            .multilineTextAlignment(.trailing)
    }
}

/// Primary CTA — navy bg + cream text, AAA contrast.
struct BrandPrimaryButtonStyle: ButtonStyle {
    var isLoading: Bool = false
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(Color.brandNavy.opacity(configuration.isPressed ? 0.85 : 1))
            .foregroundColor(Color.brandCream)
            .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

/// Gold accent CTA (used sparingly — gold bg + navy text).
struct BrandGoldButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(Color.brandGold.opacity(configuration.isPressed ? 0.85 : 1))
            .foregroundColor(Color.brandNavy)
            .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}
