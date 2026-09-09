import { describe, it, expect } from 'vitest';
import { resolveHelpers, type RequestContext } from '../utils/template-helpers.js';
import { resolveVariables } from '../utils/template-variables.js';

function ctxWith(partial: Partial<RequestContext>): RequestContext {
  return { body: {}, queryParams: {}, pathSegments: [], headers: {}, pathParams: {}, ...partial };
}

describe('offset suffix on request-context helpers', () => {
  it('does arithmetic on a body value', () => {
    const ctx = ctxWith({ body: { data: 1 } });
    const out = resolveHelpers('{"a": {{$body \'data\'}}, "b": {{$body \'data\' + 1}}, "c": {{$body \'data\' + 2}}}', ctx);
    expect(JSON.parse(out)).toEqual({ a: 1, b: 2, c: 3 });
  });

  it('subtracts, handles decimals, and works on query params', () => {
    const ctx = ctxWith({ queryParams: { page: '3', price: '10.5' } });
    expect(resolveHelpers("{{$queryParams 'page' - 1}}", ctx)).toBe('2');
    expect(resolveHelpers("{{$queryParams 'price' + 0.2}}", ctx)).toBe('10.7');
  });

  it('shifts a date-ish body value by a time unit', () => {
    const ctx = ctxWith({ body: { at: '2026-01-01T00:00:00.000Z', epoch: '1767225600' } });
    expect(resolveHelpers("{{$body 'at' + 3h}}", ctx)).toBe('2026-01-01T03:00:00.000Z');
    expect(resolveHelpers("{{$body 'at' - 1d}}", ctx)).toBe('2025-12-31T00:00:00.000Z');
    expect(resolveHelpers("{{$body 'epoch' + 1d}}", ctx)).toBe('1767312000');
  });

  it('leaves absent / non-numeric values alone so the body stays parseable', () => {
    const ctx = ctxWith({ body: { name: 'kim' } });
    const out = resolveHelpers('{"n": {{$body \'missing\' \'0\' + 1}}, "s": "{{$body \'name\' + 1}}"}', ctx);
    expect(JSON.parse(out)).toEqual({ n: 1, s: 'kim' });
  });

  it('still honours the default-value arg (no offset)', () => {
    expect(resolveHelpers("{{$body 'x' 'fallback'}}", ctxWith({}))).toBe('fallback');
  });
});

describe('offset suffix on dynamic variables', () => {
  it('shifts $isoTimestamp forward', () => {
    const out = resolveVariables('{{$isoTimestamp + 3h}}');
    expect(Date.parse(out) - Date.now()).toBeGreaterThan(3 * 3600_000 - 5000);
    expect(Date.parse(out) - Date.now()).toBeLessThan(3 * 3600_000 + 5000);
  });

  it('shifts $timestamp back by days', () => {
    const out = Number(resolveVariables('{{$timestamp - 7d}}'));
    expect(Math.floor(Date.now() / 1000) - out).toBeCloseTo(7 * 86400, -1);
  });

  it('supports s / m / w units and plain arithmetic', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(Number(resolveVariables('{{$timestamp + 30s}}')) - now).toBeCloseTo(30, -1);
    expect(Number(resolveVariables('{{$timestamp + 15m}}')) - now).toBeCloseTo(900, -1);
    expect(Number(resolveVariables('{{$timestamp + 2w}}')) - now).toBeCloseTo(1209600, -1);
    expect(Number(resolveVariables('{{$randomInt + 100000}}'))).toBeGreaterThanOrEqual(100000);
  });

  it('leaves bare and unknown variables untouched', () => {
    expect(resolveVariables('{{$isoTimestamp}}')).not.toBe('{{$isoTimestamp}}');
    expect(resolveVariables('{{$nope + 1}}')).toBe('{{$nope + 1}}');
    expect(resolveVariables('{{$randomUUID}}')).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('full resolveResponseBody pipeline', () => {
  it('survives the env pass and resolves offsets end to end', async () => {
    const { resolveResponseBody } = await import('../services/mock-handler.service.js');
    const template = '{"host":"{{baseUrl}}","data":{{$body \'data\'}},"next":{{$body \'data\' + 1}},"expiresAt":"{{$isoTimestamp + 3h}}"}';
    const out = resolveResponseBody(template, { baseUrl: 'http://x' }, ctxWith({ body: { data: 1 } }));
    const parsed = JSON.parse(out);
    expect(parsed.host).toBe('http://x');
    expect(parsed.next).toBe(2);
    expect(Date.parse(parsed.expiresAt) - Date.now()).toBeGreaterThan(3 * 3600_000 - 5000);
  });
});
