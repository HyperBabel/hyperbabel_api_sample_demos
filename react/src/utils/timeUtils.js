/**
 * HyperBabel React Demo — Locale-Aware Time Utility
 *
 * Formats message timestamps in a human-friendly way that automatically
 * adapts to the user's device locale (navigator.language).
 *
 * Supported locales (auto-detected from browser):
 *   en  — English     : "just now", "2 min ago", "Yesterday 3:30 PM"
 *   ko  — Korean      : "방금 전", "2분 전", "어제 오후 3:30"
 *   ja  — Japanese    : "たった今", "2分前", "昨日 15:30"
 *   zh  — Chinese     : "刚刚", "2分钟前", "昨天 15:30"
 *   es  — Spanish     : "ahora mismo", "hace 2 min", "Ayer 15:30"
 *   fr  — French      : "à l'instant", "il y a 2 min", "Hier 15:30"
 *   de  — German      : "gerade eben", "vor 2 Min.", "Gestern 15:30"
 *   pt  — Portuguese  : "agora mesmo", "há 2 min", "Ontem 15:30"
 *   ar  — Arabic      : "الآن", "منذ 2 دقيقة", "أمس 15:30"
 *   hi  — Hindi       : "अभी", "2 मिनट पहले", "कल दोपहर 3:30"
 *   vi  — Vietnamese  : "vừa xong", "2 phút trước", "Hôm qua 15:30"
 *   th  — Thai        : "เมื่อกี้", "2 นาทีที่แล้ว", "เมื่อวาน 15:30"
 *
 * Falls back to English for any unrecognised locale.
 *
 * Usage:
 *   import { formatMessageTime, formatFullDate } from '../utils/timeUtils';
 *   formatMessageTime('2026-03-16T08:23:00Z')  → "2 hours ago"  (en browser)
 *   formatMessageTime('2026-03-16T08:23:00Z')  → "2시간 전"     (ko browser)
 */

import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import isToday from 'dayjs/plugin/isToday';
import isYesterday from 'dayjs/plugin/isYesterday';

// ── dayjs plugins ──────────────────────────────────────────────────────────
dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);
dayjs.extend(isToday);
dayjs.extend(isYesterday);

// ── Supported locale map ───────────────────────────────────────────────────

/**
 * Supported dayjs locale modules, keyed by IETF language tag (base only).
 * Lazily loaded the first time a locale is requested.
 */
const LOCALE_LOADERS = {
  ko: () => import('dayjs/locale/ko'),
  ja: () => import('dayjs/locale/ja'),
  'zh-cn': () => import('dayjs/locale/zh-cn'),
  'zh-tw': () => import('dayjs/locale/zh-tw'),
  zh: () => import('dayjs/locale/zh-cn'),
  es: () => import('dayjs/locale/es'),
  fr: () => import('dayjs/locale/fr'),
  de: () => import('dayjs/locale/de'),
  pt: () => import('dayjs/locale/pt'),
  ar: () => import('dayjs/locale/ar'),
  hi: () => import('dayjs/locale/hi'),
  vi: () => import('dayjs/locale/vi'),
  th: () => import('dayjs/locale/th'),
  ru: () => import('dayjs/locale/ru'),
  id: () => import('dayjs/locale/id'),
  tr: () => import('dayjs/locale/tr'),
  // English is dayjs default — no import needed
};

/** Track loaded state to avoid duplicate imports */
const loadedLocales = new Set(['en']);

/**
 * Detect the user's locale from the browser and load the corresponding
 * dayjs locale if not already loaded.
 *
 * Resolution order:
 *  1. Full tag match    : "zh-TW" → 'zh-tw'
 *  2. Base lang match   : "zh-TW" → 'zh'
 *  3. Default           : 'en'
 */
export const initLocale = async () => {
  // navigator.languages is ordered by preference; navigator.language is the first
  const browserLang = (navigator.languages?.[0] || navigator.language || 'en').toLowerCase();

  // Try full tag first (e.g. "zh-tw"), then base language ("zh")
  const candidates = [browserLang, browserLang.split('-')[0]];

  for (const candidate of candidates) {
    if (LOCALE_LOADERS[candidate]) {
      if (!loadedLocales.has(candidate)) {
        await LOCALE_LOADERS[candidate]();
        loadedLocales.add(candidate);
      }
      dayjs.locale(candidate);
      return candidate;
    }
  }

  // Fallback to English
  dayjs.locale('en');
  return 'en';
};

