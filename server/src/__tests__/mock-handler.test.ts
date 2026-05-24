import { describe, it, expect } from 'vitest';
import { resolveVariant, resolveResponseBody, buildRecordBody, resolveEnvVariables } from '../services/mock-handler.service.js';
import type { ResponseVariant } from '../models/response-variant.js';

// Helper to create a minimal ResponseVariant
function makeVariant(overrides: Partial<ResponseVariant> & { id: string; statusCode: number; description: string }): ResponseVariant {
  return {
    endpointId: 'ep1',
    body: '{}',
    headers: '{}',
    delay: null,
    memo: '',
    sortOrder: 0,
    matchRules: null,
    variantGroup: 'standard',
    ...overrides,
  };
}

// ─── resolveVariant ───────────────────────────────────────────────────────────

describe('resolveVariant', () => {
  const ep = { id: 'ep1', activeVariantId: undefined as string | undefined, sequenceMode: 'off' as const };
  const v200 = makeVariant({ id: 'v1', statusCode: 200, description: 'OK', sortOrder: 0 });
  const v404 = makeVariant({ id: 'v2', statusCode: 404, description: 'Not Found', sortOrder: 1 });
  const vActive = makeVariant({ id: 'v3', statusCode: 201, description: 'Created', sortOrder: 2 });

  it('returns undefined when variants array is empty', () => {
    expect(resolveVariant(ep, [], {}, {}, {}, {})).toBeUndefined();
  });

  it('selects variant by x-mock-response-code header', () => {
    const result = resolveVariant(ep, [v200, v404], { 'x-mock-response-code': '404' }, {}, {}, {});
    expect(result?.statusCode).toBe(404);
  });

  it('falls through to next strategy when x-mock-response-code does not match', () => {
    const result = resolveVariant({ ...ep, activeVariantId: 'v2' }, [v200, v404], { 'x-mock-response-code': '999' }, {}, {}, {});
    expect(result?.id).toBe('v2');
  });

  it('selects variant by x-mock-response-name header (case-insensitive)', () => {
    const result = resolveVariant(ep, [v200, v404], { 'x-mock-response-name': 'NOT FOUND' }, {}, {}, {});
    expect(result?.id).toBe('v2');
  });

  it('selects variant by matchRules', () => {
    const vRule = makeVariant({
      id: 'vRule',
      statusCode: 422,
      description: 'Unprocessable',
      matchRules: {
        bodyRules: [{ field: 'name', operator: 'equals', value: 'trigger' }],
        headerRules: [],
        queryParamRules: [],
        pathParamRules: [],
        combineWith: 'AND',
      },
    });
    const result = resolveVariant(ep, [v200, vRule], {}, { name: 'trigger' }, {}, {});
    expect(result?.id).toBe('vRule');
  });

  it('falls back to activeVariantId when no other strategy matches', () => {
    const result = resolveVariant({ ...ep, activeVariantId: 'v3' }, [v200, v404, vActive], {}, {}, {}, {});
    expect(result?.id).toBe('v3');
  });

  it('falls back to first variant when activeVariantId is absent', () => {
    const result = resolveVariant(ep, [v200, v404], {}, {}, {}, {});
    expect(result?.id).toBe('v1');
  });

  // Sequential mode tests
  it('sequential mode returns variants in sortOrder across calls', () => {
    const seqEp = { id: 'seq1', activeVariantId: undefined, sequenceMode: 'sequential' as const };
    const r1 = resolveVariant(seqEp, [v200, v404], {}, {}, {}, {});
    expect(r1?.id).toBe('v1');
    const r2 = resolveVariant(seqEp, [v200, v404], {}, {}, {}, {});
    expect(r2?.id).toBe('v2');
    const r3 = resolveVariant(seqEp, [v200, v404], {}, {}, {}, {});
    expect(r3?.id).toBe('v2'); // stays on last
  });

  it('loop mode wraps around', () => {
    const loopEp = { id: 'loop1', activeVariantId: undefined, sequenceMode: 'loop' as const };
    const r1 = resolveVariant(loopEp, [v200, v404], {}, {}, {}, {});
    expect(r1?.id).toBe('v1');
    const r2 = resolveVariant(loopEp, [v200, v404], {}, {}, {}, {});
    expect(r2?.id).toBe('v2');
    const r3 = resolveVariant(loopEp, [v200, v404], {}, {}, {}, {});
    expect(r3?.id).toBe('v1'); // wraps around
  });

  it('x-mock-response-code overrides sequence without advancing counter', () => {
    const seqEp = { id: 'seq2', activeVariantId: undefined, sequenceMode: 'sequential' as const };
    // first real call
    const r1 = resolveVariant(seqEp, [v200, v404], {}, {}, {}, {});
    expect(r1?.id).toBe('v1');
    // override call — should NOT advance
    const r2 = resolveVariant(seqEp, [v200, v404], { 'x-mock-response-code': '404' }, {}, {}, {});
    expect(r2?.id).toBe('v2');
    // next real call — counter should still be at 1
    const r3 = resolveVariant(seqEp, [v200, v404], {}, {}, {}, {});
    expect(r3?.id).toBe('v2');
  });

  it('match rules are skipped in sequence mode', () => {
    const seqEp = { id: 'seq3', activeVariantId: undefined, sequenceMode: 'sequential' as const };
    const vRule = makeVariant({
      id: 'vRule',
      statusCode: 422,
      description: 'Unprocessable',
      sortOrder: 1,
      matchRules: {
        bodyRules: [{ field: 'name', operator: 'equals', value: 'trigger' }],
        headerRules: [],
        queryParamRules: [],
        pathParamRules: [],
        combineWith: 'AND',
      },
    });
    // In sequence mode, match rules are ignored — first call returns sortOrder 0
    const result = resolveVariant(seqEp, [v200, vRule], {}, { name: 'trigger' }, {}, {});
    expect(result?.id).toBe('v1');
  });
});

