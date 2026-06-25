# Shared Dataset — Client UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Companion plan:** This builds the React UI on top of the server contract delivered by `2026-06-25-shared-dataset-mock.md`. **Execute the server plan first** — this plan assumes `GET/POST/PUT/DELETE /api/datasets` and the variant `datasetBinding` field already work.

**Goal:** Add Mocka client UI so a human can (1) author shared datasets in a modal and (2) bind a response variant to a dataset (list/detail mode) from the variant editor — making the dataset feature usable by clicking, not just via API/MCP.

**Architecture:** Mirror the existing Environment feature end-to-end. A `datasets` Zustand store wraps a thin `datasetsApi` client; a `DatasetModal` (cloned from `EnvironmentModal`) does master-detail CRUD; a `DatasetBindingEditor` sub-component inside the variant editor sets `variant.datasetBinding` via the existing `updateVariant` path. No new server calls beyond the dataset REST routes.

**Tech Stack:** React 19 + TypeScript, Zustand stores, Tailwind (design tokens like `bg-bg-input`, `border-border-secondary`, `text-text-primary`), lucide-react icons, custom i18n (`useTranslation()` / `fmt()`), Vite dev server.

## Global Constraints

- The client has **no automated test suite** (no vitest/jest in `client/`). Verification per task is **manual in the browser** via `cd client && npm run dev` — each task lists exactly what to click and observe. Do not introduce a test framework.
- Follow existing patterns exactly: stores mirror `stores/environment.store.ts`, api mirrors `api/environments.ts`, the modal mirrors `components/modals/EnvironmentModal.tsx`. Reuse Tailwind tokens already in those files — do not invent class names or hex colors.
- The `Dataset` and `DatasetBinding` client types must match the server contract verbatim (`id, name, keyField, records, createdAt, updatedAt` and `{ datasetId, mode, projection?, keySource? }`).
- Run the app from repo root or `client/`; the dev server proxies `/api/*` to the admin server, so the server plan must be running.
- Commit after each task.

---

### Task 1: Client types — `Dataset`, `DatasetBinding`, variant binding field

**Files:**
- Modify: `client/src/types/index.ts`

**Interfaces:**
- Produces: `interface Dataset`, `interface DatasetBinding`, `ResponseVariant.datasetBinding?: DatasetBinding | null`

- [ ] **Step 1: Add the `Dataset` and `DatasetBinding` interfaces**

In `client/src/types/index.ts`, add these interfaces (next to `Environment`, near the bottom of the file):

```ts
export interface Dataset {
  id: string;
  name: string;
  keyField: string;
  records: any[];
  createdAt: string;
  updatedAt: string;
}

export interface DatasetBinding {
  datasetId: string;
  mode: 'list' | 'detail';
  /** list mode only: return just these fields per record */
  projection?: string[];
  /** detail mode: where the lookup key comes from (defaults to body[keyField]) */
  keySource?: { from: 'body' | 'path' | 'query'; field: string };
}
```

- [ ] **Step 2: Add `datasetBinding` to `ResponseVariant`**

In the `ResponseVariant` interface, add the field after `presetId: string | null;`:

```ts
  presetId: string | null;
  datasetBinding?: DatasetBinding | null;
```

- [ ] **Step 3: Verify it type-checks**

Run: `cd client && npx tsc --noEmit`
Expected: no errors (the field is optional, so nothing else breaks).

- [ ] **Step 4: Commit**

```bash
git add client/src/types/index.ts
git commit -m "feat(dataset-ui): add Dataset/DatasetBinding types + variant binding field"
```

---

### Task 2: Dataset data layer — API client, store, UI flag

**Files:**
- Create: `client/src/api/datasets.ts`
- Create: `client/src/stores/dataset.store.ts`
- Modify: `client/src/stores/ui.store.ts` (add `showDatasets` flag + setter)

**Interfaces:**
- Consumes: `api` from `./client`, `Dataset` (Task 1)
- Produces: `datasetsApi` (`getAll/create/update/remove`), `useDatasetStore` (`datasets`, `fetch/create/update/remove`), `useUIStore.showDatasets` + `setShowDatasets`

- [ ] **Step 1: Create the API client**

Create `client/src/api/datasets.ts` (mirrors `api/environments.ts`):

