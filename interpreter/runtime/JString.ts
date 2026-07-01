/**
 * java.lang.String helper methods invoked on string receivers
 * (e.g. `s.length()`, `s.charAt(i)`). Note: in Java `length` is a field-like
 * method here; the engine treats `.length` specially for arrays, so for
 * Strings we expose methods.
 */
import type { Value } from '../types';
import { javaToString } from './JSystem';

export const JStringMethods: Record<string, (receiver: Value, args: Value[]) => Value> = {
  length: (r) => javaToString(r).length,
  charAt: (r, a) => javaToString(r).charAt(Number(a[0]) | 0),
  substring: (r, a) => {
    const s = javaToString(r);
    const start = Number(a[0]) | 0;
    if (a[1] !== undefined) return s.substring(start, Number(a[1]) | 0);
    return s.substring(start);
  },
  indexOf: (r, a) => {
    const s = javaToString(r);
    const needle = typeof a[0] === 'string' ? a[0] : String.fromCharCode(Number(a[0]) | 0);
    const from = a[1] !== undefined ? Number(a[1]) | 0 : 0;
    return s.indexOf(needle, from);
  },
  lastIndexOf: (r, a) => {
    const s = javaToString(r);
    const needle = typeof a[0] === 'string' ? a[0] : String.fromCharCode(Number(a[0]) | 0);
    return s.lastIndexOf(needle);
  },
  equals: (r, a) => r === a[0],
  equalsIgnoreCase: (r, a) => typeof r === 'string' && typeof a[0] === 'string' && r.toLowerCase() === a[0].toLowerCase(),
  compareTo: (r, a) => {
    const x = javaToString(r); const y = javaToString(a[0]);
    return x < y ? -1 : x > y ? 1 : 0;
  },
  toLowerCase: (r) => javaToString(r).toLowerCase(),
  toUpperCase: (r) => javaToString(r).toUpperCase(),
  trim: (r) => javaToString(r).trim(),
  strip: (r) => javaToString(r).trim(),
  isEmpty: (r) => javaToString(r).length === 0,
  contains: (r, a) => javaToString(r).includes(javaToString(a[0])),
  startsWith: (r, a) => javaToString(r).startsWith(javaToString(a[0])),
  endsWith: (r, a) => javaToString(r).endsWith(javaToString(a[0])),
  replace: (r, a) => javaToString(r).split(javaToString(a[0])).join(javaToString(a[1])),
  split: (r, a) => {
    const parts = javaToString(r).split(new RegExp(javaToString(a[0])));
    return { __array: true, elements: parts, elementType: 'String' };
  },
  toCharArray: (r) => {
    const chars = javaToString(r).split('');
    return { __array: true, elements: chars, elementType: 'char' };
  },
  toString: (r: Value) => javaToString(r),
  valueOf: (_r: Value, a: Value[]) => javaToString(a[0]),
};

export type { Value };
