/**
 * CST -> normalized AST transform.
 *
 * `java-parser` produces a Chevrotain CST with this core shape:
 *   expression -> ternaryExpression -> binaryExpression -> unaryExpression -> primary
 *   primary    -> primaryPrefix (literal | fqnOrRefType | newExpression | This | parens)
 *              -> primarySuffix* (methodInvocationSuffix | arrayAccessSuffix | .field)
 *
 * This module turns that CST into the small discriminated AST in `nodes.ts`.
 * Out-of-subset constructs are caught separately by `unsupported.ts`, which
 * scans the *source* (not the AST), so it fires regardless of CST quirks.
 */

import type { CstNode, IToken } from 'java-parser';
import type {
  ArrayLiteralNode, AssignmentExpressionNode, AssignmentOperator,
  BinaryExpressionNode, BinaryOperator, BlockNode, CastExpressionNode,
  ClassDeclarationNode, ExpressionNode, FieldDeclarationNode,
  LocalVarDeclarationNode, MethodDeclarationNode, ParameterNode, ProgramNode,
  StatementNode, TernaryExpressionNode,
} from './nodes';

// ---------------- helpers ----------------

const isCst = (n: unknown): n is CstNode =>
  !!n && typeof n === 'object' && 'name' in (n as Record<string, unknown>) && 'children' in (n as Record<string, unknown>);
const isTok = (n: unknown): n is IToken =>
  !!n && typeof n === 'object' && 'image' in (n as Record<string, unknown>) && !('children' in (n as Record<string, unknown>));

function kids(node: CstNode | undefined, name: string): CstNode[] {
  const arr = node?.children?.[name];
  return Array.isArray(arr) ? arr.filter(isCst) : [];
}
function kid(node: CstNode | undefined, name: string): CstNode | undefined {
  return kids(node, name)[0];
}
function toks(node: CstNode | undefined, type: string): IToken[] {
  const arr = node?.children?.[type];
  return Array.isArray(arr) ? arr.filter(isTok) : [];
}
function tok(node: CstNode | undefined, type: string): IToken | undefined {
  return toks(node, type)[0];
}
function img(node: CstNode | undefined, type: string): string {
  return tok(node, type)?.image ?? '';
}
function firstToken(node: CstNode): IToken | undefined {
  for (const arr of Object.values(node.children ?? {})) {
    if (!Array.isArray(arr)) continue;
    for (const c of arr) {
      if (isTok(c)) return c;
      if (isCst(c)) { const t = firstToken(c); if (t) return t; }
    }
  }
  return undefined;
}
function locOf(n: CstNode | IToken | undefined) {
  const t = n && isCst(n) ? firstToken(n) : (n as IToken | undefined);
  return t && t.startLine != null ? { line: t.startLine, column: t.startColumn } : undefined;
}

// ---------------- entrypoint ----------------

export function normalize(cst: CstNode): ProgramNode {
  const cu = kid(cst, 'ordinaryCompilationUnit') ?? kid(cst, 'compilationUnit') ?? cst;
  const classes: ClassDeclarationNode[] = [];
  for (const td of kids(cu, 'typeDeclaration')) {
    const cd = kid(td, 'classDeclaration');
    if (cd) {
      const cls = normalizeClass(cd);
      if (cls) classes.push(cls);
    }
  }
  const mainClass = classes.find(c => c.methods.some(m => m.isStatic && m.name === 'main')) ?? classes[0];
  return { type: 'Program', classes, mainClass };
}

function normalizeClass(cd: CstNode): ClassDeclarationNode | null {
  const normal = kid(cd, 'normalClassDeclaration') ?? kid(cd, 'recordDeclaration');
  if (!normal) return null;
  const name = img(normal, 'Identifier') || img(kid(normal, 'typeIdentifier'), 'Identifier') || 'Unnamed';
  const body = kid(normal, 'classBody');
  const fields: FieldDeclarationNode[] = [];
  const methods: MethodDeclarationNode[] = [];
  const constructors: MethodDeclarationNode[] = [];
  if (body) {
    for (const md of kids(body, 'classBodyDeclaration')) {
      const ctor = kid(md, 'constructorDeclaration') ?? findFirstIn(md, 'constructorDeclaration');
      if (ctor) { const c = normalizeMethod(ctor, name, true); if (c) constructors.push(c); continue; }
      const member = kid(md, 'classMemberDeclaration') ?? kid(md, 'memberDeclaration');
      if (!member) continue;
      const fd = kid(member, 'fieldDeclaration') ?? findFirstIn(member, 'fieldDeclaration');
      if (fd) { fields.push(...normalizeField(fd)); continue; }
      const md2 = kid(member, 'methodDeclaration') ?? findFirstIn(member, 'methodDeclaration');
      if (md2) { const m = normalizeMethod(md2, name, false); if (m) methods.push(m); }
    }
  }
  return { type: 'ClassDeclaration', name, fields, methods, constructors, loc: locOf(cd) };
}

