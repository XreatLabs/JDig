import { run } from './helpers';
import { runJava } from '../index';
import { findUnsupported } from '../parser/unsupported';

describe('AC5: unsupported-feature whitelist (fail fast, before run)', () => {
  it('rejects java.io.File reference before execution', () => {
    const src = `import java.io.File;
public class M { public static void main(String[] a){
  File f = new File("secret.txt");
} }`;
    expect(findUnsupported(src)?.label).toMatch(/File/);
  });

  it('runJava returns error reason (never throws) for java.io.File', async () => {
    const src = `import java.io.File;
public class M { public static void main(String[] a){
  File f = new File("secret.txt");
} }`;
    let output = '';
    const res = await runJava({
      source: src,
      onOutput: (t) => { output += t; },
      onInputRequest: () => {},
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('error');
    expect(output).toMatch(/not supported|File/i);
  });

  it('rejects networking references', () => {
    const src = `import java.net.Socket;
public class M { public static void main(String[] a){} }`;
    expect(findUnsupported(src)?.label).toMatch(/Networking/);
  });

  it('rejects System.exit', () => {
    const src = `public class M { public static void main(String[] a){ System.exit(0); } }`;
    expect(findUnsupported(src)?.label).toMatch(/System.exit/);
  });

  it('does not flag ordinary subset programs', () => {
    const src = `import java.util.Scanner;
public class M { public static void main(String[] a){ Scanner sc = new Scanner(System.in); int n = sc.nextInt(); } }`;
    expect(findUnsupported(src)).toBeNull();
  });
});

describe('AC4: infinite-loop step-budget kill', () => {
  it('while(true){} is killed by the step budget (no freeze)', async () => {
    const src = `public class M { public static void main(String[] a){
      while (true) { }
    } }`;
    let output = '';
    const start = Date.now();
    const res = await runJava({
      source: src,
      onOutput: (t) => { output += t; },
      onInputRequest: () => {},
      stepBudget: 50_000, // small for a fast test; real default is ~5e6
      wallClockMs: 5_000,
    });
    const elapsed = Date.now() - start;
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('budget');
    expect(output).toMatch(/timed out|too long/i);
    expect(elapsed).toBeLessThan(10_000);
  });

  it('a tight heavy loop is killed (not infinite but exhaustive)', async () => {
    const src = `public class M { public static void main(String[] a){
      long x = 0;
      while (true) { x = x + 1; }
    } }`;
    const res = await runJava({
      source: src,
      onOutput: () => {},
      onInputRequest: () => {},
      stepBudget: 100_000,
      wallClockMs: 5_000,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('budget');
  });
});

describe('AC4: output cap truncation', () => {
  it('truncates runaway output at the cap', async () => {
    const src = `public class M { public static void main(String[] a){
      int i = 0;
      while (i < 1000000) { System.out.println(i); i++; }
    } }`;
    let lines = 0;
    const res = await runJava({
      source: src,
      onOutput: () => { lines++; },
      onInputRequest: () => {},
      outputCapLines: 100,
      stepBudget: 5_000_000,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('output-cap');
    expect(lines).toBeLessThan(500);
  });
});

describe('Scanner-abort invariant (no read leak)', () => {
  it('abort while awaiting stdin rejects the pending read', async () => {
    const src = `import java.util.Scanner;
public class M { public static void main(String[] a){
  Scanner sc = new Scanner(System.in);
  int a = sc.nextInt();
  System.out.println(a);
} }`;
    const controller = new AbortController();
    let output = '';
    const runPromise = runJava({
      source: src,
      signal: controller.signal,
      onOutput: (t) => { output += t; },
      onInputRequest: () => {
        // user never provides input; abort shortly after.
        setTimeout(() => controller.abort(), 50);
      },
    });
    const res = await runPromise;
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('aborted');
    // No leaked pending read: the finally block rejects it; the run resolved.
    expect(output).toMatch(/stopped|aborted/i);
  });
});
