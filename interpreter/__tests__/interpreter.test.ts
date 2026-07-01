import { run } from './helpers';

describe('arithmetic', () => {
  it('evaluates basic integer arithmetic', async () => {
    const out = await run(`public class M { public static void main(String[] a){
      System.out.println(1 + 2 * 3);
      System.out.println(10 - 4 % 3);
      System.out.println(7 / 2);
      System.out.println(7.0 / 2);
    } }`);
    expect(out.output).toBe('7\n9\n3\n3.5\n');
  });

  it('respects precedence and parentheses', async () => {
    const out = await run(`public class M { public static void main(String[] a){
      System.out.println((1 + 2) * 3);
      System.out.println(2 + 3 < 4 * 5);
    } }`);
    expect(out.output).toBe('9\ntrue\n');
  });

  it('handles unary, bitwise, and logical ops', async () => {
    const out = await run(`public class M { public static void main(String[] a){
      System.out.println(-5 + 3);
      System.out.println(!false);
      System.out.println(1 << 3);
      System.out.println(5 & 3);
      System.out.println(true && false || true);
    } }`);
    expect(out.output).toBe('-2\ntrue\n8\n1\ntrue\n');
  });
});

describe('control flow', () => {
  it('if/else', async () => {
    const out = await run(`public class M { public static void main(String[] a){
      int x = 5;
      if (x > 3) System.out.println("big"); else System.out.println("small");
    } }`);
    expect(out.output).toBe('big\n');
  });

  it('while loop', async () => {
    const out = await run(`public class M { public static void main(String[] a){
      int i = 0; int sum = 0;
      while (i < 5) { sum += i; i++; }
      System.out.println(sum);
    } }`);
    expect(out.output).toBe('10\n');
  });

  it('classic for loop', async () => {
    const out = await run(`public class M { public static void main(String[] a){
      int p = 1;
      for (int i = 1; i <= 5; i++) p *= i;
      System.out.println(p);
    } }`);
    expect(out.output).toBe('120\n');
  });

  it('do-while loop', async () => {
    const out = await run(`public class M { public static void main(String[] a){
      int n = 0;
      do { n++; } while (n < 3);
      System.out.println(n);
    } }`);
    expect(out.output).toBe('3\n');
  });

  it('break and continue', async () => {
    const out = await run(`public class M { public static void main(String[] a){
      int s = 0;
      for (int i = 0; i < 10; i++) { if (i == 5) break; if (i % 2 == 0) continue; s += i; }
      System.out.println(s);
    } }`);
    expect(out.output).toBe('4\n');
  });
});

describe('classes and methods', () => {
  it('instance methods and fields', async () => {
    const out = await run(`public class M {
      int sq(int x) { return x * x; }
      public static void main(String[] a){
        M m = new M();
        System.out.println(m.sq(6));
      }
    }`);
    expect(out.output).toBe('36\n');
  });

  it('static methods', async () => {
    const out = await run(`public class M {
      static int add(int a, int b) { return a + b; }
      public static void main(String[] a){
        System.out.println(add(3, 4));
      }
    }`);
    expect(out.output).toBe('7\n');
  });

  it('constructor', async () => {
    const out = await run(`public class M {
      int v;
      M(int v) { this.v = v; }
      public static void main(String[] a){
        M m = new M(42);
        System.out.println(m.v);
      }
    }`);
    expect(out.output).toBe('42\n');
  });
});

describe('bare instance field resolution (no `this.` required)', () => {
  it('reads instance fields by bare name', async () => {
    const out = await run(`public class Rect {
      int width;
      int height;
      Rect(int w, int h) { width = w; height = h; }
      int area() { return width * height; }
      public static void main(String[] a){
        Rect r = new Rect(3, 4);
        System.out.println(r.area());
      }
    }`);
    expect(out.output).toBe('12\n');
  });

  it('assigns instance fields by bare name', async () => {
    const out = await run(`public class Counter {
      int count;
      void inc() { count = count + 1; }
      int get() { return count; }
      public static void main(String[] a){
        Counter c = new Counter();
        c.inc(); c.inc(); c.inc();
        System.out.println(c.get());
      }
    }`);
    expect(out.output).toBe('3\n');
  });

  it('a same-named param shadows the field (local wins; field still writable via this)', async () => {
    const out = await run(`public class Box {
      int value;
      Box(int value) { this.value = value; }
      int with(int value) { return value + this.value; }
      public static void main(String[] a){
        Box b = new Box(10);
        System.out.println(b.with(5));
      }
    }`);
    expect(out.output).toBe('15\n');
  });

  it('field initializer sees bare fields of a sibling declared earlier', async () => {
    const out = await run(`public class M {
      int base = 100;
      int scaled = base * 2;
      public static void main(String[] a){
        M m = new M();
        System.out.println(m.scaled);
      }
    }`);
    expect(out.output).toBe('200\n');
  });
});

