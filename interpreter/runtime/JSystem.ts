/**
 * java.lang.System / System.out shim.
 *
 * `out` is a value whose methods route to an emitter callback that pushes
 * output lines into the Console. `System.out.println(x)` and `print(x)` live
 * here. There is intentionally NO `System.in` binding here — interactive stdin
 * goes through `java.util.Scanner`, which is `JScanner`.
 */

import type { Value } from '../types';

export type Emitter = (text: string, stream: 'stdout' | 'stderr') => void;

/** Convert any interpreter Value into its Java `String.valueOf` form. */
export function javaToString(v: Value): string {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return 'NaN';
    if (!Number.isFinite(v)) return v > 0 ? 'Infinity' : '-Infinity';
    // Java prints doubles without a trailing ".0" only for whole-value ints cast
    // to double; for the interpreter we keep Number's default but strip a
    // trailing ".0" only when the value is an integer-typed double. We
    // approximate by using the value's natural string.
    if (Number.isInteger(v)) return String(v);
    return String(v);
  }
  if (typeof v === 'string') return v;
  if (Array.isArray(Object(v) ? null : null)) return '';
  if (v && typeof v === 'object') {
    const anyV = v as { toString?: () => string; className?: string };
    if (typeof anyV.toString === 'function' && anyV.toString !== Object.prototype.toString) {
      return anyV.toString();
    }
    if ('__array' in (v as object)) {
      const arr = (v as { elements: Value[] }).elements;
      return `[${arr.map(javaToString).join(', ')}]`;
    }
    if ('className' in (v as object)) return `${(v as { className: string }).className}@object`;
  }
  return String(v);
}

/** Build the `System.out` object given an emitter. */
export function makeSystemOut(emitter: Emitter): Record<string, (args: Value[]) => Value> {
  const println = (args: Value[]): Value => {
    const arg = args[0];
    emitter(arg === undefined ? '' : javaToString(arg), 'stdout');
    emitter('\n', 'stdout');
    return null;
  };
  const print = (args: Value[]): Value => {
    const arg = args[0];
    emitter(arg === undefined ? '' : javaToString(arg), 'stdout');
    return null;
  };
  const printf = (args: Value[]): Value => {
    // minimal printf: %d %s %f %n with simple substitution
    const fmt = typeof args[0] === 'string' ? args[0] : '';
    emitter(formatJava(fmt, args.slice(1)), 'stdout');
    return null;
  };
  return { println, print, printf };
}

/** Minimal Java format string support (subset of Formatter). */
export function formatJava(fmt: string, args: Value[]): string {
  let i = 0;
  let out = '';
  let argIdx = 0;
  while (i < fmt.length) {
    const c = fmt[i]!;
    if (c !== '%') { out += c; i++; continue; }
    i++;
    if (fmt[i] === '%') { out += '%'; i++; continue; }
    // parse flags/width/precision minimally: skip until conversion char
    let spec = '';
    while (i < fmt.length && !'dsfcbxXeogG%naA'.includes(fmt[i]!)) { spec += fmt[i]; i++; }
    const conv = fmt[i] ?? 's';
    i++;
    const arg = args[argIdx++];
    switch (conv) {
      case 'd': out += String(toInt(arg)); break;
      case 's': out += javaToString(arg); break;
      case 'f': out += (typeof arg === 'number' ? arg.toFixed(spec.includes('.') ? Number(spec.split('.')[1]) : 6) : String(arg)); break;
      case 'c': out += typeof arg === 'string' ? arg[0] ?? '' : String.fromCharCode(toInt(arg)); break;
      case 'b': out += arg === true ? 'true' : 'false'; break;
      case 'x': out += toInt(arg).toString(16); break;
      case 'X': out += toInt(arg).toString(16).toUpperCase(); break;
      case 'e': out += (typeof arg === 'number' ? arg.toExponential() : String(arg)); break;
      case 'n': out += '\n'; argIdx--; break;
      default: out += javaToString(arg);
    }
  }
  return out;
}

export function toInt(v: Value): number {
  if (typeof v === 'number') return Math.trunc(v);
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

/** A `System` namespace value: `{ out: {...} }` is built lazily at bind time. */
export interface JSystemValue {
  out: Record<string, (args: Value[]) => Value>;
  err: Record<string, (args: Value[]) => Value>;
}
