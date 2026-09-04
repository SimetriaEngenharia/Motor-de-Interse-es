import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function distancePointToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

export function lineIntersection(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number) {
  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (denom === 0) return null;
  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
  return { x: x1 + ua * (x2 - x1), y: y1 + ua * (y2 - y1), ua, ub };
}
export const ALIGNMENT_LENGTH = 1000;

const exprCache = new Map<string, Function>();

export function evaluateExpression(
  expr: string,
  context: Record<string, number>,
): number {
  if (!expr || expr.trim() === "") return 0;
  try {
    const keys = Object.keys(context).sort();
    const cacheKey = expr + "|" + keys.join(",");
    let f = exprCache.get(cacheKey);
    if (!f) {
      f = new Function(...keys, `return ${expr};`);
      exprCache.set(cacheKey, f);
    }
    const values = keys.map(k => context[k]);
    const val = f(...values);
    return isNaN(val) ? 0 : val;
  } catch (e) {
    return 0;
  }
}
