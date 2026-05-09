/**
 * Locale-aware timestamp formatting helpers — mirrors the React demo.
 *   - within last 60 seconds  → "just now"
 *   - within last 60 minutes  → "X min ago"
 *   - same day                → time only
 *   - yesterday               → "Yesterday HH:mm"
 *   - this year               → short date + time
 *   - older                   → year + short date
 */

const LOCALE = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';

export function formatMessageTime(input, now = new Date()) {
  if (!input) return '';
  const when = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(when.getTime())) return '';
  const diffSec = Math.floor((now - when) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const sameDay = when.toDateString() === now.toDateString();
  const time = when.toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return time;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (when.toDateString() === yesterday.toDateString()) {
    return `Yesterday ${time}`;
  }
  if (when.getFullYear() === now.getFullYear()) {
    return `${when.toLocaleDateString(LOCALE, { month: 'short', day: 'numeric' })} ${time}`;
  }
  return when.toLocaleDateString(LOCALE, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateSeparator(input, now = new Date()) {
  if (!input) return '';
  const when = input instanceof Date ? input : new Date(input);
  if (when.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (when.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return when.toLocaleDateString(LOCALE, { year: 'numeric', month: 'long', day: 'numeric' });
}
