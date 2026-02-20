import type { QueryParam } from '../types';

/**
 * Build a full URL string from path + enabled query params.
 * Only includes params that are enabled and have a non-empty key.
 * Values are optional — if empty, only the key is included.
 */
export function buildFullUrl(
  path: string,
  queryParams: QueryParam[] | undefined,
): string {
  if (!queryParams?.length) return path;

  const parts = queryParams
    .filter(p => p.isEnabled && p.key.trim())
    .map(p => {
      const key = encodeURIComponent(p.key.trim());
      const val = p.value.trim();
      return val ? `${key}=${encodeURIComponent(val)}` : key;
    });

  if (!parts.length) return path;
  return `${path}?${parts.join('&')}`;
}

/**
 * Parse a URL string that may contain query params into path + params array.
 * e.g. "/api?pageNo=1&pageSize=3" → { path: "/api", params: [{key:"pageNo",value:"1"}, ...] }
 */
export function parseUrlWithParams(
  url: string,
): { path: string; params: { key: string; value: string }[] } {
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return { path: url, params: [] };

  const path = url.slice(0, qIndex);
  const queryString = url.slice(qIndex + 1);
  if (!queryString) return { path, params: [] };

  const params = queryString
    .split('&')
    .filter(Boolean)
    .map(part => {
      const eqIndex = part.indexOf('=');
      if (eqIndex === -1) {
        return { key: decodeURIComponent(part), value: '' };
      }
      return {
        key: decodeURIComponent(part.slice(0, eqIndex)),
        value: decodeURIComponent(part.slice(eqIndex + 1)),
      };
    })
    .filter(p => p.key);

  return { path, params };
}
