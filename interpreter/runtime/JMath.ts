/**
 * java.lang.Math shim.
 */
import type { Value } from '../types';

const TAU = Math.PI * 2;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export const JMathMethods: Record<string, (args: Value[]) => Value> = {
  abs: (a) => Math.abs(typeof a[0] === 'number' ? a[0] : 0),
  max: (a) => Math.max(typeof a[0] === 'number' ? a[0] : -Infinity, typeof a[1] === 'number' ? a[1] : -Infinity),
  min: (a) => Math.min(typeof a[0] === 'number' ? a[0] : Infinity, typeof a[1] === 'number' ? a[1] : Infinity),
  pow: (a) => Math.pow(Number(a[0]), Number(a[1])),
  sqrt: (a) => Math.sqrt(Number(a[0])),
  cbrt: (a) => Math.cbrt(Number(a[0])),
  floor: (a) => Math.floor(Number(a[0])),
  ceil: (a) => Math.ceil(Number(a[0])),
  round: (a) => Math.round(Number(a[0])),
  random: () => Math.random(),
  sin: (a) => Math.sin(Number(a[0])),
  cos: (a) => Math.cos(Number(a[0])),
  tan: (a) => Math.tan(Number(a[0])),
  asin: (a) => Math.asin(Number(a[0])),
  acos: (a) => Math.acos(Number(a[0])),
  atan: (a) => Math.atan(Number(a[0])),
  atan2: (a) => Math.atan2(Number(a[0]), Number(a[1])),
  toRadians: (a) => toRad(Number(a[0])),
  toDegrees: (a) => toDeg(Number(a[0])),
  log: (a) => Math.log(Number(a[0])),
  log10: (a) => Math.log10(Number(a[0])),
  exp: (a) => Math.exp(Number(a[0])),
  signum: (a) => Math.sign(Number(a[0])),
  hypot: (a) => Math.hypot(Number(a[0]), Number(a[1])),
  floorMod: (a) => {
    const x = Number(a[0]); const y = Number(a[1]);
    return ((x % y) + y) % y;
  },
};

export const JMathFields: Record<string, Value> = {
  PI: Math.PI,
  E: Math.E,
  TAU,
};

export type { Value };