function modifiers(node: CstNode | undefined): { isStatic: boolean; isFinal: boolean; isPublic: boolean } {
  let isStatic = false, isFinal = false, isPublic = false;
  if (node?.children) {
    for (const arr of Object.values(node.children)) {
      if (!Array.isArray(arr)) continue;
      for (const c of arr) {
        if (!isCst(c) || !c.children) continue;
        for (const k of Object.keys(c.children)) {
          // modifier nodes carry a single child token type
          const typeMap: Record<string, keyof { isStatic: boolean; isFinal: boolean; isPublic: boolean }> = {
            Static: 'isStatic', Final: 'isFinal', Public: 'isPublic',
          };
          if (typeMap[k]) (typeMap[k] === 'isStatic' ? (isStatic = true) : typeMap[k] === 'isFinal' ? (isFinal = true) : (isPublic = true));
        }
      }
    }
  }
  return { isStatic, isFinal, isPublic };
}

/** Collect modifier token types across modifier-list wrappers. */
function hasModifier(modifierRoot: CstNode | undefined, types: string[]): boolean {
  if (!modifierRoot?.children) return false;
  for (const arr of Object.values(modifierRoot.children)) {
    if (!Array.isArray(arr)) continue;
    for (const c of arr) {
      if (isCst(c) && c.children) {
        for (const t of types) if (c.children[t] && Array.isArray(c.children[t])) return true;
      }
      if (isTok(c) && types.includes(String((c as { tokenType: unknown }).tokenType))) return true;
    }
  }
  return false;
}

function typeFromUnann(typeRef: CstNode | undefined): string {
  if (!typeRef) return 'var';
  // Find the deepest identifier / primitive token chain.
  const ids: string[] = [];
  const collect = (n: CstNode | undefined) => {
    if (!n) return;
    const primitive: Record<string, string> = {
      Int: 'int', Long: 'long', Short: 'short', Byte: 'byte',
      Char: 'char', Float: 'float', Double: 'double', Boolean: 'boolean',
    };
    for (const [tt, base] of Object.entries(primitive)) {
      if (tok(n, tt)) ids.push(base);
    }
    for (const id of toks(n, 'Identifier')) ids.push(id.image);
    // descend
    for (const arr of Object.values(n.children ?? {})) {
      if (Array.isArray(arr)) for (const c of arr) if (isCst(c)) collect(c);
    }
  };
  collect(typeRef);
  const base = ids.length ? ids.join('.') : 'var';
  let dims = 0;
  const dimsNode = kid(typeRef, 'dims');
  if (dimsNode) dims = toks(dimsNode, 'LSquare').length;
  // also inline dimExprs etc not relevant for declared type
  return dims ? base + '[]'.repeat(dims) : base;
}

function normalizeField(fd: CstNode): FieldDeclarationNode[] {
  const mods = modifiers(fd);
  const typeRef = kid(fd, 'unannType') ?? kid(fd, 'type');
  const jt = typeFromUnann(typeRef);
  const vdl = kid(fd, 'variableDeclaratorList');
  const out: FieldDeclarationNode[] = [];
  if (!vdl) return out;
  for (const vd of kids(vdl, 'variableDeclarator')) {
    const name = declaratorName(vd);
    const initExpr = normalizeInitializer(kid(vd, 'variableInitializer'));
    out.push({ type: 'FieldDeclaration', name, javaType: jt, initializer: initExpr, isStatic: mods.isStatic, isFinal: mods.isFinal, loc: locOf(vd) });
  }
  return out;
}

function normalizeMethod(md: CstNode, className: string, isConstructor: boolean): MethodDeclarationNode | null {
  const mods = modifiers(md);
  const header = kid(md, 'methodHeader') ?? md;
  let returnType = isConstructor ? className : 'void';
  const params: ParameterNode[] = [];
  if (!isConstructor) {
    const result = kid(header, 'result');
    if (result) {
      const ut = kid(result, 'unannType');
      returnType = ut ? typeFromUnann(ut) : (tok(result, 'Void') ? 'void' : 'void');
    }
  }
  // The method name + param list live on methodDeclarator / constructorDeclarator.
  const declarator = kid(header, 'methodDeclarator') ?? kid(md, 'constructorDeclarator') ?? kid(header, 'constructorDeclarator') ?? header;
  const paramList = kid(declarator, 'formalParameterList') ?? kid(header, 'formalParameterList') ?? kid(md, 'formalParameterList');
  if (paramList) {
    for (const fp of kids(paramList, 'formalParameter')) {
      const real = kid(fp, 'variableParaRegularParameter') ?? fp;
      const pType = kid(real, 'unannType') ?? kid(real, 'type');
      const vdi = kid(real, 'variableDeclaratorId');
      const pname = img(vdi, 'Identifier') || img(real, 'Identifier');
      params.push({ type: 'Parameter', name: pname, javaType: typeFromUnann(pType), loc: locOf(real) });
    }
  }
  const body = kid(md, 'methodBody') ?? kid(md, 'constructorBody');
  const block = body ? normalizeBlock(kid(body, 'block') ?? body) : { type: 'Block' as const, statements: [] };
  const name = isConstructor ? className : (img(declarator, 'Identifier') || img(header, 'Identifier') || 'unknown');
  return { type: 'MethodDeclaration', name, returnType, params, body: block, isStatic: mods.isStatic, isPublic: mods.isPublic, isConstructor, loc: locOf(md) };
}

