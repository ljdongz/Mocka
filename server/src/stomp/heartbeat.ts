/**
 * STOMP 1.2 heart-beat negotiation.
 *
 * Client sends `heart-beat: cx,cy` (cx = what it can send, cy = what it wants
 * to receive); the server answers `sx,sy`. Effective intervals:
 *   server sends every  = (cy == 0 || sx == 0) ? 0 : max(sx, cy)
 *   server expects every = (cx == 0 || sy == 0) ? 0 : max(cx, sy)
 */

export function parseHeartbeat(header: string | undefined): [number, number] {
  if (!header) return [0, 0];
  const parts = header.split(',');
  if (parts.length !== 2) return [0, 0];
  const a = Number(parts[0].trim());
  const b = Number(parts[1].trim());
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return [0, 0];
  return [a, b];
}

export function negotiateHeartbeat(
  client: [number, number],
  server: [number, number],
): { sendEvery: number; expectEvery: number } {
  const [cx, cy] = client;
  const [sx, sy] = server;
  return {
    sendEvery: cy === 0 || sx === 0 ? 0 : Math.max(sx, cy),
    expectEvery: cx === 0 || sy === 0 ? 0 : Math.max(cx, sy),
  };
}
