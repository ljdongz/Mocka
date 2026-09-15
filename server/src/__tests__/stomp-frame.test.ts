import { describe, it, expect } from 'vitest';
import { encodeFrame, StompFrameDecoder, StompFrameError, HEARTBEAT } from '../stomp/frame.js';

const dec = () => new StompFrameDecoder();

describe('encodeFrame', () => {
  it('encodes command, headers, body and NUL', () => {
    expect(encodeFrame({ command: 'SEND', headers: { destination: '/a', 'content-length': '2' }, body: 'hi' }))
      .toBe('SEND\ndestination:/a\ncontent-length:2\n\nhi\0');
  });
  it('encodes a frame without headers', () => {
    expect(encodeFrame({ command: 'DISCONNECT', headers: {}, body: '' })).toBe('DISCONNECT\n\n\0');
  });
  it('escapes header values except on CONNECT/CONNECTED', () => {
    expect(encodeFrame({ command: 'MESSAGE', headers: { k: 'a:b\nc\\d' }, body: '' })).toBe('MESSAGE\nk:a\\cb\\nc\\\\d\n\n\0');
    expect(encodeFrame({ command: 'CONNECTED', headers: { k: 'a:b' }, body: '' })).toBe('CONNECTED\nk:a:b\n\n\0');
    expect(encodeFrame({ command: 'CONNECT', headers: { host: 'a:b' }, body: '' })).toBe('CONNECT\nhost:a:b\n\n\0');
  });
});

describe('StompFrameDecoder', () => {
  it('round-trips', () => {
    const f = { command: 'MESSAGE', headers: { destination: '/t', x: 'a:b\nc' }, body: '{"k":1}' };
    const [out] = dec().push(encodeFrame(f));
    expect(out).toEqual(f);
  });
  it('reads exactly content-length bytes (body may contain NUL, multibyte)', () => {
    const body = 'a\0한';
    const len = Buffer.byteLength(body);
    const [out] = dec().push(`SEND\ncontent-length:${len}\n\n${body}\0`);
    expect(out.body).toBe(body);
  });
  it('reads to NUL when no content-length', () => {
    expect(dec().push('SEND\n\nabc\0')[0].body).toBe('abc');
  });
  it('keeps the first duplicate header', () => {
    expect(dec().push('SEND\nk:1\nk:2\n\n\0')[0].headers.k).toBe('1');
  });
  it('splits multiple frames in one chunk and skips heartbeat EOLs', () => {
    const frames = dec().push('\n\r\nSEND\n\na\0\nSEND\n\nb\0\n');
    expect(frames.map(f => f.body)).toEqual(['a', 'b']);
  });
  it('a lone heartbeat yields nothing and leaves nothing pending', () => {
    const d = dec();
    expect(d.push('\n')).toEqual([]);
    expect(d.pending).toBe(false);
  });
  it('accumulates a frame split across chunks (incomplete ≠ invalid)', () => {
    const d = dec();
    expect(d.push('SEND\ndest')).toEqual([]);
    expect(d.pending).toBe(true);
    expect(d.push('ination:/a\n\nhel')).toEqual([]);
    const [f] = d.push('lo\0');
    expect(f.headers.destination).toBe('/a');
    expect(f.body).toBe('hello');
    expect(d.pending).toBe(false);
  });
  it('accumulates when content-length body is short', () => {
    const d = dec();
    expect(d.push('SEND\ncontent-length:5\n\nhel')).toEqual([]);
    expect(d.push('lo\0')[0].body).toBe('hello');
  });
  it('accepts CRLF line endings', () => {
    expect(dec().push('SEND\r\nk:v\r\n\r\nx\0')[0]).toEqual({ command: 'SEND', headers: { k: 'v' }, body: 'x' });
  });
  it('does not unescape CONNECT headers', () => {
    expect(dec().push('CONNECT\nhost:a\\cb\n\n\0')[0].headers.host).toBe('a\\cb');
  });
  it('keeps everything after the first colon as the value', () => {
    expect(dec().push('CONNECT\nhost:a:b:c\n\n\0')[0].headers.host).toBe('a:b:c');
  });
  it('throws on a bad command line', () => {
    expect(() => dec().push('hello world\n\n\0')).toThrow(StompFrameError);
  });
  it('throws on a bad command line even before the frame completes', () => {
    expect(() => dec().push('hello world\n')).toThrow(StompFrameError);
  });
  it('throws on a header line without colon', () => {
    expect(() => dec().push('SEND\nnocolon\n\n\0')).toThrow(StompFrameError);
  });
  it('throws when content-length body is not NUL-terminated', () => {
    expect(() => dec().push('SEND\ncontent-length:2\n\nabc\0')).toThrow(StompFrameError);
  });
  it('throws on an undefined escape sequence', () => {
    expect(() => dec().push('SEND\nk:a\\tb\n\n\0')).toThrow(StompFrameError);
  });
  it('accepts Buffer input', () => {
    expect(dec().push(Buffer.from('SEND\n\nbuf\0'))[0].body).toBe('buf');
  });
  it('exports the heartbeat token', () => { expect(HEARTBEAT).toBe('\n'); });
});
