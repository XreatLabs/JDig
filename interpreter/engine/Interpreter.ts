/**
 * Async tree-walking interpreter for the JDig Java subset.
 *
 * CRITICAL INVARIANT (ADR, Architect REC1): `evalExpression()` and
 * `execStatement()` are BOTH `async`, and EVERY sub-evaluation is `await`ed.
 * This is a correctness requirement, not a perf choice: it makes
 * `int x = sc.nextInt() + sc.nextInt()` evaluate the left `nextInt()` (which
 * awaits user input), THEN the right `nextInt()` (a second input), and only
 * then add them. A synchronous or non-awaited evaluation would read both
 * prompts at the wrong time. See the REC1 test case.
 *
 * The scheduler is ticked on every node so the run cooperatively yields to the
 * UI and can be aborted (Stop) within ~500ms (AC4).
 */

import { Environment } from './Environment';
import { Scheduler, RunAbortedError } from './scheduler';
import type {
  AssignmentExpressionNode, BinaryExpressionNode, BinaryOperator,
  ClassDeclarationNode, ExpressionNode, FieldDeclarationNode,
  LocalVarDeclarationNode, MethodDeclarationNode, ParameterNode, ProgramNode,
  StatementNode,
} from '../parser/nodes';
import type {
  JArrayListValue, JArrayValue, JCallable, JObject, Value,
} from '../types';
import { VOID } from '../types';
import { asHostNamespace } from '../runtime/bindings';
import { JStringMethods } from '../runtime/JString';
import { JArrayListMethods } from '../runtime/JArrayList';
import { javaToString, toInt } from '../runtime/JSystem';

/** Control-flow signals used to unwind the CFA out of nested calls/blocks. */
class ReturnSignal { constructor(public value: Value) {} }
class BreakSignal {}
class ContinueSignal {}

/**
 * Static check: does this expression node represent a floating-point value?
 * Used to decide int-vs-double arithmetic (Java widening). Conservative —
 * variables/fields holding doubles are not detected here (acceptable v1
 * approximation; the common case `7.0 / 2` and `(double)x` are covered).
 */
function isDoubleNode(node: ExpressionNode): boolean {
  switch (node.type) {
    case 'DoubleLiteral':
      return true;
    case 'Cast':
      return node.targetType === 'double' || node.targetType === 'float' || node.targetType === 'Double' || node.targetType === 'Float';
    case 'Paren':
      return isDoubleNode(node.expression);
    case 'UnaryExpression':
      return isDoubleNode(node.operand);
    default:
      return false;
  }
}

export class RuntimeError extends Error {
  constructor(message: string) { super(message); this.name = 'RuntimeError'; }
}

export interface InterpreterOptions {
  scheduler: Scheduler;
  /** Global scope carrying host bindings (System, Math, Scanner, ...). */
  globalEnv?: Environment;
}

export class Interpreter {
  private readonly program: ProgramNode;
  private readonly classTable = new Map<string, ClassDeclarationNode>();
  private readonly scheduler: Scheduler;
  private readonly globalEnv?: Environment;

  constructor(program: ProgramNode, opts: InterpreterOptions) {
    this.program = program;
    this.scheduler = opts.scheduler;
    this.globalEnv = opts.globalEnv;
    for (const c of program.classes) this.classTable.set(c.name, c);
  }

  /** Run main([String[] args]) of the main class. */
  async run(): Promise<void> {
    const mainClass = this.program.mainClass ?? this.program.classes[0];
    if (!mainClass) throw new RuntimeError('No class to run.');
    const main = mainClass.methods.find(m => m.isStatic && m.name === 'main');
    if (!main) throw new RuntimeError(`No main method in class ${mainClass.name}.`);
    // class env is a child of the global env so host bindings (System, Math...)
    // resolve through the scope chain.
    const classEnv = new Environment(this.globalEnv ?? null, mainClass.name);
    await this.initStaticFields(mainClass, classEnv);
    // args = empty String array
    const argsValue: Value = { __array: true, elements: [], elementType: 'String' };
    await this.invokeMethod(mainClass, main, null, [argsValue], classEnv);
  }

