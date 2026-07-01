/**
 * Run store — the interactive console + run lifecycle (Phase 3, step 17).
 *
 * Owns the output buffer (stdout/stderr lines, scrollback-capped) and the
 * current run's AbortController. `run(source)` drives `runJava` from
 * interpreter/index.ts; `submitInput(line)` resolves a pending Scanner read;
 * `stop()` aborts.
 *
 * Scanner-abort invariant (AC4, Critic gap): on `stop()` OR when the running
 * screen unmounts (`dispose()`), the AbortController is aborted AND any pending
 * stdin Promise is rejected so no read leaks. The interpreter's JScanner wires
 * the signal to a reject listener (RunAbortedError on abort); we additionally
 * reject defensively via the stored resolver in case the run finished before
 * the signal propagated. See interpreter/runtime/JScanner.ts.
 */

import { create } from 'zustand';
import { runJava } from '@/interpreter';
import type { RunJavaResult, InputRequest } from '@/interpreter';

/** Maximum number of lines kept in the output buffer for scrollback. */
const SCROLLBACK_CAP = 2000;

export type RunState =
  | 'idle'
  | 'running'
  | 'waiting-input'
  | 'done'
  | 'error';

export interface OutputLine {
  id: number;
  text: string;
  stream: 'stdout' | 'stderr';
}

interface PendingInput {
  req: InputRequest;
}

export interface RunStore {
  /** Current lifecycle phase. */
  state: RunState;
  /** Output buffer (stdout + stderr interleaved, scrollback-capped). */
  lines: OutputLine[];
  /** Last finished run's summary, if any. */
  result: RunJavaResult | null;
  /** Active run's AbortController (one per run; null when idle). */
  controller: AbortController | null;
  /** Pending stdin request being awaited by the interpreter. */
  pending: PendingInput | null;
  /** Friendly prompt for the pending request. */
  inputPrompt: string | null;

  /** Start a new run with the given source. Replaces any prior output. */
  run: (source: string) => Promise<void>;
  /** Resolve the pending stdin request with one line of user input. */
  submitInput: (line: string) => void;
  /** Abort the active run. Rejects any pending stdin read (no leak). */
  stop: () => void;
  /**
   * Teardown hook for screen unmount. Aborts the run and clears references so
   * no read leaks and no setState lands on an unmounted consumer.
   */
  dispose: () => void;
  /** Clear the output buffer and reset to idle. */
  clear: () => void;
}

let lineSeq = 0;

/** Push a line, trimming the head of the buffer once over the scrollback cap. */
function pushLine(lines: OutputLine[], text: string, stream: 'stdout' | 'stderr'): OutputLine[] {
  // `runJava` emits text that already includes newlines; split into display
  // lines so the FlatList can render each row.
  const chunks = text.split('\n');
  // Drop a trailing empty segment produced by a final newline.
  if (chunks.length > 1 && chunks[chunks.length - 1] === '') chunks.pop();
  const next = [...lines];
  for (const c of chunks) {
    next.push({ id: lineSeq++, text: c, stream });
  }
  if (next.length > SCROLLBACK_CAP) {
    return next.slice(next.length - SCROLLBACK_CAP);
  }
  return next;
}

export const useRunStore = create<RunStore>((set, get) => ({
  state: 'idle',
  lines: [],
  result: null,
  controller: null,
  pending: null,
  inputPrompt: null,

  run: async (source: string) => {
    // If a run is somehow already active, abort it cleanly before starting.
    if (get().state === 'running' || get().state === 'waiting-input') {
      get().stop();
    }

    const controller = new AbortController();
    set({
      state: 'running',
      lines: [],
      result: null,
      controller,
      pending: null,
      inputPrompt: null,
    });

    const result = await runJava({
      source,
      signal: controller.signal,
      onOutput: (text, stream) => {
        set((s) => ({ lines: pushLine(s.lines, text, stream) }));
      },
      onInputRequest: (req) => {
        // The interpreter is blocked on a Scanner read. Store the resolver and
        // surface the prompt so the ConsoleInput UI can collect a line.
        set({ state: 'waiting-input', pending: { req }, inputPrompt: req.prompt });
      },
    });

    // If the run was aborted/stopped while we were awaiting, do not overwrite a
    // disposed state. Guard by checking the controller is still the active one.
    if (get().controller !== controller) return;

    set({
      state: result.ok ? 'done' : result.reason === 'aborted' ? 'done' : 'error',
      result,
      pending: null,
      inputPrompt: null,
      controller: null,
    });
  },

  submitInput: (line: string) => {
    const { pending } = get();
    if (!pending) return;
    // Resolve the Scanner read; the interpreter resumes from `readLine`.
    pending.req.resolve(line);
    set({ pending: null, inputPrompt: null, state: 'running' });
  },

  stop: () => {
    const { controller, pending } = get();
    // Abort the cooperative run — JScanner's abort listener rejects the pending
    // read with RunAbortedError (no leak). We also reject defensively in case
    // the interpreter hasn't wired the signal path for this read yet.
    if (controller) {
      controller.abort();
    }
    if (pending) {
      pending.req.reject(new Error('Program was stopped.'));
    }
    // Settle to 'done' immediately so the badge doesn't flash "Running" while
    // the aborted run unwinds; the in-flight runJava promise still resolves via
    // the controller guard below and sets result.reason='aborted'.
    set({ pending: null, inputPrompt: null, state: 'done' });
  },

  dispose: () => {
    const { controller, pending } = get();
    if (controller) controller.abort();
    if (pending) pending.req.reject(new Error('Console unmounted.'));
    set({
      controller: null,
      pending: null,
      inputPrompt: null,
      state: 'idle',
    });
  },

  clear: () => {
    set({ lines: [], result: null, state: 'idle' });
  },
}));
