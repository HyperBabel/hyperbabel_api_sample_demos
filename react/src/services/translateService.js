/**
 * HyperBabel API — Translation Service
 *
 * AI-powered real-time translation supporting 100+ languages.
 * Use for standalone text translation, batch multi-language output,
 * language detection, or to query supported language codes.
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
 */
export const translateText = (text, targetLanguage, sourceLanguage = 'auto') =>
  api.post(`${BASE}/text`, { text, target_language: targetLanguage, source_language: sourceLanguage });

/**
 * Translate a text string to multiple target languages at once.
 *
 * @param {string}   text
 * @param {string[]} targetLanguages — e.g. ['ko', 'ja', 'es']
 * @param {string}   [sourceLanguage]
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
 * @returns {Promise<{ language: string, confidence: number }>}
 */
export const detectLanguage = (text) => api.post(`${BASE}/detect`, { text });

/**
 * Get the full list of supported language codes.
 * @returns {Promise<string[]>}
 */
export const getSupportedLanguages = () => api.get(`${BASE}/languages`);
