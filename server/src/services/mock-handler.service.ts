import { match } from './route-registry.js';
import * as historyService from './history.service.js';

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

  // Find active variant
  const variant = endpoint.responseVariants?.find(v => v.id === endpoint.activeVariantId)
    ?? endpoint.responseVariants?.[0];

  if (!variant) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'No response variant configured' }),
      headers: {},
      delay: 0,
    };
  }

  // Apply delay
  const delay = variant.delay ?? 0;
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

  // Record request
  historyService.record({
    method,
    path: url,
    statusCode: variant.statusCode,
    bodyOrParams: recordBody,
    requestHeaders: JSON.stringify(headers),
    responseBody: variant.body,
  });

  return {
    statusCode: variant.statusCode,
    body: variant.body,
    headers: responseHeaders,
    delay: 0,
  };
}
