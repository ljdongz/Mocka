import { match } from './route-registry.js';
import * as historyService from './history.service.js';
import * as environmentService from './environment.service.js';
import * as settingsService from './settings.service.js';
import { resolveVariables } from '../utils/template-variables.js';
import { resolveHelpers, parseQueryParams, parsePathSegments, type RequestContext } from '../utils/template-helpers.js';
import { matchesRules, type ResponseVariant } from '../models/response-variant.js';

/** Replace {{envVarName}} placeholders (non-$ prefixed) with environment variable values */
export function resolveEnvVariables(template: string, envVars: Record<string, string>): string {
  if (Object.keys(envVars).length === 0) return template;
  return template.replace(/\{\{\s*([a-zA-Z_]\w*)\s*\}\}/g, (fullMatch, varName: string) => {
    return varName in envVars ? envVars[varName] : fullMatch;
  });
}

/** Select the best matching ResponseVariant for a request */
export function resolveVariant(
  variants: ResponseVariant[],
  activeVariantId: string | undefined,
  headers: Record<string, string>,
  body: any,
  queryParams: Record<string, string>,
  pathParams: Record<string, string>,
): ResponseVariant | undefined {
  if (variants.length === 0) return undefined;

  // 1. x-mock-response-code header
  const mockResponseCode = headers['x-mock-response-code'];
  if (mockResponseCode) {
    const code = parseInt(mockResponseCode, 10);
    const found = variants.find(v => v.statusCode === code);
    if (found) return found;
  }

  // 2. x-mock-response-name header
  const mockResponseName = headers['x-mock-response-name'];
  if (mockResponseName) {
    const name = mockResponseName.toLowerCase();
    const found = variants.find(v => v.description.toLowerCase() === name);
    if (found) return found;
  }

  // 3. Conditional match rules
  const ruleMatch = variants.find(v => v.matchRules && matchesRules(v.matchRules, body, headers, queryParams, pathParams));
  if (ruleMatch) return ruleMatch;

  // 4. Active variant or first variant
  return variants.find(v => v.id === activeVariantId) ?? variants[0];
}

/** Resolve template body: env vars → helpers → dynamic variables */
export function resolveResponseBody(
  template: string,
  envVars: Record<string, string>,
  requestContext: RequestContext,
): string {
  return resolveVariables(resolveHelpers(resolveEnvVariables(template, envVars), requestContext));
}

/** Build the body string used for history recording (merges pathParams if present) */
export function buildRecordBody(body: any, pathParams: Record<string, string>): string {
  if (Object.keys(pathParams).length === 0) {
    return JSON.stringify(body ?? {});
  }
  const safeBody = (typeof body === 'object' && body !== null && !Array.isArray(body)) ? body : { _body: body };
  return JSON.stringify({ ...safeBody, _pathParams: pathParams });
}

export interface MockResponse {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
  delay: number;
}

export async function handleMockRequest(
  method: string,
  url: string,
  body: any,
  headers: Record<string, string>,
): Promise<MockResponse> {
  const path = url.split('?')[0];
  const result = match(method, path);

  if (!result) {
    const message = `No mock endpoint configured for ${method} ${path}`;
    historyService.record({
      method,
      path: url,
      statusCode: 404,
      bodyOrParams: JSON.stringify(body ?? {}),
      requestHeaders: JSON.stringify(headers),
      responseBody: JSON.stringify({ error: message }),
    });
    return { statusCode: 404, body: JSON.stringify({ error: message }), headers: {}, delay: 0 };
  }

  const { endpoint, pathParams } = result;
  const queryParams = parseQueryParams(url);
  const variants = endpoint.responseVariants ?? [];

  const variant = resolveVariant(variants, endpoint.activeVariantId ?? undefined, headers, body, queryParams, pathParams);

  if (!variant) {
    return { statusCode: 500, body: JSON.stringify({ error: 'No response variant configured' }), headers: {}, delay: 0 };
  }

  // Apply delay: header > variant delay > global default (all in seconds)
  const mockResponseDelay = headers['x-mock-response-delay'];
  const globalDelay = settingsService.getAll().responseDelay ?? 0;
  const delaySec = mockResponseDelay ? parseFloat(mockResponseDelay) : (variant.delay ?? globalDelay);
  if (delaySec > 0) {
    await new Promise(resolve => setTimeout(resolve, delaySec * 1000));
  }

  // Parse response headers
  let responseHeaders: Record<string, string> = {};
  try {
    responseHeaders = JSON.parse(variant.headers);
  } catch { /* ignore invalid headers */ }

  const envVars = environmentService.getActiveVariables();
  const requestContext: RequestContext = {
    body: typeof body === 'object' ? body : {},
    queryParams,
    pathSegments: parsePathSegments(url),
    headers,
    pathParams,
  };

  const resolvedBody = resolveResponseBody(variant.body, envVars, requestContext);

  // Also resolve env variables in response headers
  for (const [key, val] of Object.entries(responseHeaders)) {
    responseHeaders[key] = resolveEnvVariables(val, envVars);
  }

  historyService.record({
    method,
    path: url,
    statusCode: variant.statusCode,
    bodyOrParams: buildRecordBody(body, pathParams),
    requestHeaders: JSON.stringify(headers),
    responseBody: resolvedBody,
  });

  return {
    statusCode: variant.statusCode,
    body: resolvedBody,
    headers: responseHeaders,
    delay: 0,
  };
}