```ts
import { api } from './client';
import type { Dataset } from '../types';

export const datasetsApi = {
  getAll: () => api.get<Dataset[]>('/api/datasets'),
  create: (name: string, keyField: string) =>
    api.post<Dataset>('/api/datasets', { name, keyField, records: [] }),
  update: (id: string, data: Partial<Dataset>) =>
    api.put<Dataset>(`/api/datasets/${id}`, data),
  remove: (id: string) => api.delete<{ success: boolean }>(`/api/datasets/${id}`),
};
```

- [ ] **Step 2: Create the Zustand store**

Create `client/src/stores/dataset.store.ts` (mirrors `stores/environment.store.ts`):

```ts
import { create } from 'zustand';
import { datasetsApi } from '../api/datasets';
import type { Dataset } from '../types';

interface DatasetStore {
  datasets: Dataset[];
  fetch: () => Promise<void>;
  create: (name: string, keyField: string) => Promise<void>;
  update: (id: string, data: Partial<Dataset>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useDatasetStore = create<DatasetStore>((set) => ({
  datasets: [],

  fetch: async () => {
    set({ datasets: await datasetsApi.getAll() });
  },

  create: async (name, keyField) => {
    await datasetsApi.create(name, keyField);
    set({ datasets: await datasetsApi.getAll() });
  },

  update: async (id, data) => {
    await datasetsApi.update(id, data);
    set({ datasets: await datasetsApi.getAll() });
  },

  remove: async (id) => {
    await datasetsApi.remove(id);
    set({ datasets: await datasetsApi.getAll() });
  },
}));
```

- [ ] **Step 3: Add the `showDatasets` UI flag**

In `client/src/stores/ui.store.ts`, add to the `UIStore` interface (after `showEnvironments: boolean;`):

```ts
  showDatasets: boolean;
```

Add the setter to the interface (after `setShowEnvironments: (v: boolean) => void;`):

```ts
  setShowDatasets: (v: boolean) => void;
```

Add the initial value in the store object (after `showEnvironments: false,`):

```ts
  showDatasets: false,
```

Add the setter implementation (after `setShowEnvironments: (v) => set({ showEnvironments: v }),`):

```ts
  setShowDatasets: (v) => set({ showDatasets: v }),
```

- [ ] **Step 4: Verify it type-checks**

Run: `cd client && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/api/datasets.ts client/src/stores/dataset.store.ts client/src/stores/ui.store.ts
git commit -m "feat(dataset-ui): add datasets api client, store, and UI flag"
```

---

### Task 3: Dataset authoring modal + entry point

**Files:**
- Create: `client/src/components/modals/DatasetModal.tsx`
- Modify: `client/src/components/sidebar/IconRail.tsx` (add a Database icon button)
- Modify: `client/src/App.tsx` (render `<DatasetModal />`)
- Modify: `client/src/i18n/ko.ts` and `client/src/i18n/en.ts` (add `dataset` block + `sidebar.datasets`)

**Interfaces:**
- Consumes: `useDatasetStore` (Task 2), `useUIStore.showDatasets` (Task 2), `ModalOverlay`, `useTranslation`
- Produces: `DatasetModal` component; a sidebar button that opens it

- [ ] **Step 1: Add i18n keys (both locales)**

In `client/src/i18n/ko.ts`, add `datasets: 'Datasets',` to the `sidebar` block, and add a new `dataset` block (next to the `environment` block):

```ts
  dataset: {
    title: 'Datasets',
    createToStart: '시작하려면 Dataset을 생성하세요.',
    namePlaceholder: '이름...',
    newDataset: '새 Dataset',
    deleteDataset: 'Dataset 삭제',
    keyField: 'Key Field',
    records: 'Records (JSON)',
    invalidJson: '유효하지 않은 JSON',
    mustBeArray: '배열이어야 합니다',
    usageHint: 'Response Body에 {{$dataset}}를 넣으면 이 Dataset이 주입됩니다.',
  },
```

In `client/src/i18n/en.ts`, add `datasets: 'Datasets',` to `sidebar`, and the matching `dataset` block:

```ts
  dataset: {
    title: 'Datasets',
    createToStart: 'Create a dataset to start.',
    namePlaceholder: 'Name...',
    newDataset: 'New Dataset',
    deleteDataset: 'Delete Dataset',
    keyField: 'Key Field',
    records: 'Records (JSON)',
    invalidJson: 'Invalid JSON',
    mustBeArray: 'Must be an array',
    usageHint: 'Put {{$dataset}} in a Response Body to inject this dataset.',
  },
```

- [ ] **Step 2: Create the modal**

Create `client/src/components/modals/DatasetModal.tsx` (cloned from `EnvironmentModal.tsx`; editor edits name + keyField + records JSON, no "active" concept):

