/**
 * Lexical environment / scope chain for the interpreter.
 *
 * Scopes are nested (method block -> enclosing block -> ... -> class/global).
 * Variable lookup walks parents; assignment walks up to the defining scope.
 */

import type { Value } from '../types';
import { VOID } from '../types';

/**
 * Interface shared by normal scopes and the instance-field adapter. The engine
 * walks the chain polymorphically so a field-backed scope can sit between a
 * method scope and its caller — this is how bare field names resolve in
 * instance methods (`return width * height;`) without `this.`, matching real
 * Java semantics (Principle 4).
 */
export interface Scope {
  readonly parent: Scope | null;
  get(name: string): Value | undefined;
  has(name: string): boolean;
  assign(name: string, value: Value): boolean;
  /** This scope's own binding (no parent walk), or undefined if not held here. */
  getOwn?(name: string): Value | undefined;
  /** True iff this scope itself holds a binding for `name` (no parent walk). */
  hasOwn?(name: string): boolean;
  /** Assign within this scope only (no parent walk). Returns true if held. */
  assignOwn?(name: string, value: Value): boolean;
}

export class Environment implements Scope {
  private readonly vars = new Map<string, Value>();
  readonly parent: Scope | null;
  /** Owning class name, if this scope is anchored to a class instance/global. */
  readonly className?: string;

  constructor(parent: Scope | null = null, className?: string) {
    this.parent = parent;
    this.className = className;
  }

  /** Define a new variable in THIS scope. */
  define(name: string, value: Value): void {
    this.vars.set(name, value);
  }

  /** Define or reset; returns previous value if any. */
  setIfPresent(name: string, value: Value): Value {
    const prev = this.vars.get(name);
    this.vars.set(name, value);
    return prev ?? VOID;
  }

  /** Look up a variable walking the scope chain. */
  get(name: string): Value | undefined {
    for (let env: Scope | null = this; env; env = env.parent) {
      const v = env.getOwn?.(name);
      if (v !== undefined) return v;
    }
    return undefined;
  }

  /** True if `name` is defined anywhere in the chain. */
  has(name: string): boolean {
    for (let env: Scope | null = this; env; env = env.parent) {
      if (env.hasOwn?.(name)) return true;
    }
    return false;
  }

  /**
   * Assign to an existing variable. Walks up to find the defining scope.
   * Returns true if found; false if not declared (caller decides whether to
   * define or error).
   */
  assign(name: string, value: Value): boolean {
    for (let env: Scope | null = this; env; env = env.parent) {
      if (env.assignOwn?.(name, value)) return true;
    }
    return false;
  }

  // --- Scope interface: this scope's own (local) storage ---
  getOwn(name: string): Value | undefined {
    return this.vars.get(name);
  }
  hasOwn(name: string): boolean {
    return this.vars.has(name);
  }
  assignOwn(name: string, value: Value): boolean {
    if (this.vars.has(name)) {
      this.vars.set(name, value);
      return true;
    }
    return false;
  }

  /** Create a child scope. */
  push(className?: string): Environment {
    return new Environment(this, className ?? this.className);
  }
}

/**
 * A scope backed directly by an instance's field Map (no copying). Inserted
 * between a method scope and its caller so bare names resolve to instance
 * fields AFTER locals/params but BEFORE globals/statics. Mutations go to the
 * underlying field map, so `width = w;` inside a method writes the field.
 */
export class FieldScopeEnvironment implements Scope {
  readonly parent: Scope | null;
  private readonly fields: Map<string, Value>;
  readonly className?: string;

  constructor(fields: Map<string, Value>, parent: Scope | null = null, className?: string) {
    this.fields = fields;
    this.parent = parent;
    this.className = className;
  }

  getOwn(name: string): Value | undefined {
    return this.fields.get(name);
  }
  hasOwn(name: string): boolean {
    return this.fields.has(name);
  }
  assignOwn(name: string, value: Value): boolean {
    if (this.fields.has(name)) {
      this.fields.set(name, value);
      return true;
    }
    return false;
  }
  // Unused but part of the polymorphic chain via get/has/assign on Environment.
  get(name: string): Value | undefined {
    for (let env: Scope | null = this; env; env = env.parent) {
      const v = env.getOwn?.(name);
      if (v !== undefined) return v;
    }
    return undefined;
  }
  has(name: string): boolean {
    for (let env: Scope | null = this; env; env = env.parent) {
      if (env.hasOwn?.(name)) return true;
    }
    return false;
  }
  assign(name: string, value: Value): boolean {
    for (let env: Scope | null = this; env; env = env.parent) {
      if (env.assignOwn?.(name, value)) return true;
    }
    return false;
  }
}

