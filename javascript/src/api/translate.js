/**
 * HyperBabel API — AI Translation service.
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
