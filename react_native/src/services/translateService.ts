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
 * @param text             - Text to translate
 * @param targetLanguage   - BCP-47 code (e.g. 'ko', 'en', 'ja')
 * @param sourceLanguage   - Auto-detect if omitted
 */
export const translateText = (
  text: string,
  targetLanguage: string,
  sourceLanguage = 'auto',
) =>
  api.post<{ translated_text: string; source_language: string }>(`${BASE}/text`, {
    text,
    target_language: targetLanguage,
    source_language: sourceLanguage,
  });

/**
 * Translate a text string to multiple target languages at once.
 *
 * @param text            - Text to translate
 * @param targetLanguages - e.g. ['ko', 'ja', 'es']
 * @param sourceLanguage  - Auto-detect if omitted
 */
export const translateBatch = (
  text: string,
  targetLanguages: string[],
  sourceLanguage?: string,
) =>
  api.post<{ translations: Record<string, string> }>(`${BASE}/batch`, {
    text,
    target_languages: targetLanguages,
    ...(sourceLanguage && { source_language: sourceLanguage }),
  });

/**
 * Detect the language of a given text string.
 *
 * @returns { language: string, confidence: number }
 */
export const detectLanguage = (text: string) =>
  api.post<{ language: string; confidence: number }>(`${BASE}/detect`, { text });

/**
 * Get the full list of supported language codes.
 */
export const getSupportedLanguages = () =>
  api.get<string[]>(`${BASE}/languages`);
