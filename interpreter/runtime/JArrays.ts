/**
 * java.util.Arrays shim (the static helpers; array element access/length live
 * in the engine via FieldAccess/ArrayAccess).
 */
import type { JArrayValue, Value } from '../types';

function asArray(v: Value): JArrayValue | null {
  return v && typeof v === 'object' && '__array' in v ? (v as JArrayValue) : null;
}

export const JArraysMethods: Record<string, (args: Value[]) => Value> = {
  sort: (a: Value[]) => {
    const arr = asArray(a[0]);
    if (arr) arr.elements.sort((x, y) => {
      const xi = Number(x); const yi = Number(y);
      return xi < yi ? -1 : xi > yi ? 1 : 0;
    });
    return null;
  },
  toString: (a: Value[]) => {
    const arr = asArray(a[0]);
    if (!arr) return 'null';
    return '[' + arr.elements.map(v => String(v)).join(', ') + ']';
  },
  asList: (a) => {
    const arr = asArray(a[0]);
    const items = arr ? arr.elements : [];
    return { __arraylist: true, items: [...items] };
  },
  fill: (a) => {
    const arr = asArray(a[0]);
    if (arr) {
      const val = a[1];
      for (let i = 0; i < arr.elements.length; i++) arr.elements[i] = val;
    }
    return null;
  },
  copyOf: (a) => {
    const arr = asArray(a[0]);
    const n = Number(a[1]) | 0;
    const elements = arr ? arr.elements.slice(0, n) : [];
    while (elements.length < n) elements.push(0);
    return { __array: true, elements, elementType: arr?.elementType ?? 'int' };
  },
  equals: (a) => {
    const x = asArray(a[0]); const y = asArray(a[1]);
    if (!x || !y) return false;
    if (x.elements.length !== y.elements.length) return false;
    for (let i = 0; i < x.elements.length; i++) if (x.elements[i] !== y.elements[i]) return false;
    return true;
  },
  binarySearch: (a) => {
    const arr = asArray(a[0]);
    if (!arr) return -1;
    const key = Number(a[1]);
    let lo = 0; let hi = arr.elements.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const mv = Number(arr.elements[mid]);
      if (mv < key) lo = mid + 1; else if (mv > key) hi = mid - 1; else return mid;
    }
    return -(lo + 1);
  },
};
