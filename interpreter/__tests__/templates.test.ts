/**
 * AC2 sanity check: every bundled template parses + runs within the supported
 * subset (no UnsupportedFeatureError, no runtime crash). Interactive templates
 * supply canned stdin. Output is asserted non-empty where deterministic.
 */
import { run } from './helpers';
import { TEMPLATES } from '../../data/templates';

const INTERACTIVE = new Set(['scanner-interactive']);

describe('bundled templates run within the supported subset (AC2)', () => {
  for (const t of TEMPLATES) {
    it(`${t.name} (${t.id}) runs`, async () => {
      const inputs = INTERACTIVE.has(t.id) ? ['Ada', '7'] : [];
      const res = await run(t.source, inputs);
      expect(res.result.ok).toBe(true);
      expect(res.output.length).toBeGreaterThan(0);
    });
  }

  it('recursion template prints correct factorial + fib sequence', async () => {
    const tmpl = TEMPLATES.find((t) => t.id === 'recursion')!;
    const res = await run(tmpl.source);
    expect(res.output).toContain('5! = 120');
    expect(res.output).toContain('0 1 1 2 3 5 8 13 21 34 55');
  });

  it('scanner-interactive reads name + number and squares it', async () => {
    const tmpl = TEMPLATES.find((t) => t.id === 'scanner-interactive')!;
    const res = await run(tmpl.source, ['Grace', '9']);
    expect(res.output).toContain('Hi Grace! 9^2 = 81');
  });
});
