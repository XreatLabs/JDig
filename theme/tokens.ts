/**
 * Design tokens — the single default theme for JDig (v1).
 *
 * Theming/dark-mode is an explicit non-goal for v1 (see spec Non-Goals); we
 * ship ONE consistent theme. These tokens encode the spacing scale, color
 * ramp, type sizes, radii, and shadows used across every screen so the UI has
 * a single source of truth (per the layout skill: a consistent 4pt spacing
 * scale + hierarchy through space/weight, not ad-hoc values).
 *
 * Mobile-first: touch targets meet the 44pt minimum; spacing favors the
 * tighter end for a code-focused surface (editor + console are data-dense).
 */

/** 4pt base spacing scale (per layout skill: 4pt beats 8pt — 12 is needed). */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/** Type scale (React Native font sizes, pt). */
export const type = {
  code: 13,
  body: 14,
  meta: 12,
  micro: 11,
  title: 16,
  heading: 20,
} as const;

/** Line heights. */
export const leading = {
  code: 18,
  body: 20,
} as const;

/** Radii. */
export const radius = {
  none: 0,
  sm: 6,
  md: 8,
  lg: 12,
  pill: 999,
} as const;

/**
 * Color system. A near-neutral slate surface with a confident indigo accent
 * and a dark "console" panel that contrasts the light chrome (the console is
 * always dark, like a real terminal, even in v1's single theme).
 */
export const color = {
  // surfaces
  bg: '#f6f7f9',
  surface: '#ffffff',
  surfaceMuted: '#f1f3f5',
  hairline: '#e5e7eb',
  hairlineStrong: '#d1d5db',

  // text
  textPrimary: '#111827',
  textSecondary: '#4b5563',
  textMuted: '#6b7280',
  textFaint: '#9ca3af',

  // brand / semantic
  accent: '#4f46e5',
  accentHover: '#4338ca',
  accentSoft: '#eef2ff',
  danger: '#dc2626',
  dangerSoft: '#fef2f2',
  success: '#16a34a',
  warning: '#d97706',

  // console (dark panel)
  consoleBg: '#0b1021',
  consoleText: '#e6edf3',
  consoleDim: '#6e7681',
  consoleErr: '#ff7b72',
  consolePrompt: '#7ee787',
  consoleInputBorder: '#1f2433',
} as const;

/** Elevation scale (subtle; reinforces hierarchy, not decoration). */
export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    shadowOpacity: 0.06,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    shadowOpacity: 0.08,
    elevation: 2,
  },
} as const;

/** Minimum touch target (pt). */
export const touchTarget = 44;

/** Run-lifecycle badge metadata (color + label) per runStore state. */
export const runBadge: Record<
  'idle' | 'running' | 'waiting-input' | 'done' | 'error',
  { label: string; fg: string; bg: string }
> = {
  idle: { label: 'Idle', fg: color.textMuted, bg: color.surfaceMuted },
  running: { label: 'Running', fg: color.accent, bg: color.accentSoft },
  'waiting-input': { label: 'Input', fg: color.success, bg: '#ecfdf5' },
  done: { label: 'Done', fg: color.textSecondary, bg: color.surfaceMuted },
  error: { label: 'Error', fg: color.danger, bg: color.dangerSoft },
};
