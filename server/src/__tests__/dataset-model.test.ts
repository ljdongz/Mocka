import { describe, it, expect } from 'vitest';
import { resolveDatasetValue, type Dataset, type DatasetBinding } from '../models/dataset.js';

const ds: Dataset = {
  id: 'd1', name: 'plans', keyField: 'idx',
  records: [
    { idx: 1, title: 'alpha' },
    { idx: 2, title: 'beta' },
    { idx: 3, title: 'gamma' },
  ],
  createdAt: '2026-06-25 00:00:00', updatedAt: '2026-06-25 00:00:00',
};
const emptyCtx = { body: {}, pathParams: {}, queryParams: {} };

describe('resolveDatasetValue', () => {
  it('list mode returns the whole records array', () => {
    const b: DatasetBinding = { datasetId: 'd1', mode: 'list' };
    expect(resolveDatasetValue(ds, b, emptyCtx)).toEqual(ds.records);
  });

  it('list mode with projection returns only the named fields per record', () => {
    const b: DatasetBinding = { datasetId: 'd1', mode: 'list', projection: ['idx'] };
    expect(resolveDatasetValue(ds, b, emptyCtx)).toEqual([{ idx: 1 }, { idx: 2 }, { idx: 3 }]);
  });

  it('detail mode returns the matching record (key from body, default keyField)', () => {
    const b: DatasetBinding = { datasetId: 'd1', mode: 'detail' };
    expect(resolveDatasetValue(ds, b, { ...emptyCtx, body: { idx: 2 } })).toEqual({ idx: 2, title: 'beta' });
  });

  it('detail mode coerces number/string when matching the key', () => {
    const b: DatasetBinding = { datasetId: 'd1', mode: 'detail', keySource: { from: 'path', field: 'idx' } };
    expect(resolveDatasetValue(ds, b, { ...emptyCtx, pathParams: { idx: '2' } })).toEqual({ idx: 2, title: 'beta' });
  });

  it('detail mode returns null when no record matches', () => {
    const b: DatasetBinding = { datasetId: 'd1', mode: 'detail' };
    expect(resolveDatasetValue(ds, b, { ...emptyCtx, body: { idx: 99 } })).toBeNull();
  });

  it('detail mode returns null when the key is absent from the request', () => {
    const b: DatasetBinding = { datasetId: 'd1', mode: 'detail' };
    expect(resolveDatasetValue(ds, b, emptyCtx)).toBeNull();
  });
});
