/**
 * Minimal browser-side STOMP 1.2 codec for the built-in test client.
 * Mirrors the server's escaping rules; bodies never carry NUL here, so
 * decoding splits on the frame terminator instead of honouring content-length.
 */

export interface StompFrame {
  command: string;
  headers: Record<string, string>;
  body: string;
}

const NO_ESCAPE = new Set(['CONNECT', 'CONNECTED', 'STOMP']);

function escapeHeader(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/:/g, '\\c');
}

function unescapeHeader(v: string): string {
  return v.replace(/\\(.)/g, (_, c: string) => ({ r: '\r', n: '\n', c: ':', '\\': '\\' }[c] ?? `\\${c}`));
}

export const byteLength = (s: string): number => new TextEncoder().encode(s).length;

export function encodeFrame(frame: StompFrame): string {
  const esc = !NO_ESCAPE.has(frame.command);
  const lines = Object.entries(frame.headers).map(([k, v]) => `${esc ? escapeHeader(k) : k}:${esc ? escapeHeader(String(v)) : String(v)}`);
  return `${frame.command}\n${lines.join('\n')}${lines.length ? '\n' : ''}\n${frame.body}\0`;
}

/** Decode every complete frame in a WebSocket text message; heartbeat EOLs are skipped. */
export function decodeFrames(text: string): StompFrame[] {
  const frames: StompFrame[] = [];
  for (const chunk of text.split('\0')) {
    const trimmed = chunk.replace(/^(\r?\n)+/, '');
    if (!trimmed) continue;
    const headerEnd = trimmed.search(/\r?\n\r?\n/);
    const head = headerEnd === -1 ? trimmed : trimmed.slice(0, headerEnd);
    const body = headerEnd === -1 ? '' : trimmed.slice(headerEnd).replace(/^\r?\n\r?\n/, '');
    const [commandLine, ...headerLines] = head.split(/\r?\n/);
    const command = commandLine.trim();
    const unescape = !NO_ESCAPE.has(command);
    const headers: Record<string, string> = {};
    for (const line of headerLines) {
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const key = unescape ? unescapeHeader(line.slice(0, idx)) : line.slice(0, idx);
      if (!(key in headers)) headers[key] = unescape ? unescapeHeader(line.slice(idx + 1)) : line.slice(idx + 1);
    }
    frames.push({ command, headers, body });
  }
  return frames;
}

export function isHeartbeat(text: string): boolean {
  return text === '\n' || text === '\r\n';
}
