import SwiftUI

/// Login screen — Hebrew RTL, Dynamic Type compliant.
///
/// A11y per pre-write review:
///   - Visible `Text` label above each field (placeholders alone fail 3.3.2).
///   - Errors flow into VoiceOver via `.accessibilityLabel`/`accessibilityValue`
///     and a transient `Announcer.announce(...)` from the view model.
///   - Biometric button is conditionally rendered, never disabled.
///   - All sizing via Dynamic Type text styles.
struct LoginView: View {
    @StateObject private var viewModel = LoginViewModel()
    @EnvironmentObject var authManager: AuthManager
    @FocusState private var emailFocused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 32) {
                    // Logo / brand mark
                    VStack(spacing: 8) {
                        Circle()
                            .fill(Color.brandGold)
                            .frame(width: 12, height: 12)
                            .accessibilityHidden(true)
                        Text("AutoTradeIL")
                            .font(.largeTitle.weight(.bold))
                            .foregroundColor(Color.brandNavy)
                            .accessibilityAddTraits(.isHeader)
                    }
                    .padding(.top, 60)

                    // Form
                    VStack(alignment: .trailing, spacing: 20) {
                        emailField
                        passwordField

                        if let error = viewModel.errorMessage {
                            Text(error)
                                .font(.footnote)
                                .foregroundColor(Color.brandDanger)
                                .frame(maxWidth: .infinity, alignment: .trailing)
                                .accessibilityAddTraits(.isStaticText)
                        }

                        Button {
                            Task { await viewModel.login() }
                        } label: {
                            Group {
                                if viewModel.isLoading {
                                    ProgressView().tint(Color.brandCream)
                                } else {
                                    Text("התחבר")
                                }
                            }
                        }
                        .buttonStyle(BrandPrimaryButtonStyle(isLoading: viewModel.isLoading))
                        .disabled(viewModel.isLoading)
                        .accessibilityLabel("התחבר")
                        .accessibilityHint("שולח את פרטי ההתחברות לשרת")

                        // Biometric — only rendered when available (req #8)
                        if viewModel.biometricType != .none {
                            biometricButton
                        }

                        NavigationLink("שכחתי סיסמה", destination: ForgotPasswordView())
                            .font(.footnote)
                            .foregroundColor(Color.brandNavy)
                            .underline()
                            .frame(maxWidth: .infinity, alignment: .trailing)
                    }
                    .padding(.horizontal, 24)
                }
                .padding(.bottom, 40)
            }
            .background(Color.brandCream.ignoresSafeArea())
            .scrollDismissesKeyboard(.interactively)
            .environment(\.layoutDirection, .rightToLeft)
            .onAppear { emailFocused = true }
        }
    }

    @ViewBuilder
    private var emailField: some View {
        VStack(alignment: .trailing, spacing: 6) {
            Text("אימייל")
                .font(.subheadline.weight(.medium))
                .foregroundColor(Color.brandNavy)
            TextField("", text: $viewModel.email, prompt: Text("name@example.com"))
                .textFieldStyle(BrandTextFieldStyle())
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .focused($emailFocused)
                .accessibilityLabel("אימייל")
        }
    }

    @ViewBuilder
    private var passwordField: some View {
        VStack(alignment: .trailing, spacing: 6) {
            Text("סיסמה")
                .font(.subheadline.weight(.medium))
                .foregroundColor(Color.brandNavy)
            SecureField("", text: $viewModel.password)
                .textFieldStyle(BrandTextFieldStyle())
                .textContentType(.password)
                .accessibilityLabel("סיסמה")
        }
    }

    @ViewBuilder
    private var biometricButton: some View {
        let isFaceID = viewModel.biometricType == .faceID
        let label = isFaceID ? "התחבר עם Face ID" : "התחבר עם Touch ID"
        Button {
            Task { await viewModel.loginWithBiometrics() }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: isFaceID ? "faceid" : "touchid")
                Text(label)
            }
            .frame(maxWidth: .infinity, minHeight: 44)
            .foregroundColor(Color.brandNavy)
        }
        .accessibilityLabel(label)
    }
}
