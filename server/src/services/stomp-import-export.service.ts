import { v4 as uuid } from 'uuid';
import { withTransaction } from '../db/connection.js';
import * as connectionRepo from '../repositories/stomp-connection.repo.js';
import * as destinationRepo from '../repositories/stomp-destination.repo.js';
import * as variantRepo from '../repositories/stomp-variant.repo.js';
import * as stompService from './stomp.service.js';
import { normalizeStompPath } from '../models/stomp.js';
import type { StompConnectPolicy, StompFireKind, StompMessageVariant, StompScope, StompTrigger } from '../models/stomp.js';
import type { MatchRules } from '../models/response-variant.js';
import type { DatasetBinding } from '../models/dataset.js';

export const STOMP_EXPORT_VERSION = 1;

export interface StompExportVariant {
  description: string;
  kind: StompFireKind;
  targetDestination: string;
  scope: StompScope;
  body: string;
  headers: string;
  delay: number | null;
  repeatIntervalMs: number | null;
  repeatCount: number | null;
  matchRules: MatchRules | null;
  datasetBinding: DatasetBinding | null;
  memo: string;
  sortOrder: number;
}

export interface StompExportPreset {
  name: string;
  mode: 'sequential' | 'loop';
  sortOrder: number;
  variants: StompExportVariant[];
}

export interface StompExportDestination {
  name: string;
  pattern: string;
  trigger: StompTrigger;
  isEnabled: boolean;
  sequenceMode: 'off' | 'on';
  sortOrder: number;
  variants: StompExportVariant[];
  activeVariantIndex: number;
  presets: StompExportPreset[];
  activePresetIndex: number;
}

export interface StompExportData {
  kind: 'mocka-stomp-connection';
  version: 1;
  exportedAt: string;
  connection: {
    name: string;
    path: string;
    isEnabled: boolean;
    connectPolicy: StompConnectPolicy;
    requiredHeaders: string[];
    rejectMessage: string;
    heartbeatOutgoing: number;
    heartbeatIncoming: number;
    stompVersion: string;
    defaultDelay: number | null;
    replayBufferSize: number;
    destinations: StompExportDestination[];
  };
}

export interface StompImportResult {
  created: boolean;
  overwritten: boolean;
  skipped: boolean;
  destinations: number;
  errors: string[];
}

function toExportVariant(v: StompMessageVariant): StompExportVariant {
  return {
    description: v.description, kind: v.kind, targetDestination: v.targetDestination, scope: v.scope,
    body: v.body, headers: v.headers, delay: v.delay, repeatIntervalMs: v.repeatIntervalMs, repeatCount: v.repeatCount,
    matchRules: v.matchRules ?? null, datasetBinding: v.datasetBinding ?? null, memo: v.memo, sortOrder: v.sortOrder,
  };
}

export function exportConnection(id: string): StompExportData | null {
  const c = connectionRepo.findById(id);
  if (!c) return null;
  return {
    kind: 'mocka-stomp-connection',
    version: 1,
    exportedAt: new Date().toISOString(),
    connection: {
      name: c.name,
      path: c.path,
      isEnabled: c.isEnabled,
      connectPolicy: c.connectPolicy,
      requiredHeaders: c.requiredHeaders,
      rejectMessage: c.rejectMessage,
      heartbeatOutgoing: c.heartbeatOutgoing,
      heartbeatIncoming: c.heartbeatIncoming,
      stompVersion: c.stompVersion,
      defaultDelay: c.defaultDelay,
      replayBufferSize: c.replayBufferSize,
      destinations: (c.destinations ?? []).map(d => {
        const standard = (d.variants ?? []).filter(v => v.variantGroup === 'standard');
        const activeVariantIndex = standard.findIndex(v => v.id === d.activeVariantId);
        const presets = d.presets ?? [];
        return {
          name: d.name,
          pattern: d.pattern,
          trigger: d.trigger,
          isEnabled: d.isEnabled,
          sequenceMode: d.sequenceMode,
          sortOrder: d.sortOrder,
          variants: standard.map(toExportVariant),
          activeVariantIndex: activeVariantIndex >= 0 ? activeVariantIndex : 0,
          presets: presets.map(p => ({
            name: p.name,
            mode: p.mode,
            sortOrder: p.sortOrder,
            variants: (d.variants ?? []).filter(v => v.presetId === p.id).map(toExportVariant),
          })),
          activePresetIndex: presets.findIndex(p => p.id === d.activePresetId),
        };
      }),
    },
  };
}