describe('recursion', () => {
  it('factorial', async () => {
    const out = await run(`public class M {
      static int fact(int n) { return n <= 1 ? 1 : n * fact(n - 1); }
      public static void main(String[] a){ System.out.println(fact(5)); }
    }`);
    expect(out.output).toBe('120\n');
  });

  it('fibonacci', async () => {
    const out = await run(`public class M {
      static int fib(int n) { if (n < 2) return n; return fib(n-1) + fib(n-2); }
      public static void main(String[] a){ System.out.println(fib(10)); }
    }`);
    expect(out.output).toBe('55\n');
  });
});

describe('arrays', () => {
  it('sized array and indexed access', async () => {
    const out = await run(`public class M { public static void main(String[] a){
      int[] arr = new int[5];
      for (int i = 0; i < 5; i++) arr[i] = i * i;
      System.out.println(arr[3]);
      System.out.println(arr.length);
    } }`);
    expect(out.output).toBe('9\n5\n');
  });

  it('array initializer literal', async () => {
    const out = await run(`public class M { public static void main(String[] a){
      int[] x = {10, 20, 30};
      int s = 0;
      for (int i = 0; i < x.length; i++) s += x[i];
      System.out.println(s);
    } }`);
    expect(out.output).toBe('60\n');
  });

  it('enhanced for loop', async () => {
    const out = await run(`public class M { public static void main(String[] a){
      int[] x = {1, 2, 3, 4};
      int s = 0;
      for (int v : x) s += v;
      System.out.println(s);
    } }`);
    expect(out.output).toBe('10\n');
  });

  it('2-D array declaration length (creation; element access is a v1 stretch)', async () => {
    // Multi-dimensional arrays are out of scope for v1; we only assert that the
    // outer dimension's length is reported correctly.
    const out = await run(`public class M { public static void main(String[] a){
      int[][] g = new int[2][2];
      System.out.println(g.length);
    } }`);
    expect(out.output).toBe('2\n');
  });
});

describe('ArrayList', () => {
  it('add, get, size, remove', async () => {
    const out = await run(`import java.util.ArrayList;
public class M { public static void main(String[] a){
  ArrayList<Integer> list = new ArrayList<>();
  list.add(10); list.add(20); list.add(30);
  System.out.println(list.size());
  System.out.println(list.get(1));
  list.remove(1);
  System.out.println(list.size());
} }`);
    expect(out.output).toBe('3\n20\n2\n');
  });

  it('contains and indexOf', async () => {
    const out = await run(`import java.util.ArrayList;
public class M { public static void main(String[] a){
  ArrayList<String> l = new ArrayList<>();
  l.add("a"); l.add("b");
  System.out.println(l.contains("b"));
  System.out.println(l.indexOf("a"));
} }`);
    expect(out.output).toBe('true\n0\n');
  });
});

describe('Scanner (interactive stdin)', () => {
  it('reads an int and prints its square (AC1)', async () => {
    const out = await run(
      `import java.util.Scanner;
public class M { public static void main(String[] a){
  Scanner sc = new Scanner(System.in);
  int n = sc.nextInt();
  System.out.println(n * n);
} }`,
      ['7'],
    );
    expect(out.output).toBe('49\n');
    expect(out.inputs).toEqual(['7']);
  });

  it('reads multiple lines with nextLine', async () => {
    const out = await run(
      `import java.util.Scanner;
public class M { public static void main(String[] a){
  Scanner sc = new Scanner(System.in);
  String a1 = sc.nextLine();
  String a2 = sc.nextLine();
  System.out.println(a1 + "-" + a2);
} }`,
      ['hello', 'world'],
    );
    expect(out.output).toBe('hello-world\n');
  });

  it('REC1 proof: int x = sc.nextInt() + sc.nextInt() (Architect REC1)', async () => {
    // Correctness invariant: the two reads must happen in order, left then
    // right, because every sub-evaluation is awaited. If they were evaluated
    // out of order or concurrently the inputs would be mis-assigned.
    const out = await run(
      `import java.util.Scanner;
public class M { public static void main(String[] a){
  Scanner sc = new Scanner(System.in);
  int x = sc.nextInt() + sc.nextInt();
  System.out.println(x);
} }`,
      ['3', '4'],
    );
    expect(out.output).toBe('7\n');
    expect(out.inputs).toEqual(['3', '4']); // left first, then right
  });
});

describe('String operations', () => {
  it('length, charAt, substring, equals', async () => {
    const out = await run(`public class M { public static void main(String[] a){
      String s = "hello";
      System.out.println(s.length());
      System.out.println(s.charAt(1));
      System.out.println(s.substring(1, 3));
      System.out.println(s.equals("hello"));
      System.out.println(s.toUpperCase());
    } }`);
    expect(out.output).toBe('5\ne\nel\ntrue\nHELLO\n');
  });

  it('concatenation with mixed types', async () => {
    const out = await run(`public class M { public static void main(String[] a){
      int x = 5;
      System.out.println("x=" + x + ", x*2=" + (x*2));
    } }`);
    expect(out.output).toBe('x=5, x*2=10\n');
  });
});
