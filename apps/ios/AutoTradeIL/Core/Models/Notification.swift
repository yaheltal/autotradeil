import Foundation

struct AppNotification: Identifiable, Codable {
    let id: String
    let type: String
    let title: String
    let body: String
    let readAt: Date?
    let createdAt: Date
}

struct NotificationListResponse: Codable {
    let items: [AppNotification]
    let unreadCount: Int
}