export function isStompExport(data: unknown): data is StompExportData {
  const d = data as any;
  return !!d && d.kind === 'mocka-stomp-connection' && d.version === 1 && !!d.connection && typeof d.connection.path === 'string'
    && Array.isArray(d.connection.destinations);
}

export function importConnection(data: StompExportData, policy: 'skip' | 'overwrite'): StompImportResult {
  const result: StompImportResult = { created: false, overwritten: false, skipped: false, destinations: 0, errors: [] };
  const path = normalizeStompPath(data.connection.path);

  withTransaction(() => {
    const existing = connectionRepo.findByPath(path);
    if (existing) {
      if (policy === 'skip') { result.skipped = true; return; }
      connectionRepo.remove(existing.id);
      result.overwritten = true;
    } else {
      result.created = true;
    }
    result.destinations = createFromExport(data, path, result.errors, existing?.sortOrder);
  });

  if (!result.skipped) stompService.syncRegistry();
  return result;
}

function createFromExport(data: StompExportData, path: string, errors: string[], sortOrder?: number): number {
  const src = data.connection;
  const connectionId = uuid();
  connectionRepo.create({
    id: connectionId,
    name: src.name ?? '',
    path,
    isEnabled: src.isEnabled ?? true,
    connectPolicy: src.connectPolicy ?? 'accept',
    requiredHeaders: Array.isArray(src.requiredHeaders) ? src.requiredHeaders : [],
    rejectMessage: src.rejectMessage ?? 'Connection rejected',
    heartbeatOutgoing: src.heartbeatOutgoing ?? 10000,
    heartbeatIncoming: src.heartbeatIncoming ?? 10000,
    stompVersion: src.stompVersion ?? '1.2',
    defaultDelay: src.defaultDelay ?? null,
    replayBufferSize: src.replayBufferSize ?? 0,
    sortOrder: sortOrder ?? connectionRepo.findAll().length,
  });

  let count = 0;
  (src.destinations ?? []).forEach((d, idx) => {
    try {
      const destinationId = uuid();
      const variantIds = (d.variants ?? []).map(() => uuid());
      destinationRepo.create({
        id: destinationId,
        connectionId,
        name: d.name ?? '',
        pattern: d.pattern,
        trigger: d.trigger,
        isEnabled: d.isEnabled ?? true,
        activeVariantId: variantIds[d.activeVariantIndex ?? 0] ?? variantIds[0] ?? null,
        activePresetId: null,
        sequenceMode: 'off',
        sortOrder: d.sortOrder ?? idx,
      });
      (d.variants ?? []).forEach((v, j) => {
        variantRepo.create({ id: variantIds[j], destinationId, ...fromExportVariant(v), variantGroup: 'standard', presetId: null });
      });

      let activePresetId: string | null = null;
      (d.presets ?? []).forEach((p, pIdx) => {
        const presetId = uuid();
        if (pIdx === (d.activePresetIndex ?? 0)) activePresetId = presetId;
        variantRepo.createPreset({ id: presetId, destinationId, name: p.name ?? 'Default', mode: p.mode ?? 'sequential', sortOrder: p.sortOrder ?? pIdx });
        for (const v of p.variants ?? []) {
          variantRepo.create({ id: uuid(), destinationId, ...fromExportVariant(v), variantGroup: 'sequence', presetId });
        }
      });
      if (activePresetId) {
        destinationRepo.update(destinationId, { activePresetId, sequenceMode: d.sequenceMode === 'on' ? 'on' : 'off' });
      }
      count++;
    } catch (e: any) {
      errors.push(`Destination ${d.pattern}: ${e.message}`);
    }
  });
  return count;
}

function fromExportVariant(v: StompExportVariant): Omit<StompMessageVariant, 'id' | 'destinationId' | 'variantGroup' | 'presetId'> {
  return {
    description: v.description ?? 'Message',
    kind: v.kind ?? 'message',
    targetDestination: v.targetDestination ?? '',
    scope: v.scope ?? 'broadcast',
    body: v.body ?? '{}',
    headers: v.headers ?? '{}',
    delay: v.delay ?? null,
    repeatIntervalMs: v.repeatIntervalMs ?? null,
    repeatCount: v.repeatCount ?? null,
    matchRules: v.matchRules ?? null,
    datasetBinding: v.datasetBinding ?? null,
    memo: v.memo ?? '',
    sortOrder: v.sortOrder ?? 0,
  };
}
