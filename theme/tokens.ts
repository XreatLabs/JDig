/**
 * Design tokens — JDig's "midnight terminal" theme: pitch-black canvas with the
 * Catppuccin Mocha palette as the accent + syntax system. Mauve is the signature
 * accent (not generic indigo). One consistent theme (multi-theme is a v1 non-goal).
 *
 * These tokens are the single source of truth consumed by every screen +
 * component, so changing a value here restyles the whole app. The Catppuccin
 * syntax colors are also reused by the CodeMirror HighlightStyle (cm-source.js)
 * and any in-app code rendering, keeping the editor + chrome visually unified.
 */

/** 4pt base spacing scale (4pt beats 8pt; 12 is needed for data-dense surfaces). */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/** Type scale (RN font sizes, pt). Mono-forward for a code-editor feel. */
export const type = {
  code: 13,
  body: 14,
  meta: 12,
  micro: 11,
  title: 16,
  heading: 22,
  display: 28,
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
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

/** Font families (system stacks; offline, no bundled font files). Mono for code. */
export const font = {
  mono: 'monospace',
  sans: 'System',
} as const;

/**
 * Color system — pitch-black surface with Catppuccin Mocha accents.
 * Background is true #000 (per user pref); surfaces carry a faint cool tint so
 * elevation reads against the black canvas.
 */
export const color = {
  // surfaces (cool-tinted blacks for elevation)
  bg: '#000000',
  surface: '#0c0c13',
  surfaceMuted: '#14141d',
  surfaceRaised: '#1b1b27',
  hairline: '#232331',
  hairlineStrong: '#34344a',

  // text (Catppuccin Mocha text ramp)
  textPrimary: '#cdd6f4',
  textSecondary: '#a6adc8',
  textMuted: '#7f849c',
  textFaint: '#585b70',

  // brand / semantic (Catppuccin)
  accent: '#cba6f7', // mauve — signature
  accentHover: '#b4befe', // lavender
  accentSoft: 'rgba(203,166,247,0.16)',
  accentGlow: 'rgba(203,166,247,0.55)', // for the Run FAB glow
  blue: '#89b4fa',
  sapphire: '#74c7ec',
  sky: '#89dceb',
  teal: '#94e2d5',
  green: '#a6e3a1',
  yellow: '#f9e2af',
  peach: '#fab387',
  maroon: '#eba0ac',
  red: '#f38ba8',
  pink: '#f5c2e7',
  flamingo: '#f2cdcd',
  rosewater: '#f5e0dc',

  danger: '#f38ba8',
  dangerSoft: 'rgba(243,139,168,0.16)',
  success: '#a6e3a1',
  successSoft: 'rgba(166,227,161,0.16)',
  warning: '#f9e2af',
  warningSoft: 'rgba(249,226,175,0.16)',

  // console (shares the black canvas)
  consoleBg: '#000000',
  consoleText: '#cdd6f4',
  consoleDim: '#7f849c',
  consoleErr: '#f38ba8',
  consolePrompt: '#a6e3a1',
  consoleInputBorder: '#232331',
} as const;

/** Catppuccin Mocha syntax token colors (used by the CM HighlightStyle). */
export const syntax = {
  keyword: '#cba6f7', // mauve
  controlKeyword: '#cba6f7',
  definitionKeyword: '#cba6f7',
  string: '#a6e3a1', // green
  number: '#fab387', // peach
  comment: '#6c7086', // overlay0
  type: '#f9e2af', // yellow
  typeName: '#f9e2af',
  className: '#f9e2af',
  function: '#89b4fa', // blue
  method: '#89b4fa',
  variable: '#cdd6f4', // text
  localVariable: '#cdd6f4',
  property: '#89b4fa',
  operator: '#89dceb', // sky
  punctuation: '#9399b2', // overlay2
  constant: '#fab387', // peach (true/false/null)
  atom: '#f38ba8', // red (this/super)
  meta: '#f5c2e7', // pink (annotations)
  bracket: '#9399b2',
} as const;

/** Elevation (subtle; hierarchy, not decoration). The accent glow lifts the FAB. */
export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    shadowOpacity: 0.18,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    shadowOpacity: 0.22,
    elevation: 3,
  },
  /** Accent glow — used by the Run FAB so it reads as the primary action. */
  glow: {
    shadowColor: color.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 16,
    shadowOpacity: 0.6,
    elevation: 6,
  },
} as const;

/** Minimum touch target (pt). */
export const touchTarget = 44;

/** Run-lifecycle badge metadata (Catppuccin colors) per runStore state. */
export const runBadge: Record<
  'idle' | 'running' | 'waiting-input' | 'done' | 'error',
  { label: string; fg: string; bg: string }
> = {
  idle: { label: 'Idle', fg: color.textMuted, bg: color.surfaceMuted },
  running: { label: 'Running', fg: color.accent, bg: color.accentSoft },
  'waiting-input': { label: 'Input', fg: color.success, bg: color.successSoft },
  done: { label: 'Done', fg: color.success, bg: color.successSoft },
  error: { label: 'Error', fg: color.danger, bg: color.dangerSoft },
};
