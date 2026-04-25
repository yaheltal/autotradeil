import Foundation

struct Offer: Identifiable, Codable {
    let id: String
    let inventoryId: String
    let sellerDealerId: String
    let buyerDealerId: String
    let offeredPrice: Int
    let message: String?
    let status: String
    let counterPrice: Int?
    let counterMessage: String?
    let createdAt: Date?
    let updatedAt: Date?
}

struct OfferListResponse: Codable {
    let items: [Offer]
    let total: Int
}