// ---------------- statements ----------------

/** Recursively collect all child CstNodes matching `name` (depth-first). */
function findAll(node: CstNode | undefined, name: string): CstNode[] {
  const out: CstNode[] = [];
  const walk = (n: CstNode | undefined) => {
    if (!n?.children) return;
    for (const arr of Object.values(n.children)) {
      if (!Array.isArray(arr)) continue;
      for (const c of arr) {
        if (isCst(c)) {
          if (c.name === name) out.push(c);
          walk(c);
        }
      }
    }
  };
  walk(node);
  return out;
}

function normalizeBlock(block: CstNode | undefined): BlockNode {
  const statements: StatementNode[] = [];
  if (!block) return { type: 'Block', statements };
  // block -> blockStatements -> blockStatement*
  // Iterate ONLY the direct blockStatement children (do not recurse with
  // findAll — that would steal nested blockStatements from while/for/if bodies
  // and re-emit them as siblings, corrupting control flow).
  const blockStatementsNode = kid(block, 'blockStatements') ?? block;
  for (const bs of kids(blockStatementsNode, 'blockStatement')) {
    const lv = kid(bs, 'localVariableDeclaration')
      ?? kid(kid(bs, 'localVariableDeclarationStatement'), 'localVariableDeclaration');
    if (lv) {
      statements.push(...normalizeLocalVar(lv));
      continue;
    }
    const s = kid(bs, 'statement')
      ?? kid(kid(bs, 'classOrInterfaceDeclaration'), 'classDeclaration');
    if (s) {
      const r = normalizeStatement(s);
      if (r) statements.push(r);
    }
  }
  return { type: 'Block', statements };
}

function normalizeBlockStatement(bs: CstNode): StatementNode | StatementNode[] | null {
  const lv = kid(bs, 'localVariableDeclaration');
  if (lv) return normalizeLocalVar(lv);
  const s = kid(bs, 'statement');
  if (s) return normalizeStatement(s);
  return null;
}

/** Normalize a `variableInitializer` CST: either an expression or an array initializer. */
function normalizeInitializer(vi: CstNode | undefined): ExpressionNode | null {
  if (!vi) return null;
  const arrInit = kid(vi, 'arrayInitializer');
  if (arrInit) return arrayLiteralFrom(arrInit);
  const e = kid(vi, 'expression');
  if (e) return normalizeExpression(e);
  return null;
}


function declaratorName(vd: CstNode): string {
  const vdi = kid(vd, 'variableDeclaratorId') ?? vd;
  return img(vdi, 'Identifier');
}

function normalizeLocalVar(lv: CstNode): LocalVarDeclarationNode[] {
  const lvt = kid(lv, 'localVariableType');
  const typeRef = (lvt ? kid(lvt, 'unannType') : undefined) ?? kid(lv, 'unannType') ?? kid(lv, 'type');
  const inferred = !!lvt && !!tok(lvt, 'Var');
  const jt = inferred ? 'var' : typeFromUnann(typeRef);
  const vdl = kid(lv, 'variableDeclaratorList');
  const out: LocalVarDeclarationNode[] = [];
  if (!vdl) return out;
  for (const vd of kids(vdl, 'variableDeclarator')) {
    const name = declaratorName(vd);
    const initExpr = normalizeInitializer(kid(vd, 'variableInitializer'));
    out.push({ type: 'LocalVarDeclaration', name, javaType: jt, initializer: initExpr, inferred, loc: locOf(vd) });
  }
  return out;
}

