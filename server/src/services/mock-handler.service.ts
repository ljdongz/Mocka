import { match } from './route-registry.js';
import * as historyService from './history.service.js';
import * as environmentService from './environment.service.js';
import { resolveVariables } from '../utils/template-variables.js';
import { resolveHelpers, parseQueryParams, parsePathSegments, type RequestContext } from '../utils/template-helpers.js';
import { matchesRules } from '../models/response-variant.js';

/** Replace {{envVarName}} placeholders (non-$ prefixed) with environment variable values */
function resolveEnvVariables(template: string, envVars: Record<string, string>): string {
  if (Object.keys(envVars).length === 0) return template;
  return template.replace(/\{\{\s*([a-zA-Z_]\w*)\s*\}\}/g, (fullMatch, varName: string) => {
    return varName in envVars ? envVars[varName] : fullMatch;
  });
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
    return {
      statusCode: 404,
      body: JSON.stringify({ error: message }),
      headers: {},
      delay: 0,
    };
  }

  const { endpoint, pathParams } = result;

  // Find variant: x-mock-response-* headers take priority over active variant
  const variants = endpoint.responseVariants ?? [];
  const mockResponseCode = headers['x-mock-response-code'];
  const mockResponseName = headers['x-mock-response-name'];
  const mockResponseDelay = headers['x-mock-response-delay'];

  let variant = undefined;

  // 1. x-mock-response-* headers take highest priority
  if (mockResponseCode) {
    const code = parseInt(mockResponseCode, 10);
    variant = variants.find(v => v.statusCode === code);
  }

  if (!variant && mockResponseName) {
    const name = mockResponseName.toLowerCase();
    variant = variants.find(v => v.description.toLowerCase() === name);
  }

  // 2. Conditional match rules: find first variant whose rules match the request
  if (!variant) {
    variant = variants.find(v => v.matchRules && matchesRules(v.matchRules, body, headers));
  }

  // 3. Fallback: active variant or first variant
  if (!variant) {
    variant = variants.find(v => v.id === endpoint.activeVariantId)
      ?? variants[0];
  }

  if (!variant) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'No response variant configured' }),
      headers: {},
      delay: 0,
    };
  }

  // Apply delay: x-mock-response-delay header overrides variant delay
  const delay = mockResponseDelay ? parseInt(mockResponseDelay, 10) : (variant.delay ?? 0);
  if (delay > 0) {
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  // Parse response headers
  let responseHeaders: Record<string, string> = {};
  try {
    responseHeaders = JSON.parse(variant.headers);
  } catch { /* ignore invalid headers */ }

  // Build request info with path params (safely handle non-object bodies)
  const hasPathParams = Object.keys(pathParams).length > 0;
  let recordBody: string;
  if (hasPathParams) {
    const safeBody = (typeof body === 'object' && body !== null && !Array.isArray(body)) ? body : { _body: body };
    recordBody = JSON.stringify({ ...safeBody, _pathParams: pathParams });
  } else {
    recordBody = JSON.stringify(body ?? {});
  }

  // Build request context for template helpers
  const requestContext: RequestContext = {
    body: typeof body === 'object' ? body : {},
    queryParams: parseQueryParams(url),
    pathSegments: parsePathSegments(url),
    headers,
    pathParams,
  };

  // Resolve: env variables → template helpers (request data) → dynamic variables (random data)
  const envVars = environmentService.getActiveVariables();
  const resolvedBody = resolveVariables(resolveHelpers(resolveEnvVariables(variant.body, envVars), requestContext));

  // Also resolve env variables in response headers
  for (const [key, val] of Object.entries(responseHeaders)) {
    responseHeaders[key] = resolveEnvVariables(val, envVars);
  }

  // Record request
  historyService.record({
    method,
    path: url,
    statusCode: variant.statusCode,
    bodyOrParams: recordBody,
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
