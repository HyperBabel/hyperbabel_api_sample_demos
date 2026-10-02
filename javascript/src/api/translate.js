/**
 * HyperBabel API — AI Translation service.
 *
 * ⚠️ EVERY CALL HERE NEEDS YOUR BACKEND — IT CANNOT RUN FROM THE BROWSER.
 *
 *   `/translate/*` authenticates with your ORGANIZATION API KEY
 *   (`Authorization: Bearer hb_live_…`). A customer JWT is rejected up front:
 *
 *       POST /api/v1/translate/detect
 *       -> 401 { "error": { "code": "invalid_api_key_format" } }
 *
 *   This demo only ever holds a customer JWT (the API client refuses to put an
 *   org key in a browser bundle), so no page imports this module.
 *
 *   Ship it as:  browser -> your backend (holds hb_live_…) -> HyperBabel /translate/*
 *   The paths and payloads below are accurate — implement them on your server.
 *   `/detect` answers `{ detected_language, confidence }`.
 *
 *   Signed-in users translate CHAT MESSAGES without your backend:
 *   `batchTranslateMessages` in `api/unitedChat.js`
 *   (POST /unitedchat/rooms/:roomId/messages/batch-translate).
 */

import { api } from './client.js';

export const translateText = (text, targetLang, sourceLang) =>
  api.post('/translate/text', {
    text,
    target_language: targetLang,
    source_language: sourceLang,
  });

export const detectLanguage = (text) =>
  api.post('/translate/detect', { text });

export const getSupportedLanguages = () =>
  api.get('/translate/languages');
