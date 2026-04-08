/**
 * HyperBabel Demo — Color System
 *
 * Dark-mode-first palette consistent with the HyperBabel brand.
 * Mirrors the CSS custom properties used in the React web demo.
 */

export const colors = {
  // ── Background layers ──────────────────────────────────────────────────
  background:    '#0a0a0f',
  surface:       '#12121a',
  card:          '#1a1a2e',
  cardElevated:  '#1f1f35',
  border:        '#2a2a3e',
  borderSubtle:  '#1e1e32',

  // ── Brand ──────────────────────────────────────────────────────────────
  primary:       '#6366f1',   // indigo-500
  primaryDark:   '#4f46e5',   // indigo-600
  primaryLight:  '#818cf8',   // indigo-400
  accent:        '#8b5cf6',   // violet-500
  accentDark:    '#7c3aed',   // violet-600

  // ── Gradients (as [start, end] pairs) ─────────────────────────────────
  gradientBrand: ['#6366f1', '#8b5cf6'] as [string, string],
  gradientCard:  ['#1a1a2e', '#12121a'] as [string, string],

  // ── Semantic ───────────────────────────────────────────────────────────
  success:       '#10b981',   // emerald-500
  successDark:   '#059669',
  error:         '#ef4444',   // red-500
  errorDark:     '#dc2626',
  warning:       '#f59e0b',   // amber-500
  warningDark:   '#d97706',
  info:          '#3b82f6',   // blue-500

  // ── Text ───────────────────────────────────────────────────────────────
  text:          '#f8fafc',   // near-white
  textSecondary: '#94a3b8',   // slate-400
  textMuted:     '#64748b',   // slate-500
  textDisabled:  '#334155',   // slate-700

  // ── Chat-specific ──────────────────────────────────────────────────────
  bubbleSent:     '#4f46e5',  // indigo-600 — sent messages
  bubbleReceived: '#1e1e32',  // dark surface — received messages
  bubbleSystem:   'transparent',

  // ── Presence ───────────────────────────────────────────────────────────
  presenceOnline:  '#10b981',
  presenceAway:    '#f59e0b',
  presenceDnd:     '#ef4444',
  presenceOffline: '#64748b',

  // ── Call ───────────────────────────────────────────────────────────────
  callAccept: '#10b981',
  callReject: '#ef4444',

  // ── Transparent overlays ───────────────────────────────────────────────
  overlay:       'rgba(0, 0, 0, 0.7)',
  overlayLight:  'rgba(0, 0, 0, 0.4)',
  glassLight:    'rgba(255, 255, 255, 0.05)',
  glassBorder:   'rgba(255, 255, 255, 0.08)',

  // ── Misc ───────────────────────────────────────────────────────────────
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',
} as const;

export type Color = keyof typeof colors;
