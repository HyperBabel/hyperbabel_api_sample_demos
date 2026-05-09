/*
 * HyperBabel API — AI Translation service.
 *
 * Wire shapes:
 *   POST /translate/text      → { translated_text, source_language, target_language, char_count }
 *   POST /translate/detect    → { detected_language, confidence }
 *   GET  /translate/languages → { languages: [{ code, name }], count }
 */
import Foundation

struct TranslateTextResponse: Codable {
    let translatedText: String
    let sourceLanguage: String?
    let targetLanguage: String?
    let charCount: Int?

    enum CodingKeys: String, CodingKey {
        case translatedText = "translated_text"
        case sourceLanguage = "source_language"
        case targetLanguage = "target_language"
        case charCount = "char_count"
    }
}

struct DetectLanguageResponse: Codable {
    let detectedLanguage: String
    let confidence: Double?

    enum CodingKeys: String, CodingKey {
        case detectedLanguage = "detected_language"
        case confidence
    }
}

struct LanguageOption: Codable, Hashable, Identifiable {
    let code: String
    let name: String
    var id: String { code }
}

struct LanguagesResponse: Codable {
    let languages: [LanguageOption]
    let count: Int?
}

enum TranslateService {
    static func translate(_ body: TranslateTextRequest) async throws -> TranslateTextResponse {
        try await ApiClient.shared.request("POST", "/translate/text", body: body)
    }

    static func detect(text: String) async throws -> DetectLanguageResponse {
        try await ApiClient.shared.request("POST", "/translate/detect", body: ["text": text])
    }

    static func languages() async throws -> LanguagesResponse {
        try await ApiClient.shared.request("GET", "/translate/languages")
    }
}
