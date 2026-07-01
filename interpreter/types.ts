/**
 * Runtime value types for the JDig Java-subset interpreter.
 *
 * These are the JavaScript-side representations of Java values produced and
 * consumed by the tree-walking engine. They are intentionally narrow so the
 * engine can discriminate at runtime without boxing overhead.
 */

/** Primitive (or primitive-wrapper) numeric/text values. */
export type Primitive = number | string | boolean | null;

/** A function-like callable, either a Java method defined in the AST or a host shim. */
export interface JCallable {
  /** Discriminator. */
  readonly __callable: true;
  /** Method/method-like name for diagnostics. */
  name: string;
  /** Parameter names (AST methods) — host shims may leave empty. */
  params?: string[];
  /** Arity; -1 means variadic (host shims). */
  arity: number;
  /** Invoke the callable. `args` are already-evaluated Values. */
  call: (args: Value[]) => Promise<Value> | Value;
}

/** A user-defined class instance. */
export interface JObject {
  readonly __object: true;
  /** The class this instance was constructed from. */
  className: string;
  /** Field storage (name -> Value). */
  fields: Map<string, Value>;
}

/** A host-provided array view (java.util.ArrayList) wrapper. */
export interface JArrayListValue {
  readonly __arraylist: true;
  /** Backing JavaScript array of Values. */
  items: Value[];
}

/** A native Java array (T[]). */
export interface JArrayValue {
  readonly __array: true;
  /** Element Values. */
  elements: Value[];
  /** Element Java type name (e.g. "int", "String"). */
  elementType: string;
}

/** A Scanner instance bound to the interactive stdin source. */
export interface JScannerValue {
  readonly __scanner: true;
}

/** A sentinel meaning "no value" (e.g. a void method return, or missing). */
export const VOID = Symbol('jdig.void');
export type Void = typeof VOID;

/** Any value the interpreter can hold. */
export type Value =
  | Primitive
  | JCallable
  | JObject
  | JArrayValue
  | JArrayListValue
  | JScannerValue
  | Void;

/** Type guards. */
export const isObject = (v: Value): v is JObject =>
  typeof v === 'object' && v !== null && (v as JObject).__object === true;

export const isArray = (v: Value): v is JArrayValue =>
  typeof v === 'object' && v !== null && (v as JArrayValue).__array === true;

export const isArrayList = (v: Value): v is JArrayListValue =>
  typeof v === 'object' && v !== null && (v as JArrayListValue).__arraylist === true;

export const isCallable = (v: Value): v is JCallable =>
  !!v && typeof v === 'object' && (v as JCallable).__callable === true;

export const isScanner = (v: Value): v is JScannerValue =>
  typeof v === 'object' && v !== null && (v as JScannerValue).__scanner === true;

export const isNumber = (v: Value): v is number => typeof v === 'number';
export const isString = (v: Value): v is string => typeof v === 'string';
export const isBoolean = (v: Value): v is boolean => typeof v === 'boolean';

/** True for any value that is not the VOID sentinel. */
export const hasValue = (v: Value): boolean => v !== VOID;
