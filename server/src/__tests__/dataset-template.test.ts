import { describe, it, expect } from 'vitest';
import { resolveDataset, resolveHelpers, type RequestContext } from '../utils/template-helpers.js';
import { resolveResponseBody } from '../services/mock-handler.service.js';

const ctx: RequestContext = {
  body: {}, queryParams: {}, pathSegments: [], headers: {}, pathParams: {},
  datasetJson: '{"idx":2,"title":"beta"}',
};

describe('resolveDataset', () => {
  it('replaces {{$dataset}} with ctx.datasetJson', () => {
    expect(resolveDataset('{"data": {{$dataset}}}', ctx)).toBe('{"data": {"idx":2,"title":"beta"}}');
  });

  it('replaces {{$dataset}} with null when datasetJson is absent', () => {
    const noDs: RequestContext = { body: {}, queryParams: {}, pathSegments: [], headers: {}, pathParams: {} };
    expect(resolveDataset('{"data": {{$dataset}}}', noDs)).toBe('{"data": null}');
  });

  it('survives the helpers pass untouched (no quoted arg → no match)', () => {
    expect(resolveHelpers('{{$dataset}}', ctx)).toBe('{{$dataset}}');
  });

  it('resolveResponseBody injects the dataset as the final step', () => {
    const out = resolveResponseBody('{"errorCode":null,"data": {{$dataset}}}', {}, ctx);
    expect(JSON.parse(out)).toEqual({ errorCode: null, data: { idx: 2, title: 'beta' } });
  });
});
