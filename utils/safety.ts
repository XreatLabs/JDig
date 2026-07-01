/**
 * Execution safety constants for the JDig interpreter.
 *
 * These bound runaway student programs so the UI thread is never frozen
 * (Principle 2, AC4). All values are CALIBRATABLE — they live here as
 * constants so Phase 6 on-device profiling can tune them without touching the
 * engine.
 */

/**
 * Step budget: the maximum number of interpreter "steps" (one eval/exec node)
 * before a program is killed as "took too long". Calibrated to roughly 5s on a
 * mid-range Android device during Phase 6 step 9. Until then, a generous
 * default that still trips quickly on true infinite loops.
 *
 * A tight arithmetic loop does ~1e6 steps/sec on a mid-range phone; 5e6 ≈ 5s.
 */
export const STEP_BUDGET = 5_000_000;

/**
 * Hard wall-clock backstop (ms). Even if step accounting somehow stalls (a
 * single expensive native op, or a host shim that blocks), this is the
 * absolute ceiling before the run is aborted.
 */
export const WALL_CLOCK_BACKSTOP_MS = 60_000;

/**
 * Output cap: maximum lines emitted to the console before output is truncated.
 * Protects memory + scrollback (AC4). ~10k lines.
 */
export const OUTPUT_CAP_LINES = 10_000;

/**
 * Cooperative-yield granularity: the interpreter awaits a yield microtask
 * every K steps. K is small enough that the JS thread yields to the UI
 * regularly (so Stop aborts within ~500ms, AC4) and large enough that yield
 * overhead is negligible. Initial K from the plan; tuned during calibration.
 */
export const YIELD_EVERY_K_STEPS = 1_000;

/** Default options block for runJava when callers omit budget. */
export interface BudgetOptions {
  stepBudget?: number;
  wallClockMs?: number;
  outputCapLines?: number;
  yieldEveryK?: number;
}

export const DEFAULT_BUDGET: Required<BudgetOptions> = {
  stepBudget: STEP_BUDGET,
  wallClockMs: WALL_CLOCK_BACKSTOP_MS,
  outputCapLines: OUTPUT_CAP_LINES,
  yieldEveryK: YIELD_EVERY_K_STEPS,
};

/** Human-facing message when a run exceeds its step or wall-clock budget. */
export const BUDGET_EXCEEDED_MESSAGE =
  'Program took too long to run and was stopped (execution timed out). Check for infinite loops.';

/** Human-facing message when a run is aborted by the user (Stop). */
export const ABORTED_MESSAGE = 'Program was stopped.';
