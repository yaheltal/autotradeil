import Foundation

struct DealerProfile: Codable, Identifiable {
    let id: String
    let businessName: String
    let email: String
    let city: String?
    let phone: String?
    let verified: Bool
    let tier: String
    let trustScore: Int
    let dealsCompleted: Int
}
