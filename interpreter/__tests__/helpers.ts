/**
 * Shared test harness: run a Java source string and collect output / answer
 * stdin requests deterministically.
 */
import { runJava, type InputRequest } from '../index';

export interface RunResult {
  output: string;
  result: Awaited<ReturnType<typeof runJava>>;
  inputs: string[];
}

/**
 * Run `source`. If `inputs` is provided, each Scanner read auto-resolves to
 * the next input in order (so tests are deterministic without UI).
 */
export async function run(
  source: string,
  inputs: string[] = [],
  opts: { stepBudget?: number; signal?: AbortSignal } = {},
): Promise<RunResult> {
  let output = '';
  let inputIdx = 0;
  const pending: InputRequest[] = [];
  const inputsUsed: string[] = [];

  const res = await runJava({
    source,
    onOutput: (t) => { output += t; },
    onInputRequest: (req) => {
      if (inputIdx < inputs.length) {
        const v = inputs[inputIdx++];
        inputsUsed.push(v);
        req.resolve(v);
      } else {
        // No more input: stash so the test can inspect / resolve. Auto-reject
        // to avoid hanging, but we keep the promise pending-reject path tested
        // elsewhere; here we just store.
        pending.push(req);
      }
    },
    signal: opts.signal,
    stepBudget: opts.stepBudget ?? 2_000_000,
  });

  return { output, result: res, inputs: inputsUsed };
}
