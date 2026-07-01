/**
 * AST + source whitelist: detect out-of-subset Java constructs and fail fast
 * with a student-friendly error BEFORE execution (Principle 4, AC5).
 *
 * Strategy: a curated deny-list of fully-qualified type prefixes and import
 * patterns is matched against the raw source first (cheap, catches `java.io.File`,
 * `java.net.Socket`, etc. regardless of CST quirks). Then the normalized AST is
 * scanned for constructs we deliberately do not execute (lambdas, switches in
 * some modes, etc. — currently none, but the hook exists).
 */

import type { ProgramNode } from './nodes';
import { ParseError } from './parse';

export class UnsupportedFeatureError extends Error {
  readonly feature: string;
  constructor(message: string, feature = 'unsupported-feature') {
    super(message);
    this.name = 'UnsupportedFeatureError';
    this.feature = feature;
  }
}

/** Banned import / fully-qualified type prefixes. Sandbox by absence (Principle 3). */
const DENIED_PACKAGES: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /\bjava\.io\b/g, label: 'File and I/O (java.io)' },
  { pattern: /\bjava\.net\b/g, label: 'Networking (java.net)' },
  { pattern: /\bjava\.nio\b/g, label: 'NIO / channels (java.nio)' },
  { pattern: /\bjava\.sql\b/g, label: 'Databases (java.sql)' },
  { pattern: /\bjava\.lang\.Process|Runtime\.getRuntime|ProcessBuilder\b/g, label: 'Spawning processes' },
  { pattern: /\bjava\.lang\.Thread\b/g, label: 'Threads' },
  { pattern: /\bjavafx\b/g, label: 'JavaFX GUI' },
  { pattern: /\bjava\.awt\b/g, label: 'AWT GUI' },
  { pattern: /\bjavax\.swing\b/g, label: 'Swing GUI' },
  { pattern: /\bjava\.util\.concurrent\b/g, label: 'Concurrency utilities' },
  { pattern: /\bjava\.util\.regex\b/g, label: 'Regular expressions' },
  { pattern: /\bjava\.util\.stream\b/g, label: 'Streams API' },
  { pattern: /\bjava\.lang\.reflect\b/g, label: 'Reflection' },
  { pattern: /\bFileReader|FileWriter|FileInputStream|FileOutputStream|RandomAccessFile\b/g, label: 'File access' },
  { pattern: /\bSocket|ServerSocket|DatagramSocket|HttpClient|URL\b/g, label: 'Networking' },
  { pattern: /\bSystem\.exit\b/g, label: 'System.exit' },
];

/**
 * Run the unsupported-feature check. Throws UnsupportedFeatureError on the
 * first denied construct. Operates on source (and optionally the AST).
 */
export function assertSupported(source: string, ast?: ProgramNode): void {
  for (const { pattern, label } of DENIED_PACKAGES) {
    pattern.lastIndex = 0;
    const m = pattern.exec(source);
    if (m) {
      throw new UnsupportedFeatureError(
        `"${label}" is not supported in JDig. JDig runs a small, safe subset of Java without file or network access.`,
        label,
      );
    }
  }
  // AST-level checks can be added here as the subset grows.
  if (ast) assertAstSupported(ast);
}

function assertAstSupported(_ast: ProgramNode): void {
  // Reserved for future AST-level denials (e.g. certain statements).
}

/** Convenience: returns true if `source` references any denied feature. */
export function findUnsupported(source: string): { label: string; match: string } | null {
  for (const { pattern, label } of DENIED_PACKAGES) {
    pattern.lastIndex = 0;
    const m = pattern.exec(source);
    if (m) return { label, match: m[0] };
  }
  return null;
}

// Re-export for callers that want both errors under one namespace.
export { ParseError };
