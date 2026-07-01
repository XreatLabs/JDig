/**
 * Bundled sample Java programs (AC2 language coverage + v1 templates scope).
 *
 * Each template stays strictly within the interpreter's supported subset:
 *   - core Java: variables, arithmetic, if/else, loops, methods, classes,
 *     constructors, 1-D arrays + .length, recursion, String methods;
 *   - java.util.Scanner and java.util.ArrayList;
 *   - NO java.io / java.net / System.exit / multi-dim array element access /
 *     generics-heavy or reflection code (denied or unsupported — see
 *     interpreter/parser/unsupported.ts).
 *
 * Templates are feedable into Project.create({ source }) and into runJava().
 */

export interface Template {
  /** Stable slug id. */
  id: string;
  /** Display name shown on the templates/new-project screen. */
  name: string;
  /** Java source text. */
  source: string;
}

const helloWorld: Template = {
  id: 'hello-world',
  name: 'Hello, World!',
  source: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}
`,
};

const variablesArithmetic: Template = {
  id: 'variables-arith',
  name: 'Variables & Arithmetic',
  source: `public class Main {
    public static void main(String[] args) {
        int a = 15;
        int b = 4;
        System.out.println("a + b = " + (a + b));
        System.out.println("a - b = " + (a - b));
        System.out.println("a * b = " + (a * b));
        System.out.println("a / b = " + (a / b));
        System.out.println("a % b = " + (a % b));
        double d = a / (b * 1.0);
        System.out.println("exact divide = " + d);
    }
}
`,
};

const ifElse: Template = {
  id: 'if-else',
  name: 'If / Else & Grading',
  source: `public class Main {
    public static void main(String[] args) {
        int score = 86;
        String grade;
        if (score >= 90) {
            grade = "A";
        } else if (score >= 80) {
            grade = "B";
        } else if (score >= 70) {
            grade = "C";
        } else if (score >= 60) {
            grade = "D";
        } else {
            grade = "F";
        }
        System.out.println("Score " + score + " -> grade " + grade);
    }
}
`,
};

const forLoop: Template = {
  id: 'for-loop',
  name: 'For Loop & FizzBuzz',
  source: `public class Main {
    public static void main(String[] args) {
        for (int i = 1; i <= 15; i++) {
            if (i % 15 == 0) {
                System.out.println("FizzBuzz");
            } else if (i % 3 == 0) {
                System.out.println("Fizz");
            } else if (i % 5 == 0) {
                System.out.println("Buzz");
            } else {
                System.out.println(i);
            }
        }
    }
}
`,
};

const whileLoop: Template = {
  id: 'while-loop',
  name: 'While Loop & Collatz',
  source: `public class Main {
    public static void main(String[] args) {
        int n = 27;
        int steps = 0;
        System.out.println("Starting at " + n);
        while (n > 1) {
            if (n % 2 == 0) {
                n = n / 2;
            } else {
                n = 3 * n + 1;
            }
            steps++;
        }
        System.out.println("Reached 1 in " + steps + " steps");
    }
}
`,
};

const methods: Template = {
  id: 'methods',
  name: 'Methods: GCD & LCM',
  source: `public class Main {
    static int gcd(int a, int b) {
        while (b != 0) {
            int t = b;
            b = a % b;
            a = t;
        }
        return a;
    }

    static int lcm(int a, int b) {
        return a * (b / gcd(a, b));
    }

    public static void main(String[] args) {
        System.out.println("gcd(24, 36) = " + gcd(24, 36));
        System.out.println("lcm(24, 36) = " + lcm(24, 36));
    }
}
`,
};

const classesConstructors: Template = {
  id: 'classes',
  name: 'Classes & Constructors',
  source: `public class Main {
    public static void main(String[] args) {
        Rectangle a = new Rectangle(3, 4);
        Rectangle b = new Rectangle(6, 8);
        System.out.println(a.describe());
        System.out.println(b.describe());
        System.out.println("total area = " + (a.area() + b.area()));
    }
}

class Rectangle {
    int width;
    int height;

    Rectangle(int w, int h) {
        this.width = w;
        this.height = h;
    }

    int area() {
        return this.width * this.height;
    }

    String describe() {
        return this.width + "x" + this.height + " rectangle, area = " + this.area();
    }
}
`,
};

const arrays: Template = {
  id: 'arrays',
  name: 'Arrays & Statistics',
  source: `public class Main {
    public static void main(String[] args) {
        int[] data = {5, 2, 9, 1, 7, 3};
        int sum = 0;
        int max = data[0];
        for (int i = 0; i < data.length; i++) {
            sum += data[i];
            if (data[i] > max) max = data[i];
        }
        double avg = sum / (data.length * 1.0);
        System.out.println("count = " + data.length);
        System.out.println("sum   = " + sum);
        System.out.println("max   = " + max);
        System.out.println("avg   = " + avg);
    }
}
`,
};

const recursion: Template = {
  id: 'recursion',
  name: 'Recursion: Factorial & Fibonacci',
  source: `public class Main {
    static int factorial(int n) {
        if (n <= 1) return 1;
        return n * factorial(n - 1);
    }

    static int fib(int n) {
        if (n < 2) return n;
        return fib(n - 1) + fib(n - 2);
    }

    public static void main(String[] args) {
        System.out.println("5! = " + factorial(5));
        System.out.println("fib(0..10):");
        for (int i = 0; i <= 10; i++) {
            System.out.print(fib(i) + " ");
        }
        System.out.println();
    }
}
`,
};

const arrayList: Template = {
  id: 'arraylist',
  name: 'ArrayList Basics',
  source: `import java.util.ArrayList;

public class Main {
    public static void main(String[] args) {
        ArrayList<Integer> nums = new ArrayList<>();
        nums.add(10);
        nums.add(20);
        nums.add(30);
        nums.add(40);

        int sum = 0;
        for (int i = 0; i < nums.size(); i++) {
            sum += nums.get(i);
        }
        System.out.println("size = " + nums.size());
        System.out.println("sum  = " + sum);

        nums.remove(0);
        System.out.println("after remove(0), first = " + nums.get(0));
        System.out.println("contains 30? " + nums.contains(30));
    }
}
`,
};

const scannerInteractive: Template = {
  id: 'scanner-interactive',
  name: 'Scanner: Interactive',
  source: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        System.out.println("What is your name?");
        String name = sc.nextLine();
        System.out.println("Enter a number to square:");
        int n = sc.nextInt();
        System.out.println("Hi " + name + "! " + n + "^2 = " + (n * n));
    }
}
`,
};

/** All bundled templates (AC2 coverage). Order = display order. */
export const TEMPLATES: readonly Template[] = [
  helloWorld,
  variablesArithmetic,
  ifElse,
  forLoop,
  whileLoop,
  methods,
  classesConstructors,
  arrays,
  recursion,
  arrayList,
  scannerInteractive,
];
