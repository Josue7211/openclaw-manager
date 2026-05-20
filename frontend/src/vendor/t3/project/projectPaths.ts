// Copied/adapted from T3 Code apps/web/src/lib/projectPaths.
// Upstream: T3 Chat project path normalization semantics.

export function normalizeProjectPathForComparison(path: string): string {
  return path
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/g, '')
    .toLowerCase()
}