function normalizeStatement(s: CstNode): StatementNode | null {
  if (kid(s, 'block')) return normalizeBlock(kid(s, 'block'));

  // DIRECT-child dispatch only. (findFirstIn would recurse into nested bodies
  // and mis-classify — e.g. a for-loop containing `if(...)` would be treated as
  // an If, leaking the inner statement out and dropping the loop.)
  const iff = kid(s, 'ifStatement');
  if (iff) {
    const test = normalizeExpression(kid(iff, 'expression'));
    const stmts = kids(iff, 'statement');
    const consequent = stmts[0]
      ? (kid(stmts[0], 'block') ? normalizeBlock(kid(stmts[0], 'block')!) : normalizeStatement(stmts[0]) ?? { type: 'Block', statements: [] })
      : { type: 'Block', statements: [] } as StatementNode;
    let alternate: StatementNode | null = null;
    if (tok(iff, 'Else') && stmts[1]) {
      alternate = kid(stmts[1], 'block') ? normalizeBlock(kid(stmts[1], 'block')!) : normalizeStatement(stmts[1]) ?? null;
    }
    return { type: 'If', test, consequent, alternate, loc: locOf(iff) };
  }

  const wh = kid(s, 'whileStatement');
  if (wh) {
    return { type: 'While', test: normalizeExpression(kid(wh, 'expression')), body: bodyOf(wh), loc: locOf(wh) };
  }

  const dw = kid(s, 'doStatement');
  if (dw) {
    return { type: 'DoWhile', body: bodyOf(dw), test: normalizeExpression(kid(dw, 'expression')), loc: locOf(dw) };
  }

  const frRaw = kid(s, 'forStatement');
  if (frRaw) {
    const fr = kid(frRaw, 'basicForStatement') ?? kid(frRaw, 'enhancedForStatement') ?? frRaw;
    return normalizeFor(fr);
  }

  const ret = kid(s, 'returnStatement');
  if (ret) {
    const e = kid(ret, 'expression');
    return { type: 'Return', value: e ? normalizeExpression(e) : null, loc: locOf(ret) };
  }
  if (kid(s, 'breakStatement')) return { type: 'Break', loc: locOf(s) };
  if (kid(s, 'continueStatement')) return { type: 'Continue', loc: locOf(s) };

  // Non-trailing statement is wrapped in statementWithoutTrailingSubstatement.
  const swts = kid(s, 'statementWithoutTrailingSubstatement');
  if (swts) {
    const r = normalizeStatement(swts);
    if (r) return r;
  }
  const es = kid(s, 'expressionStatement');
  if (es) {
    const se = kid(es, 'statementExpression');
    const e = (se ? kid(se, 'expression') : undefined) ?? kid(es, 'expression');
    if (e) return { type: 'ExpressionStatement', expression: normalizeExpression(e), loc: locOf(es) };
  }
  const lvs = kid(s, 'localVariableDeclarationStatement');
  if (lvs) {
    const lv = kid(lvs, 'localVariableDeclaration');
    if (lv) {
      const decls = normalizeLocalVar(lv);
      if (decls.length === 1) return decls[0]!;
      if (decls.length > 1) return { type: 'Block', statements: decls };
    }
  }
  if (tok(s, 'Semicolon')) return { type: 'Block', statements: [] };
  return null;
}

/** Find the first descendant production named `name` within `node` (BFS). */
function findFirstIn(node: CstNode | undefined, name: string): CstNode | undefined {
  return findAll(node, name)[0];
}

/** Resolve the body of a control-flow node: may be a `block` or a `statement`. */
function bodyOf(control: CstNode): StatementNode {
  const block = kid(control, 'block') ?? findFirstIn(control, 'block');
  if (block) return normalizeBlock(block);
  const stmt = kid(control, 'statement') ?? findFirstIn(control, 'statement');
  if (stmt) return normalizeStatement(stmt) ?? { type: 'Block', statements: [] };
  return { type: 'Block', statements: [] };
}

function normalizeFor(fr: CstNode): StatementNode {
  const enh = fr.name === 'enhancedForStatement'
    ? fr
    : (kid(fr, 'enhancedForStatement') ?? kid(fr, 'enhancedForControl'));
  if (enh) {
    // desugar: for (T v : iter) body  ->  { T[] __it = iter; int __i=0; while(__i<__it.length){ T v=__it[__i]; __i++; body } }
    const typeRef = kid(enh, 'type') ?? kid(enh, 'unannType');
    const vdi = kid(enh, 'variableDeclaratorId');
    const varName = img(vdi, 'Identifier') || img(enh, 'Identifier');
    const iterExpr = normalizeExpression(kid(enh, 'expression') ?? findFirstIn(enh, 'expression') ?? enh);
    const body = bodyOf(fr);
    return {
      type: 'Block',
      statements: [
        { type: 'LocalVarDeclaration', javaType: typeFromUnann(typeRef) + '[]', name: '__it', inferred: false, initializer: iterExpr },
        { type: 'LocalVarDeclaration', javaType: 'int', name: '__i', inferred: false, initializer: { type: 'IntegerLiteral', value: 0 } },
        {
          type: 'While',
          test: { type: 'BinaryExpression', operator: '<', left: { type: 'Identifier', name: '__i' }, right: { type: 'FieldAccess', object: { type: 'Identifier', name: '__it' }, field: 'length' } },
          body: {
            type: 'Block',
            statements: [
              { type: 'LocalVarDeclaration', javaType: typeFromUnann(typeRef), name: varName, inferred: false, initializer: { type: 'ArrayAccess', array: { type: 'Identifier', name: '__it' }, index: { type: 'Identifier', name: '__i' } } },
              { type: 'ExpressionStatement', expression: { type: 'Postfix', operator: '++', operand: { type: 'Identifier', name: '__i' } } },
              body ?? { type: 'Block', statements: [] },
            ],
          },
        },
      ],
    };
  }

  // classic for
  const init = kid(fr, 'forInit') ?? findFirstIn(fr, 'forInit');
  let initializer: StatementNode | null = null;
  if (init) {
    const lv = kid(init, 'localVariableDeclaration') ?? findFirstIn(init, 'localVariableDeclaration');
    if (lv) { const decls = normalizeLocalVar(lv); initializer = decls.length === 1 ? decls[0]! : { type: 'Block' as const, statements: decls }; }
    else {
      const exprList = kid(init, 'expressionList') ?? findFirstIn(init, 'expressionList');
      if (exprList) {
        const exprs = findAll(exprList, 'expression').map(normalizeExpression);
        initializer = { type: 'Block', statements: exprs.map(e => ({ type: 'ExpressionStatement', expression: e })) };
      }
    }
  }
  // condition: a bare `expression` direct child of the forStatement.
  // Use direct-child lookup (NOT findFirstIn — that would steal the forInit's
  // initializer expression).
  const exprList = kid(fr, 'expressionList');
  let test: ExpressionNode | null = null;
  if (exprList) test = normalizeExpression(findAll(exprList, 'expression')[0]);
  else {
    const bareExpr = kid(fr, 'expression');
    if (bareExpr) test = normalizeExpression(bareExpr);
  }
  const updateCst = kid(fr, 'forUpdate') ?? findFirstIn(fr, 'forUpdate');
  let update: ExpressionNode | null = null;
  if (updateCst) {
    const el = kid(updateCst, 'expressionList') ?? updateCst;
    const exprs = findAll(el, 'expression').map(normalizeExpression);
    update = exprs[0] ?? null;
  }
  const body = bodyOf(fr);
  return { type: 'For', initializer, test, update, body, loc: locOf(fr) };
}

