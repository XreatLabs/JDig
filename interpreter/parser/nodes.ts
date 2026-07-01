/**
 * Normalized AST node interfaces for the JDig interpreter.
 *
 * `java-parser` produces a Chevrotain CST. `normalize.ts` transforms that CST
 * into THIS shape — a small, discriminated, tree-walkable AST covering the
 * supported Java subset. The engine only ever consumes these nodes, never the
 * raw CST.
 */

/** Source span for diagnostics. */
export interface Loc {
  line?: number;
  column?: number;
}

/** Marker interface. */
export interface Node {
  readonly type: string;
  loc?: Loc;
}

// ---------- Program / declarations ----------

export interface ProgramNode extends Node {
  type: 'Program';
  classes: ClassDeclarationNode[];
  /** Convenience: the single class whose `main` we invoke. */
  mainClass?: ClassDeclarationNode;
}

export interface ClassDeclarationNode extends Node {
  type: 'ClassDeclaration';
  name: string;
  fields: FieldDeclarationNode[];
  methods: MethodDeclarationNode[];
  constructors: MethodDeclarationNode[];
}

export interface FieldDeclarationNode extends Node {
  type: 'FieldDeclaration';
  javaType: string;
  /** Single declarator per node (we split multi-declarator fields at normalize time). */
  name: string;
  initializer?: ExpressionNode | null;
  /** Static modifier. */
  isStatic: boolean;
  /** Final modifier (informational). */
  isFinal: boolean;
}

export interface MethodDeclarationNode extends Node {
  type: 'MethodDeclaration';
  name: string;
  returnType: string;
  params: ParameterNode[];
  body: BlockNode;
  isStatic: boolean;
  isPublic: boolean;
  /** True for constructors (name == class name). */
  isConstructor: boolean;
}

export interface ParameterNode extends Node {
  type: 'Parameter';
  name: string;
  javaType: string;
}

// ---------- Statements ----------

export interface BlockNode extends Node {
  type: 'Block';
  statements: StatementNode[];
}

export type StatementNode =
  | BlockNode
  | LocalVarDeclarationNode
  | IfStatementNode
  | WhileStatementNode
  | ForStatementNode
  | DoWhileStatementNode
  | ReturnStatementNode
  | BreakStatementNode
  | ContinueStatementNode
  | ExpressionStatementNode
  | PrintStatementNode;

export interface LocalVarDeclarationNode extends Node {
  type: 'LocalVarDeclaration';
  javaType: string;
  name: string;
  initializer?: ExpressionNode | null;
  /** True if the declared Java type was `var`. */
  inferred: boolean;
}

export interface IfStatementNode extends Node {
  type: 'If';
  test: ExpressionNode;
  consequent: StatementNode;
  alternate?: StatementNode | null;
}

export interface WhileStatementNode extends Node {
  type: 'While';
  test: ExpressionNode;
  body: StatementNode;
}

export interface DoWhileStatementNode extends Node {
  type: 'DoWhile';
  body: StatementNode;
  test: ExpressionNode;
}

export interface ForStatementNode extends Node {
  type: 'For';
  initializer?: StatementNode | null;
  test?: ExpressionNode | null;
  update?: ExpressionNode | null;
  body: StatementNode;
}

export interface ReturnStatementNode extends Node {
  type: 'Return';
  value?: ExpressionNode | null;
}

export interface BreakStatementNode extends Node {
  type: 'Break';
}

export interface ContinueStatementNode extends Node {
  type: 'Continue';
}

export interface ExpressionStatementNode extends Node {
  type: 'ExpressionStatement';
  expression: ExpressionNode;
}

/**
 * Convenience node emitted for `System.out.println(...)` / `print(...)` at
 * normalize time so the engine can short-circuit to the emitter.
 */
export interface PrintStatementNode extends Node {
  type: 'Print';
  /** "println" or "print". */
  variant: 'println' | 'print';
  arg?: ExpressionNode | null;
}

// ---------- Expressions ----------