  private async initStaticFields(cls: ClassDeclarationNode, env: Environment): Promise<void> {
    for (const f of cls.fields) {
      if (!f.isStatic) continue;
      const v = f.initializer ? await this.evalExpression(f.initializer, env) : this.defaultValue(f.javaType);
      env.define(f.name, v);
    }
  }

  private async initInstanceFields(cls: ClassDeclarationNode, obj: JObject, env: Environment): Promise<void> {
    for (const f of cls.fields) {
      if (f.isStatic) continue;
      const v = f.initializer ? await this.evalExpression(f.initializer, env) : this.defaultValue(f.javaType);
      obj.fields.set(f.name, v);
    }
  }

  /** Default zero/false/null for a Java type. */
  private defaultValue(javaType: string): Value {
    if (javaType === 'int' || javaType === 'long' || javaType === 'short' || javaType === 'byte') return 0;
    if (javaType === 'double' || javaType === 'float') return 0;
    if (javaType === 'boolean') return false;
    if (javaType === 'char') return '\0';
    return null;
  }

  // ---------------- statements ----------------

  async execStatement(stmt: StatementNode, env: Environment): Promise<void> {
    await this.scheduler.tick();

    switch (stmt.type) {
      case 'Block': {
        const blockEnv = env.push();
        for (const s of stmt.statements) {
          await this.execStatement(s, blockEnv);
        }
        return;
      }
      case 'LocalVarDeclaration': {
        return this.execLocalVar(stmt as LocalVarDeclarationNode, env);
      }
      case 'If': {
        const test = await this.evalExpression(stmt.test, env);
        if (this.truthy(test)) await this.execStatement(stmt.consequent, env);
        else if (stmt.alternate) await this.execStatement(stmt.alternate, env);
        return;
      }
      case 'While': {
        while (true) {
          const test = await this.evalExpression(stmt.test, env);
          if (!this.truthy(test)) break;
          try {
            await this.execStatement(stmt.body, env);
          } catch (e) {
            if (e instanceof BreakSignal) break;
            if (e instanceof ContinueSignal) continue;
            throw e;
          }
        }
        return;
      }
      case 'DoWhile': {
        do {
          try {
            await this.execStatement(stmt.body, env);
          } catch (e) {
            if (e instanceof BreakSignal) break;
            if (e instanceof ContinueSignal) { /* fallthrough to test */ }
            else throw e;
          }
        } while (this.truthy(await this.evalExpression(stmt.test, env)));
        return;
      }
      case 'For': {
        const forEnv = env.push();
        if (stmt.initializer) await this.execStatement(stmt.initializer, forEnv);
        while (true) {
          if (stmt.test) {
            const t = await this.evalExpression(stmt.test, forEnv);
            if (!this.truthy(t)) break;
          }
          try {
            await this.execStatement(stmt.body, forEnv);
          } catch (e) {
            if (e instanceof BreakSignal) break;
            if (e instanceof ContinueSignal) { /* fallthrough to update */ }
            else throw e;
          }
          if (stmt.update) await this.evalExpression(stmt.update, forEnv);
        }
        return;
      }
      case 'Return': {
        const v = stmt.value ? await this.evalExpression(stmt.value, env) : VOID;
        throw new ReturnSignal(v);
      }
      case 'Break': throw new BreakSignal();
      case 'Continue': throw new ContinueSignal();
      case 'ExpressionStatement': {
        await this.evalExpression(stmt.expression, env);
        return;
      }
      case 'Print': {
        const arg = stmt.arg ? await this.evalExpression(stmt.arg, env) : null;
        const text = arg === null && stmt.variant === 'println' ? '' : javaToString(arg as Value);
        const line = stmt.variant === 'println' ? text + '\n' : text;
        this.emitRaw(line);
        return;
      }
      default:
        // exhaustive guard
        return;
    }
  }

