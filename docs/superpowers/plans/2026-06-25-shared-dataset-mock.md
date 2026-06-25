# Shared Dataset Mock (Approach A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one shared, read-only dataset back multiple mock endpoints so a LIST endpoint returns the whole record array and a DETAIL endpoint returns the single record matching a key from the request — making "click id=2 → get id=2's data" work without hand-authoring one variant per id.

**Architecture:** A new first-class `datasets` table holds named record arrays keyed by a `keyField`. A response variant gains an optional `datasetBinding` (`{ datasetId, mode: 'list'|'detail', keySource? }`). At request time `handleMockRequest` resolves the binding against the live dataset (pure function `resolveDatasetValue`), JSON-stringifies the result, and the response-body template's `{{$dataset}}` token is replaced with it as the final templating step. Resolution is per-request and stateless, so it stays a true mock (no writes, no cross-request state) and needs no route-registry invalidation.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), better-sqlite3 (synchronous, raw SQL DDL), Fastify (admin API), `@modelcontextprotocol/sdk` + zod (MCP tools), vitest 4 (tests).

## Global Constraints

- ESM import specifiers always end in `.js` even though sources are `.ts`.
- DB is better-sqlite3 and **synchronous** — no `async`/`await` around DB calls.
- JSON columns are `TEXT`; serialize with `JSON.stringify` on write and `JSON.parse` on read **in the repository layer only**.
- Migrations live in `db/schema.ts:initSchema()`, run on every startup, and **must be idempotent** (`CREATE TABLE IF NOT EXISTS`; guard `ALTER TABLE` with a `PRAGMA table_info` check).
- Foreign keys are ON (`PRAGMA foreign_keys = ON`); a `response_variants` row requires an existing `endpoints` row.
- Routes do manual `req.body as {...}` / `req.params as {...}` casts (no validation framework). Error responses are `{ error: string }`. For 201/40x, call `reply.code(n)` **before** `return`.
- IDs are UUID strings via `import { randomUUID as uuid } from 'crypto'`, generated in the **service** layer; repos receive the full id.
- Run a single test file with `npm run test -- <name-fragment>` (from `server/`). Run all with `npm run test`.
- **Scope:** server core only. The client UI (dataset-authoring modal + variant-binding UI) is a **separate follow-up plan** — see "Out of Scope" at the end.

---

### Task 1: Dataset model + pure resolution logic

**Files:**
- Create: `server/src/models/dataset.ts`
- Modify: `server/src/models/response-variant.ts` (add optional `datasetBinding` field)
- Test: `server/src/__tests__/dataset-model.test.ts`

**Interfaces:**
- Produces: `interface Dataset { id: string; name: string; keyField: string; records: any[]; createdAt: string; updatedAt: string }`
- Produces: `interface DatasetBinding { datasetId: string; mode: 'list' | 'detail'; projection?: string[]; keySource?: { from: 'body' | 'path' | 'query'; field: string } }`
- Produces: `interface DatasetLookupContext { body: any; pathParams: Record<string,string>; queryParams: Record<string,string> }`
- Produces: `function resolveDatasetValue(dataset: Dataset, binding: DatasetBinding, ctx: DatasetLookupContext): any[] | Record<string, any> | null`
- Produces: `ResponseVariant.datasetBinding?: DatasetBinding | null`

- [ ] **Step 1: Write the failing test**

Create `server/src/__tests__/dataset-model.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm run test -- dataset-model`
Expected: FAIL — cannot resolve `../models/dataset.js` (file does not exist).

- [ ] **Step 3: Create the model and resolver**

Create `server/src/models/dataset.ts`:

```ts
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
```

- [ ] **Step 4: Add the `datasetBinding` field to the ResponseVariant model**

In `server/src/models/response-variant.ts`, add the import at the top and the field inside `interface ResponseVariant` (after `presetId: string | null;`):

```ts
import type { DatasetBinding } from './dataset.js';
```

```ts
  presetId: string | null;
  datasetBinding?: DatasetBinding | null;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npm run test -- dataset-model`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/models/dataset.ts server/src/models/response-variant.ts server/src/__tests__/dataset-model.test.ts
git commit -m "feat(dataset): add Dataset model + pure resolveDatasetValue + variant binding type"
```

---

### Task 2: Database schema — `datasets` table + `dataset_binding` column

**Files:**
- Modify: `server/src/db/schema.ts` (add `datasets` to the `db.exec` CREATE block; add a migration for `response_variants.dataset_binding`)
- Test: `server/src/__tests__/dataset-schema.test.ts`

**Interfaces:**
- Produces: table `datasets(id, name, key_field, records, created_at, updated_at)`
- Produces: column `response_variants.dataset_binding TEXT` (nullable)

- [ ] **Step 1: Write the failing test**

Create `server/src/__tests__/dataset-schema.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDb, closeDb, getDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';

