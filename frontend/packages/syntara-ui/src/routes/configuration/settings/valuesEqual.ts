/** Compare two setting values for equality (handles arrays and primitives). */
export function valuesEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i])
  }
  return Object.is(a, b)
}
