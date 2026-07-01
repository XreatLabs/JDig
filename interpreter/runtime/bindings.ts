/**
 * Sandboxed global scope for student programs (Principle 3: sandbox by
 * absence). This wires the host shims (System, Math, Scanner, ArrayList,
 * Arrays, String, Integer/Double wrappers) into the interpreter's global
 * environment. There are deliberately NO filesystem or network bindings.
 */

import { Environment } from '../engine/Environment';
import type { Value } from '../types';
import { makeSystemOut, type Emitter } from './JSystem';
import { makeScanner, type ScannerState } from './JScanner';
import { JMathFields, JMathMethods } from './JMath';
import { JArrayListMethods, makeArrayList } from './JArrayList';
import { JArraysMethods } from './JArrays';

/** Marker objects the engine recognizes as host namespaces/callables. */
export interface HostNamespace {
  __host: true;
  fields?: Record<string, Value>;
  methods: Record<string, (args: Value[]) => Value | Promise<Value>>;
}

export interface RuntimeDeps {
  emitter: Emitter;
  scannerState: ScannerState;
}

/** Build the global environment with all host bindings. */
export function buildGlobalScope(deps: RuntimeDeps): Environment {
  const env = new Environment(null, '__global__');

  // System.out / System.err
  const out = makeSystemOut(deps.emitter);
  const err = makeSystemOut((t, _s) => deps.emitter(t, 'stderr'));
  const SystemNs: HostNamespace = {
    __host: true,
    fields: { out: { __host: true, methods: out } as unknown as Value, err: { __host: true, methods: err } as unknown as Value },
    methods: {
      currentTimeMillis: () => Date.now(),
      nanoTime: () => performance.now() * 1e6,
    },
  };
  env.define('System', SystemNs as unknown as Value);

  // Math
  const MathNs: HostNamespace = { __host: true, fields: { ...JMathFields }, methods: JMathMethods as Record<string, (args: Value[]) => Value> };
  env.define('Math', MathNs as unknown as Value);

  // Scanner: a constructor-call host. The engine treats `new Scanner(...)` by
  // creating a scanner value regardless of args (System.in is the only arg).
  const ScannerCtor: HostNamespace = { __host: true, methods: {} };
  env.define('Scanner', ScannerCtor as unknown as Value);
  env.define('__newScanner__', { __host: true, methods: { create: () => makeScanner(deps.scannerState) } } as unknown as Value);

  // ArrayList constructor
  const ArrayListCtor: HostNamespace = {
    __host: true,
    methods: {
      create: () => makeArrayList(),
      // instance methods are dispatched by the engine via the receiver
    },
  };
  env.define('ArrayList', ArrayListCtor as unknown as Value);
  env.define('__arraylistMethods__', JArrayListMethods as unknown as Value);

  // Arrays static
  const ArraysNs: HostNamespace = { __host: true, methods: JArraysMethods as Record<string, (args: Value[]) => Value> };
  env.define('Arrays', ArraysNs as unknown as Value);

  // String static helpers
  env.define('String', {
    __host: true,
    methods: {
      valueOf: (args: Value[]) => {
        const a = args[0];
        if (a === null || a === undefined) return 'null';
        return String(a);
      },
    },
  } as unknown as Value);

  // Wrapper classes (minimal — autoboxing is implicit since our runtime Values
  // are already unboxed JS primitives). Provide parseXxx / MAX_VALUE.
  env.define('Integer', {
    __host: true,
    fields: { MAX_VALUE: 2147483647, MIN_VALUE: -2147483648 },
    methods: {
      parseInt: (a: Value[]) => parseInt(String(a[0]), 10),
      toString: (a: Value[]) => String(Math.trunc(Number(a[0]))),
      valueOf: (a: Value[]) => Math.trunc(Number(a[0])),
    },
  } as unknown as Value);

  env.define('Double', {
    __host: true,
    fields: { MAX_VALUE: Number.MAX_VALUE, MIN_VALUE: Number.MIN_VALUE, POSITIVE_INFINITY: Infinity, NEGATIVE_INFINITY: -Infinity, NaN: NaN },
    methods: {
      parseDouble: (a: Value[]) => Number(a[0]),
      toString: (a: Value[]) => String(Number(a[0])),
      valueOf: (a: Value[]) => Number(a[0]),
    },
  } as unknown as Value);

  env.define('Long', {
    __host: true,
    fields: { MAX_VALUE: 9007199254740991, MIN_VALUE: -9007199254740991 },
    methods: { parseLong: (a: Value[]) => Math.trunc(Number(a[0])), valueOf: (a: Value[]) => Math.trunc(Number(a[0])) },
  } as unknown as Value);

  env.define('Boolean', {
    __host: true,
    fields: { TRUE: true, FALSE: false },
    methods: { parseBoolean: (a: Value[]) => String(a[0]).toLowerCase() === 'true' },
  } as unknown as Value);

  env.define('Character', {
    __host: true,
    methods: {
      isDigit: (a: Value[]) => typeof a[0] === 'string' ? /\d/.test(a[0]) : false,
      isLetter: (a: Value[]) => typeof a[0] === 'string' ? /[a-zA-Z]/.test(a[0]) : false,
      isUpperCase: (a: Value[]) => typeof a[0] === 'string' ? a[0] === a[0].toUpperCase() : false,
      isLowerCase: (a: Value[]) => typeof a[0] === 'string' ? a[0] === a[0].toLowerCase() : false,
      isWhitespace: (a: Value[]) => typeof a[0] === 'string' ? /\s/.test(a[0]) : false,
      toUpperCase: (a: Value[]) => typeof a[0] === 'string' ? a[0].toUpperCase() : a[0],
      toLowerCase: (a: Value[]) => typeof a[0] === 'string' ? a[0].toLowerCase() : a[0],
      getNumericValue: (a: Value[]) => typeof a[0] === 'string' ? (parseInt(a[0], 36) || -1) : -1,
      toString: (a: Value[]) => String(a[0]),
    },
  } as unknown as Value);

  return env;
}

/** Pull a host namespace marker off a Value, or null. */
export function asHostNamespace(v: Value): HostNamespace | null {
  return v && typeof v === 'object' && '__host' in v ? (v as unknown as HostNamespace) : null;
}
