/**
 * Dummy resolver that maps a file path to a Genie node ID.
 * Replace with real project‑graph lookup.
 */
export function nodeForPath(path: string): string | undefined {
  const m = /nodes\/(.*?)(\/|$)/.exec(path);
  return m?.[1];
}