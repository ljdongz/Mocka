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

/**
 * Pattern: {{$helperName 'arg'}} or {{$helperName 'arg' 'default'}}
 * Supports both single and double quotes.
 */
const HELPER_REGEX = /\{\{\s*(\$\w+)\s+['"]([^'"]*)['"]\s*(?:['"]([^'"]*)['"]\s*)?\}\}/g;

/**
 * Resolve all {{$helper 'arg' 'default'}} placeholders using request context.
 */
export function resolveHelpers(template: string, ctx: RequestContext): string {
  return template.replace(HELPER_REGEX, (_fullMatch, helperName: string, arg: string, defaultValue?: string) => {
    const helper = HELPERS[helperName];
    if (!helper) return _fullMatch;
    return helper(ctx, arg, defaultValue);
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