  private async execLocalVar(stmt: LocalVarDeclarationNode, env: Environment): Promise<void> {
    if (stmt.initializer) {
      const v = await this.evalExpression(stmt.initializer, env);
      env.define(stmt.name, this.coerce(v, stmt.javaType));
    } else {
      env.define(stmt.name, this.defaultValue(stmt.javaType));
    }
  }

  /** Route text to the emitter via a side channel set by runJava. */
  private emitRaw(_text: string): void {
    // emitter is injected via the scheduler's deps; we keep a module-level hook.
    if (EMITTER_HOOK.value) EMITTER_HOOK.value(_text);
  }

  // ---------------- expressions ----------------

  async evalExpression(node: ExpressionNode, env: Environment): Promise<Value> {
    await this.scheduler.tick();

    switch (node.type) {
      case 'IntegerLiteral':
      case 'LongLiteral':
      case 'DoubleLiteral':
        return node.value;
      case 'BooleanLiteral':
        return node.value;
      case 'CharLiteral':
      case 'StringLiteral':
        return node.value;
      case 'NullLiteral':
        return null;
      case 'Identifier':
        return this.evalIdentifier(node.name, env);
      case 'This':
        return this.evalIdentifier('this', env);
      case 'Paren':
        return this.evalExpression(node.expression, env);
      case 'BinaryExpression':
        return this.evalBinary(node as BinaryExpressionNode, env);
      case 'UnaryExpression':
        return this.evalUnary(node.operator, await this.evalExpression(node.operand, env));
      case 'PreIncrement': {
        const cur = await this.evalExpression(node.operand, env);
        const next = (typeof cur === 'number' ? cur : 0) + (node.operator === '++' ? 1 : -1);
        await this.assignTo(node.operand, next, env);
        return next;
      }
      case 'Postfix': {
        const cur = await this.evalExpression(node.operand, env);
        const next = (typeof cur === 'number' ? cur : 0) + (node.operator === '++' ? 1 : -1);
        await this.assignTo(node.operand, next, env);
        return cur as Value;
      }
      case 'Assignment':
        return this.evalAssignment(node as AssignmentExpressionNode, env);
      case 'Ternary': {
        const t = await this.evalExpression(node.test, env);
        return this.truthy(t) ? this.evalExpression(node.consequent, env) : this.evalExpression(node.alternate, env);
      }
      case 'Cast':
        return this.coerce(await this.evalExpression(node.expression, env), node.targetType);
      case 'ArrayLiteral':
        return { __array: true, elements: await this.evalAll(node.elements, env), elementType: 'Object' };
      case 'NewArray':
        return this.evalNewArray(node, env);
      case 'NewObject':
        return this.evalNewObject(node.className, node.args, env);
      case 'ArrayAccess': {
        const arr = await this.evalExpression(node.array, env);
        const idx = await this.evalExpression(node.index, env);
        return this.arrayGet(arr, idx);
      }
      case 'FieldAccess':
        return this.evalFieldAccess(node, env);
      case 'MethodInvocation':
        return this.evalMethodInvocation(node, env);
      default:
        return null;
    }
  }

  private async evalAll(nodes: ExpressionNode[], env: Environment): Promise<Value[]> {
    const out: Value[] = [];
    for (const n of nodes) out.push(await this.evalExpression(n, env));
    return out;
  }

  private evalIdentifier(name: string, env: Environment): Value {
    // host namespace shortcut (System, Math, etc.) lives in global scope.
    const v = env.get(name);
    if (v !== undefined) return v;
    // could be a class name (for static access) or a host constructor
    if (this.classTable.has(name)) return this.classTable.get(name) as unknown as Value;
    throw new RuntimeError(`Cannot find symbol: ${name}`);
  }