```tsx
import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useDatasetStore } from '../../stores/dataset.store';
import { useUIStore } from '../../stores/ui.store';
import { ModalOverlay } from '../shared/ModalOverlay';
import { useTranslation } from '../../i18n';
import type { Dataset } from '../../types';
import clsx from 'clsx';

export function DatasetModal() {
  const t = useTranslation();
  const open = useUIStore(s => s.showDatasets);
  const close = () => useUIStore.getState().setShowDatasets(false);
  const { datasets, fetch, create, update, remove } = useDatasetStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  useEffect(() => { if (open) fetch(); }, [open, fetch]);
  useEffect(() => {
    if (datasets.length > 0 && !selectedId) setSelectedId(datasets[0].id);
  }, [datasets, selectedId]);

  const selected = datasets.find(d => d.id === selectedId);

  const handleCreate = async () => {
    const name = newName.trim() || t.dataset.newDataset;
    await create(name, 'id');
    setNewName('');
    const all = useDatasetStore.getState().datasets;
    setSelectedId(all[all.length - 1]?.id ?? null);
  };

  const handleDelete = async (id: string) => {
    await remove(id);
    if (selectedId === id) {
      const all = useDatasetStore.getState().datasets;
      setSelectedId(all[0]?.id ?? null);
    }
  };

  return (
    <ModalOverlay open={open} onClose={close}>
      <div className="w-[640px] max-h-[80vh] rounded-lg border border-border-secondary bg-bg-surface flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-secondary">
          <h2 className="text-base font-semibold text-text-primary">{t.dataset.title}</h2>
          <button onClick={close} className="text-text-muted hover:text-text-secondary text-lg">&times;</button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Left: dataset list */}
          <div className="w-48 border-r border-border-secondary flex flex-col">
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {datasets.map(ds => (
                <div
                  key={ds.id}
                  onClick={() => setSelectedId(ds.id)}
                  className={clsx(
                    'flex items-center gap-2 rounded px-2.5 py-2 cursor-pointer text-sm',
                    selectedId === ds.id ? 'bg-bg-hover text-text-primary' : 'text-text-secondary hover:bg-bg-hover',
                  )}
                >
                  <span className="flex-1 truncate">{ds.name}</span>
                  <span className="text-xs text-text-muted">{ds.records.length}</span>
                </div>
              ))}
            </div>
            <div className="p-2 border-t border-border-secondary">
              <div className="flex gap-1">
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  placeholder={t.dataset.namePlaceholder}
                  className="flex-1 min-w-0 rounded border border-border-secondary bg-bg-input px-2 py-1 text-xs text-text-primary outline-none focus:border-accent-primary"
                />
                <button onClick={handleCreate} className="text-accent-primary hover:text-accent-primary/80">
                  <Plus size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Right: editor */}
          <div className="flex-1 p-4 overflow-y-auto">
            {selected ? (
              <DatasetEditor key={selected.id} dataset={selected} onUpdate={update} onDelete={handleDelete} />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-text-muted">
                {t.dataset.createToStart}
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}

function DatasetEditor({
  dataset,
  onUpdate,
  onDelete,
}: {
  dataset: Dataset;
  onUpdate: (id: string, data: Partial<Dataset>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const t = useTranslation();
  const [name, setName] = useState(dataset.name);
  const [keyField, setKeyField] = useState(dataset.keyField);
  const [recordsText, setRecordsText] = useState(() => JSON.stringify(dataset.records, null, 2));
  const [error, setError] = useState('');

  const commitRecords = () => {
    try {
      const parsed = JSON.parse(recordsText);
      if (!Array.isArray(parsed)) { setError(t.dataset.mustBeArray); return; }
      setError('');
      onUpdate(dataset.id, { records: parsed });
    } catch {
      setError(t.dataset.invalidJson);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={() => { if (name !== dataset.name) onUpdate(dataset.id, { name }); }}
          className="flex-1 rounded border border-border-secondary bg-bg-input px-2.5 py-1.5 text-sm text-text-primary font-medium outline-none focus:border-accent-primary"
        />
        <button
          onClick={() => onDelete(dataset.id)}
          className="text-text-muted hover:text-method-delete p-1.5"
          title={t.dataset.deleteDataset}
        >
          <Trash2 size={14} />
        </button>
      </div>

      <label className="block text-xs text-text-tertiary mb-1 uppercase tracking-wider">{t.dataset.keyField}</label>
      <input
        type="text"
        value={keyField}
        onChange={e => setKeyField(e.target.value)}
        onBlur={() => { if (keyField !== dataset.keyField) onUpdate(dataset.id, { keyField }); }}
        placeholder="id"
        className="w-full rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-sm text-text-primary font-mono outline-none focus:border-accent-primary mb-4"
      />

      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-text-tertiary uppercase tracking-wider">{t.dataset.records}</label>
        {error && <span className="text-xs text-method-delete">{error}</span>}
      </div>
      <textarea
        value={recordsText}
        onChange={e => setRecordsText(e.target.value)}
        onBlur={commitRecords}
        rows={14}
        spellCheck={false}
        className="w-full rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent-primary font-mono resize-none"
      />
      <p className="mt-3 text-xs text-text-muted">{t.dataset.usageHint}</p>
    </div>
  );
}
```

