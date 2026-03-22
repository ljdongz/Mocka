import { match } from './ws-registry.js';
import * as historyService from './history.service.js';
import * as environmentService from './environment.service.js';
import * as settingsService from './settings.service.js';
import { resolveResponseBody } from './mock-handler.service.js';
import { matchesRules } from '../models/response-variant.js';
import type { WsResponseFrame } from '../models/ws-endpoint.js';
import { parsePathSegments } from '../utils/template-helpers.js';
import type { RequestContext } from '../utils/template-helpers.js';

export interface WsFrameResponse {
  body: string;
  delay: number;
  intervalMin: number | null;
  intervalMax: number | null;
  /** Original template for re-resolution on periodic sends */
  messageTemplate: string;
}

/**
 * Select the best matching WsResponseFrame for an incoming WS message.
 * Priority:
 *   1. Conditional match rules (bodyRules on the JSON message)
 *   2. Active frame or first frame
 */
function resolveFrame(
  frames: WsResponseFrame[],
  activeFrameId: string | undefined,
  messageBody: any,
  pathParams: Record<string, string>,
): WsResponseFrame | undefined {
  if (frames.length === 0) return undefined;

  // Match rules operate on the parsed message body; no headers/queryParams in WS context
  const ruleMatch = frames.find(f =>
    f.matchRules && matchesRules(f.matchRules, messageBody, {}, {}, pathParams),
  );
  if (ruleMatch) return ruleMatch;

  return frames.find(f => f.id === activeFrameId) ?? frames[0];
}

/**
 * Handle a new WebSocket connection: return all connect-trigger frames,
 * or null if no endpoint matched.
 */
export async function handleWsConnect(
  path: string,
): Promise<WsFrameResponse[] | null> {
  const result = match(path);
  if (!result) return null;

  const { endpoint, pathParams } = result;
  const connectFrames = (endpoint.responseFrames ?? []).filter(f => f.trigger === 'connect');
  if (connectFrames.length === 0) return [];

  const envVars = environmentService.getActiveVariables();
  const responses: WsFrameResponse[] = [];

  for (const frame of connectFrames) {
    const globalDelay = settingsService.getAll().responseDelay ?? 0;
    const delaySec = frame.delay ?? globalDelay;
    if (delaySec > 0) {
      await new Promise(resolve => setTimeout(resolve, delaySec * 1000));
    }

    const requestContext: RequestContext = {
      body: {},
      queryParams: {},
      pathSegments: parsePathSegments(path),
      headers: {},
      pathParams,
    };

    const resolvedBody = resolveResponseBody(frame.messageBody, envVars, requestContext);

    historyService.recordWs({
      path,
      bodyOrParams: '',
      requestHeaders: '{}',
      responseBody: resolvedBody,
    });

    responses.push({
      body: resolvedBody,
      delay: 0,
      intervalMin: frame.intervalMin,
      intervalMax: frame.intervalMax,
      messageTemplate: frame.messageBody,
    });
  }

  return responses;
}

/**
 * Handle an incoming WebSocket message and return the frame to send back,
 * or null if no endpoint matched (caller should close with 4004).
 *
 * @param path  - normalized URL path of the WS connection (without query string)
 * @param rawMessage - raw string message received from the client
 */
export async function handleWsMessage(
  path: string,
  rawMessage: string,
): Promise<WsFrameResponse | null> {
  const result = match(path);

  if (!result) {
    return null;
  }

  const { endpoint, pathParams } = result;
  const frames = (endpoint.responseFrames ?? []).filter(f => f.trigger !== 'connect');

  // Parse message body as JSON for rule matching; fall back to raw string
  let parsedBody: any;
  try {
    parsedBody = JSON.parse(rawMessage);
  } catch {
    parsedBody = rawMessage;
  }

  const frame = resolveFrame(frames, endpoint.activeFrameId ?? undefined, parsedBody, pathParams);

  if (!frame) {
    // Endpoint exists but has no frames – record and return empty response
    historyService.recordWs({
      path,
      bodyOrParams: rawMessage,
      requestHeaders: '{}',
      responseBody: '',
    });
    return { body: '', delay: 0, intervalMin: null, intervalMax: null, messageTemplate: '' };
  }

  // Apply delay: frame delay > global default (seconds)
  const globalDelay = settingsService.getAll().responseDelay ?? 0;
  const delaySec = frame.delay ?? globalDelay;
  if (delaySec > 0) {
    await new Promise(resolve => setTimeout(resolve, delaySec * 1000));
  }

  const envVars = environmentService.getActiveVariables();
  const requestContext: RequestContext = {
    body: typeof parsedBody === 'object' && parsedBody !== null ? parsedBody : {},
    queryParams: {},
    pathSegments: parsePathSegments(path),
    headers: {},
    pathParams,
  };

  const resolvedBody = resolveResponseBody(frame.messageBody, envVars, requestContext);

  historyService.recordWs({
    path,
    bodyOrParams: rawMessage,
    requestHeaders: '{}',
    responseBody: resolvedBody,
  });

  return { body: resolvedBody, delay: 0, intervalMin: null, intervalMax: null, messageTemplate: frame.messageBody };
}

/**
 * Resolve a WS message template with fresh environment variables and context.
 * Used for periodic re-sends so each tick gets fresh dynamic values (e.g. {{$timestamp}}).
 */
export function resolveWsTemplate(path: string, template: string): string {
  const envVars = environmentService.getActiveVariables();
  const requestContext: RequestContext = {
    body: {},
    queryParams: {},
    pathSegments: parsePathSegments(path),
    headers: {},
    pathParams: {},
  };
  return resolveResponseBody(template, envVars, requestContext);
}
