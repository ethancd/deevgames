// Node >= 17 and all modern browsers provide structuredClone at runtime, but
// the bare ES2022 lib (no DOM, no @types/node) does not declare it.
declare function structuredClone<T>(value: T): T;
