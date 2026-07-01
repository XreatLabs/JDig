/**
 * Phase-1 GATE harness: explicitly demonstrates AC1 (core run: HelloWorld +
 * Scanner-interactive square) and AC4 (safety: infinite-loop step-budget kill,
 * output cap, no freeze) on a stub editor / node-side path.
 *
 * These mirror the acceptance criteria the plan requires before Phase 2 begins.
 */
import { runJava } from '../index';

describe('GATE — AC1 core run', () => {
  it('HelloWorld prints "Hello, World!"', async () => {
    let out = '';
    const res = await runJava({
      source: `public class Main { public static void main(String[] args) { System.out.println("Hello, World!"); } }`,
      onOutput: (t) => { out += t; },
      onInputRequest: () => {},
    });
    expect(res.ok).toBe(true);
    expect(out).toBe('Hello, World!\n');
  });

  it('Scanner reads an int interactively and prints its square', async () => {
    let out = '';
    const res = await runJava({
      source: `import java.util.Scanner;
public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    int n = sc.nextInt();
    System.out.println(n * n);
  }
}`,
      onOutput: (t) => { out += t; },
      onInputRequest: (req) => { req.resolve('9'); },
    });
    expect(res.ok).toBe(true);
    expect(out).toBe('81\n');
  });
});

describe('GATE — AC4 safety', () => {
  it('while(true){} is killed within the step budget (~5s calibrated; fast here)', async () => {
    const start = Date.now();
    const res = await runJava({
      source: `public class Main { public static void main(String[] args) { while (true) { } } }`,
      onOutput: () => {},
      onInputRequest: () => {},
      stepBudget: 100_000,
      wallClockMs: 5_000,
    });
    const elapsed = Date.now() - start;
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('budget');
    expect(elapsed).toBeLessThan(10_000);
  });

  it('flood output is capped (~10k lines) and the run reports output-cap', async () => {
    let lines = 0;
    const res = await runJava({
      source: `public class Main { public static void main(String[] args) { int i = 0; while (i < 1000000) { System.out.println(i); i++; } } }`,
      onOutput: () => { lines++; },
      onInputRequest: () => {},
      outputCapLines: 100,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('output-cap');
    expect(lines).toBeLessThan(500);
  });
});