  private async evalBinary(node: BinaryExpressionNode, env: Environment): Promise<Value> {
    const op = node.operator;
    // short-circuit
    if (op === '&&') {
      const l = await this.evalExpression(node.left, env);
      if (!this.truthy(l)) return false;
      return this.truthy(await this.evalExpression(node.right, env));
    }
    if (op === '||') {
      const l = await this.evalExpression(node.left, env);
      if (this.truthy(l)) return true;
      return this.truthy(await this.evalExpression(node.right, env));
    }
    // MANDATORY: await left, then await right (REC1 correctness).
    const left = await this.evalExpression(node.left, env);
    const right = await this.evalExpression(node.right, env);
    // Floating-point context: if either operand NODE is a double literal or a
    // cast to double, the result is double (Java widening). We can't recover
    // this from the Values alone (7.0 === 7 in JS), so we read it from nodes.
    const forceDouble = isDoubleNode(node.left) || isDoubleNode(node.right);
    return this.applyBinary(op, left, right, forceDouble);
  }

  private applyBinary(op: BinaryOperator, l: Value, r: Value, forceDouble = false): Value {
    // String concatenation for '+'
    if (op === '+' && (typeof l === 'string' || typeof r === 'string')) {
      return javaToString(l) + javaToString(r);
    }
    const ln = typeof l === 'number' ? l : NaN;
    const rn = typeof r === 'number' ? r : NaN;
    const bothInt = !forceDouble && this.isIntegral(l) && this.isIntegral(r);
    switch (op) {
      case '+': return bothInt ? (Math.trunc(ln + rn) | 0) : ln + rn;
      case '-': return bothInt ? (Math.trunc(ln - rn) | 0) : ln - rn;
      case '*': return bothInt ? (Math.trunc(ln * rn) | 0) : ln * rn;
      case '/':
        if (bothInt) {
          if (rn === 0) throw new RuntimeError('ArithmeticException: / by zero');
          return Math.trunc(ln / rn) | 0;
        }
        return ln / rn;
      case '%':
        if (rn === 0) throw new RuntimeError('ArithmeticException: / by zero');
        return bothInt ? (Math.trunc(ln) % Math.trunc(rn)) : ln % rn;
      case '<': return ln < rn;
      case '<=': return ln <= rn;
      case '>': return ln > rn;
      case '>=': return ln >= rn;
      case '==': return this.javaEquals(l, r);
      case '!=': return !this.javaEquals(l, r);
      case '&': return (typeof l === 'boolean' && typeof r === 'boolean') ? (l && r) : (toInt(l) & toInt(r));
      case '|': return (typeof l === 'boolean' && typeof r === 'boolean') ? (l || r) : (toInt(l) | toInt(r));
      case '^': return (typeof l === 'boolean' && typeof r === 'boolean') ? (l !== r) : (toInt(l) ^ toInt(r));
      case '<<': return toInt(l) << toInt(r);
      case '>>': return toInt(l) >> toInt(r);
      default: throw new RuntimeError(`Unsupported operator: ${op}`);
    }
  }

  private isIntegral(v: Value): boolean {
    return typeof v === 'number' && Number.isInteger(v);
  }


  private javaEquals(l: Value, r: Value): boolean {
    if (typeof l === 'string' || typeof r === 'string') return String(l) === String(r);
    if (typeof l === 'number' && typeof r === 'number') return l === r;
    return l === r;
  }

  private evalUnary(op: '-' | '+' | '!' | '~', v: Value): Value {
    switch (op) {
      case '-': return -Number(v);
      case '+': return +Number(v);
      case '!': return !this.truthy(v);
      case '~': return ~toInt(v);
    }
  }

  private truthy(v: Value): boolean {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') return v.length > 0;
    return v !== null && v !== undefined;
  }

