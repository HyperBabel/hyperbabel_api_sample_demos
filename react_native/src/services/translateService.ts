/**
 * HyperBabel API — Translation Service
 *
 * AI-powered real-time translation supporting 100+ languages.
 * Use for standalone text translation, batch multi-language output,
 * language detection, or to query supported language codes.
 *
 * ⚠️ EVERY CALL IN THIS FILE NEEDS YOUR BACKEND — IT CANNOT RUN FROM THE APP.
 *
 *   `/translate/*` accepts only your ORGANIZATION API KEY
 *   (`Authorization: Bearer hb_live_…`). This demo holds a customer JWT
 *   (`api.ts` refuses to carry an org key on a device), so a call from here
 *   answers 401 — and every 401 also burns a token refresh. No screen in this
 *   demo calls these functions.
 *
 *   Ship it as:  app  →  your backend (holds hb_live_…)  →  HyperBabel /translate/*
 *
 *   The paths, payloads and response shapes below are accurate — implement
 *   them on your server. To translate CHAT messages from the app, use
 *   `batchTranslateMessages()` in unitedChatService (the `useTranslation`
 *   hook), which accepts the end-user token.
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
 * @returns { detected_language: string, confidence: number }
 */
export const detectLanguage = (text: string) =>
  api.post<{ detected_language: string; confidence: number }>(`${BASE}/detect`, { text });

/**
 * Get the full list of supported languages.
 */
export const getSupportedLanguages = () =>
  api.get<{ languages: { code: string; name: string }[]; count: number }>(`${BASE}/languages`);
