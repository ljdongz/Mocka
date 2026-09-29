import { v4 as uuid } from 'uuid';
import { withTransaction } from '../db/connection.js';
import * as endpointRepo from '../repositories/endpoint.repo.js';
import * as variantRepo from '../repositories/variant.repo.js';
import * as presetRepo from '../repositories/preset.repo.js';
import * as collectionRepo from '../repositories/collection.repo.js';
import * as routeRegistry from './route-registry.js';
import { emit } from './domain-events.js';
import type { Endpoint } from '../models/endpoint.js';
import type { Collection } from '../models/collection.js';
import { HTTP_METHODS, type HttpMethod } from '../models/http-method.js';
import { normalizePath } from '../models/route-path.js';
import { exportAllConnections, importConnections } from './stomp-import-export.service.js';
import type { StompExportConnection } from './stomp-import-export.service.js';

export const EXPORT_VERSION = 5;

interface ExportDataV1 {
  version: 1;
  exportedAt: string;
  endpoints: ExportEndpoint[];
  collections: ExportCollection[];
}

interface ExportDataV2 {
  version: 2;
  exportedAt: string;
  endpoints: ExportEndpoint[];
  collections: ExportCollection[];
}

interface ExportPreset {
  name: string;
  mode: 'sequential' | 'loop';
  sortOrder: number;
  variants: ExportVariant[];
}

interface ExportDataV3 {
  version: 3;
  exportedAt: string;
  endpoints: ExportEndpoint[];
  collections: ExportCollection[];
}

/** v4 adds STOMP connections alongside the HTTP endpoints. */
interface ExportDataV4 {
  version: 4;
  exportedAt: string;
  endpoints: ExportEndpoint[];
  collections: ExportCollection[];
  stompConnections: StompExportConnection[];
}

/** v5 nests collections: `parentIndex` points at an earlier entry of `collections`. */
interface ExportDataV5 extends Omit<ExportDataV4, 'version'> {
  version: 5;
}

export type ExportData = ExportDataV1 | ExportDataV2 | ExportDataV3 | ExportDataV4 | ExportDataV5;

interface ExportEndpoint {
  method: string;
  path: string;
  name: string;
  isEnabled: boolean;
  requestBodyContentType: string;
  requestBodyRaw: string;
  queryParams: { key: string; value: string; isEnabled: boolean; sortOrder: number }[];
  requestHeaders: { key: string; value: string; isEnabled: boolean; sortOrder: number }[];
  responseVariants: ExportVariant[];
  activeVariantIndex: number;
  sequenceMode?: 'off' | 'on' | 'sequential' | 'loop';
  sequencePresets?: ExportPreset[];
  activePresetIndex?: number;
  /** v5: position among the top-level children (collections and endpoints) when outside every collection */
  rootSortOrder?: number;
}

interface ExportVariant {
  statusCode: number;
  description: string;
  body: string;
  headers: string;
  delay: number | null;
  memo: string;
  sortOrder: number;
  matchRules?: import('../models/response-variant.js').MatchRules | null;
  variantGroup?: 'standard' | 'sequence';
}

interface ExportCollection {
  name: string;
  sortOrder: number;
  /** Indices into the endpoints array */
  endpointIndices: number[];
  /** v5: index of the enclosing collection in the collections array (always an earlier entry); absent at top level */
  parentIndex?: number;
  /** v5: positions of endpointIndices among this collection's children, on the scale of child collections' sortOrder */
  endpointSortOrders?: number[];
}

export type ConflictPolicy = 'overwrite' | 'skip' | 'merge';

export interface ImportResult {
  created: number;
  skipped: number;
  overwritten: number;
  merged: number;
  collectionsCreated: number;
  collectionsSkipped: number;
  stompCreated: number;
  stompSkipped: number;
  stompOverwritten: number;
  errors: string[];
}

