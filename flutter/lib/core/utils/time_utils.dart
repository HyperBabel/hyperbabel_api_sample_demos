import 'dart:ui';

import 'package:intl/intl.dart';

/// Locale-aware timestamp formatting helpers used by the chat surface.
///
/// Rules (mirrors the React demo):
///   - within last 60 seconds  → "just now"
///   - within last 60 minutes  → "X min ago"
///   - same day                → time only ("3:45 PM" or "15:45" per locale)
///   - yesterday               → "Yesterday 3:45 PM"
///   - this year, older        → "Mar 15, 3:45 PM"
///   - older                   → "Mar 15, 2024"
String formatMessageTime(DateTime when, {DateTime? now, Locale? locale}) {
  final n = now ?? DateTime.now();
  final localeTag = (locale ?? PlatformDispatcher.instance.locale).toLanguageTag();
  final delta = n.difference(when);

  if (delta.inSeconds < 60) return 'just now';
  if (delta.inMinutes < 60) return '${delta.inMinutes} min ago';

  final isSameDay = when.year == n.year && when.month == n.month && when.day == n.day;
  if (isSameDay) {
    return DateFormat.jm(localeTag).format(when);
  }

  final yesterday = DateTime(n.year, n.month, n.day - 1);
  final isYesterday = when.year == yesterday.year &&
      when.month == yesterday.month &&
      when.day == yesterday.day;
  if (isYesterday) {
    return 'Yesterday ${DateFormat.jm(localeTag).format(when)}';
  }

  if (when.year == n.year) {
    return DateFormat.MMMd(localeTag).format(when) +
        ' ' +
        DateFormat.jm(localeTag).format(when);
  }
  return DateFormat.yMMMd(localeTag).format(when);
}

/// Date separator for chat history (e.g. "March 15, 2026").
String formatDateSeparator(DateTime when, {Locale? locale}) {
  final localeTag = (locale ?? PlatformDispatcher.instance.locale).toLanguageTag();
  final now = DateTime.now();
  if (when.year == now.year && when.month == now.month && when.day == now.day) {
    return 'Today';
  }
  final yesterday = DateTime(now.year, now.month, now.day - 1);
  if (when.year == yesterday.year &&
      when.month == yesterday.month &&
      when.day == yesterday.day) {
    return 'Yesterday';
  }
  return DateFormat.yMMMd(localeTag).format(when);
}

/// Convenience: parse a server ISO 8601 timestamp into a DateTime, or null.
DateTime? parseServerTimestamp(String? iso) {
  if (iso == null || iso.isEmpty) return null;
  return DateTime.tryParse(iso)?.toLocal();
}
