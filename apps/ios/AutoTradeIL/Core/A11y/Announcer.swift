import UIKit

/// VoiceOver announcement helpers (a11y-lead required change #4).
///
/// SwiftUI lacks a first-party API for transient announcements, so we drop
/// to UIKit's `UIAccessibility.post(notification:argument:)`. Use sparingly —
/// for inline form errors prefer wiring `.accessibilityValue` on the field.
enum Announcer {
    /// Polite announcement — interrupts other speech but is queued.
    static func announce(_ message: String) {
        guard !message.isEmpty else { return }
        UIAccessibility.post(notification: .announcement, argument: message)
    }

    /// Signal a screen-level change (e.g. empty state replaces loading).
    /// VoiceOver moves focus to the supplied label or the first eligible
    /// element on the new screen.
    static func screenChanged(focusOn message: String? = nil) {
        UIAccessibility.post(notification: .screenChanged, argument: message)
    }
}
