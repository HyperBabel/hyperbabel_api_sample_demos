/**
 * HyperBabel API — Translation Service
 *
 * AI-powered real-time translation supporting 100+ languages.
 * Use for standalone text translation, batch multi-language output,
 * language detection, or to query supported language codes.
 *
 * ⚠️ BACKEND ONLY. Every `/translate/*` endpoint authenticates with your
 * organization API key (`hb_live_…`). The end-user token this browser demo
 * holds is rejected with 401 `invalid_api_key_format` (and each 401 also
 * costs a token refresh in services/api.js), so no page in this demo calls
 * these functions. They document the request shapes — run the same calls
 * from your own server and expose a thin endpoint to the browser.
 *
 * To translate CHAT messages from a client app you do not need any of this:
 * use `batchTranslateMessages()` in unitedChatService.js
 * (POST /unitedchat/rooms/:roomId/messages/batch-translate), which accepts
 * the end-user token.
 *
 * Base path: /translate
 */

import api from './api';

const BASE = '/translate';

/**
 * Translate a single text string to the target language.
 *
 * @param {string} text
 * @param {string} targetLanguage — BCP-47 code (e.g. 'ko', 'en', 'ja')
 * @param {string} [sourceLanguage='auto'] — Auto-detect if omitted
 * @returns {Promise<{ translated_text: string, source_language: string,
 *   target_language: string, char_count: number }>}
 */
export const translateText = (text, targetLanguage, sourceLanguage = 'auto') =>
  api.post(`${BASE}/text`, { text, target_language: targetLanguage, source_language: sourceLanguage });

/**
 * Translate a text string to multiple target languages at once (up to 10).
 *
 * @param {string}   text
 * @param {string[]} targetLanguages — e.g. ['ko', 'ja', 'es']
 * @param {string}   [sourceLanguage]
 * @returns {Promise<{ translations: Object<string, string>, char_count: number,
 *   successful_languages: string[] }>} `translations` maps language → text
 */
export const translateBatch = (text, targetLanguages, sourceLanguage) =>
  api.post(`${BASE}/batch`, {
    text,
    target_languages: targetLanguages,
    ...(sourceLanguage && { source_language: sourceLanguage }),
  });

/**
 * Detect the language of a given text string.
 *
 * @param {string} text
 * @returns {Promise<{ detected_language: string, confidence: number }>}
 */
export const detectLanguage = (text) => api.post(`${BASE}/detect`, { text });

/**
 * Get the full list of supported languages.
 * @returns {Promise<{ languages: Array<{ code: string, name: string }>, count: number }>}
 */
export const getSupportedLanguages = () => api.get(`${BASE}/languages`);
