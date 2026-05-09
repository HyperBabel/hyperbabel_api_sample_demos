/*
 * Locale-aware timestamp helpers — mirrors the React / Flutter / Kotlin
 * demos. Returns "just now" / "X min ago" / time / "Yesterday HH:mm" /
 * short date depending on age.
 */
import Foundation

enum TimeUtils {
    static let isoParser: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    static let timeOnly: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .none
        f.timeStyle = .short
        return f
    }()

    static let shortDate: DateFormatter = {
        let f = DateFormatter()
        f.setLocalizedDateFormatFromTemplate("MMMd")
        return f
    }()

    static let fullDate: DateFormatter = {
        let f = DateFormatter()
        f.setLocalizedDateFormatFromTemplate("yMMMd")
        return f
    }()

    static func parse(_ iso: String?) -> Date? {
        guard let s = iso, !s.isEmpty else { return nil }
        return isoParser.date(from: s) ?? ISO8601DateFormatter().date(from: s)
    }

    static func formatMessageTime(_ iso: String?, now: Date = Date()) -> String {
        guard let when = parse(iso) else { return "" }
        let secs = now.timeIntervalSince(when)
        if secs < 60 { return "just now" }
        let mins = Int(secs / 60)
        if mins < 60 { return "\(mins) min ago" }
        let cal = Calendar.current
        if cal.isDate(when, inSameDayAs: now) {
            return timeOnly.string(from: when)
        }
        if let yesterday = cal.date(byAdding: .day, value: -1, to: now),
           cal.isDate(when, inSameDayAs: yesterday) {
            return "Yesterday \(timeOnly.string(from: when))"
        }
        if cal.component(.year, from: when) == cal.component(.year, from: now) {
            return "\(shortDate.string(from: when)) \(timeOnly.string(from: when))"
        }
        return fullDate.string(from: when)
    }

    static func formatDateSeparator(_ iso: String?, now: Date = Date()) -> String {
        guard let when = parse(iso) else { return "" }
        let cal = Calendar.current
        if cal.isDate(when, inSameDayAs: now) { return "Today" }
        if let yesterday = cal.date(byAdding: .day, value: -1, to: now),
           cal.isDate(when, inSameDayAs: yesterday) { return "Yesterday" }
        return fullDate.string(from: when)
    }
}
