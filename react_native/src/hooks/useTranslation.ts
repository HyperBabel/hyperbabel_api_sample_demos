/**
 * HyperBabel Demo — useTranslation Hook
 *
 * Provides convenient auto-translation helpers for a chat room:
 *  - Batch-translates a list of messages on demand
 *  - Caches results in memory (keyed by messageId + targetLang)
 *  - Returns a map of messageId → translated text
 *
 * Usage:
 *   const { translatedMap, translateMessages } = useTranslation(roomId, 'ko');
 *   await translateMessages(messages.map(m => m.message_id));
 *   const text = translatedMap[msg.message_id] ?? msg.content;
 */

import { useCallback, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { batchTranslateMessages } from '@/services/unitedChatService';

export interface UseTranslationResult {
  /** Map of messageId → translated text in targetLang */
  translatedMap:    Record<string, string>;
  /** Trigger translation for a list of message IDs (skips already cached) */
  translateMessages: (messageIds: string[]) => Promise<void>;
  /** Whether a translation request is in-flight */
  isTranslating:    boolean;
}

export function useTranslation(roomId: string, targetLang?: string): UseTranslationResult {
  const { user } = useAuth();
  const lang = targetLang ?? user?.langCode ?? 'en';

  const [translatedMap, setTranslatedMap] = useState<Record<string, string>>({});
  const [isTranslating, setIsTranslating] = useState(false);
  const cachedIds = useRef<Set<string>>(new Set());

  const translateMessages = useCallback(
    async (messageIds: string[]) => {
      // Filter out already-translated IDs
      const pending = messageIds.filter((id) => !cachedIds.current.has(id));
      if (pending.length === 0) return;

      setIsTranslating(true);
      try {
        const result = await batchTranslateMessages(roomId, pending, lang);
        const translations = result.translations ?? {};

        // Mark as cached
        pending.forEach((id) => cachedIds.current.add(id));

        setTranslatedMap((prev) => ({ ...prev, ...translations }));
      } catch {
        // Translation failure is non-fatal — original content is shown
      } finally {
        setIsTranslating(false);
      }
    },
    [roomId, lang],
  );

  return { translatedMap, translateMessages, isTranslating };
}
