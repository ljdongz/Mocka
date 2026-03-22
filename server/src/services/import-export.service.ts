import { v4 as uuid } from 'uuid';
import { withTransaction } from '../db/connection.js';
import * as endpointRepo from '../repositories/endpoint.repo.js';
import * as variantRepo from '../repositories/variant.repo.js';
import * as collectionRepo from '../repositories/collection.repo.js';
import * as wsEndpointRepo from '../repositories/ws-endpoint.repo.js';
import * as routeRegistry from './route-registry.js';
import { emit } from './domain-events.js';
import type { Endpoint } from '../models/endpoint.js';
import type { Collection } from '../models/collection.js';
import type { MatchRules } from '../models/response-variant.js';
import { HTTP_METHODS, type HttpMethod } from '../models/http-method.js';
import { normalizePath } from '../models/route-path.js';

interface ExportDataV1 {
  version: 1;
  exportedAt: string;
  endpoints: ExportEndpoint[];
  collections: ExportCollection[];
}

interface ExportWsFrame {
  trigger?: 'message' | 'connect';
  label: string;
  messageBody: string;
  delay: number | null;
  intervalMin: number | null;
  intervalMax: number | null;
  memo: string;
  sortOrder: number;
  matchRules: MatchRules | null;
}

interface ExportWsEndpoint {
  path: string;
  name: string;
  isEnabled: boolean;
  frames: ExportWsFrame[];
  activeFrameIndex: number;
}

interface ExportDataV2 {
  version: 2;
  exportedAt: string;
  endpoints: ExportEndpoint[];
  collections: ExportCollection[];
  wsEndpoints: ExportWsEndpoint[];
}

export type ExportData = ExportDataV1 | ExportDataV2;

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
      responseVariants: (ep.responseVariants ?? []).map(v => ({
        statusCode: v.statusCode,
        description: v.description,
        body: v.body,
        headers: v.headers,
        delay: v.delay,
        memo: v.memo,
        sortOrder: v.sortOrder,
        matchRules: v.matchRules ?? null,
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

  const allWsEndpoints = wsEndpointRepo.findAll();
  const exportWsEndpoints: ExportWsEndpoint[] = allWsEndpoints.map(wsEp => {
    const frames = wsEp.responseFrames ?? [];
    const activeFrameIndex = frames.findIndex(f => f.id === wsEp.activeFrameId);
    return {
      path: wsEp.path,
      name: wsEp.name,
      isEnabled: wsEp.isEnabled,
      frames: frames.map(f => ({
        trigger: f.trigger,
        label: f.label,
        messageBody: f.messageBody,
        delay: f.delay,
        intervalMin: f.intervalMin ?? null,
        intervalMax: f.intervalMax ?? null,
        memo: f.memo,
        sortOrder: f.sortOrder,
        matchRules: f.matchRules ?? null,
      })),
      activeFrameIndex: activeFrameIndex >= 0 ? activeFrameIndex : 0,
    };
  });

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    endpoints: exportEndpoints,
    collections: exportCollections,
    wsEndpoints: exportWsEndpoints,
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
    errors: [],
  };

  withTransaction(() => {
    const importedEndpointIds = new Map<number, string>();

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
        const allCollections = collectionRepo.findAll();
        const existingCol = allCollections.find(c => c.name === importCol.name);

        if (existingCol && conflictPolicy === 'skip') {
          // Link new endpoints to existing collection
          for (const epIndex of importCol.endpointIndices ?? []) {
            const epId = importedEndpointIds.get(epIndex);
            if (epId && !collectionRepo.isEndpointLinked(existingCol.id, epId)) {
              const maxSort = collectionRepo.getMaxSortOrder(existingCol.id);
              collectionRepo.addEndpoint(existingCol.id, epId, maxSort + 1);
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
    // Import WS endpoints (v2 only)
    if (data.version === 2 && Array.isArray(data.wsEndpoints)) {
      for (const importWsEp of data.wsEndpoints) {
        try {
          const normalizedPath = normalizePath(importWsEp.path);
          const existing = wsEndpointRepo.findByPath(normalizedPath);

          if (existing) {
            switch (conflictPolicy) {
              case 'skip':
                result.skipped++;
                continue;

              case 'overwrite': {
                wsEndpointRepo.remove(existing.id);
                createWsEndpointFromImport(importWsEp);
                result.overwritten++;
                break;
              }

              case 'merge': {
                const existingFrames = wsEndpointRepo.findFramesByEndpointId(existing.id);
                const existingLabels = new Set(existingFrames.map(f => f.label));
                let nextSort = existingFrames.length;
                for (const f of importWsEp.frames ?? []) {
                  if (!existingLabels.has(f.label)) {
                    wsEndpointRepo.createFrame({
                      id: uuid(),
                      wsEndpointId: existing.id,
                      trigger: f.trigger ?? 'message',
                      label: f.label,
                      messageBody: f.messageBody,
                      delay: f.delay,
                      intervalMin: f.intervalMin ?? null,
                      intervalMax: f.intervalMax ?? null,
                      memo: f.memo,
                      sortOrder: nextSort++,
                      matchRules: f.matchRules ?? null,
                    });
                  }
                }
                result.merged++;
                break;
              }
            }
          } else {
            createWsEndpointFromImport(importWsEp);
            result.created++;
          }
        } catch (e: any) {
          result.errors.push(`WS endpoint ${importWsEp.path}: ${e.message}`);
        }
      }
    }
  });

  routeRegistry.reload(endpointRepo.findAll());
  emit('import:completed', result);

  return result;
}

function createWsEndpointFromImport(importWsEp: ExportWsEndpoint): string {
  const endpointId = uuid();
  const frames = importWsEp.frames ?? [];
  const frameIds: string[] = frames.map(() => uuid());
  const activeFrameId = frameIds[importWsEp.activeFrameIndex] ?? frameIds[0] ?? null;

  wsEndpointRepo.create({
    id: endpointId,
    path: normalizePath(importWsEp.path),
    name: importWsEp.name ?? '',
    isEnabled: importWsEp.isEnabled,
    activeFrameId,
    createdAt: '',
    updatedAt: '',
  });

  for (let j = 0; j < frames.length; j++) {
    const f = frames[j];
    wsEndpointRepo.createFrame({
      id: frameIds[j],
      wsEndpointId: endpointId,
      trigger: f.trigger ?? 'message',
      label: f.label,
      messageBody: f.messageBody,
      delay: f.delay,
      intervalMin: f.intervalMin ?? null,
      intervalMax: f.intervalMax ?? null,
      memo: f.memo ?? '',
      sortOrder: f.sortOrder,
      matchRules: f.matchRules ?? null,
    });
  }

  return endpointId;
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
      matchRules: v.matchRules ?? null,
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

  const full = endpointRepo.findById(endpointId)!;
  routeRegistry.add(full);

  return endpointId;
}
