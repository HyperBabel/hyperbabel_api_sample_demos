/**
 * HyperBabel Demo — Typography System
 *
 * Uses platform-native font families — SF Pro on iOS, Roboto on Android.
 * Font weights and sizes match the React web demo's Inter-based scale.
 */

import { Platform, TextStyle } from 'react-native';

// System font stack — closest to Inter on each platform
export const fontFamily = {
  regular:    Platform.OS === 'ios' ? 'System'         : 'Roboto',
  medium:     Platform.OS === 'ios' ? 'System'         : 'sans-serif-medium',
  semibold:   Platform.OS === 'ios' ? 'System'         : 'sans-serif-medium',
  bold:       Platform.OS === 'ios' ? 'System'         : 'sans-serif',
  mono:       Platform.OS === 'ios' ? 'Menlo'          : 'monospace',
};

export const fontSize = {
  xs:   11,
  sm:   13,
  base: 15,
  md:   16,
  lg:   18,
  xl:   20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
} as const;

export const lineHeight = {
  tight:   1.25,
  normal:  1.5,
  relaxed: 1.75,
} as const;

export const fontWeight = {
  regular:  '400' as TextStyle['fontWeight'],
  medium:   '500' as TextStyle['fontWeight'],
  semibold: '600' as TextStyle['fontWeight'],
  bold:     '700' as TextStyle['fontWeight'],
  extrabold:'800' as TextStyle['fontWeight'],
} as const;

// Pre-built text style presets
export const textPresets = {
  h1:      { fontSize: fontSize['3xl'], fontWeight: fontWeight.bold,     lineHeight: fontSize['3xl'] * lineHeight.tight  } satisfies TextStyle,
  h2:      { fontSize: fontSize['2xl'], fontWeight: fontWeight.bold,     lineHeight: fontSize['2xl'] * lineHeight.tight  } satisfies TextStyle,
  h3:      { fontSize: fontSize.xl,    fontWeight: fontWeight.semibold,  lineHeight: fontSize.xl    * lineHeight.tight  } satisfies TextStyle,
  h4:      { fontSize: fontSize.lg,    fontWeight: fontWeight.semibold,  lineHeight: fontSize.lg    * lineHeight.normal } satisfies TextStyle,
  body:    { fontSize: fontSize.base,  fontWeight: fontWeight.regular,   lineHeight: fontSize.base  * lineHeight.normal } satisfies TextStyle,
  bodyMd:  { fontSize: fontSize.md,    fontWeight: fontWeight.regular,   lineHeight: fontSize.md    * lineHeight.normal } satisfies TextStyle,
  label:   { fontSize: fontSize.sm,    fontWeight: fontWeight.medium,    lineHeight: fontSize.sm    * lineHeight.normal } satisfies TextStyle,
  caption: { fontSize: fontSize.xs,    fontWeight: fontWeight.regular,   lineHeight: fontSize.xs    * lineHeight.normal } satisfies TextStyle,
  mono:    { fontSize: fontSize.sm,    fontFamily: fontFamily.mono       } satisfies TextStyle,
} as const;
