/**
 * Union of all property values of an object type.
 * Common pattern for const objects (e.g. enum-like maps).
 * See: https://github.com/microsoft/TypeScript/issues/37642
 *
 * @example
 * const MyIds = { FOO: 'foo', BAR: 'bar' } as const
 * type MyIdValue = ValueOf<typeof MyIds>  // 'foo' | 'bar'
 */
export type ValueOf<T> = T[keyof T]
