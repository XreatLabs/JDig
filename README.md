# JDig

An **offline Java compiler + code editor for Android**, built for students. Write Java, run it with a real interactive console (output *and* line-by-line input), and manage multiple projects — all on-device, no internet required.

JDig runs a **core-Java subset** (variables, loops, conditionals, methods, classes, arrays, recursion, and basic `java.util` like `Scanner` and `ArrayList`) via a custom **pure-TypeScript interpreter** that lives entirely inside the app. No cloud, no JVM bundled — it just works offline.

> An open-source project by [XreatLabs](https://github.com/XreatLabs).

## Features

- **Code editor** — Java syntax highlighting, auto-indent, find & replace, line numbers, undo/redo (CodeMirror 6 in an offline WebView).
- **Real console** — displays `System.out`/`System.err` and accepts **interactive line-by-line stdin** (e.g. `Scanner.nextInt()`), so input-driven programs work like a real terminal.
- **Projects** — create, open, rename, delete, and autosave multiple programs; code is persisted on-device and survives app restarts.
- **Templates** — 10+ bundled sample programs covering loops, classes, arrays, recursion, `ArrayList`, and `Scanner`.
- **Safe by design** — student code is sandboxed (no filesystem or network access); infinite loops are killed by a step-budget watchdog (~5 s); output is capped.
- **Fully offline** — the run path makes zero network calls.

## Tech stack

- **React Native + Expo** (managed workflow → EAS development build), TypeScript, Expo Router.
- **Interpreter** — `java-parser` (CST) → normalizer (AST) → async, cooperative-yielding tree-walking evaluator with a step-budget watchdog. Expression-level async so interactive stdin works without freezing the UI.
- **Editor** — CodeMirror 6 bundled offline (esbuild → inlined HTML), configured for Android (native IME cursor preserved).
- **Persistence** — `expo-file-system` with atomic writes (`projects.json`).
- **State** — Zustand.

## Project structure

```
app/                 # Expo Router screens (Projects + Editor tabs)
  (tabs)/
    projects.tsx     # project list, new/template/delete
    editor.tsx       # editor + console + run/stop orchestration
  _layout.tsx        # root layout, hydrates store
components/
  editor/            # CodeEditor (WebView + CodeMirror 6)
  console/           # Console + ConsoleInput (interactive stdin)
  ui/                # Button / Badge primitives
interpreter/
  parser/            # parse (CST) → normalize (AST) → unsupported whitelist
  engine/            # async tree-walker + Environment + scheduler
  runtime/           # JSystem, JScanner, JMath, JString, JArrayList, JArrays, bindings
  index.ts           # runJava({ source, onOutput, onInputRequest, signal, budget })
store/               # projectsStore, runStore, persist/ (atomic)
data/templates.ts    # bundled sample programs
theme/tokens.ts      # single default theme
utils/safety.ts      # step budget, output cap, wall-clock backstop
```

## Build & run

JDig targets Android and is built in the cloud with **EAS Build** (no local Android SDK required).

```bash
# install deps
npm install

# generate the offline CodeMirror bundle (also runs automatically if needed)
npm run build:editor

# type-check and run the interpreter/test suite
npx tsc --noEmit
npm test

# build an Android APK via EAS (cloud) — requires `eas login` first
eas build -p android --profile preview
```

For development, use an Expo **development build** (the app uses native modules that are not in Expo Go):

```bash
eas build -p android --profile development
# or, to run a dev client during iteration:
npx expo start --dev-client
```

## Supported Java subset & limitations

**Supported:** primitives (`int`, `double`, `boolean`, `char`, `String`), arithmetic & logic, `if/else`, `while`, `for`, enhanced-for, `break/continue`, methods, classes, constructors, fields (access with or without `this.`), arrays, recursion, `ArrayList`, `Scanner` (interactive), `Math`, `Arrays`, and common `String` operations.

**Not supported (v1):** GUI programs (Swing/JavaFX/AWT), the full JDK standard library beyond the subset, multi-dimensional array element access (`int[][]` element ops), threads, file/network I/O, and generics-heavy code. Out-of-subset constructs fail fast with a student-friendly error before execution.

**Known v1 behavior:** a heavy but legal loop may hit the ~5 s step budget because of async-interpreter overhead (reported as "execution timed out"), not because it's infinite.

## Testing

The interpreter has a jest suite covering arithmetic, control flow, classes, recursion, arrays, `ArrayList`, interactive `Scanner`, the safety limits (infinite-loop kill, output cap), the sandbox whitelist, and the run gate (HelloWorld + interactive square). Run with `npm test`.

## License

[MIT](LICENSE) © 2026 XreatLabs
