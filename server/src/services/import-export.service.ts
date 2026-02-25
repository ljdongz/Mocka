import { v4 as uuid } from 'uuid';
import { getDb } from '../db/connection.js';
import * as endpointRepo from '../repositories/endpoint.repo.js';
import * as variantRepo from '../repositories/variant.repo.js';
import * as collectionRepo from '../repositories/collection.repo.js';
import * as routeRegistry from './route-registry.js';
import { broadcast } from '../plugins/websocket.js';
import type { Endpoint } from '../models/endpoint.js';
import type { Collection } from '../models/collection.js';

export interface ExportData {
  version: 1;
  exportedAt: string;
  endpoints: ExportEndpoint[];
  collections: ExportCollection[];
}

interface ExportEndpoint {
  method: string;
  path: string;
  isEnabled: boolean;
  requestBodyContentType: string;
  requestBodyRaw: string;
  queryParams: { key: string; value: string; isEnabled: boolean; sortOrder: number }[];
  requestHeaders: { key: string; value: string; isEnabled: boolean; sortOrder: number }[];
  responseVariants: ExportVariant[];
  activeVariantIndex: number;
}

interface ExportVariant {
  statusCode: number;
  description: string;
  body: string;
  headers: string;
  delay: number | null;
  memo: string;
  sortOrder: number;
}

interface ExportCollection {
  name: string;
  sortOrder: number;
  /** Indices into the endpoints array */
  endpointIndices: number[];
}

export type ConflictPolicy = 'overwrite' | 'skip' | 'merge';

export interface ImportResult {
  created: number;
  skipped: number;
  overwritten: number;
  merged: number;
  collectionsCreated: number;
  collectionsSkipped: number;
  errors: string[];
}

/** Export all or filtered by collection IDs */
export function exportData(collectionIds?: string[]): ExportData {
  const allEndpoints = endpointRepo.findAll();
  const allCollections = collectionRepo.findAll();

  let endpoints: Endpoint[];
  let collections: Collection[];

  if (collectionIds && collectionIds.length > 0) {
    collections = allCollections.filter(c => collectionIds.includes(c.id));
    const includedEndpointIds = new Set<string>();
    for (const c of collections) {
      for (const eid of c.endpointIds ?? []) {
        includedEndpointIds.add(eid);
      }
    }
    endpoints = allEndpoints.filter(ep => includedEndpointIds.has(ep.id));
  } else {
    endpoints = allEndpoints;
    collections = allCollections;
  }

  const endpointIndexMap = new Map<string, number>();
  const exportEndpoints: ExportEndpoint[] = endpoints.map((ep, idx) => {
    endpointIndexMap.set(ep.id, idx);
    const activeVariantIndex = ep.responseVariants?.findIndex(v => v.id === ep.activeVariantId) ?? 0;
    return {
      method: ep.method,
      path: ep.path,
      isEnabled: ep.isEnabled,
      requestBodyContentType: ep.requestBodyContentType,
      requestBodyRaw: ep.requestBodyRaw,
      queryParams: (ep.queryParams ?? []).map(p => ({
        key: p.key, value: p.value, isEnabled: p.isEnabled, sortOrder: p.sortOrder,
      })),
      requestHeaders: (ep.requestHeaders ?? []).map(h => ({
        key: h.key, value: h.value, isEnabled: h.isEnabled, sortOrder: h.sortOrder,
      })),
      responseVariants: (ep.responseVariants ?? []).map(v => ({
        statusCode: v.statusCode,
        description: v.description,
        body: v.body,
        headers: v.headers,
        delay: v.delay,
        memo: v.memo,
        sortOrder: v.sortOrder,
      })),
      activeVariantIndex: activeVariantIndex >= 0 ? activeVariantIndex : 0,
    };
  });

  const exportCollections: ExportCollection[] = collections.map(c => ({
    name: c.name,
    sortOrder: c.sortOrder,
    endpointIndices: (c.endpointIds ?? [])
      .map(eid => endpointIndexMap.get(eid))
      .filter((idx): idx is number => idx !== undefined),
  }));

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    endpoints: exportEndpoints,
    collections: exportCollections,
  };
}

const VALID_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);

