export interface Dataset {
  id: string;
  name: string;
  /** field name each record is keyed by, e.g. "idx" or "id" */
  keyField: string;
  records: any[];
  createdAt: string;
  updatedAt: string;
}

export interface DatasetBinding {
  datasetId: string;
  mode: 'list' | 'detail';
  /** list mode only: return just these fields per record (omit → full records) */
  projection?: string[];
  /** where the lookup key comes from in detail mode (defaults to body[dataset.keyField]) */
  keySource?: { from: 'body' | 'path' | 'query'; field: string };
}

export interface DatasetLookupContext {
  body: any;
  pathParams: Record<string, string>;
  queryParams: Record<string, string>;
}

/**
 * Resolve a variant's dataset binding to a response value.
 * - list  → the full records array
 * - detail → the single record whose keyField equals the request key, else null
 * Pure and stateless: output is a function of (dataset, binding, request) only.
 */
export function resolveDatasetValue(
  dataset: Dataset,
  binding: DatasetBinding,
  ctx: DatasetLookupContext,
): any[] | Record<string, any> | null {
  if (binding.mode === 'list') {
    if (!binding.projection || binding.projection.length === 0) return dataset.records;
    const fields = binding.projection;
    return dataset.records.map(r => Object.fromEntries(fields.map(k => [k, r?.[k]])));
  }

  const src = binding.keySource ?? { from: 'body' as const, field: dataset.keyField };
  const bag = src.from === 'path' ? ctx.pathParams : src.from === 'query' ? ctx.queryParams : ctx.body;
  const rawKey = bag != null ? bag[src.field] : undefined;
  if (rawKey === undefined || rawKey === null) return null;

  const match = dataset.records.find(r => r != null && String(r[dataset.keyField]) === String(rawKey));
  return match ?? null;
}
