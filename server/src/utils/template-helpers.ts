/**
 * Template helpers — resolves {{$helper 'arg' 'default'}} placeholders
 * using actual request data (body, query params, path segments, headers, path params).
 */

export interface RequestContext {
  body: any;
  queryParams: Record<string, string>;
  pathSegments: string[];
  headers: Record<string, string>;
  pathParams: Record<string, string>;
  /** Pre-rendered JSON of a variant's resolved dataset binding, injected for {{$dataset}}. */
  datasetJson?: string;
}

/**
 * Access a nested property by dot-notation path.
 * e.g., getNestedValue({ user: { address: { city: 'NYC' } } }, 'user.address.city') => 'NYC'
 */
function getNestedValue(obj: any, path: string): any {
  if (obj == null || typeof obj !== 'object') return undefined;
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return current;
}

function stringify(value: any): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

type HelperFn = (ctx: RequestContext, arg: string, defaultValue?: string) => string;

const HELPERS: Record<string, HelperFn> = {
  '$body': (ctx, arg, defaultValue) => {
    const val = getNestedValue(ctx.body, arg);
    return val !== undefined ? stringify(val) : (defaultValue ?? '');
  },

  '$queryParams': (ctx, arg, defaultValue) => {
    const val = ctx.queryParams[arg];
    return val !== undefined ? val : (defaultValue ?? '');
  },

  '$pathSegments': (ctx, arg, defaultValue) => {
    const idx = parseInt(arg, 10);
    const val = ctx.pathSegments[idx];
    return val !== undefined ? val : (defaultValue ?? '');
  },

  '$headers': (ctx, arg, defaultValue) => {
    // Headers are case-insensitive
    const key = arg.toLowerCase();
    const val = ctx.headers[key];
    return val !== undefined ? val : (defaultValue ?? '');
  },

  '$pathParams': (ctx, arg, defaultValue) => {
    const val = ctx.pathParams[arg];
    return val !== undefined ? val : (defaultValue ?? '');
  },
};

const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };

/**
 * Apply an offset suffix (`+ 1`, `- 30m`, `+ 3h`) to an already-resolved value.
 * With a time unit the value is read as a date — Unix seconds, or anything Date.parse accepts —
 * and comes back as Unix seconds / ISO 8601 respectively. Without a unit it is plain arithmetic.
 * Empty or non-numeric values are returned untouched, so an absent field never yields `NaN`
 * in the response body. Supply a default to opt in: {{$body 'count' '0' + 1}}.
 * ponytail: units capped at s/m/h/d/w — months/years need calendar math (setMonth), add when asked.
 */
export function applyOffset(value: string, sign?: string, amount?: string, unit?: string): string {
  if (!sign || amount === undefined) return value;
  const trimmed = value.trim();
  if (trimmed === '') return value;
  const delta = (sign === '-' ? -1 : 1) * Number(amount);

  if (!unit) {
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return value;
    return String(Number((n + delta).toFixed(10)));
  }

  const seconds = delta * UNIT_SECONDS[unit];
  if (/^\d+$/.test(trimmed)) return String(Math.trunc(Number(trimmed) + seconds));
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return value;
  return new Date(ms + seconds * 1000).toISOString();
}

/**
 * Pattern: {{$helperName 'arg'}}, {{$helperName 'arg' 'default'}},
 * each optionally followed by an offset suffix — {{$body 'count' + 1}}, {{$body 'at' + 3h}}.
 * Supports both single and double quotes.
 */
const HELPER_REGEX = /\{\{\s*(\$\w+)\s+['"]([^'"]*)['"]\s*(?:['"]([^'"]*)['"]\s*)?(?:([-+])\s*(\d+(?:\.\d+)?)\s*([smhdw])?\s*)?\}\}/g;

/**
 * Resolve all {{$helper 'arg' 'default'}} placeholders using request context,
 * applying any trailing offset suffix to the result.
 */
export function resolveHelpers(template: string, ctx: RequestContext): string {
  return template.replace(HELPER_REGEX, (
    _fullMatch, helperName: string, arg: string, defaultValue?: string,
    sign?: string, amount?: string, unit?: string,
  ) => {
    const helper = HELPERS[helperName];
    if (!helper) return _fullMatch;
    return applyOffset(helper(ctx, arg, defaultValue), sign, amount, unit);
  });
}

/** Parse query string from URL into key-value pairs */
export function parseQueryParams(url: string): Record<string, string> {
  const qIdx = url.indexOf('?');
  if (qIdx === -1) return {};
  const params: Record<string, string> = {};
  const searchStr = url.slice(qIdx + 1);
  for (const pair of searchStr.split('&')) {
    const [key, ...rest] = pair.split('=');
    if (key) {
      params[decodeURIComponent(key)] = decodeURIComponent(rest.join('=') || '');
    }
  }
  return params;
}

/** Split URL path into segments (filtering empty strings) */
export function parsePathSegments(url: string): string[] {
  const path = url.split('?')[0];
  return path.split('/').filter(Boolean);
}

const DATASET_REGEX = /\{\{\s*\$dataset\s*\}\}/g;

/** Replace {{$dataset}} with the request's pre-resolved dataset JSON (or null literal). */
export function resolveDataset(template: string, ctx: RequestContext): string {
  return template.replace(DATASET_REGEX, () => ctx.datasetJson ?? 'null');
}
