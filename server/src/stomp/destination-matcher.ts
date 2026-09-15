/**
 * Ant-style destination patterns (Spring SimpleBroker convention):
 *   `*`  one segment      /topic/rooms/*   → /topic/rooms/88   ✓   /topic/rooms/88/read ✗
 *   `**` the rest         /topic/**        → /topic/rooms/88/read ✓
 *   literal exact match   /user/queue/inbox
 * Separators are `/` and `.`; a leading separator yields no empty segment, so
 * `/topic/rooms/88` and `/topic/rooms.88` are the same `["topic","rooms","88"]`.
 * This grammar differs from Mocka's `:param` route paths and is kept separate.
 */

export function splitSegments(destination: string): string[] {
  return destination.split(/[/.]/).filter(Boolean);
}

export function hasWildcard(pattern: string): boolean {
  return pattern.includes('*');
}

/** Returns the wildcard captures (in pattern order; `**` captures its segments joined with '/') or null. */
export function matchDestination(pattern: string, destination: string): { captures: string[] } | null {
  const captures = match(splitSegments(pattern), 0, splitSegments(destination), 0, []);
  return captures ? { captures } : null;
}

function match(p: string[], pi: number, d: string[], di: number, caps: string[]): string[] | null {
  if (pi === p.length) return di === d.length ? caps : null;
  const tok = p[pi];
  if (tok === '**') {
    // greedy, backtracking so a literal tail (e.g. /**/read) can still match
    for (let take = d.length - di; take >= 0; take--) {
      const r = match(p, pi + 1, d, di + take, [...caps, d.slice(di, di + take).join('/')]);
      if (r) return r;
    }
    return null;
  }
  if (di >= d.length) return null;
  if (tok === '*') return match(p, pi + 1, d, di + 1, [...caps, d[di]]);
  return tok === d[di] ? match(p, pi + 1, d, di + 1, caps) : null;
}
