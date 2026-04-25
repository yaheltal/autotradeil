import Foundation

enum APIError: Error, LocalizedError {
    case invalidURL
    case networkError(Error)
    case httpError(Int, String?)
    case decodingError(Error)
    case unauthorized

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "כתובת לא תקינה"
        case .unauthorized: return "נדרשת התחברות מחדש"
        case .httpError(_, let detail?): return detail
        case .httpError(let code, _): return "שגיאת שרת (\(code))"
        case .networkError: return "בעיית חיבור לאינטרנט"
        case .decodingError: return "שגיאה בעיבוד התשובה"
        }
    }
}

/// Lightweight URLSession-backed JSON client.
///
/// Uses snake_case → camelCase conversion + ISO-8601 dates so Swift models
/// can stay idiomatic while the wire format matches the backend.
final class APIClient {
    static let shared = APIClient()

    /// Override at runtime (set via env or build config) for production.
    /// 10.0.2.2 is iOS Simulator's loopback to host's localhost on some setups;
    /// the Simulator on macOS uses `localhost` directly.
    private(set) var baseURL: String = "http://localhost:8000"

    private init() {}

    func setBaseURL(_ url: String) { self.baseURL = url }

    func request<T: Decodable>(
        endpoint: String,
        method: String = "GET",
        body: Encodable? = nil,
        token: String? = nil
    ) async throws -> T {
        guard let url = URL(string: baseURL + endpoint) else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body = body {
            let encoder = JSONEncoder()
            encoder.keyEncodingStrategy = .convertToSnakeCase
            request.httpBody = try encoder.encode(AnyEncodable(body))
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.networkError(URLError(.badServerResponse))
        }

        if http.statusCode == 401 { throw APIError.unauthorized }
        guard (200...299).contains(http.statusCode) else {
            // Try to surface backend `detail` field (Hebrew error messages).
            let detail = (try? JSONDecoder().decode([String: String].self, from: data))?["detail"]
            throw APIError.httpError(http.statusCode, detail)
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .iso8601
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }
}

/// Type-erased Encodable wrapper so callers can pass any Encodable as `body`.
private struct AnyEncodable: Encodable {
    private let _encode: (Encoder) throws -> Void
    init(_ wrapped: Encodable) {
        self._encode = wrapped.encode
    }
    func encode(to encoder: Encoder) throws { try _encode(encoder) }
}
