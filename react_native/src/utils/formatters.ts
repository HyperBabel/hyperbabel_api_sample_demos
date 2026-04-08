/**
 * HyperBabel Demo — Formatters
 * Shared utility functions for dates, file sizes, text truncation.
 */

import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import calendar from 'dayjs/plugin/calendar';

dayjs.extend(relativeTime);
dayjs.extend(calendar);

/**
 * Format a timestamp for chat message list items.
 * < 1 min: 'just now'
 * < 60 min: '5m ago'
 * Today: '14:30'
 * This week: 'Mon'
 * Older: '31 Mar'
 */
export const formatMessageTime = (isoString: string): string => {
  const d = dayjs(isoString);
  const now = dayjs();
  const diffMinutes = now.diff(d, 'minute');

  if (diffMinutes < 1)   return 'just now';
  if (diffMinutes < 60)  return `${diffMinutes}m`;
  if (d.isSame(now, 'day')) return d.format('HH:mm');
  if (d.isSame(now, 'week')) return d.format('ddd');
  return d.format('D MMM');
};

/**
 * Format a timestamp as a readable calendar date for section headers.
 * 'Today', 'Yesterday', or 'Mon, 31 Mar 2026'
 */
export const formatDateHeader = (isoString: string): string => {
  return dayjs(isoString).calendar(null, {
    sameDay:   '[Today]',
    lastDay:   '[Yesterday]',
    lastWeek:  'ddd, D MMM YYYY',
    sameElse:  'D MMM YYYY',
  });
};

/**
 * Format file size in human-readable form.
 * e.g. 1536 → '1.5 KB', 2097152 → '2.0 MB'
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024)           return `${bytes} B`;
  if (bytes < 1024 * 1024)    return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3)      return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

/**
 * Truncate a string to max characters, appending '…' if needed.
 */
export const truncate = (str: string, max: number): string =>
  str.length > max ? `${str.slice(0, max - 1)}…` : str;

/**
 * Get initials from a display name (up to 2 characters).
 * e.g. 'Alice Kim' → 'AK', 'Bob' → 'B'
 */
export const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

/**
 * Get a deterministic hue (0–360) for a user ID or name.
 * Used for avatar gradient colors to ensure consistency.
 */
export const getHueFromId = (id: string): number => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
};
