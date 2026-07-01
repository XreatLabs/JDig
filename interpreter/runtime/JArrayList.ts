/**
 * java.util.ArrayList shim.
 *
 * Constructed via `new ArrayList<...>()` (the engine creates a fresh value per
 * `new`). All methods mutate the backing JS array. Generic type arguments are
 * erased (runtime is untyped, like the rest of the interpreter).
 */
import type { JArrayListValue, Value } from '../types';

export function makeArrayList(): JArrayListValue {
  return { __arraylist: true, items: [] };
}

export const JArrayListMethods: Record<string, (receiver: JArrayListValue, args: Value[]) => Value> = {
  add: (list, a) => { list.items.push(a[0] as Value); return true; },
  addAt: (list, a) => { list.items.splice(Number(a[0]) | 0, 0, a[1] as Value); return null; },
  get: (list, a) => list.items[Number(a[0]) | 0] ?? null,
  set: (list, a) => {
    const i = Number(a[0]) | 0;
    const prev = list.items[i] ?? null;
    list.items[i] = a[1] as Value;
    return prev;
  },
  remove: (list, a) => {
    if (typeof a[0] === 'number') {
      const i = a[0] | 0;
      const removed = list.items.splice(i, 1);
      return removed[0] ?? null;
    }
    const idx = list.items.indexOf(a[0]);
    if (idx >= 0) list.items.splice(idx, 1);
    return idx >= 0 ? true : false;
  },
  size: (list) => list.items.length,
  isEmpty: (list) => list.items.length === 0,
  clear: (list) => { list.items.length = 0; return null; },
  contains: (list, a) => list.items.includes(a[0]),
  indexOf: (list, a) => list.items.indexOf(a[0]),
  toArray: (list) => ({ __array: true, elements: [...list.items], elementType: 'Object' }),
  get$length: (list) => list.items.length,
};
