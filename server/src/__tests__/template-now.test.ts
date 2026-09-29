import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveHelpers, type RequestContext } from '../utils/template-helpers.js';

const ctx: RequestContext = { body: {}, queryParams: {}, pathSegments: [], headers: {}, pathParams: {} };

describe('{{$now \'format\'}} helper', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Local-time constructor so the assertions hold in any TZ.
    vi.setSystemTime(new Date(2026, 8, 29, 9, 21, 3, 123));
  });
  afterEach(() => vi.useRealTimers());

  it('formats the current local time', () => {
    expect(resolveHelpers("{{$now 'yyMMddHHmmssSSS'}}", ctx)).toBe('260929092103123');
    expect(resolveHelpers("{{$now 'yyyy.MM.dd HH:mm:ss'}}", ctx)).toBe('2026.09.29 09:21:03');
    expect(resolveHelpers("{{$now ''}}", ctx)).toBe(new Date().toISOString());
  });

  it('applies the offset before formatting, so the format survives', () => {
    expect(resolveHelpers("{{$now 'yyyy.MM.dd' + 14d}}", ctx)).toBe('2026.10.13');
    expect(resolveHelpers("{{$now 'HH:mm' - 30m}}", ctx)).toBe('08:51');
  });

  it('rolls over midnight and month end on the calendar', () => {
    vi.setSystemTime(new Date(2026, 8, 30, 23, 30, 0, 0));
    expect(resolveHelpers("{{$now 'yyyy.MM.dd HH:mm' + 1h}}", ctx)).toBe('2026.10.01 00:30');
  });

  it('uses one instant for every $now in a template', () => {
    vi.useRealTimers();
    const out = JSON.parse(resolveHelpers(
      '{"a": {{$now \'yyMMddHHmmssSSS\'}}, "b": {{$now \'yyMMddHHmmssSSS\'}}}', ctx));
    expect(out.a).toBe(out.b);
  });
});