- [ ] **Step 3: Add the sidebar entry point**

In `client/src/components/sidebar/IconRail.tsx`, add `Database` to the lucide import (line 1):

```ts
import { Folder, History, Layers, ArrowUpDown, Settings, BookOpen, Database } from 'lucide-react';
```

Add the setter selector (after the `setShowEnvironments` line):

```ts
  const setShowDatasets = useUIStore(s => s.setShowDatasets);
```

Add the button in the bottom section, right after the Environments button (the one with `<Layers />`):

```tsx
        <button
          onClick={() => setShowDatasets(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary"
          title={t.sidebar.datasets}
        >
          <Database size={20} strokeWidth={1.8} />
        </button>
```

- [ ] **Step 4: Mount the modal**

In `client/src/App.tsx`, add the import (after the `EnvironmentModal` import on line 12):

```ts
import { DatasetModal } from './components/modals/DatasetModal';
```

Render it in the Modals block (after `<EnvironmentModal />` on line 75):

```tsx
      <DatasetModal />
```

- [ ] **Step 5: Verify in the browser**

Run: `cd client && npm run dev` (with the server plan running).
- Click the new Database icon in the bottom icon rail → the Datasets modal opens.
- Type a name, press Enter → a dataset appears in the left list and is selected.
- Set Key Field to `idx`, paste `[{"idx":1,"title":"a"},{"idx":2,"title":"b"}]` into Records, click out (blur) → no error; reopen the modal → records persisted.
- Paste invalid JSON, blur → "Invalid JSON" shows and nothing is saved.
- Delete the dataset → it disappears.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/modals/DatasetModal.tsx client/src/components/sidebar/IconRail.tsx client/src/App.tsx client/src/i18n/ko.ts client/src/i18n/en.ts
git commit -m "feat(dataset-ui): dataset authoring modal + sidebar entry + i18n"
```

---

### Task 4: Bind a variant to a dataset (variant editor)

**Files:**
- Modify: `client/src/components/editor/tabs/ResponseTab.tsx` (add `DatasetBindingEditor` sub-component + render it in `VariantEditor`)

**Interfaces:**
- Consumes: `useDatasetStore` (Task 2), `DatasetBinding` (Task 1), `updateVariant` (existing)
- Produces: a binding control that sets `variant.datasetBinding` via `updateVariant`

- [ ] **Step 1: Add imports**

In `client/src/components/editor/tabs/ResponseTab.tsx`, ensure these imports exist (add what's missing):

```ts
import { useEffect } from 'react';                 // add useEffect to the existing react import
import { useDatasetStore } from '../../../stores/dataset.store';
import type { DatasetBinding } from '../../../types';
```

(If `react` is already imported as `import { useState } from 'react';`, change it to `import { useState, useEffect } from 'react';`. `fmt` and `useTranslation` are already imported in this file.)

- [ ] **Step 2: Add the `DatasetBindingEditor` sub-component**

Add this function near the other sub-components (e.g., right before `function MatchRulesEditor(...)`):

```tsx
function DatasetBindingEditor({
  variant,
  updateVariant,
}: {
  variant: ResponseVariant;
  updateVariant: (id: string, data: Partial<ResponseVariant>) => Promise<void>;
}) {
  const t = useTranslation();
  const datasets = useDatasetStore(s => s.datasets);
  const fetchDatasets = useDatasetStore(s => s.fetch);
  useEffect(() => { fetchDatasets(); }, [fetchDatasets]);

  const binding = variant.datasetBinding ?? null;
  const setBinding = (next: DatasetBinding | null) => updateVariant(variant.id, { datasetBinding: next });

  const projectionText = (binding?.projection ?? []).join(', ');

  return (
    <div className="mb-4">
      <label className="block text-xs text-text-tertiary mb-1 uppercase tracking-wider">{t.response.datasetBinding}</label>
      <div className="flex gap-2">
        <select
          value={binding?.datasetId ?? ''}
          onChange={e => {
            const datasetId = e.target.value;
            setBinding(datasetId ? { datasetId, mode: binding?.mode ?? 'detail', projection: binding?.projection } : null);
          }}
          className="flex-1 rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary"
        >
          <option value="">{t.response.noDataset}</option>
          {datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {binding && (
          <select
            value={binding.mode}
            onChange={e => setBinding({ ...binding, mode: e.target.value as 'list' | 'detail' })}
            className="rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary"
          >
            <option value="detail">detail</option>
            <option value="list">list</option>
          </select>
        )}
      </div>

      {binding?.mode === 'list' && (
        <input
          type="text"
          defaultValue={projectionText}
          onBlur={e => {
            const fields = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
            setBinding({ ...binding, projection: fields.length ? fields : undefined });
          }}
          placeholder="projection: idx, title, price (비우면 전체 필드)"
          className="mt-2 w-full rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-xs text-text-primary font-mono outline-none focus:border-accent-primary"
        />
      )}

      {binding && (
        <p className="mt-1 text-xs text-text-muted">{fmt(t.response.datasetHint, '{{$dataset}}')}</p>
      )}
    </div>
  );
}
```

> Note: `keySource` is intentionally not exposed in the UI — it defaults server-side to `body[keyField]`, which matches the all-POST-with-body APIs this feature targets. Add an input later if non-body keys are needed.

- [ ] **Step 3: Render it inside `VariantEditor`**

In `VariantEditor`'s returned JSX, add the binding editor right after the `<MatchRulesEditor ... />` line:

```tsx
      {/* Match Rules */}
      <MatchRulesEditor variant={variant} updateVariant={updateVariant} />

      {/* Dataset binding */}
      <DatasetBindingEditor variant={variant} updateVariant={updateVariant} />
```

- [ ] **Step 4: Add the two i18n keys (both locales)**

In `client/src/i18n/ko.ts`, add to the `response` block:

```ts
    datasetBinding: 'Dataset Binding',
    noDataset: 'Dataset 없음',
    datasetHint: 'Response Body의 {0} 위치에 이 Dataset이 주입됩니다.',
```

In `client/src/i18n/en.ts`, add to the `response` block:

```ts
    datasetBinding: 'Dataset Binding',
    noDataset: 'No dataset',
    datasetHint: 'This dataset is injected where {0} appears in the Response Body.',
```

- [ ] **Step 5: Verify in the browser**

Run: `cd client && npm run dev` (server plan running; create a dataset first via Task 3).
- Open an endpoint → Response tab → select a variant. The "Dataset Binding" row appears.
- Pick your dataset → a mode dropdown appears (`detail`/`list`).
- Set the body to `{"data": {{$dataset}}}`. With mode `detail`, send a request whose body key matches the dataset `keyField` → the response `data` is the matching record. Switch to `list` → `data` is the full array; type `idx, title` in the projection box and blur → `list` now returns only those fields.
- Set the dataset dropdown back to "No dataset" → `datasetBinding` clears (binding row collapses).

- [ ] **Step 6: Commit**

```bash
git add client/src/components/editor/tabs/ResponseTab.tsx client/src/i18n/ko.ts client/src/i18n/en.ts
git commit -m "feat(dataset-ui): bind a response variant to a dataset (list/detail + projection)"
```

---

## Self-Review

- **Spec coverage:** dataset authoring (create/rename/keyField/records/delete) ✓ (Task 3); variant binding with list/detail + projection ✓ (Task 4); types match server contract ✓ (Task 1); reuses Environment patterns ✓ (Tasks 2–3). `keySource` UI deferred (documented) — server default covers the target APIs.
- **Type consistency:** `Dataset`, `DatasetBinding`, `useDatasetStore`, `datasetsApi`, `showDatasets`/`setShowDatasets`, `t.dataset.*`, `t.sidebar.datasets`, `t.response.datasetBinding/noDataset/datasetHint` are used identically across tasks and match the server's field names.
- **Placeholder scan:** every step has complete code, exact file paths, and a concrete click-through verification (no automated tests exist in the client).
- **Dependency on server plan:** Task 4's verification and the binding round-trip require the server plan's `datasetBinding` persistence + `{{$dataset}}` resolution. Run the server plan first.