  private async evalAssignment(node: AssignmentExpressionNode, env: Environment): Promise<Value> {
    if (node.operator === '=') {
      const v = await this.evalExpression(node.value, env);
      await this.assignTo(node.target, v, env);
      return v;
    }
    // compound: read current, apply op, write back
    const cur = await this.evalExpression(node.target, env);
    const rhs = await this.evalExpression(node.value, env);
    const baseOp = node.operator.slice(0, -1) as BinaryOperator;
    const next = this.applyBinary(baseOp, cur, rhs);
    await this.assignTo(node.target, next, env);
    return next;
  }

  private async assignTo(target: ExpressionNode, value: Value, env: Environment): Promise<void> {
    switch (target.type) {
      case 'Identifier': {
        const found = env.assign(target.name, value);
        if (!found) env.define(target.name, value);
        return;
      }
      case 'ArrayAccess': {
        const arr = await this.evalExpression(target.array, env);
        const idx = await this.evalExpression(target.index, env);
        this.arraySet(arr, idx, value);
        return;
      }
      case 'FieldAccess': {
        const obj = target.object ? await this.evalExpression(target.object, env) : this.evalIdentifier('this', env);
        return this.fieldSet(obj, target.field, value);
      }
      default:
        throw new RuntimeError('Invalid assignment target.');
    }
  }

  private arrayGet(arr: Value, idx: Value): Value {
    if (arr && typeof arr === 'object') {
      if ('__array' in arr) {
        const a = arr as JArrayValue;
        const i = toInt(idx);
        if (i < 0 || i >= a.elements.length) throw new RuntimeError(`ArrayIndexOutOfBoundsException: ${i}`);
        return a.elements[i] ?? this.defaultValue(a.elementType);
      }
      if ('__arraylist' in arr) {
        const a = arr as JArrayListValue;
        const i = toInt(idx);
        if (i < 0 || i >= a.items.length) throw new RuntimeError(`IndexOutOfBoundsException: ${i}`);
        return a.items[i] ?? null;
      }
    }
    if (typeof arr === 'string') return arr[toInt(idx)] ?? '';
    throw new RuntimeError('Not an array.');
  }

  private arraySet(arr: Value, idx: Value, value: Value): void {
    if (arr && typeof arr === 'object') {
      if ('__array' in arr) {
        const a = arr as JArrayValue;
        const i = toInt(idx);
        if (i < 0 || i >= a.elements.length) throw new RuntimeError(`ArrayIndexOutOfBoundsException: ${i}`);
        a.elements[i] = value;
        return;
      }
      if ('__arraylist' in arr) {
        const a = arr as JArrayListValue;
        const i = toInt(idx);
        a.items[i] = value;
        return;
      }
    }
    throw new RuntimeError('Not an array.');
  }

  private async evalFieldAccess(node: { type: 'FieldAccess'; object?: ExpressionNode | null; field: string }, env: Environment): Promise<Value> {
    // `.length` on arrays
    if (node.field === 'length' && node.object) {
      const obj = await this.evalExpression(node.object, env);
      if (obj && typeof obj === 'object' && '__array' in obj) return (obj as JArrayValue).elements.length;
      if (typeof obj === 'string') return obj.length;
    }
    // System.out, Math.PI, Integer.MAX_VALUE, etc. -> host namespace field
    if (node.object) {
      const obj = await this.evalExpression(node.object, env);
      const ns = asHostNamespace(obj);
      if (ns?.fields && node.field in ns.fields) return ns.fields[node.field]!;
      // instance field
      if (obj && typeof obj === 'object' && '__object' in obj) {
        const o = obj as JObject;
        if (o.fields.has(node.field)) return o.fields.get(node.field)!;
        // maybe a method ref on host namespace or scanner/arraylist
      }
      // host namespace method-as-value not supported; static field only
      throw new RuntimeError(`Cannot access field "${node.field}".`);
    }
    // unqualified field -> this.field or scope var
    const thisVal = env.get('this');
    if (thisVal && typeof thisVal === 'object' && '__object' in thisVal) {
      const o = thisVal as JObject;
      if (o.fields.has(node.field)) return o.fields.get(node.field)!;
    }
    return this.evalIdentifier(node.field, env);
  }