// ─── resolveResponseBody ──────────────────────────────────────────────────────

describe('resolveResponseBody', () => {
  const ctx = {
    body: { userId: 42 },
    queryParams: { page: '2' },
    pathSegments: ['api', 'users', '42'],
    headers: { 'x-request-id': 'abc' },
    pathParams: { id: '42' },
  };

  it('substitutes environment variables', () => {
    const result = resolveResponseBody('Hello {{NAME}}', { NAME: 'World' }, ctx);
    expect(result).toBe('Hello World');
  });

  it('leaves unmatched env placeholders intact', () => {
    const result = resolveResponseBody('{{MISSING}}', {}, ctx);
    expect(result).toBe('{{MISSING}}');
  });

  it('substitutes $body helper', () => {
    const result = resolveResponseBody('id={{$body \'userId\'}}', {}, ctx);
    expect(result).toBe('id=42');
  });

  it('substitutes env var and helper together', () => {
    const result = resolveResponseBody('{{BASE}}/{{$body \'userId\'}}', { BASE: 'users' }, ctx);
    expect(result).toBe('users/42');
  });
});

// ─── buildRecordBody ──────────────────────────────────────────────────────────

describe('buildRecordBody', () => {
  it('returns JSON-stringified body when no pathParams', () => {
    const result = buildRecordBody({ a: 1 }, {});
    expect(result).toBe('{"a":1}');
  });

  it('returns empty object string for null body without pathParams', () => {
    const result = buildRecordBody(null, {});
    expect(result).toBe('{}');
  });

  it('merges pathParams into body object', () => {
    const parsed = JSON.parse(buildRecordBody({ a: 1 }, { id: '7' }));
    expect(parsed.a).toBe(1);
    expect(parsed._pathParams).toEqual({ id: '7' });
  });

  it('wraps non-object body in _body key when pathParams present', () => {
    const parsed = JSON.parse(buildRecordBody('raw-string', { id: '7' }));
    expect(parsed._body).toBe('raw-string');
    expect(parsed._pathParams).toEqual({ id: '7' });
  });

  it('wraps array body in _body key when pathParams present', () => {
    const parsed = JSON.parse(buildRecordBody([1, 2], { id: '3' }));
    expect(parsed._body).toEqual([1, 2]);
    expect(parsed._pathParams).toEqual({ id: '3' });
  });
});

// ─── resolveEnvVariables ──────────────────────────────────────────────────────

describe('resolveEnvVariables', () => {
  it('replaces known env vars', () => {
    expect(resolveEnvVariables('Hello {{NAME}}', { NAME: 'World' })).toBe('Hello World');
  });

  it('leaves unknown placeholders intact', () => {
    expect(resolveEnvVariables('{{UNKNOWN}}', {})).toBe('{{UNKNOWN}}');
  });

  it('returns template unchanged when envVars is empty', () => {
    expect(resolveEnvVariables('no vars here', {})).toBe('no vars here');
  });

  it('does not replace $-prefixed placeholders (helper syntax)', () => {
    expect(resolveEnvVariables("{{$body 'x'}}", { '$body': 'oops' })).toBe("{{$body 'x'}}");
  });
});
