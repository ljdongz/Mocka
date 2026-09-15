/**
 * Shared helpers for the STOMP integration tests: an in-memory DB behind a real
 * mock server on an ephemeral port, and a tiny STOMP client over `ws`.
 */
import WebSocket from 'ws';
import { initDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import { createMockServer } from '../mock-server.js';
import { StompFrameDecoder, encodeFrame, type StompFrame } from '../stomp/frame.js';
import * as stompService from '../services/stomp.service.js';
import * as stompRegistry from '../services/stomp-registry.js';
import * as runtime from '../stomp/runtime.js';
import type { StompConnection } from '../models/stomp.js';

export async function startMock() {
  initDb(':memory:');
  initSchema();
  stompRegistry.reload([]);
  runtime.resetAll();
  const app = await createMockServer(0);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = (app.server.address() as { port: number }).port;
  return {
    app,
    port,
    url: (path: string) => `ws://127.0.0.1:${port}${path}`,
    close: async () => { runtime.resetAll(); await app.close(); },
  };
}

export function seedConnection(over: Partial<StompConnection> = {}): StompConnection {
  return stompService.createConnection({ name: 'chat', path: '/api/app/ws/chat', ...over });
}

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export class TestClient {
  ws!: WebSocket;
  /** decoded frames not yet consumed by next() */
  frames: StompFrame[] = [];
  /** every raw text message, heartbeats included */
  raw: string[] = [];
  closed: { code: number; reason: string } | null = null;
  private dec = new StompFrameDecoder();
  private waiters: ((f: StompFrame) => void)[] = [];

  static async open(url: string): Promise<TestClient> {
    const c = new TestClient();
    c.ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      c.ws.once('open', () => resolve());
      c.ws.once('error', reject);
    });
    c.ws.on('message', (data) => {
      const text = data.toString();
      c.raw.push(text);
      for (const f of c.dec.push(text)) {
        const waiter = c.waiters.shift();
        if (waiter) waiter(f); else c.frames.push(f);
      }
    });
    c.ws.on('close', (code, reason) => { c.closed = { code, reason: reason.toString() }; });
    return c;
  }

  send(frame: StompFrame): void {
    this.ws.send(encodeFrame(frame));
  }

  sendRaw(text: string): void {
    this.ws.send(text);
  }

  next(timeoutMs = 2000): Promise<StompFrame> {
    const queued = this.frames.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout waiting for frame')), timeoutMs);
      this.waiters.push(f => { clearTimeout(t); resolve(f); });
    });
  }

  /** Resolves true when no frame arrives within the window. */
  async silence(ms: number): Promise<boolean> {
    const before = this.frames.length;
    await sleep(ms);
    return this.frames.length === before && this.waiters.length === 0;
  }

  async connect(headers: Record<string, string> = {}): Promise<StompFrame> {
    this.send({ command: 'CONNECT', headers: { 'accept-version': '1.2', 'heart-beat': '0,0', host: 'localhost', ...headers }, body: '' });
    return this.next();
  }

  subscribe(id: string, destination: string, extra: Record<string, string> = {}): void {
    this.send({ command: 'SUBSCRIBE', headers: { id, destination, ack: 'auto', ...extra }, body: '' });
  }

  sendTo(destination: string, body: string, extra: Record<string, string> = {}): void {
    this.send({ command: 'SEND', headers: { destination, 'content-length': String(Buffer.byteLength(body)), ...extra }, body });
  }

  heartbeatsReceived(): number {
    return this.raw.filter(r => r === '\n').length;
  }

  waitClose(timeoutMs = 2000): Promise<{ code: number; reason: string }> {
    if (this.closed) return Promise.resolve(this.closed);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout waiting for close')), timeoutMs);
      this.ws.once('close', (code, reason) => { clearTimeout(t); resolve({ code, reason: reason.toString() }); });
    });
  }

  close(): void {
    this.ws.close();
  }
}