  private async fieldSet(obj: Value, field: string, value: Value): Promise<void> {
    if (obj && typeof obj === 'object' && '__object' in obj) {
      (obj as JObject).fields.set(field, value);
      return;
    }
    const ns = asHostNamespace(obj);
    if (ns) {
      ns.fields = ns.fields ?? {};
      ns.fields[field] = value;
      return;
    }
    throw new RuntimeError(`Cannot assign field "${field}".`);
  }

  private async evalMethodInvocation(node: { type: 'MethodInvocation'; callee?: ExpressionNode | null; name: string; args: ExpressionNode[] }, env: Environment): Promise<Value> {
    // Unqualified call: a user-defined method (same class) or host ctor-style.
    if (!node.callee) {
      // resolve user method in the current class
      const thisVal = env.get('this');
      const className = thisVal && typeof thisVal === 'object' && '__object' in thisVal ? (thisVal as JObject).className : env.className;
      const cls = className ? this.classTable.get(className) : undefined;
      if (cls) {
        const m = this.findMethod(cls, node.name, node.args.length);
        if (m) {
          const argVals = await this.evalAll(node.args, env);
          // static call from instance context: use class env
          return this.invokeMethod(cls, m, m.isStatic ? null : (thisVal as JObject), argVals, env);
        }
      }
      // could be a host namespace method invoked unqualified (rare) — error
      throw new RuntimeError(`Cannot find method: ${node.name}`);
    }

    // Receiver is `System.out`, a Scanner, ArrayList, String, array, host namespace, etc.
    const receiver = await this.evalExpression(node.callee, env);

    // host namespace static method? (Math.max, Arrays.sort, Integer.parseInt)
    const ns = asHostNamespace(receiver);
    if (ns && ns.methods && node.name in ns.methods) {
      const argVals = await this.evalAll(node.args, env);
      return ns.methods[node.name]!(argVals);
    }

    // System.out.println special: receiver is { __host, methods: {println, print} }
    if (ns && ns.methods && (node.name === 'println' || node.name === 'print' || node.name === 'printf')) {
      const argVals = await this.evalAll(node.args, env);
      return ns.methods[node.name]!(argVals);
    }

    // String methods
    if (typeof receiver === 'string') {
      const m = JStringMethods[node.name];
      if (m) {
        const argVals = await this.evalAll(node.args, env);
        return m(receiver, argVals);
      }
    }

    // Scanner / ArrayList instance methods
    if (receiver && typeof receiver === 'object') {
      if ('__scanner' in receiver) {
        const methods = (receiver as unknown as { __methods: Record<string, (a: Value[]) => Promise<Value>> }).__methods;
        if (methods && node.name in methods) {
          const argVals = await this.evalAll(node.args, env);
          return methods[node.name]!(argVals);
        }
      }
      if ('__arraylist' in receiver) {
        const list = receiver as JArrayListValue;
        const m = JArrayListMethods[node.name];
        if (m) {
          const argVals = await this.evalAll(node.args, env);
          return m(list, argVals);
        }
      }
      // user-defined instance method
      if ('__object' in receiver) {
        const o = receiver as JObject;
        const cls = this.classTable.get(o.className);
        if (cls) {
          const m = this.findMethod(cls, node.name, node.args.length);
          if (m) {
            const argVals = await this.evalAll(node.args, env);
            return this.invokeMethod(cls, m, o, argVals, env);
          }
        }
      }
    }

    throw new RuntimeError(`Cannot invoke method "${node.name}" on ${typeof receiver}.`);
  }