// Auto-init on module load (non-blocking)
initLocale().catch(() => {});

// ── Formatting functions ───────────────────────────────────────────────────

/**
 * Format a timestamp for display in a chat message.
 *
 * Rules (locale-aware throughout):
 *  - Within the last 60 seconds  → "just now" / "방금 전" / "たった今" ...
 *  - Within the last 60 minutes  → "5 minutes ago" / "5분 전" ...
 *  - Same day                    → "3:45 PM" / "오후 3:45" / "15:45" ...
 *  - Yesterday                   → "Yesterday 3:45 PM" / "어제 오후 3:45" ...
 *  - Older                       → "Mar 15, 3:45 PM" / "3월 15일 오후 3:45" ...
 *
 * @param {string|number|Date} timestamp — ISO string, Unix ms, or Date
 * @returns {string} Human-friendly, locale-aware time string
 */
export const formatMessageTime = (timestamp) => {
  if (!timestamp) return '';

  const d = dayjs(timestamp);
  if (!d.isValid()) return '';

  const now = dayjs();
  const diffSeconds = now.diff(d, 'second');
  const diffMinutes = now.diff(d, 'minute');

  // Within last 60 seconds → relative "just now"
  if (diffSeconds < 60) {
    return d.fromNow(); // locale-aware: "방금 전", "たった今", "just now"
  }

  // Within last 60 minutes → relative "X minutes ago"
  if (diffMinutes < 60) {
    return d.fromNow(); // "5분 전", "5 minutes ago", "il y a 5 min"
  }

  // Today → time only (locale formats 12h or 24h per region)
  if (d.isToday()) {
    return d.format('LT'); // "3:45 PM" (en), "15:45" (de/fr/ko/ja)
  }

  // Yesterday → label + time
  if (d.isYesterday()) {
    return `${getYesterdayLabel()} ${d.format('LT')}`;
  }

  // Older → short date + time
  return d.format('ll LT'); // "Mar 15, 3:45 PM" (en), "3月15日 15:45" (ja)
};

/**
 * Return the locale-correct word for "Yesterday".
 * Uses Intl.RelativeTimeFormat for maximum browser support.
 */
const getYesterdayLabel = () => {
  try {
    const lang = dayjs.locale();
    const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
    // Intl gives us "yesterday" / "어제" / "昨日" etc.
    const parts = rtf.formatToParts(-1, 'day');
    return parts.map((p) => p.value).join('').trim();
  } catch {
    return 'Yesterday';
  }
};

/**
 * Format a full date and time — used in message detail views or tooltips.
 *
 * @param {string|number|Date} timestamp
 * @returns {string} e.g. "Sunday, March 16, 2026 3:45 PM" / "2026년 3월 16일 일요일 오후 3:45"
 */
export const formatFullDate = (timestamp) => {
  if (!timestamp) return '';
  const d = dayjs(timestamp);
  if (!d.isValid()) return '';
  return d.format('LLLL'); // Long localised date+time
};

/**
 * Format a date only — used for date separators in chat history.
 *
 * @param {string|number|Date} timestamp
 * @returns {string} e.g. "March 16, 2026" / "2026년 3월 16일" / "16 mars 2026"
 */
export const formatDateSeparator = (timestamp) => {
  if (!timestamp) return '';
  const d = dayjs(timestamp);
  if (!d.isValid()) return '';

  if (d.isToday()) return getTodayLabel();
  if (d.isYesterday()) return getYesterdayLabel();

  return d.format('LL'); // Medium localised date
};

/**
 * Return the locale-correct word for "Today".
 */
const getTodayLabel = () => {
  try {
    const lang = dayjs.locale();
    const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
    const parts = rtf.formatToParts(0, 'day');
    return parts.map((p) => p.value).join('').trim();
  } catch {
    return 'Today';
  }
};

export default { formatMessageTime, formatFullDate, formatDateSeparator, initLocale };