/** Export all or filtered by collection IDs */
export function exportData(collectionIds?: string[]): ExportData {
  const allEndpoints = endpointRepo.findAll();
  const allCollections = collectionRepo.findAll();

  let endpoints: Endpoint[];
  let collections: Collection[];

  const filteredByCollection = !!(collectionIds && collectionIds.length > 0);

  if (filteredByCollection) {
    // A selected collection brings its whole subtree.
    const selected = new Set(collectionIds);
    for (let grew = true; grew;) {
      grew = false;
      for (const c of allCollections) {
        if (c.parentId && selected.has(c.parentId) && !selected.has(c.id)) { selected.add(c.id); grew = true; }
      }
    }
    collections = allCollections.filter(c => selected.has(c.id));
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

  // Positions within each parent's shared collection/endpoint order, so import can rebuild the interleaving.
  const positionCache = new Map<string | null, Map<string, number>>();
  const positionIn = (parentId: string | null, type: 'collection' | 'endpoint', id: string) => {
    if (!positionCache.has(parentId)) {
      positionCache.set(parentId, new Map(collectionRepo.childOrder(parentId).map((it, i) => [`${it.type}:${it.id}`, i])));
    }
    return positionCache.get(parentId)!.get(`${type}:${id}`) ?? 0;
  };
  const inSomeCollection = new Set(allCollections.flatMap(c => c.endpointIds ?? []));

  const endpointIndexMap = new Map<string, number>();
  const exportEndpoints: ExportEndpoint[] = endpoints.map((ep, idx) => {
    endpointIndexMap.set(ep.id, idx);
    const activeVariantIndex = ep.responseVariants?.findIndex(v => v.id === ep.activeVariantId) ?? 0;
    return {
      method: ep.method,
      path: ep.path,
      name: ep.name,
      isEnabled: ep.isEnabled,
      requestBodyContentType: ep.requestBodyContentType,
      requestBodyRaw: ep.requestBodyRaw,
      queryParams: (ep.queryParams ?? []).map(p => ({
        key: p.key, value: p.value, isEnabled: p.isEnabled, sortOrder: p.sortOrder,
      })),
      requestHeaders: (ep.requestHeaders ?? []).map(h => ({
        key: h.key, value: h.value, isEnabled: h.isEnabled, sortOrder: h.sortOrder,
      })),
      responseVariants: (ep.responseVariants ?? []).filter(v => v.variantGroup === 'standard').map(v => ({
        statusCode: v.statusCode,
        description: v.description,
        body: v.body,
        headers: v.headers,
        delay: v.delay,
        memo: v.memo,
        sortOrder: v.sortOrder,
        matchRules: v.matchRules ?? null,
        variantGroup: 'standard' as const,
      })),
      activeVariantIndex: activeVariantIndex >= 0 ? activeVariantIndex : 0,
      sequenceMode: ep.sequenceMode ?? 'off',
      sequencePresets: (ep.sequencePresets ?? []).map(preset => ({
        name: preset.name,
        mode: preset.mode,
        sortOrder: preset.sortOrder,
        variants: (ep.responseVariants ?? []).filter(v => v.presetId === preset.id).map(v => ({
          statusCode: v.statusCode,
          description: v.description,
          body: v.body,
          headers: v.headers,
          delay: v.delay,
          memo: v.memo,
          sortOrder: v.sortOrder,
          matchRules: v.matchRules ?? null,
          variantGroup: 'sequence' as const,
        })),
      })),
      activePresetIndex: ep.sequencePresets?.findIndex(p => p.id === ep.activePresetId) ?? -1,
      ...(inSomeCollection.has(ep.id) ? {} : { rootSortOrder: positionIn(null, 'endpoint', ep.id) }),
    };
  });

  // Parents before children, so parentIndex always points backwards and import can resolve it in one pass.
  const ordered: Collection[] = [];
  const included = new Set(collections.map(c => c.id));
  const visit = (parentId: string | null) => {
    for (const c of collections) {
      const effectiveParent = c.parentId && included.has(c.parentId) ? c.parentId : null;
      if (effectiveParent === parentId) { ordered.push(c); visit(c.id); }
    }
  };
  visit(null);
  const collectionIndexMap = new Map(ordered.map((c, i) => [c.id, i]));

  const exportCollections: ExportCollection[] = ordered.map(c => {
    const members = (c.endpointIds ?? []).filter(eid => endpointIndexMap.has(eid));
    return {
      name: c.name,
      sortOrder: positionIn(c.parentId ?? null, 'collection', c.id),
      endpointIndices: members.map(eid => endpointIndexMap.get(eid)!),
      endpointSortOrders: members.map(eid => positionIn(c.id, 'endpoint', eid)),
      ...(c.parentId && collectionIndexMap.has(c.parentId) ? { parentIndex: collectionIndexMap.get(c.parentId) } : {}),
    };
  });

  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    endpoints: exportEndpoints,
    collections: exportCollections,
    // Collections only ever hold HTTP endpoints, so a collection-filtered
    // export has no meaningful STOMP subset to carry.
    stompConnections: filteredByCollection ? [] : exportAllConnections(),
  };
}

