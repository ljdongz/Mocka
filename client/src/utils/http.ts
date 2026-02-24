export const STATUS_CODES = [
  { code: 200, label: '200 OK' },
  { code: 201, label: '201 Created' },
  { code: 204, label: '204 No Content' },
  { code: 301, label: '301 Moved Permanently' },
  { code: 302, label: '302 Found' },
  { code: 304, label: '304 Not Modified' },
  { code: 400, label: '400 Bad Request' },
  { code: 401, label: '401 Unauthorized' },
  { code: 403, label: '403 Forbidden' },
  { code: 404, label: '404 Not Found' },
  { code: 405, label: '405 Method Not Allowed' },
  { code: 409, label: '409 Conflict' },
  { code: 422, label: '422 Unprocessable Entity' },
  { code: 429, label: '429 Too Many Requests' },
  { code: 500, label: '500 Internal Server Error' },
  { code: 502, label: '502 Bad Gateway' },
  { code: 503, label: '503 Service Unavailable' },
] as const;

export function getStatusColor(code: number): string {
  if (code >= 200 && code < 300) return 'bg-[#22C55E18] text-status-2xx';
  if (code >= 400 && code < 500) return 'bg-[#F59E0B18] text-status-4xx';
  if (code >= 500) return 'bg-[#EF444418] text-status-5xx';
  return 'bg-bg-input text-text-secondary';
}
