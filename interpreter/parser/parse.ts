/**
 * Thin wrapper around `java-parser`.
 *
 * Parses Java source into a Chevrotain CST. The CST is then transformed to a
 * normalized AST by `normalize.ts`. Parsing errors are wrapped in a
 * student-friendly `ParseError` carrying location info.
 */

import { parse as javaParse, type CstNode, type IToken } from 'java-parser';

export class ParseError extends Error {
  readonly line: number;
  readonly column: number;
  constructor(message: string, line: number, column: number) {
    super(message);
    this.name = 'ParseError';
    this.line = line;
    this.column = column;
  }
}

export interface TokenLike {
  image: string;
  startLine?: number;
  startColumn?: number;
}

export type { CstNode, IToken };

/** Parse Java source to CST. Throws ParseError with location on failure. */
export function parseToCST(source: string): CstNode {
  try {
    return javaParse(source);
  } catch (e: unknown) {
    const err = e as { message?: string; token?: TokenLike; previousToken?: TokenLike };
    const tok = err.token ?? err.previousToken;
    const line = tok?.startLine ?? 1;
    const col = tok?.startColumn ?? 1;
    const msg = err.message ?? 'Syntax error';
    throw new ParseError(msg, line, col);
  }
}

/** Best-effort image of the first token in a possibly-empty array. */
export function tokenImage(tok: IToken | undefined): string {
  return tok ? tok.image : '';
}
