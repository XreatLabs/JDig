/**
 * Interpreter entrypoint: `runJava({ source, onOutput, onInputRequest, signal, budget })`.
 *
 * Pipeline: parse -> normalize -> assertSupported (whitelist, AC5) -> build
 * sandboxed global scope -> async tree-walk under the cooperative scheduler.
 *
 * Output is delivered line-by-line via `onOutput`. Interactive stdin requests
 * are surfaced via `onInputRequest` (the Console resolves them). Aborts and
 * budget exhaustion are converted into friendly messages, never rethrown raw.
 */

import { parseToCST, ParseError } from './parser/parse';
import { normalize } from './parser/normalize';
import { assertSupported, UnsupportedFeatureError } from './parser/unsupported';
import { Interpreter, EMITTER_HOOK, RuntimeError } from './engine/Interpreter';
import { Scheduler, RunAbortedError } from './engine/scheduler';
import type { InputRequest } from './runtime/JScanner';
import { buildGlobalScope } from './runtime/bindings';
import { DEFAULT_BUDGET, type BudgetOptions } from '@/utils/safety';

export { ParseError, UnsupportedFeatureError, RuntimeError, RunAbortedError };
export type { InputRequest };

export interface RunJavaOptions extends BudgetOptions {
  /** Java source text. */
  source: string;
  /** Output callback: receives raw program output text (already includes newlines). */
  onOutput: (text: string, stream: 'stdout' | 'stderr') => void;
  /** Fired when the program blocks on a Scanner read. Caller resolves/rejects. */
  onInputRequest: (req: InputRequest) => void;
  /** AbortSignal for cooperative Stop. Rejects pending stdin reads. */
  signal?: AbortSignal;
}

export interface RunJavaResult {
  ok: boolean;
  /** True if the program ended normally (no abort, no error). */
  reason?: 'completed' | 'aborted' | 'budget' | 'output-cap' | 'error';
  /** Friendly error message, if any. */
  message?: string;
  steps: number;
  durationMs: number;
}

/** Run a Java-subset program. Never throws: returns a RunJavaResult. */
export async function runJava(opts: RunJavaOptions): Promise<RunJavaResult> {
  const startedAt = Date.now();
  const budget = { ...DEFAULT_BUDGET };
  if (opts.stepBudget !== undefined) budget.stepBudget = opts.stepBudget;
  if (opts.wallClockMs !== undefined) budget.wallClockMs = opts.wallClockMs;
  if (opts.outputCapLines !== undefined) budget.outputCapLines = opts.outputCapLines;
  if (opts.yieldEveryK !== undefined) budget.yieldEveryK = opts.yieldEveryK;

  let outputLines = 0;
  let capped = false;

  const emit = (text: string, stream: 'stdout' | 'stderr') => {
    if (capped) return;
    // account for output cap by counting newlines (and a final partial line)
    outputLines += text.split('\n').length - 1;
    if (outputLines > budget.outputCapLines) {
      capped = true;
      opts.onOutput('…(output truncated)\n', 'stderr');
      return;
    }
    opts.onOutput(text, stream);
  };

  // 1. Parse + normalize
  let ast;
  try {
    const cst = parseToCST(opts.source);
    ast = normalize(cst);
  } catch (e) {
    return finish(e instanceof ParseError ? 'error' : 'error', e as Error, 0, startedAt);
  }

  // 2. Unsupported-feature whitelist (AC5) — BEFORE execution.
  try {
    assertSupported(opts.source, ast);
  } catch (e) {
    return finish('error', e as Error, 0, startedAt);
  }

  // 3. Scheduler + emitter + scanner state
  const scannerState: import('./runtime/JScanner').ScannerState = {
    onInputRequest: opts.onInputRequest,
    signal: opts.signal,
  };
  const scheduler = new Scheduler({
    signal: opts.signal,
    stepBudget: budget.stepBudget,
    wallClockMs: budget.wallClockMs,
    yieldEveryK: budget.yieldEveryK,
    outputCapLines: budget.outputCapLines,
    outputLineCount: () => outputLines,
  });

  // 4. Wire the engine's emitter side channel.
  const prevHook = EMITTER_HOOK.value;
  EMITTER_HOOK.value = (text: string) => emit(text, 'stdout');

  try {
    // Global scope with host bindings (sandbox: no FS/net).
    const globalEnv = buildGlobalScope({ emitter: emit, scannerState });
    const interp = new Interpreter(ast, { scheduler, globalEnv });
    await interp.run();
    return { ok: true, reason: 'completed', steps: scheduler.stepCount, durationMs: Date.now() - startedAt };
  } catch (e) {
    if (e instanceof RunAbortedError) {
      // Surface abort/budget/output-cap to the user as friendly text.
      const stream: 'stdout' | 'stderr' = e.reason === 'aborted' ? 'stdout' : 'stderr';
      emit('\n' + e.message + '\n', stream);
      return {
        ok: false,
        reason: e.reason === 'aborted' ? 'aborted' : e.reason === 'output-cap' ? 'output-cap' : 'budget',
        message: e.message,
        steps: scheduler.stepCount,
        durationMs: Date.now() - startedAt,
      };
    }
    if (e instanceof RuntimeError) {
      emit('\nError: ' + e.message + '\n', 'stderr');
      return finish('error', e, scheduler.stepCount, startedAt);
    }
    return finish('error', e as Error, scheduler.stepCount, startedAt);
  } finally {
    EMITTER_HOOK.value = prevHook;
    // Ensure any pending Scanner read rejects (no leak).
    if (scannerState.pendingReject) {
      scannerState.pendingReject(new Error('Program ended'));
      scannerState.pendingReject = undefined;
    }
  }

  function finish(reason: NonNullable<RunJavaResult['reason']>, e: Error, steps: number, started: number): RunJavaResult {
    const message = e instanceof ParseError
      ? `Syntax error on line ${e.line}, column ${e.column}.`
      : e instanceof UnsupportedFeatureError
        ? e.message
        : e.message || String(e);
    if (reason === 'error') {
      // surface parse/unsupported/runtime errors to the console too
      emit('\n' + (e instanceof ParseError ? message : message) + '\n', 'stderr');
    }
    return { ok: false, reason, message, steps, durationMs: Date.now() - started };
  }
}
