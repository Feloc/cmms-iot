export function normalizeQueryArray(v: unknown): string[] {
  if (v == null) return [];

  // Express/Nest: ?status=A&status=B => ['A','B']
  if (Array.isArray(v)) {
    return v
      .flatMap((x) => String(x).split(','))
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Soporta ?status=A,B
  return String(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
