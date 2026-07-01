/**
 * Lexical environment / scope chain for the interpreter.
 *
 * Scopes are nested (method block -> enclosing block -> ... -> class/global).
 * Variable lookup walks parents; assignment walks up to the defining scope.
 */

import type { Value } from '../types';
import { VOID } from '../types';

export class Environment {
  private readonly vars = new Map<string, Value>();
  readonly parent: Environment | null;
  /** Owning class name, if this scope is anchored to a class instance/global. */
  readonly className?: string;

  constructor(parent: Environment | null = null, className?: string) {
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
    for (let env: Environment | null = this; env; env = env.parent) {
      const v = env.vars.get(name);
      if (v !== undefined) return v;
    }
    return undefined;
  }

  /** True if `name` is defined anywhere in the chain. */
  has(name: string): boolean {
    for (let env: Environment | null = this; env; env = env.parent) {
      if (env.vars.has(name)) return true;
    }
    return false;
  }

  /**
   * Assign to an existing variable. Walks up to find the defining scope.
   * Returns true if found; false if not declared (caller decides whether to
   * define or error).
   */
  assign(name: string, value: Value): boolean {
    for (let env: Environment | null = this; env; env = env.parent) {
      if (env.vars.has(name)) {
        env.vars.set(name, value);
        return true;
      }
    }
    return false;
  }

  /** Create a child scope. */
  push(className?: string): Environment {
    return new Environment(this, className ?? this.className);
  }
}
