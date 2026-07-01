/**
 * Cooperative scheduler for the interpreter.
 *
 * Every K interpreter "steps" we await a microtask (`yieldToUI`) so the JS
 * thread can paint, process input, and let a pending `AbortController.signal`
 * fire. Between yields we decrement a step budget and enforce an output cap and
 * a wall-clock backstop (AC4).
 *
 * The engine calls `scheduler.tick()` at every node evaluation. If the budget
 * is exhausted or the run was aborted, `tick()` throws a terminating exception
 * that the top-level `runJava` turns into a friendly message.
 */

import {
  ABORTED_MESSAGE,
  BUDGET_EXCEEDED_MESSAGE,
} from '@/utils/safety';

export type AbortReason = 'aborted' | 'budget' | 'output-cap';

export class RunAbortedError extends Error {
  readonly reason: AbortReason;
  constructor(reason: AbortReason, message: string) {
    super(message);
    this.name = 'RunAbortedError';
    this.reason = reason;
  }
}

export interface SchedulerOptions {
  signal?: AbortSignal;
  stepBudget: number;
  wallClockMs: number;
  yieldEveryK: number;
  /** Called to check the current output line count for the cap. */
  outputLineCount: () => number;
  outputCapLines: number;
}

/** Cooperative yield: a resolved promise is a microtask; this lets the UI pump. */
export function yieldToUI(): Promise<void> {
  return Promise.resolve();
}

export class Scheduler {
  readonly opts: SchedulerOptions;
  private steps = 0;
  private readonly startedAt = Date.now();

  constructor(opts: SchedulerOptions) {
    this.opts = opts;
  }

  /**
   * Called once per interpreter step. Awaits a yield microtask every K steps
   * and enforces abort + budget + wall-clock + output-cap.
   *
   * MUST be awaited by the engine on every node (correctness for interactive
   * stdin + Stop responsiveness).
   */
  async tick(): Promise<void> {
    this.steps++;

    // Cheap checks first (no await): abort signal, wall-clock, output cap.
    if (this.opts.signal?.aborted) {
      throw new RunAbortedError('aborted', ABORTED_MESSAGE);
    }
    if (this.steps > this.opts.stepBudget) {
      throw new RunAbortedError('budget', BUDGET_EXCEEDED_MESSAGE);
    }
    if (Date.now() - this.startedAt > this.opts.wallClockMs) {
      throw new RunAbortedError('budget', BUDGET_EXCEEDED_MESSAGE);
    }
    if (this.opts.outputLineCount() >= this.opts.outputCapLines) {
      throw new RunAbortedError('output-cap', 'Program output was truncated (too much output).');
    }

    // Cooperative yield every K steps so the UI thread can run.
    if (this.opts.yieldEveryK > 0 && this.steps % this.opts.yieldEveryK === 0) {
      await yieldToUI();
      // Re-check abort after yielding (the signal may have fired during the await).
      if (this.opts.signal?.aborted) {
        throw new RunAbortedError('aborted', ABORTED_MESSAGE);
      }
    }
  }

  /** Number of steps consumed so far (for diagnostics). */
  get stepCount(): number {
    return this.steps;
  }
}