// ---------------- expressions ----------------

const BINARY: Record<string, BinaryOperator> = {
  '+': '+', '-': '-', '*': '*', '/': '/', '%': '%',
  '<': '<', '<=': '<=', '>': '>', '>=': '>=',
  '==': '==', '!=': '!=',
  '&&': '&&', '||': '||',
  '&': '&', '|': '|', '^': '^', '<<': '<<', '>>': '>>',
};
const ASSIGN: Record<string, AssignmentOperator> = {
  '=': '=', '+=': '+=', '-=': '-=', '*=': '*=', '/=': '/=', '%=': '%=',
  '&=': '&=', '|=': '|=', '^=': '^=', '<<=': '<<=', '>>=': '>>=',
};

/** Normalize an `expression` CST node. */
export function normalizeExpression(node: CstNode | undefined): ExpressionNode {
  if (!node) return { type: 'NullLiteral' };
  // expression -> ternaryExpression
  const tern = kid(node, 'ternaryExpression') ?? (node.name === 'ternaryExpression' ? node : undefined);
  if (!tern) {
    // node IS a deeper production (binary/unary/primary); dispatch.
    return dispatchExpression(node);
  }
  // ternary wraps a binaryExpression; if QuestionMark present -> ternary.
  if (tok(tern, 'QuestionMark')) {
    const innerExprs = kids(tern, 'expression');
    const bin = kid(tern, 'binaryExpression');
    const test = bin ? dispatchBinary(bin) : (innerExprs[0] ? normalizeExpression(innerExprs[0]) : { type: 'BooleanLiteral' as const, value: true });
    // innerExprs: first is condition remainder; last two are consequent/alternate
    const cons = innerExprs[innerExprs.length - 2] ? normalizeExpression(innerExprs[innerExprs.length - 2]) : test;
    const alt = innerExprs[innerExprs.length - 1] ? normalizeExpression(innerExprs[innerExprs.length - 1]) : test;
    return { type: 'Ternary', test, consequent: cons, alternate: alt, loc: locOf(tern) };
  }
  const bin = kid(tern, 'binaryExpression');
  if (bin) return dispatchBinary(bin);
  return dispatchExpression(tern);
}

function dispatchExpression(node: CstNode): ExpressionNode {
  if (node.name === 'binaryExpression') return dispatchBinary(node);
  if (node.name === 'unaryExpression') return dispatchUnary(node);
  if (node.name === 'primary') return dispatchPrimary(node);
  if (node.name === 'castExpression') return dispatchCast(node);
  if (node.name === 'ternaryExpression') return normalizeExpression(node);
  // descend
  for (const name of ['ternaryExpression', 'binaryExpression', 'unaryExpression', 'primary', 'castExpression']) {
    const c = kid(node, name);
    if (c) return dispatchExpression(c);
  }
  return { type: 'NullLiteral' };
}

/** All operator tokens on a binaryExpression, in source order, across token types. */
const OP_TOKEN_TYPES = [
  'BinaryOperator', 'AssignmentOperator',
  'Plus', 'Minus', 'Star', 'Slash', 'Percent',
  'Less', 'GreaterThan', 'LessEquals', 'GreaterEquals',
  'Equals', 'NotEquals', 'AndAnd', 'OrOr', 'And', 'Or', 'Caret',
];

interface OpToken {
  token: IToken;
  /** The children-key (token-category name) the token was found under. */
  key: string;
}

function collectOperators(bin: CstNode): OpToken[] {
  const out: OpToken[] = [];
  if (!bin.children) return out;
  for (const key of OP_TOKEN_TYPES) {
    const arr = bin.children[key];
    if (Array.isArray(arr)) for (const c of arr) if (isTok(c)) out.push({ token: c, key });
  }
  out.sort((a, b) => (a.token.startOffset ?? 0) - (b.token.startOffset ?? 0));
  return out;
}