/** Import data with conflict resolution (wrapped in a transaction) */
export function importData(data: ExportData, conflictPolicy: ConflictPolicy): ImportResult {
  const db = getDb();
  const result: ImportResult = {
    created: 0,
    skipped: 0,
    overwritten: 0,
    merged: 0,
    collectionsCreated: 0,
    collectionsSkipped: 0,
    errors: [],
  };

  const txn = db.transaction(() => {
    const importedEndpointIds = new Map<number, string>();

    for (let i = 0; i < data.endpoints.length; i++) {
      const importEp = data.endpoints[i];

      // Validate method
      const method = importEp.method?.toUpperCase();
      if (!VALID_METHODS.has(method)) {
        result.errors.push(`Endpoint ${importEp.method} ${importEp.path}: invalid method`);
        continue;
      }
      importEp.method = method;

      try {
        const existing = endpointRepo.findByMethodAndPath(importEp.method, importEp.path);

        if (existing) {
          switch (conflictPolicy) {
            case 'skip':
              importedEndpointIds.set(i, existing.id);
              result.skipped++;
              continue;

            case 'overwrite': {
              // Preserve existing collection memberships
              const membershipRows = db.prepare(
                'SELECT collection_id, sort_order FROM collection_endpoints WHERE endpoint_id = ?'
              ).all(existing.id) as { collection_id: string; sort_order: number }[];

              routeRegistry.remove(existing.method, existing.path);
              endpointRepo.remove(existing.id);
              const newId = createEndpointFromImport(db, importEp);

              // Re-link to existing collections
              for (const row of membershipRows) {
                db.prepare('INSERT OR IGNORE INTO collection_endpoints (collection_id, endpoint_id, sort_order) VALUES (?, ?, ?)')
                  .run(row.collection_id, newId, row.sort_order);
              }

              importedEndpointIds.set(i, newId);
              result.overwritten++;
              break;
            }

            case 'merge': {
              const existingVariants = variantRepo.findByEndpointId(existing.id);
              const existingDescs = new Set(existingVariants.map(v => `${v.statusCode}:${v.description}`));
              let nextSort = existingVariants.length;

              for (const v of importEp.responseVariants ?? []) {
                const key = `${v.statusCode}:${v.description}`;
                if (!existingDescs.has(key)) {
                  variantRepo.create({
                    id: uuid(),
                    endpointId: existing.id,
                    statusCode: v.statusCode,
                    description: v.description,
                    body: v.body,
                    headers: v.headers,
                    delay: v.delay,
                    memo: v.memo,
                    sortOrder: nextSort++,
                  });
                }
              }

              const updated = endpointRepo.findById(existing.id)!;
              routeRegistry.update(updated);
              importedEndpointIds.set(i, existing.id);
              result.merged++;
              break;
            }
          }
        } else {
          const newId = createEndpointFromImport(db, importEp);
          importedEndpointIds.set(i, newId);
          result.created++;
        }
      } catch (e: any) {
        result.errors.push(`Endpoint ${importEp.method} ${importEp.path}: ${e.message}`);
      }
    }

    // Import collections (with deduplication by name)
    const importCollections = Array.isArray(data.collections) ? data.collections : [];
    for (const importCol of importCollections) {
      try {
        // Check if collection with same name exists
        const allCollections = collectionRepo.findAll();
        const existingCol = allCollections.find(c => c.name === importCol.name);

        if (existingCol && conflictPolicy === 'skip') {
          // Link new endpoints to existing collection
          for (const epIndex of importCol.endpointIndices ?? []) {
            const epId = importedEndpointIds.get(epIndex);
            if (epId) {
              const alreadyLinked = db.prepare(
                'SELECT 1 FROM collection_endpoints WHERE collection_id = ? AND endpoint_id = ?'
              ).get(existingCol.id, epId);
              if (!alreadyLinked) {
                const maxSort = db.prepare(
                  'SELECT COALESCE(MAX(sort_order), -1) as m FROM collection_endpoints WHERE collection_id = ?'
                ).get(existingCol.id) as { m: number };
                collectionRepo.addEndpoint(existingCol.id, epId, maxSort.m + 1);
              }
            }
          }
          result.collectionsSkipped++;
        } else {
          const colId = uuid();
          collectionRepo.create({
            id: colId,
            name: existingCol ? `${importCol.name} (imported)` : importCol.name,
            sortOrder: allCollections.length,
          });

          for (let sortIdx = 0; sortIdx < (importCol.endpointIndices ?? []).length; sortIdx++) {
            const epIndex = importCol.endpointIndices[sortIdx];
            const epId = importedEndpointIds.get(epIndex);
            if (epId) {
              collectionRepo.addEndpoint(colId, epId, sortIdx);
            }
          }
          result.collectionsCreated++;
        }
      } catch (e: any) {
        result.errors.push(`Collection ${importCol.name}: ${e.message}`);
      }
    }
  });

  txn();

  routeRegistry.reload();
  broadcast('import:completed', result);

  return result;
}

function createEndpointFromImport(db: any, importEp: ExportEndpoint): string {
  const endpointId = uuid();
  const variants = importEp.responseVariants ?? [];
  const variantIds: string[] = variants.map(() => uuid());
  const activeVariantId = variantIds[importEp.activeVariantIndex] ?? variantIds[0] ?? null;

  endpointRepo.create({
    id: endpointId,
    method: importEp.method as any,
    path: importEp.path,
    activeVariantId,
    isEnabled: importEp.isEnabled,
    requestBodyContentType: importEp.requestBodyContentType || 'application/json',
    requestBodyRaw: importEp.requestBodyRaw || '',
    createdAt: '',
    updatedAt: '',
  });

  for (let j = 0; j < variants.length; j++) {
    const v = variants[j];
    variantRepo.create({
      id: variantIds[j],
      endpointId,
      statusCode: v.statusCode,
      description: v.description,
      body: v.body,
      headers: v.headers,
      delay: v.delay,
      memo: v.memo ?? '',
      sortOrder: v.sortOrder,
    });
  }

  const paramIns = db.prepare('INSERT INTO query_params (id, endpoint_id, key, value, is_enabled, sort_order) VALUES (?,?,?,?,?,?)');
  for (const p of importEp.queryParams ?? []) {
    paramIns.run(uuid(), endpointId, p.key, p.value, p.isEnabled ? 1 : 0, p.sortOrder);
  }

  const headerIns = db.prepare('INSERT INTO request_headers (id, endpoint_id, key, value, is_enabled, sort_order) VALUES (?,?,?,?,?,?)');
  for (const h of importEp.requestHeaders ?? []) {
    headerIns.run(uuid(), endpointId, h.key, h.value, h.isEnabled ? 1 : 0, h.sortOrder);
  }

  const full = endpointRepo.findById(endpointId)!;
  routeRegistry.add(full);

  return endpointId;
}
