/**
 * Design tokens — the single default theme for JDig (v1): a pitch-black dark
 * surface. We ship ONE consistent theme (theming/multiple palettes is an
 * explicit non-goal for v1). These tokens encode the spacing scale, color
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
 * Color system — pitch-black dark surface with a confident indigo accent.
 * The console shares the same near-black panel as the chrome (it is no longer
 * a contrasting dark-on-light element; the whole app is dark).
 */
export const color = {
  // surfaces
  bg: '#000000',
  surface: '#0b0b0d',
  surfaceMuted: '#16161a',
  hairline: '#232328',
  hairlineStrong: '#34343c',

  // text
  textPrimary: '#fafafa',
  textSecondary: '#c7c7cc',
  textMuted: '#8e8e93',
  textFaint: '#5a5a60',

  // brand / semantic
  accent: '#6366f1',
  accentHover: '#4f46e5',
  accentSoft: 'rgba(99,102,241,0.16)',
  danger: '#f87171',
  dangerSoft: 'rgba(248,113,113,0.16)',
  success: '#34d399',
  warning: '#fbbf24',

  // console (same near-black as the chrome)
  consoleBg: '#000000',
  consoleText: '#e8e8ec',
  consoleDim: '#8e8e93',
  consoleErr: '#f87171',
  consolePrompt: '#34d399',
  consoleInputBorder: '#232328',
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
  'waiting-input': { label: 'Input', fg: color.success, bg: 'rgba(52,211,153,0.16)' },
  done: { label: 'Done', fg: color.textSecondary, bg: color.surfaceMuted },
  error: { label: 'Error', fg: color.danger, bg: color.dangerSoft },
};