/** Merge adjacent `<<`/`>>` (java-parser lexes them as two `<`/`>` tokens). */
function mergeShiftOperators(ops: OpToken[]): OpToken[] {
  const out: OpToken[] = [];
  for (let i = 0; i < ops.length; i++) {
    const cur = ops[i]!;
    const next = ops[i + 1];
    if (cur.key === 'Less' && next?.key === 'Less'
        && (cur.token.endOffset ?? 0) + 1 === (next.token.startOffset ?? -999)) {
      out.push({ token: { ...cur.token, image: '<<', endOffset: next.token.endOffset }, key: 'BinaryOperator' });
      i++;
    } else if (cur.key === 'GreaterThan' && next?.key === 'GreaterThan'
        && (cur.token.endOffset ?? 0) + 1 === (next.token.startOffset ?? -999)) {
      out.push({ token: { ...cur.token, image: '>>', endOffset: next.token.endOffset }, key: 'BinaryOperator' });
      i++;
    } else {
      out.push(cur);
    }
  }
  return out;
}

function dispatchBinary(bin: CstNode): ExpressionNode {
  const rawOps = collectOperators(bin);
  // assignment form: unaryExpression  AssignmentOperator  expression
  if (rawOps.some(o => o.key === 'AssignmentOperator')) {
    const opTok = rawOps.find(o => o.key === 'AssignmentOperator')!.token;
    const op = ASSIGN[opTok.image] ?? '=';
    const target = dispatchUnary(kid(bin, 'unaryExpression')!);
    const rhs = normalizeExpression(kids(bin, 'expression')[0]);
    return { type: 'Assignment', operator: op, target, value: rhs, loc: locOf(bin) };
  }
  // plain binary: operands + operators (merging << / >>)
  const operands = kids(bin, 'unaryExpression').map(dispatchUnary);
  const merged = mergeShiftOperators(rawOps);
  const ops = merged.map(o => o.token.image);
  if (ops.length === 0) return operands[0] ?? { type: 'NullLiteral' };
  return foldBinary(operands, ops, bin);
}

/** Precedence-climbing fold of operands/ops into a left-leaning AST honoring precedence. */
function foldBinary(operands: ExpressionNode[], ops: string[], bin: CstNode): ExpressionNode {
  // Operator precedence (higher binds tighter).
  const prec: Record<string, number> = {
    '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5,
    '==': 6, '!=': 6,
    '<': 7, '<=': 7, '>': 7, '>=': 7,
    '<<': 8, '>>': 8,
    '+': 9, '-': 9,
    '*': 10, '/': 10, '%': 10,
  };
  // iterative precedence climbing
  let minPrec = 1;
  let idx = 0;
  const parse = (minP: number): { node: ExpressionNode; next: number } => {
    let left = operands[idx] ?? { type: 'IntegerLiteral' as const, value: 0 };
    idx++;
    while (idx - 1 < ops.length) {
      const op = ops[idx - 1]!;
      const p = prec[op] ?? 1;
      if (p < minP) break;
      const right = parse(p + 1);
      left = { type: 'BinaryExpression', operator: (BINARY[op] ?? op) as BinaryOperator, left, right: right.node, loc: locOf(bin) };
      idx = right.next;
    }
    return { node: left, next: idx };
  };
  const r = parse(minPrec);
  return r.node;
}

function dispatchUnary(un: CstNode): ExpressionNode {
  const prefixOps = toks(un, 'UnaryPrefixOperator').map(t => t.image);
  const suffixOps = toks(un, 'UnarySuffixOperator').map(t => t.image);
  const primary = kid(un, 'primary');
  let base: ExpressionNode;
  if (primary) base = dispatchPrimary(primary);
  else {
    const inner = kid(un, 'unaryExpression');
    base = inner ? dispatchUnary(inner) : { type: 'NullLiteral' };
  }
  // prefix increment/decrement / unary sign
  for (const op of [...prefixOps].reverse()) {
    if (op === '++' || op === '--') {
      base = { type: 'PreIncrement', operator: op, operand: base, loc: locOf(un) };
    } else if (op === '-' || op === '+' || op === '!' || op === '~') {
      base = { type: 'UnaryExpression', operator: op as '-' | '+' | '!' | '~', operand: base, loc: locOf(un) };
    }
  }
  // postfix ++/-- (java-parser token type is UnarySuffixOperator)
  for (const op of suffixOps) {
    if (op === '++' || op === '--') {
      base = { type: 'Postfix', operator: op, operand: base, loc: locOf(un) };
    }
  }
  return base;
}

function dispatchCast(cast: CstNode): CastExpressionNode {
  const t = kid(cast, 'type') ?? kid(cast, 'unannType');
  const inner = kid(cast, 'unaryExpression') ?? kid(cast, 'expression');
  return { type: 'Cast', targetType: typeFromUnann(t), expression: inner ? dispatchExpression(inner) : { type: 'NullLiteral' }, loc: locOf(cast) };
}

