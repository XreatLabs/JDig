/**
 * java.util.Scanner shim — the interactive stdin path.
 *
 * `nextInt()`, `nextDouble()`, `next()`, `nextLine()`, etc. each AWAIT a
 * Promise that is resolved by the Console UI when the user submits a line of
 * input. This is the architectural heart: it makes the interpreter pausable
 * and lets a single JS thread serve interactive console input (Driver 1).
 *
 * Scanner-abort invariant (Critic gap, AC4): when the run is aborted while a
 * read is pending, the pending Promise REJECTS so no read leaks. The engine
 * wires the AbortSignal to a reject listener; on abort we reject and clear the
 * pending resolver.
 */

import type { Value } from '../types';
import type { JScannerValue } from '../types';
import { toInt } from './JSystem';
import { RunAbortedError } from '../engine/scheduler';

export interface InputRequest {
  /** Prompt shown to the user (e.g. "nextInt"). */
  prompt: string;
  /** Resolve with the user's input line (string). */
  resolve: (line: string) => void;
  /** Reject on abort/unmount (no read leak). */
  reject: (err: Error) => void;
}

export type OnInputRequest = (req: InputRequest) => void;

export interface JScannerOptions {
  onInputRequest: OnInputRequest;
  signal?: AbortSignal;
}

/**
 * Internal state shared by all Scanner instances in a run. Each read awaits a
 * fresh promise; only one read is pending at a time.
 */
export interface ScannerState {
  onInputRequest: OnInputRequest;
  signal?: AbortSignal;
  pendingReject?: (err: Error) => void;
}

/** Request one line of input from the user; resolves when the UI submits. */
export async function readLine(state: ScannerState, prompt: string): Promise<string> {
  // If a previous read leaked (shouldn't happen), reject it first.
  if (state.pendingReject) {
    state.pendingReject(new Error('Scanner read superseded'));
    state.pendingReject = undefined;
  }
  return new Promise<string>((resolve, reject) => {
    state.pendingReject = reject;
    const cleanup = () => {
      if (state.pendingReject === reject) state.pendingReject = undefined;
    };
    // Wire abort: reject with a RunAbortedError so the engine surfaces it as
    // an abort (not a generic error) and no read leaks.
    const onAbort = () => {
      reject(new RunAbortedError('aborted', 'Program was stopped.'));
      cleanup();
    };
    if (state.signal) {
      if (state.signal.aborted) { onAbort(); return; }
      state.signal.addEventListener('abort', onAbort, { once: true });
    }
    state.onInputRequest({
      prompt,
      resolve: (line) => { cleanup(); resolve(line); },
      reject: (err) => { cleanup(); reject(err); },
    });
  });
}

/** Build a Scanner value with its methods bound to a shared input state. */
export function makeScanner(state: ScannerState): JScannerValue & { __methods: Record<string, (args: Value[]) => Promise<Value>> } {
  const methods: Record<string, (args: Value[]) => Promise<Value>> = {
    nextInt: async () => {
      const line = await readLine(state, 'nextInt');
      return toInt(line);
    },
    nextLong: async () => {
      const line = await readLine(state, 'nextLong');
      return Math.trunc(Number(line));
    },
    nextDouble: async () => {
      const line = await readLine(state, 'nextDouble');
      return Number(line);
    },
    nextFloat: async () => {
      const line = await readLine(state, 'nextFloat');
      return Number(line);
    },
    next: async () => {
      const line = await readLine(state, 'next');
      return (line.trim().split(/\s+/)[0] ?? '');
    },
    nextLine: async () => {
      const line = await readLine(state, 'nextLine');
      return line;
    },
    nextBoolean: async () => {
      const line = (await readLine(state, 'nextBoolean')).toLowerCase();
      return line === 'true' || line === '1';
    },
    hasNext: async () => true,
    hasNextInt: async () => true,
    close: async () => null,
  };
  return { __scanner: true, __methods: methods } as unknown as JScannerValue & { __methods: Record<string, (args: Value[]) => Promise<Value>> };
}