  private findMethod(cls: ClassDeclarationNode, name: string, argc: number): MethodDeclarationNode | undefined {
    return cls.methods.find(m => m.name === name && (m.params.length === argc || m.params.length === 0 && argc === 0))
      ?? cls.constructors.find(c => c.params.length === argc);
  }

  private async invokeMethod(cls: ClassDeclarationNode, method: MethodDeclarationNode, instance: JObject | null, args: Value[], callerEnv: Environment): Promise<Value> {
    // Fresh method scope chained to the caller (so globals + class statics +
    // enclosing symbols resolve through the scope chain).
    const env = new Environment(callerEnv, cls.name);
    if (instance) env.define('this', instance);
    // bind params
    method.params.forEach((p: ParameterNode, i: number) => {
      env.define(p.name, this.coerce(args[i] ?? null, p.javaType));
    });
    try {
      await this.execStatement(method.body, env);
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      throw e;
    }
    return VOID;
  }

  private async evalNewObject(className: string, argNodes: ExpressionNode[], env: Environment): Promise<Value> {
    // Host constructors
    if (className === 'Scanner') {
      // `new Scanner(System.in)` — System.in is intentionally NOT evaluated
      // (there is no stdin stream binding); we create a scanner bound to the
      // interactive input source regardless of args.
      const ctor = this.evalIdentifier('__newScanner__', env);
      const ns = asHostNamespace(ctor);
      return ns!.methods.create!([]);
    }
    if (className === 'ArrayList') {
      const ctor = this.evalIdentifier('ArrayList', env);
      const ns = asHostNamespace(ctor);
      return ns!.methods.create!([]);
    }
    // user class
    const cls = this.classTable.get(className);
    if (!cls) throw new RuntimeError(`Cannot find class: ${className}`);
    const obj: JObject = { __object: true, className, fields: new Map() };
    // init fields with an env that can see `this`
    const initEnv = new Environment(null, cls.name);
    initEnv.define('this', obj);
    await this.initInstanceFields(cls, obj, initEnv);
    // run constructor if any
    const args = await this.evalAll(argNodes, env);
    const ctor = cls.constructors.find(c => c.params.length === args.length) ?? cls.constructors[0];
    if (ctor) {
      await this.invokeMethod(cls, ctor, obj, args, env);
    }
    return obj;
  }

  private async evalNewArray(node: { type: 'NewArray'; elementType: string; sizes: ExpressionNode[]; initializer?: { type: 'ArrayLiteral'; elements: ExpressionNode[] } | null }, env: Environment): Promise<Value> {
    if (node.initializer) {
      const elements = await this.evalAll(node.initializer.elements, env);
      return { __array: true, elements, elementType: node.elementType };
    }
    // sized: new int[5] etc. — only 1-dim supported for sizing.
    if (node.sizes.length === 0) {
      return { __array: true, elements: [], elementType: node.elementType };
    }
    const len = toInt(await this.evalExpression(node.sizes[0]!, env));
    const def = this.defaultValue(node.elementType);
    const elements: Value[] = new Array(len).fill(def);
    return { __array: true, elements, elementType: node.elementType };
  }

  /** Coerce a Value to a Java type (int truncation, char<->int, etc.). */
  private coerce(v: Value, javaType: string): Value {
    if (javaType === 'int' || javaType === 'long' || javaType === 'short' || javaType === 'byte') {
      return typeof v === 'number' ? Math.trunc(v) | 0 : v;
    }
    if (javaType === 'char') {
      if (typeof v === 'number') return String.fromCharCode(v & 0xffff);
      return v;
    }
    return v;
  }
}

/** Side-channel emitter hook, set by runJava. */
export const EMITTER_HOOK: { value: ((text: string) => void) | null } = { value: null };

/** Re-exported for callers building an Interpreter directly. */
export type { ProgramNode, FieldDeclarationNode };
export { RunAbortedError };