function dispatchPrimary(primary: CstNode): ExpressionNode {
  const prefix = kid(primary, 'primaryPrefix');
  if (!prefix) {
    // bare parens etc.
    return { type: 'NullLiteral' };
  }
  let base = dispatchPrimaryPrefix(prefix);

  // fold primarySuffixes left to right
  for (const suf of kids(primary, 'primarySuffix')) {
    base = applySuffix(base, suf);
  }
  // postfix ++/-- (PostfixOp token on the primary)
  const postInc = tok(primary, 'PlusPlus');
  const postDec = tok(primary, 'MinusMinus');
  if (postInc || postDec) {
    return { type: 'Postfix', operator: postInc ? '++' : '--', operand: base, loc: locOf(primary) };
  }
  return base;
}

function dispatchPrimaryPrefix(prefix: CstNode): ExpressionNode {
  // literal
  const lit = kid(prefix, 'literal');
  if (lit) return literalFrom(lit);
  // This
  if (tok(prefix, 'This')) return { type: 'This', loc: locOf(prefix) };
  // parens
  const par = kid(prefix, 'parenthesisExpression') ?? kid(prefix, 'parExpression');
  if (par) {
    const e = kid(par, 'expression');
    return { type: 'Paren', expression: e ? normalizeExpression(e) : { type: 'NullLiteral' }, loc: locOf(par) };
  }
  // new
  const newExpr = kid(prefix, 'newExpression');
  if (newExpr) return normalizeNew(newExpr);
  // fqnOrRefType (identifier chain) — could be System.out, a variable, Math, etc.
  const fqn = kid(prefix, 'fqnOrRefType');
  if (fqn) {
    const ids = fqnIdentifiers(fqn);
    return resolveQualifiedName(ids, prefix);
  }
  // expressionName / literal fallback
  const nameNode = kid(prefix, 'expressionName') ?? kid(prefix, 'name');
  if (nameNode) return resolveQualifiedName(fqnIdentifiers(nameNode), prefix);
  return { type: 'NullLiteral' };
}

/** Extract the Identifier chain from an fqnOrRefType / name node. */
function fqnIdentifiers(node: CstNode | undefined): string[] {
  const ids: string[] = [];
  const walk = (n: CstNode | undefined) => {
    if (!n) return;
    for (const t of toks(n, 'Identifier')) {
      // only push if it's the "current" part (avoid duplicates from nested parts)
      ids.push(t.image);
    }
    for (const arr of Object.values(n.children ?? {})) {
      if (Array.isArray(arr)) for (const c of arr) if (isCst(c)) walk(c);
    }
  };
  walk(node);
  return ids;
}

function applySuffix(base: ExpressionNode, suf: CstNode): ExpressionNode {
  const methodInv = kid(suf, 'methodInvocationSuffix');
  if (methodInv) {
    const args = parseArgs(methodInv);
    // method name is the last identifier on base if base is a qualified name chain
    return makeMethodCall(base, args, suf);
  }
  const arrAccess = kid(suf, 'arrayAccessSuffix');
  if (arrAccess) {
    const index = normalizeExpression(kid(arrAccess, 'expression'));
    return { type: 'ArrayAccess', array: base, index, loc: locOf(suf) };
  }
  // field access via Dot + Identifier on the suffix
  const fieldName = img(suf, 'Identifier');
  if (tok(suf, 'Dot') && fieldName) {
    return { type: 'FieldAccess', object: base, field: fieldName, loc: locOf(suf) };
  }
  return base;
}

/** Parse an argumentList from a methodInvocationSuffix. */
function parseArgs(methodInv: CstNode): ExpressionNode[] {
  const argList = kid(methodInv, 'argumentList');
  if (!argList) return [];
  return kids(argList, 'expression').map(normalizeExpression);
}

/**
 * Given a base that ends in a qualified name, split off the last segment as
 * the method name and use the rest as the receiver. If base is not a name
 * chain, it is the receiver and the call is anonymous-ish (shouldn't happen).
 */
function makeMethodCall(base: ExpressionNode, args: ExpressionNode[], suf: CstNode): ExpressionNode {
  if (base.type === 'Identifier') {
    // unqualified call: name() — callee is null (resolve in scope / host)
    return { type: 'MethodInvocation', callee: null, name: base.name, args, loc: locOf(suf) };
  }
  if (base.type === 'FieldAccess') {
    // e.g. base = System.out -> method "println" on receiver (System.out)
    // The LAST segment is the method name; peel it off.
    return { type: 'MethodInvocation', callee: base.object, name: base.field, args, loc: locOf(suf) };
  }
  // receiver is an arbitrary expression
  return { type: 'MethodInvocation', callee: base, name: '__call__', args, loc: locOf(suf) };
}

function resolveQualifiedName(segs: string[], node: CstNode): ExpressionNode {
  const cleaned = segs.filter(Boolean);
  if (cleaned.length === 0) return { type: 'NullLiteral' };
  if (cleaned.length === 1) {
    const id = cleaned[0]!;
    return { type: 'Identifier', name: id, loc: locOf(node) };
  }
  let cur: ExpressionNode = { type: 'Identifier', name: cleaned[0]!, loc: locOf(node) };
  for (let i = 1; i < cleaned.length; i++) {
    cur = { type: 'FieldAccess', object: cur, field: cleaned[i]!, loc: locOf(node) };
  }
  return cur;
}