export type ExpressionNode =
  | IntegerLiteralNode
  | LongLiteralNode
  | DoubleLiteralNode
  | BooleanLiteralNode
  | CharLiteralNode
  | StringLiteralNode
  | NullLiteralNode
  | IdentifierNode
  | ThisNode
  | BinaryExpressionNode
  | UnaryExpressionNode
  | AssignmentExpressionNode
  | MethodInvocationNode
  | FieldAccessNode
  | ArrayAccessNode
  | ArrayLiteralNode
  | NewObjectNode
  | NewArrayNode
  | CastExpressionNode
  | TernaryExpressionNode
  | PostfixExpressionNode
  | PreIncrementNode
  | ParenExpressionNode;

export interface IntegerLiteralNode extends Node {
  type: 'IntegerLiteral';
  value: number;
}

export interface LongLiteralNode extends Node {
  type: 'LongLiteral';
  value: number;
}

export interface DoubleLiteralNode extends Node {
  type: 'DoubleLiteral';
  value: number;
}

export interface BooleanLiteralNode extends Node {
  type: 'BooleanLiteral';
  value: boolean;
}

export interface CharLiteralNode extends Node {
  type: 'CharLiteral';
  value: string;
}

export interface StringLiteralNode extends Node {
  type: 'StringLiteral';
  value: string;
}

export interface NullLiteralNode extends Node {
  type: 'NullLiteral';
}

export interface IdentifierNode extends Node {
  type: 'Identifier';
  name: string;
}

export interface ThisNode extends Node {
  type: 'This';
}

export type BinaryOperator =
  | '+' | '-' | '*' | '/' | '%'
  | '<' | '<=' | '>' | '>='
  | '==' | '!='
  | '&&' | '||'
  | '&' | '|' | '^' | '<<' | '>>';

export interface BinaryExpressionNode extends Node {
  type: 'BinaryExpression';
  operator: BinaryOperator;
  left: ExpressionNode;
  right: ExpressionNode;
}

export type UnaryOperator = '-' | '+' | '!' | '~';

export interface UnaryExpressionNode extends Node {
  type: 'UnaryExpression';
  operator: UnaryOperator;
  operand: ExpressionNode;
}

export interface PostfixExpressionNode extends Node {
  type: 'Postfix';
  operator: '++' | '--';
  operand: ExpressionNode;
}

export interface PreIncrementNode extends Node {
  type: 'PreIncrement';
  operator: '++' | '--';
  operand: ExpressionNode;
}

export type AssignmentOperator =
  | '=' | '+=' | '-=' | '*=' | '/=' | '%='
  | '&=' | '|=' | '^=' | '<<=' | '>>=';

export interface AssignmentExpressionNode extends Node {
  type: 'Assignment';
  operator: AssignmentOperator;
  target: ExpressionNode;
  value: ExpressionNode;
}

export interface MethodInvocationNode extends Node {
  type: 'MethodInvocation';
  /** `obj.method(args)` — `callee` is the receiver expression; null for unqualified calls. */
  callee?: ExpressionNode | null;
  name: string;
  args: ExpressionNode[];
}

export interface FieldAccessNode extends Node {
  type: 'FieldAccess';
  object?: ExpressionNode | null;
  field: string;
}

export interface ArrayAccessNode extends Node {
  type: 'ArrayAccess';
  array: ExpressionNode;
  index: ExpressionNode;
}

export interface ArrayLiteralNode extends Node {
  type: 'ArrayLiteral';
  elements: ExpressionNode[];
}

export interface NewObjectNode extends Node {
  type: 'NewObject';
  className: string;
  args: ExpressionNode[];
}

export interface NewArrayNode extends Node {
  type: 'NewArray';
  elementType: string;
  /** Sized-dimension lengths (e.g. `new int[5]` -> [5]). */
  sizes: ExpressionNode[];
  /** Initializer `{1,2,3}` if present. */
  initializer?: ArrayLiteralNode | null;
}

export interface CastExpressionNode extends Node {
  type: 'Cast';
  targetType: string;
  expression: ExpressionNode;
}

export interface TernaryExpressionNode extends Node {
  type: 'Ternary';
  test: ExpressionNode;
  consequent: ExpressionNode;
  alternate: ExpressionNode;
}

export interface ParenExpressionNode extends Node {
  type: 'Paren';
  expression: ExpressionNode;
}