describe('dataset schema', () => {
  beforeEach(() => { initDb(':memory:'); initSchema(); });
  afterEach(() => { closeDb(); });

  it('creates a datasets table with the expected columns', () => {
    const cols = getDb().prepare("PRAGMA table_info(datasets)").all() as { name: string }[];
    const names = cols.map(c => c.name);
    expect(names).toEqual(expect.arrayContaining(['id', 'name', 'key_field', 'records', 'created_at', 'updated_at']));
  });

  it('adds a dataset_binding column to response_variants', () => {
    const cols = getDb().prepare("PRAGMA table_info(response_variants)").all() as { name: string }[];
    expect(cols.map(c => c.name)).toContain('dataset_binding');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm run test -- dataset-schema`
Expected: FAIL — `datasets` table has no columns (PRAGMA returns `[]`) and `dataset_binding` is missing.

- [ ] **Step 3: Add the `datasets` table to the CREATE block**

In `server/src/db/schema.ts`, inside the single `db.exec(\`...\`)` template, add this table definition immediately after the `settings` table block (the last `CREATE TABLE IF NOT EXISTS settings (...)`):

```sql
    CREATE TABLE IF NOT EXISTS datasets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key_field TEXT NOT NULL DEFAULT 'id',
      records TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
```

- [ ] **Step 4: Add the idempotent `dataset_binding` migration**

In `server/src/db/schema.ts`, after the existing `preset_id` migration block (the one guarded by `variantCols3`), add:

```ts
  // Migration: add dataset_binding column to response_variants if missing
  const variantCols4 = db.prepare("PRAGMA table_info(response_variants)").all() as { name: string }[];
  if (!variantCols4.some(c => c.name === 'dataset_binding')) {
    db.exec("ALTER TABLE response_variants ADD COLUMN dataset_binding TEXT");
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npm run test -- dataset-schema`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/db/schema.ts server/src/__tests__/dataset-schema.test.ts
git commit -m "feat(dataset): add datasets table and response_variants.dataset_binding migration"
```

---

### Task 3: Dataset repository (CRUD)

**Files:**
- Create: `server/src/repositories/dataset.repo.ts`
- Test: `server/src/__tests__/dataset-repo.test.ts`

**Interfaces:**
- Consumes: `Dataset` (Task 1), `datasets` table (Task 2), `getDb` from `db/connection.js`
- Produces: `rowToDataset(row): Dataset`, `findAll(): Dataset[]`, `findById(id): Dataset | null`, `create(d: { id; name; keyField; records }): Dataset`, `update(id, data: Partial<Pick<Dataset,'name'|'keyField'|'records'>>): Dataset | null`, `remove(id): boolean`

- [ ] **Step 1: Write the failing test**

Create `server/src/__tests__/dataset-repo.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID as uuid } from 'crypto';
import { initDb, closeDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import * as datasetRepo from '../repositories/dataset.repo.js';

describe('dataset.repo', () => {
  beforeEach(() => { initDb(':memory:'); initSchema(); });
  afterEach(() => { closeDb(); });

  it('create() round-trips records as JSON and populates timestamps', () => {
    const id = uuid();
    const ds = datasetRepo.create({ id, name: 'plans', keyField: 'idx', records: [{ idx: 1 }, { idx: 2 }] });
    expect(ds.id).toBe(id);
    expect(ds.keyField).toBe('idx');
    expect(ds.records).toEqual([{ idx: 1 }, { idx: 2 }]);
    expect(ds.createdAt).toBeTruthy();
  });

  it('findById() returns null for unknown id', () => {
    expect(datasetRepo.findById('nope')).toBeNull();
  });

  it('update() coalesces unspecified fields and replaces records', () => {
    const id = uuid();
    datasetRepo.create({ id, name: 'plans', keyField: 'idx', records: [{ idx: 1 }] });
    const updated = datasetRepo.update(id, { records: [{ idx: 9 }] });
    expect(updated!.name).toBe('plans');
    expect(updated!.records).toEqual([{ idx: 9 }]);
  });

  it('remove() deletes and reports success', () => {
    const id = uuid();
    datasetRepo.create({ id, name: 'x', keyField: 'id', records: [] });
    expect(datasetRepo.remove(id)).toBe(true);
    expect(datasetRepo.findById(id)).toBeNull();
    expect(datasetRepo.remove(id)).toBe(false);
  });

  it('findAll() returns all datasets ordered by created_at', () => {
    datasetRepo.create({ id: uuid(), name: 'a', keyField: 'id', records: [] });
    datasetRepo.create({ id: uuid(), name: 'b', keyField: 'id', records: [] });
    expect(datasetRepo.findAll()).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm run test -- dataset-repo`
Expected: FAIL — cannot resolve `../repositories/dataset.repo.js`.

- [ ] **Step 3: Implement the repository**

Create `server/src/repositories/dataset.repo.ts`:

```ts
import { getDb } from '../db/connection.js';
import type { Dataset } from '../models/dataset.js';

export function rowToDataset(row: any): Dataset {
  return {
    id: row.id,
    name: row.name,
    keyField: row.key_field,
    records: row.records ? JSON.parse(row.records) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function findAll(): Dataset[] {
  const db = getDb();
  return db.prepare('SELECT * FROM datasets ORDER BY created_at').all().map(rowToDataset);
}

export function findById(id: string): Dataset | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM datasets WHERE id = ?').get(id) as any;
  return row ? rowToDataset(row) : null;
}

export function create(d: { id: string; name: string; keyField: string; records: any[] }): Dataset {
  const db = getDb();
  db.prepare('INSERT INTO datasets (id, name, key_field, records) VALUES (?, ?, ?, ?)')
    .run(d.id, d.name, d.keyField, JSON.stringify(d.records ?? []));
  return findById(d.id)!;
}

export function update(
  id: string,
  data: Partial<Pick<Dataset, 'name' | 'keyField' | 'records'>>,
): Dataset | null {
  const db = getDb();
  const existing = findById(id);
  if (!existing) return null;

  db.prepare("UPDATE datasets SET name=?, key_field=?, records=?, updated_at=datetime('now') WHERE id=?").run(
    data.name ?? existing.name,
    data.keyField ?? existing.keyField,
    JSON.stringify(data.records !== undefined ? data.records : existing.records),
    id,
  );
  return findById(id);
}

export function remove(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM datasets WHERE id = ?').run(id);
  return result.changes > 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm run test -- dataset-repo`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/repositories/dataset.repo.ts server/src/__tests__/dataset-repo.test.ts
git commit -m "feat(dataset): add dataset repository CRUD"
```

---

### Task 4: Persist `dataset_binding` on response variants

**Files:**
- Modify: `server/src/repositories/variant.repo.ts` (`rowToVariant`, `create`, `update`)
- Test: `server/src/__tests__/variant-dataset-binding.test.ts`

**Interfaces:**
- Consumes: `ResponseVariant.datasetBinding` (Task 1), `dataset_binding` column (Task 2)
- Produces: variant repo round-trips `datasetBinding` as JSON

- [ ] **Step 1: Write the failing test**

Create `server/src/__tests__/variant-dataset-binding.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID as uuid } from 'crypto';
import { initDb, closeDb, getDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import * as variantRepo from '../repositories/variant.repo.js';
import type { ResponseVariant } from '../models/response-variant.js';

function makeVariant(over: Partial<ResponseVariant> & { id: string; endpointId: string }): ResponseVariant {
  return {
    statusCode: 200, description: 'OK', body: '{}', headers: '{}', delay: null,
    memo: '', sortOrder: 0, matchRules: null, variantGroup: 'standard', presetId: null,
    datasetBinding: null,
    ...over,
  };
}

describe('variant.repo dataset_binding', () => {
  let endpointId: string;
  beforeEach(() => {
    initDb(':memory:'); initSchema();
    endpointId = uuid();
    // FK requires an endpoints row to exist
    getDb().prepare("INSERT INTO endpoints (id, method, path, name) VALUES (?, 'GET', '/x', 'x')").run(endpointId);
  });
  afterEach(() => { closeDb(); });

  it('round-trips a datasetBinding object', () => {
    const id = uuid();
    variantRepo.create(makeVariant({
      id, endpointId,
      datasetBinding: { datasetId: 'd1', mode: 'detail', keySource: { from: 'body', field: 'idx' } },
    }));
    expect(variantRepo.findById(id)!.datasetBinding).toEqual({
      datasetId: 'd1', mode: 'detail', keySource: { from: 'body', field: 'idx' },
    });
  });

  it('defaults datasetBinding to null and can be updated', () => {
    const id = uuid();
    variantRepo.create(makeVariant({ id, endpointId }));
    expect(variantRepo.findById(id)!.datasetBinding).toBeNull();

    variantRepo.update(id, { datasetBinding: { datasetId: 'd2', mode: 'list' } });
    expect(variantRepo.findById(id)!.datasetBinding).toEqual({ datasetId: 'd2', mode: 'list' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm run test -- variant-dataset-binding`
Expected: FAIL — `datasetBinding` is `undefined` (repo does not read/write the column yet).

- [ ] **Step 3: Read `dataset_binding` in `rowToVariant`**

In `server/src/repositories/variant.repo.ts`, add to the object returned by `rowToVariant` (after `presetId: row.preset_id ?? null,`):

```ts
    datasetBinding: row.dataset_binding ? JSON.parse(row.dataset_binding) : null,
```

- [ ] **Step 4: Write `dataset_binding` in `create`**

In `create`, change the INSERT column list, the placeholders, and the bound args:

```ts
  db.prepare(`
    INSERT INTO response_variants (id, endpoint_id, status_code, description, body, headers, delay, memo, sort_order, match_rules, variant_group, preset_id, dataset_binding)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(v.id, v.endpointId, v.statusCode, v.description, v.body, v.headers, v.delay, v.memo, v.sortOrder,
    v.matchRules ? JSON.stringify(v.matchRules) : null, v.variantGroup ?? 'standard', v.presetId ?? null,
    v.datasetBinding ? JSON.stringify(v.datasetBinding) : null);
```

- [ ] **Step 5: Write `dataset_binding` in `update`**

In `update`, before the `db.prepare(\`UPDATE ...\`)` call, add the coalesced value:

```ts
  const datasetBinding = data.datasetBinding !== undefined
    ? (data.datasetBinding ? JSON.stringify(data.datasetBinding) : null)
    : (existing.datasetBinding ? JSON.stringify(existing.datasetBinding) : null);
```

Then change the UPDATE statement to set the column and pass the arg (add `dataset_binding=?` after `preset_id=?`, and pass `datasetBinding` after the `presetId` arg, before `id`):

```ts
  db.prepare(`
    UPDATE response_variants SET status_code=?, description=?, body=?, headers=?, delay=?, memo=?, sort_order=?, match_rules=?, variant_group=?, preset_id=?, dataset_binding=?
    WHERE id=?
  `).run(
    data.statusCode ?? existing.statusCode,
    data.description ?? existing.description,
    data.body ?? existing.body,
    data.headers ?? existing.headers,
    data.delay !== undefined ? data.delay : existing.delay,
    data.memo ?? existing.memo,
    data.sortOrder ?? existing.sortOrder,
    matchRules,
    data.variantGroup ?? existing.variantGroup,
    data.presetId !== undefined ? data.presetId : existing.presetId,
    datasetBinding,
    id,
  );
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd server && npm run test -- variant-dataset-binding`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add server/src/repositories/variant.repo.ts server/src/__tests__/variant-dataset-binding.test.ts
git commit -m "feat(dataset): persist datasetBinding on response variants"
```

---

### Task 5: Dataset service + domain events

**Files:**
- Create: `server/src/services/dataset.service.ts`
- Modify: `server/src/services/domain-events.ts` (add dataset event types)
- Test: `server/src/__tests__/dataset-service.test.ts`

**Interfaces:**
- Consumes: `dataset.repo` (Task 3), `emit` from `domain-events.js`
- Produces: `getAll(): Dataset[]`, `getById(id): Dataset | null`, `create(input: { name; keyField; records? }): Dataset`, `update(id, data): Dataset | null`, `remove(id): boolean`
- Produces (events): `dataset:created`, `dataset:updated`, `dataset:deleted`

- [ ] **Step 1: Add dataset event types to the DomainEvent union**

In `server/src/services/domain-events.ts`, add the import (after the other model imports) and the three union members (after the `environment:active-changed` line):

```ts
import type { Dataset } from '../models/dataset.js';
```

```ts
  | { type: 'dataset:created'; payload: Dataset }
  | { type: 'dataset:updated'; payload: Dataset }
  | { type: 'dataset:deleted'; payload: { id: string } }
```

- [ ] **Step 2: Write the failing test**

Create `server/src/__tests__/dataset-service.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../services/domain-events.js', () => ({ emit: vi.fn() }));

import { initDb, closeDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import { emit } from '../services/domain-events.js';
import * as datasetService from '../services/dataset.service.js';

describe('dataset.service', () => {
  beforeEach(() => { initDb(':memory:'); initSchema(); vi.clearAllMocks(); });
  afterEach(() => { closeDb(); });

  it('create() generates an id, defaults records to [], and emits dataset:created', () => {
    const ds = datasetService.create({ name: 'plans', keyField: 'idx' });
    expect(ds.id).toBeTruthy();
    expect(ds.records).toEqual([]);
    expect(emit).toHaveBeenCalledWith('dataset:created', expect.objectContaining({ name: 'plans' }));
  });

  it('update() emits dataset:updated when the dataset exists', () => {
    const ds = datasetService.create({ name: 'plans', keyField: 'idx' });
    vi.clearAllMocks();
    datasetService.update(ds.id, { name: 'renamed' });
    expect(emit).toHaveBeenCalledWith('dataset:updated', expect.objectContaining({ name: 'renamed' }));
  });

  it('remove() emits dataset:deleted only when something was deleted', () => {
    const ds = datasetService.create({ name: 'plans', keyField: 'idx' });
    vi.clearAllMocks();
    expect(datasetService.remove(ds.id)).toBe(true);
    expect(emit).toHaveBeenCalledWith('dataset:deleted', { id: ds.id });

    vi.clearAllMocks();
    expect(datasetService.remove('nope')).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd server && npm run test -- dataset-service`
Expected: FAIL — cannot resolve `../services/dataset.service.js`.

- [ ] **Step 4: Implement the service**

Create `server/src/services/dataset.service.ts`:

```ts
import { randomUUID as uuid } from 'crypto';
import * as datasetRepo from '../repositories/dataset.repo.js';
import { emit } from './domain-events.js';
import type { Dataset } from '../models/dataset.js';

export function getAll(): Dataset[] {
  return datasetRepo.findAll();
}

export function getById(id: string): Dataset | null {
  return datasetRepo.findById(id);
}

export function create(input: { name: string; keyField: string; records?: any[] }): Dataset {
  const ds = datasetRepo.create({
    id: uuid(),
    name: input.name,
    keyField: input.keyField,
    records: input.records ?? [],
  });
  emit('dataset:created', ds);
  return ds;
}

export function update(
  id: string,
  data: Partial<Pick<Dataset, 'name' | 'keyField' | 'records'>>,
): Dataset | null {
  const ds = datasetRepo.update(id, data);
  if (ds) emit('dataset:updated', ds);
  return ds;
}

export function remove(id: string): boolean {
  const ok = datasetRepo.remove(id);
  if (ok) emit('dataset:deleted', { id });
  return ok;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npm run test -- dataset-service`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/services/dataset.service.ts server/src/services/domain-events.ts server/src/__tests__/dataset-service.test.ts
git commit -m "feat(dataset): add dataset service + domain events"
```

---

### Task 6: REST routes for datasets

**Files:**
- Create: `server/src/routes/dataset.routes.ts`
- Modify: `server/src/admin-server.ts` (import + register)
- Test: `server/src/__tests__/dataset-routes.test.ts`

**Interfaces:**
- Consumes: `dataset.service` (Task 5)
- Produces: `datasetRoutes(app: FastifyInstance): Promise<void>` exposing `GET /api/datasets`, `GET /api/datasets/:id`, `POST /api/datasets`, `PUT /api/datasets/:id`, `DELETE /api/datasets/:id`

- [ ] **Step 1: Write the failing test**

Create `server/src/__tests__/dataset-routes.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { initDb, closeDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import { datasetRoutes } from '../routes/dataset.routes.js';

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(datasetRoutes);
  await app.ready();
  return app;
}

describe('dataset routes', () => {
  let app: FastifyInstance;
  beforeEach(async () => { initDb(':memory:'); initSchema(); app = await buildApp(); });
  afterEach(async () => { await app.close(); closeDb(); });

  it('POST creates (201) and GET lists it', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/datasets',
      payload: { name: 'plans', keyField: 'idx', records: [{ idx: 1 }] } });
    expect(created.statusCode).toBe(201);
    const ds = created.json();
    expect(ds.name).toBe('plans');

    const list = await app.inject({ method: 'GET', url: '/api/datasets' });
    expect(list.json()).toHaveLength(1);
  });

  it('POST without name or keyField returns 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/datasets', payload: { name: 'x' } });
    expect(res.statusCode).toBe(400);
  });

  it('GET/PUT/DELETE unknown id returns 404', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/datasets/nope' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PUT', url: '/api/datasets/nope', payload: { name: 'y' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: '/api/datasets/nope' })).statusCode).toBe(404);
  });

  it('PUT updates records and DELETE removes', async () => {
    const created = (await app.inject({ method: 'POST', url: '/api/datasets',
      payload: { name: 'plans', keyField: 'idx', records: [] } })).json();
    const upd = await app.inject({ method: 'PUT', url: `/api/datasets/${created.id}`,
      payload: { records: [{ idx: 7 }] } });
    expect(upd.json().records).toEqual([{ idx: 7 }]);
    expect((await app.inject({ method: 'DELETE', url: `/api/datasets/${created.id}` })).statusCode).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm run test -- dataset-routes`
Expected: FAIL — cannot resolve `../routes/dataset.routes.js`.

- [ ] **Step 3: Implement the routes**

Create `server/src/routes/dataset.routes.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import * as datasetService from '../services/dataset.service.js';

export async function datasetRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/datasets', async () => datasetService.getAll());

  app.get('/api/datasets/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ds = datasetService.getById(id);
    if (!ds) { reply.code(404); return { error: 'Not found' }; }
    return ds;
  });

  app.post('/api/datasets', async (req, reply) => {
    const body = req.body as { name?: string; keyField?: string; records?: any[] };
    if (!body.name || !body.keyField) { reply.code(400); return { error: 'name and keyField are required' }; }
    reply.code(201);
    return datasetService.create({ name: body.name, keyField: body.keyField, records: body.records });
  });

  app.put('/api/datasets/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Partial<{ name: string; keyField: string; records: any[] }>;
    const ds = datasetService.update(id, body);
    if (!ds) { reply.code(404); return { error: 'Not found' }; }
    return ds;
  });

  app.delete('/api/datasets/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = datasetService.remove(id);
    if (!ok) { reply.code(404); return { error: 'Not found' }; }
    return { success: true };
  });
}
```

- [ ] **Step 4: Register the routes in the admin server**

In `server/src/admin-server.ts`, add the import alongside the other route imports (after the `environmentRoutes` import on line 14):

```ts
import { datasetRoutes } from './routes/dataset.routes.js';
```

And register it in the `await app.register(...)` block (after `await app.register(environmentRoutes);` on line 40):

```ts
  await app.register(datasetRoutes);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npm run test -- dataset-routes`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/dataset.routes.ts server/src/admin-server.ts server/src/__tests__/dataset-routes.test.ts
git commit -m "feat(dataset): add REST routes and register in admin server"
```

---

### Task 7: `{{$dataset}}` template token

**Files:**
- Modify: `server/src/utils/template-helpers.ts` (add `datasetJson` to `RequestContext`; add `resolveDataset`)
- Modify: `server/src/services/mock-handler.service.ts` (call `resolveDataset` as the final step of `resolveResponseBody`)
- Test: `server/src/__tests__/dataset-template.test.ts`

**Interfaces:**
- Consumes: `RequestContext` (template-helpers)
- Produces: `RequestContext.datasetJson?: string`
- Produces: `resolveDataset(template: string, ctx: RequestContext): string` — replaces every `{{$dataset}}` with `ctx.datasetJson ?? 'null'`
- Changes: `resolveResponseBody` runs `resolveDataset` **after** env/helpers/variables

- [ ] **Step 1: Write the failing test**

Create `server/src/__tests__/dataset-template.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm run test -- dataset-template`
Expected: FAIL — `resolveDataset` is not exported and `RequestContext` has no `datasetJson`.

- [ ] **Step 3: Extend `RequestContext` and add `resolveDataset`**

In `server/src/utils/template-helpers.ts`, add `datasetJson` to the `RequestContext` interface (after `pathParams: Record<string, string>;`):

```ts
  /** Pre-rendered JSON of a variant's resolved dataset binding, injected for {{$dataset}}. */
  datasetJson?: string;
```

Then add this exported function at the end of the file:

```ts
const DATASET_REGEX = /\{\{\s*\$dataset\s*\}\}/g;

/** Replace {{$dataset}} with the request's pre-resolved dataset JSON (or null literal). */
export function resolveDataset(template: string, ctx: RequestContext): string {
  return template.replace(DATASET_REGEX, ctx.datasetJson ?? 'null');
}
```

- [ ] **Step 4: Wire `resolveDataset` into `resolveResponseBody`**

In `server/src/services/mock-handler.service.ts`, update the import from `template-helpers.js` to also pull in `resolveDataset`:

```ts
import { resolveHelpers, resolveDataset, parseQueryParams, parsePathSegments, type RequestContext } from '../utils/template-helpers.js';
```

Then change `resolveResponseBody` (currently a single chained `return`) to run dataset substitution last:

```ts
export function resolveResponseBody(
  template: string,
  envVars: Record<string, string>,
  requestContext: RequestContext,
): string {
  const resolved = resolveVariables(resolveHelpers(resolveEnvVariables(template, envVars), requestContext));
  return resolveDataset(resolved, requestContext);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npm run test -- dataset-template`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/utils/template-helpers.ts server/src/services/mock-handler.service.ts server/src/__tests__/dataset-template.test.ts
git commit -m "feat(dataset): add {{\$dataset}} template token resolved last"
```

---

### Task 8: Resolve the binding inside `handleMockRequest`

**Files:**
- Modify: `server/src/services/mock-handler.service.ts` (resolve `variant.datasetBinding` → `datasetJson` → `RequestContext`)
- Test: `server/src/__tests__/dataset-mock-integration.test.ts`

**Interfaces:**
- Consumes: `datasetService.getById` (Task 5), `resolveDatasetValue` (Task 1), `RequestContext.datasetJson` (Task 7)
- Produces: a request to a dataset-bound variant returns the looked-up record/array in the response body

- [ ] **Step 1: Write the failing integration test**

Create `server/src/__tests__/dataset-mock-integration.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID as uuid } from 'crypto';
import { initDb, closeDb, getDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import * as datasetRepo from '../repositories/dataset.repo.js';
import * as endpointRepo from '../repositories/endpoint.repo.js';
import * as variantRepo from '../repositories/variant.repo.js';
import * as routeRegistry from '../services/route-registry.js';
import { handleMockRequest } from '../services/mock-handler.service.js';
import type { ResponseVariant } from '../models/response-variant.js';

function makeVariant(over: Partial<ResponseVariant> & { id: string; endpointId: string }): ResponseVariant {
  return {
    statusCode: 200, description: 'OK', body: '{}', headers: '{}', delay: null,
    memo: '', sortOrder: 0, matchRules: null, variantGroup: 'standard', presetId: null, datasetBinding: null,
    ...over,
  };
}

describe('handleMockRequest with dataset binding', () => {
  beforeEach(() => { initDb(':memory:'); initSchema(); routeRegistry.reload([]); });
  afterEach(() => { closeDb(); });

  function seed(binding: ResponseVariant['datasetBinding']) {
    const dataset = datasetRepo.create({
      id: uuid(), name: 'plans', keyField: 'idx',
      records: [{ idx: 1, title: 'alpha' }, { idx: 2, title: 'beta' }],
    });
    const endpointId = uuid();
    const variantId = uuid();
    // minimal endpoint row (raw insert keeps the test independent of endpoint-repo internals)
    const db = getDb();
    db.prepare("INSERT INTO endpoints (id, method, path, name, active_variant_id) VALUES (?, 'POST', '/detail', 'detail', ?)")
      .run(endpointId, variantId);
    variantRepo.create(makeVariant({
      id: variantId, endpointId,
      body: '{"errorCode":null,"data": {{$dataset}}}',
      datasetBinding: { ...binding!, datasetId: dataset.id },
    }));
    routeRegistry.reload(endpointRepo.findAll());
    return { endpointId, variantId };
  }

  it('detail mode returns the record matching the body key', async () => {
    seed({ datasetId: '', mode: 'detail', keySource: { from: 'body', field: 'idx' } });
    const res = await handleMockRequest('POST', '/detail', { idx: 2 }, {});
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ errorCode: null, data: { idx: 2, title: 'beta' } });
  });

  it('detail mode returns data:null when no record matches', async () => {
    seed({ datasetId: '', mode: 'detail', keySource: { from: 'body', field: 'idx' } });
    const res = await handleMockRequest('POST', '/detail', { idx: 99 }, {});
    expect(JSON.parse(res.body)).toEqual({ errorCode: null, data: null });
  });

  it('list mode returns the whole records array', async () => {
    seed({ datasetId: '', mode: 'list' });
    const res = await handleMockRequest('POST', '/detail', {}, {});
    expect(JSON.parse(res.body).data).toHaveLength(2);
  });
});
```

> Note: the raw endpoint insert uses `getDb()` (the already-open in-memory handle). **Do not** call `initDb()` with no args inside a test — that opens the real `~/.mocka/mocka.db` and pollutes it. (`endpointRepo.findAll()` is confirmed to nest `responseVariants`, so the bound variant reaches the route registry; `initDb(':memory:')` closes and replaces the singleton each call, so no state leaks across tests.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm run test -- dataset-mock-integration`
Expected: FAIL — response body is the literal template `{"errorCode":null,"data": {{$dataset}}}` parsed as `data: null`-via-fallback **only if** Task 7 ran; before Task 8 wiring, `datasetJson` is never set, so detail mode returns `data: null` for the matching case too → the `idx:2` assertion FAILS.

- [ ] **Step 3: Resolve the binding in `handleMockRequest`**

In `server/src/services/mock-handler.service.ts`, add two imports at the top (with the other imports):

```ts
import * as datasetService from './dataset.service.js';
import { resolveDatasetValue } from '../models/dataset.js';
```

Then, inside `handleMockRequest`, **after** the `variant` is resolved and the `if (!variant) {...}` guard, and **before** the `const requestContext: RequestContext = {...}` construction, insert:

```ts
  let datasetJson: string | undefined;
  if (variant.datasetBinding) {
    const dataset = datasetService.getById(variant.datasetBinding.datasetId);
    const value = dataset
      ? resolveDatasetValue(dataset, variant.datasetBinding, {
          body: typeof body === 'object' && body !== null ? body : {},
          pathParams,
          queryParams,
        })
      : null;
    datasetJson = JSON.stringify(value);
  }
```

Finally, add `datasetJson` to the `RequestContext` object literal (after `pathParams,`):

```ts
    pathParams,
    datasetJson,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm run test -- dataset-mock-integration`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `cd server && npm run test`
Expected: PASS (all existing tests + the new dataset tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/services/mock-handler.service.ts server/src/__tests__/dataset-mock-integration.test.ts
git commit -m "feat(dataset): resolve datasetBinding in handleMockRequest"
```

---

### Task 9: MCP tools for datasets

**Files:**
- Create: `server/src/mcp/tools/datasets.ts`
- Modify: `server/src/mcp/server.ts` (import + register)
- Modify: `server/src/mcp/tools/variants.ts` (add `datasetBinding` param to `update_variant` so AI can bind a variant to a dataset)
- Test: manual smoke (MCP tools are thin `mockaFetch` wrappers; verified end-to-end via the running admin server)

> Why the `variants.ts` change: `PUT /api/variants/:id` already passes `req.body` straight through to `variantRepo.update`, so the **REST API can already set `datasetBinding`** after Task 4. But the MCP `update_variant` tool whitelists its params via zod, so without this addition an AI agent cannot bind a variant. Binding lives on the variant, so extending `update_variant` is the natural home (no separate tool).

**Interfaces:**
- Consumes: `mockaFetch`, `toolResult`, `toolError` from `../client.js`; the REST routes from Task 6
- Produces: `registerDatasetTools(server: McpServer)` exposing `list_datasets`, `get_dataset`, `create_dataset`, `update_dataset`, `delete_dataset`

- [ ] **Step 1: Implement the tools**

Create `server/src/mcp/tools/datasets.ts`:

```ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { mockaFetch, toolResult, toolError } from '../client.js';

export function registerDatasetTools(server: McpServer) {
  server.tool(
    'list_datasets',
    'List all shared datasets (id, name, keyField, records). Datasets back LIST/DETAIL mock responses.',
    {},
    async () => {
      try { return toolResult(await mockaFetch('/api/datasets')); } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'get_dataset',
    'Get one dataset by id, including all its records.',
    { id: z.string() },
    async ({ id }) => {
      try { return toolResult(await mockaFetch(`/api/datasets/${id}`)); } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'create_dataset',
    'Create a shared dataset. records is an array of objects; keyField names the field used to look up a record in detail mode (e.g. "id" or "idx").',
    {
      name: z.string(),
      keyField: z.string().describe('field every record is keyed by, e.g. "idx"'),
      records: z.array(z.any()).optional().describe('array of record objects (omit for empty)'),
    },
    async ({ name, keyField, records }) => {
      try {
        return toolResult(await mockaFetch('/api/datasets', {
          method: 'POST', body: JSON.stringify({ name, keyField, records }),
        }));
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'update_dataset',
    'Update a dataset\'s name, keyField, and/or records (records fully replaces the existing array).',
    {
      id: z.string(),
      name: z.string().optional(),
      keyField: z.string().optional(),
      records: z.array(z.any()).optional(),
    },
    async ({ id, ...data }) => {
      try {
        return toolResult(await mockaFetch(`/api/datasets/${id}`, {
          method: 'PUT', body: JSON.stringify(data),
        }));
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'delete_dataset',
    'Delete a dataset by id.',
    { id: z.string() },
    async ({ id }) => {
      try {
        return toolResult(await mockaFetch(`/api/datasets/${id}`, { method: 'DELETE' }));
      } catch (e) { return toolError(e); }
    },
  );
}
```

- [ ] **Step 2: Register the tool group**

In `server/src/mcp/server.ts`, add the import (after the `registerImportExportTools` import on line 9):

```ts
import { registerDatasetTools } from './tools/datasets.js';
```

And call it in the registration block (after `registerImportExportTools(server);` on line 24):

```ts
  registerDatasetTools(server);
```

- [ ] **Step 2b: Let MCP bind a variant to a dataset (extend `update_variant`)**

In `server/src/mcp/tools/variants.ts`, add a `datasetBinding` param to the `update_variant` tool's zod schema (after the `matchRules` param):

```ts
      datasetBinding: z.object({
        datasetId: z.string(),
        mode: z.enum(['list', 'detail']),
        projection: z.array(z.string()).optional().describe('list mode: return only these fields per record'),
        keySource: z.object({
          from: z.enum(['body', 'path', 'query']),
          field: z.string(),
        }).optional().describe('detail mode: where the lookup key comes from (defaults to body[keyField])'),
      }).nullable().optional().describe('Bind this variant to a shared dataset; set null to unbind. body should contain {{$dataset}} where the dataset value goes.'),
```

No handler change is needed — the tool already spreads `...data` into the `PUT /api/variants/:id` body, which passes through to `variantRepo.update`.

- [ ] **Step 3: Type-check and build**

Run: `cd server && npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 4: Manual smoke (admin server + curl)**

Start the admin server (`cd server && npm run dev` or the project's run command), then:

```bash
# create a dataset
curl -s -X POST localhost:4649/api/datasets \
  -H 'content-type: application/json' \
  -d '{"name":"plans","keyField":"idx","records":[{"idx":1,"title":"alpha"},{"idx":2,"title":"beta"}]}'
# list
curl -s localhost:4649/api/datasets
```

Expected: the POST returns 201 with the created dataset; the list contains it. (Admin port is the configured `port`'s admin counterpart — confirm via `/api/server/status`.)

- [ ] **Step 5: Commit**

```bash
git add server/src/mcp/tools/datasets.ts server/src/mcp/server.ts server/src/mcp/tools/variants.ts
git commit -m "feat(dataset): add MCP dataset tools + datasetBinding param on update_variant"
```

---

### Task 10: Docs + tool-count bump + final verification

**Files:**
- Modify: `README.md` and/or `server/README.md` (MCP tool count; the repo currently advertises "41 tools" — bump to 46)
- Modify: any MCP tool-count references found by grep

- [ ] **Step 1: Find the advertised tool count**

Run: `grep -rn "41 tools\|41 MCP\|MCP tools" README.md server/README.md docs 2>/dev/null`
Expected: locate the "41" references (see commit `fab9558 Update MCP tool count to 41`).

- [ ] **Step 2: Update the count to 46**

Edit each match: `41` → `46` (5 new dataset tools). Keep surrounding wording intact.

- [ ] **Step 3: Run the full test suite one more time**

Run: `cd server && npm run test`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add README.md server/README.md
git commit -m "docs(dataset): bump MCP tool count to 46 and note shared datasets"
```

---

## Out of Scope (separate follow-up plan)

The **client UI** is built by the **companion plan `2026-06-25-shared-dataset-client-ui.md`** (execute it after this one). It covers:

1. **Dataset authoring modal** (`client/src/components/modals/DatasetModal.tsx`, `stores/dataset.store.ts`, `api/datasets.ts`, `types/index.ts`, `ui.store.ts`, `IconRail.tsx`) — clones the Environment modal pattern.
2. **Variant binding UI** in `ResponseTab.tsx`'s `VariantEditor` — a "Bind to dataset" picker that sets `datasetBinding` (`datasetId` + `mode` + `projection`) on the variant via the existing variant update API.

Still deferred to a possible **third plan**:

3. **Swagger import auto-seeding** — detect array fields in imported list-endpoint examples, create a `Dataset` from them, and auto-bind list/detail endpoints by matching key field.

Once this server plan lands, the client API contract is fixed: `GET/POST/PUT/DELETE /api/datasets`, and `datasetBinding` on the variant (via the existing variant endpoints).

## Self-Review

- **Spec coverage:** read-only ✓ (no write paths anywhere), shared dataset entity ✓ (Task 1–3), list mode ✓ + field projection ✓ / detail-by-key ✓ (Task 1, 8), variant binding ✓ (Task 4), per-request resolution / no cache invalidation ✓ (Task 8 reads dataset live; route-registry untouched), envelope wrapping ✓ (`{{$dataset}}` token, Task 7), MCP ✓ (Task 9). Client UI explicitly deferred.
- **Type consistency:** `Dataset`, `DatasetBinding`, `DatasetLookupContext`, `resolveDatasetValue`, `resolveDataset`, `datasetJson`, `datasetBinding`, and all repo/service signatures are used identically across tasks.
- **Placeholder scan:** every code/test step contains complete code and an exact run command with expected result.