function normalizeNew(newExpr: CstNode): ExpressionNode {
  const arr = kid(newExpr, 'arrayCreationExpression');
  if (arr) {
    const typeRef = kid(arr, 'unannType') ?? kid(arr, 'type') ?? kid(arr, 'primitiveType') ?? findFirstIn(arr, 'primitiveType');
    const elementType = typeFromUnann(typeRef).replace(/\[\]$/, '');
    const sizes: ExpressionNode[] = [];
    const dimExprs = kid(arr, 'dimExprs') ?? findFirstIn(arr, 'dimExprs');
    if (dimExprs) for (const de of findAll(dimExprs, 'dimExpr')) {
      const e = kid(de, 'expression');
      if (e) sizes.push(normalizeExpression(e));
    }
    const explicit = kid(arr, 'arrayCreationExplicitInitSuffix');
    const initNode = explicit ? kid(explicit, 'arrayInitializer') : undefined;
    const defaultInit = kid(arr, 'arrayCreationDefaultInitSuffix');
    let initializer: ArrayLiteralNode | null = null;
    if (initNode) initializer = arrayLiteralFrom(initNode);
    else if (defaultInit && kid(defaultInit, 'arrayInitializer')) initializer = arrayLiteralFrom(kid(defaultInit, 'arrayInitializer')!);
    return { type: 'NewArray', elementType, sizes, initializer, loc: locOf(newExpr) };
  }
  // object creation
  const obj = kid(newExpr, 'unqualifiedClassInstanceCreationExpression') ?? newExpr;
  const classType = kid(obj, 'classOrInterfaceTypeToInstantiate') ?? kid(obj, 'unannType') ?? kid(obj, 'type');
  let className = typeFromUnann(classType).split('<')[0] ?? 'Object';
  const argsNode = kid(obj, 'argumentList');
  const args = argsNode ? kids(argsNode, 'expression').map(normalizeExpression) : [];
  return { type: 'NewObject', className, args, loc: locOf(newExpr) };
}

function arrayLiteralFrom(init: CstNode): ArrayLiteralNode {
  const elements: ExpressionNode[] = [];
  // variableInitializerList -> variableInitializer -> expression
  const list = kid(init, 'variableInitializerList');
  const initializers = list ? kids(list, 'variableInitializer') : kids(init, 'variableInitializer');
  for (const vi of initializers) {
    const e = kid(vi, 'expression') ?? vi;
    elements.push(normalizeExpression(e));
  }
  return { type: 'ArrayLiteral', elements, loc: locOf(init) };
}

function literalFrom(lit: CstNode): ExpressionNode {
  const intLit = kid(lit, 'integerLiteral');
  if (intLit) {
    const it = tok(intLit, 'DecimalLiteral') ?? tok(intLit, 'HexLiteral') ?? tok(intLit, 'OctalLiteral') ?? tok(intLit, 'BinaryLiteral');
    if (it) {
      let image = it.image.replace(/_+/g, '');
      const isLong = /[lL]$/.test(image);
      image = image.replace(/[lL]$/, '');
      const radix = /^0[xX]/.test(image) ? 16 : /^0[bB]/.test(image) ? 2 : 10;
      const clean = image.replace(/^0[xXbB]/, '');
      const value = parseInt(clean === '' ? '0' : clean, radix);
      return isLong ? { type: 'LongLiteral', value, loc: locOf(lit) } : { type: 'IntegerLiteral', value, loc: locOf(lit) };
    }
  }
  const fpLit = kid(lit, 'floatingPointLiteral');
  if (fpLit) {
    const ft = tok(fpLit, 'FloatLiteral') ?? tok(fpLit, 'DoubleLiteral');
    if (ft) {
      const image = ft.image.replace(/[fFdD]$/, '').replace(/_+/g, '');
      return { type: 'DoubleLiteral', value: parseFloat(image), loc: locOf(lit) };
    }
  }
  const boolLit = kid(lit, 'booleanLiteral');
  if (boolLit) {
    if (tok(boolLit, 'True')) return { type: 'BooleanLiteral', value: true, loc: locOf(lit) };
    if (tok(boolLit, 'False')) return { type: 'BooleanLiteral', value: false, loc: locOf(lit) };
  }
  const charLit = tok(lit, 'CharacterLiteral');
  if (charLit) {
    const raw = charLit.image.slice(1, -1);
    return { type: 'CharLiteral', value: unescape(raw), loc: locOf(lit) };
  }
  const strLit = tok(lit, 'StringLiteral');
  if (strLit) {
    const raw = strLit.image.slice(1, -1);
    return { type: 'StringLiteral', value: unescape(raw), loc: locOf(lit) };
  }
  if (tok(lit, 'Null')) return { type: 'NullLiteral', loc: locOf(lit) };
  return { type: 'NullLiteral', loc: locOf(lit) };
}

function unescape(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\')
    .replace(/\\0/g, '\0');
}

// silence unused
export type { FieldDeclarationNode, ParameterNode, StatementNode };
