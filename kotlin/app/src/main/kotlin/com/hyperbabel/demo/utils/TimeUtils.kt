/*
 * Locale-aware timestamp formatting helpers, mirroring the React / Flutter
 * demos. Intentionally tiny — every chat surface uses the same pair.
 */
package com.hyperbabel.demo.utils

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.time.temporal.ChronoUnit
import java.util.Locale

private val timeFmt: DateTimeFormatter =
    DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(Locale.getDefault())
private val shortDateFmt: DateTimeFormatter =
    DateTimeFormatter.ofPattern("MMM d", Locale.getDefault())
private val fullDateFmt: DateTimeFormatter =
    DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.getDefault())

fun formatMessageTime(iso: String?, now: LocalDateTime = LocalDateTime.now()): String {
    if (iso.isNullOrBlank()) return ""
    val instant = runCatching { Instant.parse(iso) }.getOrNull() ?: return ""
    val when_ = LocalDateTime.ofInstant(instant, ZoneId.systemDefault())
    val secs = ChronoUnit.SECONDS.between(when_, now)
    if (secs < 60) return "just now"
    val mins = ChronoUnit.MINUTES.between(when_, now)
    if (mins < 60) return "$mins min ago"
    val today = now.toLocalDate()
    val whenDate = when_.toLocalDate()
    if (whenDate == today) return when_.format(timeFmt)
    if (whenDate == today.minusDays(1)) return "Yesterday ${when_.format(timeFmt)}"
    if (whenDate.year == today.year) return "${when_.format(shortDateFmt)} ${when_.format(timeFmt)}"
    return when_.format(fullDateFmt)
}

fun formatDateSeparator(iso: String?, today: LocalDate = LocalDate.now()): String {
    if (iso.isNullOrBlank()) return ""
    val instant = runCatching { Instant.parse(iso) }.getOrNull() ?: return ""
    val whenDate = LocalDateTime.ofInstant(instant, ZoneId.systemDefault()).toLocalDate()
    if (whenDate == today) return "Today"
    if (whenDate == today.minusDays(1)) return "Yesterday"
    return whenDate.format(fullDateFmt)
}