/** Import data with conflict resolution (wrapped in a transaction) */
export function importData(data: ExportData, conflictPolicy: ConflictPolicy): ImportResult {
  const result: ImportResult = {
    created: 0,
    skipped: 0,
    overwritten: 0,
    merged: 0,
    collectionsCreated: 0,
    collectionsSkipped: 0,
    stompCreated: 0,
    stompSkipped: 0,
    stompOverwritten: 0,
    errors: [],
  };

  withTransaction(() => {
    const importedEndpointIds = new Map<number, string>();
    const createdEndpointIds = new Set<string>();

    for (let i = 0; i < data.endpoints.length; i++) {
      const importEp = data.endpoints[i];

      // Validate method
      const method = importEp.method?.toUpperCase();
      if (!HTTP_METHODS.includes(method as any)) {
        result.errors.push(`Endpoint ${importEp.method} ${importEp.path}: invalid method`);
        continue;
      }
      importEp.method = method;

      try {
        const existing = endpointRepo.findByMethodAndPath(importEp.method, normalizePath(importEp.path));

        if (existing) {
          switch (conflictPolicy) {
            case 'skip':
              importedEndpointIds.set(i, existing.id);
              result.skipped++;
              continue;

            case 'overwrite': {
              // Preserve existing collection memberships
              const memberships = collectionRepo.findMembershipsByEndpointId(existing.id);

              routeRegistry.remove(existing.method, existing.path);
              endpointRepo.remove(existing.id);
              const newId = createEndpointFromImport(importEp);

              // Re-link to existing collections
              for (const m of memberships) {
                collectionRepo.addEndpoint(m.collectionId, newId, m.sortOrder);
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
                    matchRules: v.matchRules ?? null,
                    variantGroup: v.variantGroup ?? 'standard',
                    presetId: null,
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
          const newId = createEndpointFromImport(importEp);
          importedEndpointIds.set(i, newId);
          createdEndpointIds.add(newId);
          result.created++;
        }
      } catch (e: any) {
        result.errors.push(`Endpoint ${importEp.method} ${importEp.path}: ${e.message}`);
      }
    }

    // Import collections (deduplicated by name among siblings under the same parent)
    const importCollections: ExportCollection[] = Array.isArray(data.collections) ? data.collections : [];
    const importedCollectionIds = new Map<number, string>();
    // Collections this import created: their children take the file's order values as they are.
    const createdCollectionIds = new Set<string>();
    // New top-level items, placed after the existing ones in the file's order once everything exists.
    // Files without order values (pre-v5) keep the old look: collections first, then endpoints.
    const newTopLevel: { item: collectionRepo.TreeItem; order: number }[] = [];
    for (const [colIndex, importCol] of importCollections.entries()) {
      try {
        const allCollections = collectionRepo.findAll();
        const parentId = importCol.parentIndex !== undefined ? importedCollectionIds.get(importCol.parentIndex) ?? null : null;
        const siblings = allCollections.filter(c => c.parentId === parentId);
        const existingCol = siblings.find(c => c.name === importCol.name);

        if (existingCol && conflictPolicy === 'skip') {
          // Link new endpoints to existing collection
          for (const epIndex of importCol.endpointIndices ?? []) {
            const epId = importedEndpointIds.get(epIndex);
            if (epId && !collectionRepo.isEndpointLinked(existingCol.id, epId)) {
              collectionRepo.addEndpoint(existingCol.id, epId, collectionRepo.nextOrder(existingCol.id));
            }
          }
          importedCollectionIds.set(colIndex, existingCol.id);
          result.collectionsSkipped++;
        } else {
          const colId = uuid();
          const parentIsNew = parentId !== null && createdCollectionIds.has(parentId);
          collectionRepo.create({
            id: colId,
            name: existingCol ? `${importCol.name} (imported)` : importCol.name,
            sortOrder: parentIsNew ? importCol.sortOrder : collectionRepo.nextOrder(parentId),
            parentId,
          });
          importedCollectionIds.set(colIndex, colId);
          createdCollectionIds.add(colId);
          if (parentId === null) newTopLevel.push({ item: { type: 'collection', id: colId }, order: importCol.sortOrder ?? colIndex });

          // Pre-v5 files carry no endpoint order: put endpoints after this collection's child collections.
          const childCollections = importCollections.filter(x => x.parentIndex === colIndex).length;
          for (let sortIdx = 0; sortIdx < (importCol.endpointIndices ?? []).length; sortIdx++) {
            const epIndex = importCol.endpointIndices[sortIdx];
            const epId = importedEndpointIds.get(epIndex);
            if (epId) {
              collectionRepo.addEndpoint(colId, epId, importCol.endpointSortOrders?.[sortIdx] ?? childCollections + sortIdx);
            }
          }
          result.collectionsCreated++;
        }
      } catch (e: any) {
        result.errors.push(`Collection ${importCol.name}: ${e.message}`);
      }
    }

    // Endpoints this import created that ended up outside every collection.
    const grouped = new Set(collectionRepo.findAll().flatMap(c => c.endpointIds ?? []));
    for (const [i, epId] of importedEndpointIds.entries()) {
      if (createdEndpointIds.has(epId) && !grouped.has(epId)) {
        newTopLevel.push({ item: { type: 'endpoint', id: epId }, order: data.endpoints[i]?.rootSortOrder ?? 1e9 + i });
      }
    }
    newTopLevel.sort((a, b) => a.order - b.order);
    for (const { item } of newTopLevel) collectionRepo.placeItem(item, null, null, Number.MAX_SAFE_INTEGER);
  });

  routeRegistry.reload(endpointRepo.findAll());

  // STOMP runs in its own transaction, after the HTTP one has committed, so a
  // bad connection cannot roll back already-imported endpoints.
  const stompConnections = (data as { stompConnections?: StompExportConnection[] }).stompConnections;
  if (Array.isArray(stompConnections) && stompConnections.length > 0) {
    // STOMP has no merge semantics — treat it as skip.
    const stompPolicy = conflictPolicy === 'overwrite' ? 'overwrite' : 'skip';
    for (const r of importConnections(stompConnections, stompPolicy)) {
      if (r.created) result.stompCreated++;
      if (r.skipped) result.stompSkipped++;
      if (r.overwritten) result.stompOverwritten++;
      result.errors.push(...r.errors);
    }
  }

  emit('import:completed', result);

  return result;
}

function createEndpointFromImport(importEp: ExportEndpoint): string {
  const endpointId = uuid();
  const variants = importEp.responseVariants ?? [];
  const variantIds: string[] = variants.map(() => uuid());
  const activeVariantId = variantIds[importEp.activeVariantIndex] ?? variantIds[0] ?? null;

  endpointRepo.create({
    id: endpointId,
    method: importEp.method as HttpMethod,
    path: normalizePath(importEp.path),
    name: importEp.name ?? '',
    activeVariantId,
    activePresetId: null,
    sequenceMode: (importEp.sequenceMode === 'sequential' || importEp.sequenceMode === 'loop') ? 'on' : (importEp.sequenceMode ?? 'off'),
    isEnabled: importEp.isEnabled,
    requestBodyContentType: importEp.requestBodyContentType || 'application/json',
    requestBodyRaw: importEp.requestBodyRaw || '',
    createdAt: '',
    updatedAt: '',
  } as any);

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
      matchRules: v.matchRules ?? null,
      variantGroup: v.variantGroup ?? 'standard',
      presetId: null,
    });
  }

  endpointRepo.createQueryParams(
    endpointId,
    (importEp.queryParams ?? []).map(p => ({ id: uuid(), ...p })),
  );

  endpointRepo.createRequestHeaders(
    endpointId,
    (importEp.requestHeaders ?? []).map(h => ({ id: uuid(), ...h })),
  );

  // Import presets (v3+) or synthesize from old sequence variants (v1/v2)
  const presets = importEp.sequencePresets ?? [];
  if (presets.length > 0) {
    let activePresetId: string | null = null;
    presets.forEach((preset, pIdx) => {
      const presetId = uuid();
      if (pIdx === (importEp.activePresetIndex ?? 0)) activePresetId = presetId;
      presetRepo.create({
        id: presetId, endpointId, name: preset.name, mode: preset.mode, sortOrder: preset.sortOrder, createdAt: '',
      });
      for (const v of preset.variants ?? []) {
        variantRepo.create({
          id: uuid(), endpointId, statusCode: v.statusCode, description: v.description,
          body: v.body, headers: v.headers, delay: v.delay, memo: v.memo ?? '',
          sortOrder: v.sortOrder, matchRules: v.matchRules ?? null, variantGroup: 'sequence', presetId,
        });
      }
    });
    if (activePresetId) {
      endpointRepo.update(endpointId, { activePresetId, sequenceMode: 'on' } as any);
    }
  } else {
    // v1/v2: synthesize preset from old sequence variants
    const seqVariants = variants.filter((_, j) => (importEp.responseVariants ?? [])[j]?.variantGroup === 'sequence');
    if (seqVariants.length > 0) {
      const oldMode = importEp.sequenceMode;
      const presetId = uuid();
      presetRepo.create({
        id: presetId, endpointId, name: 'Default',
        mode: (oldMode === 'sequential' || oldMode === 'loop') ? oldMode : 'sequential',
        sortOrder: 0, createdAt: '',
      });
      for (let j = 0; j < variants.length; j++) {
        if ((importEp.responseVariants ?? [])[j]?.variantGroup === 'sequence') {
          variantRepo.update(variantIds[j], { presetId });
        }
      }
      endpointRepo.update(endpointId, { activePresetId: presetId, sequenceMode: 'on' } as any);
    }
  }

  const full = endpointRepo.findById(endpointId)!;
  routeRegistry.add(full);

  return endpointId;
}
