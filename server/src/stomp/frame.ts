/**
 * STOMP 1.2 frame codec.
 *
 *   COMMAND\n
 *   header:value\n
 *   \n
 *   body\0
 *
 * Header escaping (\r → \\r, \n → \\n, : → \\c, \\ → \\\\) applies to every
 * frame except CONNECT / CONNECTED / STOMP. `content-length`, when present, is
 * authoritative for the body (which may then contain NUL). The decoder is an
 * accumulating buffer: a frame split over several WebSocket messages is
 * *incomplete* (wait for more), a rule violation is *invalid* (throw).
 */

export interface StompFrame {
  command: string;
  headers: Record<string, string>;
  body: string;
}

export class StompFrameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StompFrameError';
  }
}

export const HEARTBEAT = '\n';

const NO_ESCAPE = new Set(['CONNECT', 'CONNECTED', 'STOMP']);
const COMMAND_RE = /^[A-Z]+$/;
/** Guard against an endless header section that never terminates. */
const MAX_BUFFER = 1 << 20;
const LF = 0x0a;
const CR = 0x0d;
const NUL = 0x00;

function escapeHeader(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/:/g, '\\c');
}

function unescapeHeader(v: string): string {
  return v.replace(/\\(.?)/g, (_, c: string) => {
    switch (c) {
      case 'r': return '\r';
      case 'n': return '\n';
      case 'c': return ':';
      case '\\': return '\\';
      default: throw new StompFrameError(`undefined escape sequence \\${c}`);
    }
  });
}

export function encodeFrame(frame: StompFrame): string {
  const esc = !NO_ESCAPE.has(frame.command);
  const lines = Object.entries(frame.headers).map(([k, v]) => {
    const key = esc ? escapeHeader(k) : k;
    const val = esc ? escapeHeader(String(v)) : String(v);
    return `${key}:${val}`;
  });
  return `${frame.command}\n${lines.join('\n')}${lines.length ? '\n' : ''}\n${frame.body}\0`;
}

export class StompFrameDecoder {
  private buf: Buffer = Buffer.alloc(0);

  get pending(): boolean {
    return this.buf.length > 0;
  }

  /** Append a chunk and return every frame completed by it. Throws StompFrameError on protocol violations. */
  push(chunk: string | Buffer): StompFrame[] {
    const incoming = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8');
    this.buf = this.buf.length ? Buffer.concat([this.buf, incoming]) : incoming;

    const frames: StompFrame[] = [];
    for (;;) {
      this.skipHeartbeats();
      if (this.buf.length === 0) break;

      const parsed = this.parseOne();
      if (!parsed) break; // incomplete — wait for more bytes
      frames.push(parsed.frame);
      this.buf = this.buf.subarray(parsed.end);
    }
    return frames;
  }

  private skipHeartbeats(): void {
    let i = 0;
    while (i < this.buf.length) {
      if (this.buf[i] === LF) i += 1;
      else if (this.buf[i] === CR && this.buf[i + 1] === LF) i += 2;
      else break;
    }
    if (i > 0) this.buf = this.buf.subarray(i);
  }

  /** Returns null when more data is needed. */
  private parseOne(): { frame: StompFrame; end: number } | null {
    const buf = this.buf;

    // ── command line ──
    const cmdEnd = buf.indexOf(LF);
    if (cmdEnd === -1) {
      if (buf.length > MAX_BUFFER) throw new StompFrameError('frame too large');
      return null;
    }
    const command = lineText(buf, 0, cmdEnd);
    if (!COMMAND_RE.test(command)) throw new StompFrameError(`invalid command line: ${command.slice(0, 32)}`);
    const unescape = !NO_ESCAPE.has(command);

    // ── headers ──
    const headers: Record<string, string> = {};
    let pos = cmdEnd + 1;
    for (;;) {
      const lineEnd = buf.indexOf(LF, pos);
      if (lineEnd === -1) {
        if (buf.length > MAX_BUFFER) throw new StompFrameError('frame too large');
        return null;
      }
      const line = lineText(buf, pos, lineEnd);
      pos = lineEnd + 1;
      if (line === '') break; // blank line ends the headers
      const colon = line.indexOf(':');
      if (colon === -1) throw new StompFrameError(`header line without colon: ${line.slice(0, 32)}`);
      const rawKey = line.slice(0, colon);
      const rawVal = line.slice(colon + 1);
      const key = unescape ? unescapeHeader(rawKey) : rawKey;
      if (!(key in headers)) headers[key] = unescape ? unescapeHeader(rawVal) : rawVal; // first value wins
    }

    // ── body ──
    const bodyStart = pos;
    const lengthHeader = headers['content-length'];
    if (lengthHeader !== undefined) {
      const len = Number(lengthHeader);
      if (!Number.isInteger(len) || len < 0) throw new StompFrameError(`invalid content-length: ${lengthHeader}`);
      const nulAt = bodyStart + len;
      if (buf.length < nulAt + 1) return null;
      if (buf[nulAt] !== NUL) throw new StompFrameError('body longer than content-length');
      return { frame: { command, headers, body: buf.subarray(bodyStart, nulAt).toString('utf8') }, end: nulAt + 1 };
    }
    const nulAt = buf.indexOf(NUL, bodyStart);
    if (nulAt === -1) {
      if (buf.length > MAX_BUFFER) throw new StompFrameError('frame too large');
      return null;
    }
    return { frame: { command, headers, body: buf.subarray(bodyStart, nulAt).toString('utf8') }, end: nulAt + 1 };
  }
}

/** Text of buf[start, end) with a trailing CR stripped (CRLF tolerance). */
function lineText(buf: Buffer, start: number, end: number): string {
  const stop = end > start && buf[end - 1] === CR ? end - 1 : end;
  return buf.subarray(start, stop).toString('utf8');
}
