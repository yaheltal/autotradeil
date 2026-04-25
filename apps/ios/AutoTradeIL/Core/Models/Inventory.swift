import Foundation

/// Mirrors the backend `InventoryItemResponse` (Phase 4.3 shape).
///
/// Naming aligned to backend wire format via `keyDecodingStrategy = .convertFromSnakeCase`:
///   - `primary_image_url` → `primaryImageUrl`
///   - `b2b_price` / `b2c_price` → `b2bPrice` / `b2cPrice`
///
/// The marketplace search response uses `primary_image_url`; the my-inventory
/// response doesn't include images at the top level (separate /images endpoint).
/// We keep `primaryImageUrl` optional so both shapes decode.
struct InventoryItem: Identifiable, Codable {
    let id: String
    let make: String
    let model: String
    let year: Int
    let mileage: Int
    let price: Int
    let color: String?
    let transmission: String?
    let fuelType: String?
    let engineVolume: Double?
    let notes: String?
    /// Owner-only fields — absent on marketplace search rows.
    let status: String?
    let visibility: String?
    let b2bPrice: Int?
    let b2cPrice: Int?
    let primaryImageUrl: String?
    let createdAt: Date?
    /// Marketplace search-only fields.
    let sellerDealerId: String?
    let sellerBusinessName: String?
    let sellerCity: String?
    let sellerTier: String?

    /// Display-friendly Hebrew label for VoiceOver/composite labels.
    var fullLabel: String { "\(make) \(model) \(year)" }

    /// Pick the right price for display: prefer b2b_price, fall back to price.
    var displayPrice: Int { b2bPrice ?? price }
}

struct InventoryListResponse: Codable {
    let items: [InventoryItem]
    let total: Int
    let page: Int
    let pages: Int
}

/// Marketplace search returns a slightly trimmed shape — most fields overlap
/// so we reuse `InventoryItem`. Backend includes `seller_business_name` etc.
/// but on the iOS card we only need the vehicle bits + `primary_image_url`.
typealias MarketplaceVehicle = InventoryItem
