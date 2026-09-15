/**
 * Pure fire resolution: STOMP template helpers, variant selection and the
 * plan (target, body, headers, delay) a variant yields for a given trigger.
 * No sockets — the runtime executes plans.
 */
import { randomUUID } from 'crypto';
import { matchesRules } from '../models/response-variant.js';
import { resolveDatasetValue } from '../models/dataset.js';
import * as datasetService from '../services/dataset.service.js';
import * as sequenceCounter from '../services/sequence-counter.service.js';
import { resolveResponseBody } from '../services/mock-handler.service.js';
import type { RequestContext } from '../utils/template-helpers.js';
import { splitSegments } from './destination-matcher.js';
import type { StompFrame } from './frame.js';
import type { StompConnection, StompDestination, StompFireKind, StompMessageVariant, StompScope } from '../models/stomp.js';

export interface FireContext {
  connection: StompConnection;
  /** destination that triggered the fire (SEND/SUBSCRIBE header, or the manual destination pattern) */
  triggerDestination: string;
  /** wildcard captures of the matched destination pattern, 1-based in templates */
  captures: string[];
  /** headers of the triggering frame ({} for manual fires) */
  frameHeaders: Record<string, string>;
  /** CONNECT headers of the target session ({} when there is none) */
  connectHeaders: Record<string, string>;
  /** parsed frame body (JSON when possible) */
  body: any;
  rawBody: string;
  sessionId: string | null;
  subscriptionId: string | null;
  envVars: Record<string, string>;
  datasetJson?: string;
}

export interface FirePlan {
  kind: StompFireKind;
  scope: StompScope;
  targetDestination: string;
  body: string;
  headers: Record<string, string>;
  /** ms */
  delay: number;
  repeatIntervalMs: number | null;
  repeatCount: number | null;
}

const SIMPLE_HELPER_RE = /\{\{\s*\$(sessionId|destination|subscriptionId)\s*\}\}/g;
const ARG_HELPER_RE = /\{\{\s*\$(destCapture|destSeg|stompHeader|connectHeader)\s+(?:['"]([^'"]*)['"]|([^\s'"}]+))(?:\s+['"]([^'"]*)['"])?\s*\}\}/g;

function lookupHeader(headers: Record<string, string>, name: string): string | undefined {
  if (headers[name] !== undefined) return headers[name];
  const lower = name.toLowerCase();
  const key = Object.keys(headers).find(k => k.toLowerCase() === lower);
  return key ? headers[key] : undefined;
}

/** Resolve the STOMP-specific {{$...}} helpers (spec §7.4). Unknown helpers are left for the generic resolver. */
export function resolveStompHelpers(template: string, ctx: FireContext): string {
  return template
    .replace(SIMPLE_HELPER_RE, (_m, name: string) => {
      switch (name) {
        case 'sessionId': return ctx.sessionId ?? '';
        case 'destination': return ctx.triggerDestination;
        case 'subscriptionId': return ctx.subscriptionId ?? '';
        default: return '';
      }
    })
    .replace(ARG_HELPER_RE, (_m, name: string, quoted: string | undefined, bare: string | undefined, dflt: string | undefined) => {
      const arg = quoted ?? bare ?? '';
      const fallback = dflt ?? '';
      switch (name) {
        case 'destCapture': { const n = parseInt(arg, 10); return ctx.captures[n - 1] ?? fallback; }
        case 'destSeg': { const n = parseInt(arg, 10); return splitSegments(ctx.triggerDestination)[n] ?? fallback; }
        case 'stompHeader': return lookupHeader(ctx.frameHeaders, arg) ?? fallback;
        case 'connectHeader': return lookupHeader(ctx.connectHeaders, arg) ?? fallback;
        default: return fallback;
      }
    });
}

/** CONNECT headers ⊕ triggering frame headers (frame wins), keys lower-cased for match rules and {{$headers}}. */
export function mergedHeaders(ctx: FireContext): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(ctx.connectHeaders)) out[k.toLowerCase()] = v;
  for (const [k, v] of Object.entries(ctx.frameHeaders)) out[k.toLowerCase()] = v;
  return out;
}

/** Wildcard captures as 1-based path params: {{$pathParams '1'}} and pathParamRules field "1". */
export function capturesAsParams(captures: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  captures.forEach((c, i) => { out[String(i + 1)] = c; });
  return out;
}

function toRequestContext(ctx: FireContext): RequestContext {
  return {
    body: typeof ctx.body === 'object' && ctx.body !== null ? ctx.body : {},
    queryParams: {},
    pathSegments: splitSegments(ctx.triggerDestination),
    headers: mergedHeaders(ctx),
    pathParams: capturesAsParams(ctx.captures),
    datasetJson: ctx.datasetJson,
  };
}

/** env vars → STOMP helpers → request helpers → dynamic variables → {{$dataset}}. */
export function resolveStompTemplate(template: string, ctx: FireContext): string {
  return resolveResponseBody(resolveStompHelpers(template, ctx), ctx.envVars, toRequestContext(ctx));
}

/** Which variants compete for this destination right now (sequence preset or standard group). */
export function pickVariantPool(dest: StompDestination): { variants: StompMessageVariant[]; presetMode: 'sequential' | 'loop' | null } {
  const all = dest.variants ?? [];
  if (dest.sequenceMode === 'on' && dest.activePresetId) {
    const preset = dest.presets?.find(p => p.id === dest.activePresetId);
    return { variants: all.filter(v => v.presetId === dest.activePresetId), presetMode: preset?.mode ?? null };
  }
  return { variants: all.filter(v => v.variantGroup === 'standard'), presetMode: null };
}

/** Spec §7.3: match rules → sequence preset → active variant → first. */
export function selectVariant(
  dest: StompDestination,
  variants: StompMessageVariant[],
  presetMode: 'sequential' | 'loop' | null,
  ctx: FireContext,
): StompMessageVariant | undefined {
  if (variants.length === 0) return undefined;

  const headers = mergedHeaders(ctx);
  const params = capturesAsParams(ctx.captures);
  const ruleMatch = variants.find(v => v.matchRules && matchesRules(v.matchRules, ctx.body, headers, {}, params));
  if (ruleMatch) return ruleMatch;

  if (dest.sequenceMode === 'on' && dest.activePresetId && presetMode) {
    const sorted = [...variants].sort((a, b) => a.sortOrder - b.sortOrder);
    return sorted[sequenceCounter.getNextIndex(dest.activePresetId, sorted.length, presetMode)];
  }

  return variants.find(v => v.id === dest.activeVariantId) ?? variants[0];
}

export function buildFirePlan(variant: StompMessageVariant, ctx: FireContext): FirePlan {
  let resolved = ctx;
  if (variant.datasetBinding) {
    const dataset = datasetService.getById(variant.datasetBinding.datasetId);
    const value = dataset
      ? resolveDatasetValue(dataset, variant.datasetBinding, {
          body: typeof ctx.body === 'object' && ctx.body !== null ? ctx.body : {},
          pathParams: capturesAsParams(ctx.captures),
          queryParams: {},
        })
      : null;
    resolved = { ...ctx, datasetJson: JSON.stringify(value) };
  }

  let rawHeaders: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(variant.headers || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) rawHeaders = parsed;
  } catch {
    console.warn(`[Mocka] Invalid JSON in headers of STOMP variant ${variant.id}; sending none.`);
  }
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawHeaders)) headers[k] = resolveStompTemplate(String(v), resolved);

  return {
    kind: variant.kind,
    scope: variant.scope,
    targetDestination: variant.targetDestination.trim() ? resolveStompTemplate(variant.targetDestination, resolved) : ctx.triggerDestination,
    body: resolveStompTemplate(variant.body, resolved),
    headers,
    delay: variant.delay ?? ctx.connection.defaultDelay ?? 0,
    repeatIntervalMs: variant.repeatIntervalMs,
    repeatCount: variant.repeatCount,
  };
}

/** MESSAGE frame with the routing headers the client depends on; caller headers cannot override them. */
export function buildMessageFrame(destination: string, subscriptionId: string, body: string, headers: Record<string, string>): StompFrame {
  return {
    command: 'MESSAGE',
    headers: {
      ...headers,
      destination,
      subscription: subscriptionId,
      'message-id': randomUUID(),
      'content-length': String(Buffer.byteLength(body)),
    },
    body,
  };
}
