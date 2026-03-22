import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing the service
vi.mock('../services/ws-registry.js', () => ({
  match: vi.fn(),
}));

vi.mock('../services/history.service.js', () => ({
  recordWs: vi.fn(),
}));

vi.mock('../services/environment.service.js', () => ({
  getActiveVariables: vi.fn().mockReturnValue({}),
}));

vi.mock('../services/settings.service.js', () => ({
  getAll: vi.fn().mockReturnValue({ responseDelay: 0 }),
}));

vi.mock('../services/mock-handler.service.js', () => ({
  resolveResponseBody: vi.fn((template: string) => template),
}));

import { handleWsMessage } from '../services/ws-mock-handler.service.js';
import * as wsRegistry from '../services/ws-registry.js';
import * as historyService from '../services/history.service.js';
import { resolveResponseBody } from '../services/mock-handler.service.js';
import type { WsEndpoint, WsResponseFrame } from '../models/ws-endpoint.js';

function makeFrame(overrides: Partial<WsResponseFrame> & { id: string }): WsResponseFrame {
  return {
    wsEndpointId: 'ep1',
    trigger: 'message',
    label: 'Response',
    messageBody: '{"reply":"hello"}',
    delay: null,
    intervalMin: null,
    intervalMax: null,
    memo: '',
    sortOrder: 0,
    matchRules: null,
    ...overrides,
  };
}

function makeEndpoint(frames: WsResponseFrame[], activeFrameId?: string): WsEndpoint {
  return {
    id: 'ep1',
    path: '/chat',
    name: '',
    isEnabled: true,
    activeFrameId: activeFrameId ?? frames[0]?.id ?? null,
    createdAt: '',
    updatedAt: '',
    responseFrames: frames,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveResponseBody).mockImplementation((template: string) => template);
  vi.mocked(historyService.recordWs).mockImplementation(() => ({ id: 'r1', protocol: 'ws', method: 'WS', path: '/chat', statusCode: 0, bodyOrParams: '', requestHeaders: '{}', responseBody: '', timestamp: '' }));
});

describe('handleWsMessage: no endpoint match', () => {
  it('returns null when path has no registered endpoint', async () => {
    vi.mocked(wsRegistry.match).mockReturnValue(undefined);
    const result = await handleWsMessage('/unknown', '{}');
    expect(result).toBeNull();
  });
});

describe('handleWsMessage: endpoint with no frames', () => {
  it('returns empty body when endpoint has no frames', async () => {
    const ep = makeEndpoint([]);
    vi.mocked(wsRegistry.match).mockReturnValue({ endpoint: ep, pathParams: {} });
    const result = await handleWsMessage('/chat', '{}');
    expect(result).toBeDefined();
    expect(result!.body).toBe('');
  });
});

describe('handleWsMessage: active frame selection', () => {
  it('returns the active frame body', async () => {
    const f1 = makeFrame({ id: 'f1', messageBody: '{"msg":"first"}' });
    const f2 = makeFrame({ id: 'f2', messageBody: '{"msg":"second"}', sortOrder: 1 });
    const ep = makeEndpoint([f1, f2], 'f2');
    vi.mocked(wsRegistry.match).mockReturnValue({ endpoint: ep, pathParams: {} });
    const result = await handleWsMessage('/chat', 'hello');
    expect(result!.body).toBe('{"msg":"second"}');
  });

  it('falls back to first frame when activeFrameId is not found', async () => {
    const f1 = makeFrame({ id: 'f1', messageBody: '{"msg":"first"}' });
    const ep = makeEndpoint([f1], 'nonexistent');
    vi.mocked(wsRegistry.match).mockReturnValue({ endpoint: ep, pathParams: {} });
    const result = await handleWsMessage('/chat', '{}');
    expect(result!.body).toBe('{"msg":"first"}');
  });
});

describe('handleWsMessage: match rules', () => {
  it('selects frame with matching body rules over active frame', async () => {
    const defaultFrame = makeFrame({ id: 'f1', messageBody: '{"reply":"default"}' });
    const ruleFrame = makeFrame({
      id: 'f2',
      messageBody: '{"reply":"matched"}',
      sortOrder: 1,
      matchRules: {
        bodyRules: [{ field: 'action', operator: 'equals', value: 'greet' }],
        headerRules: [],
        queryParamRules: [],
        pathParamRules: [],
        combineWith: 'AND',
      },
    });
    const ep = makeEndpoint([defaultFrame, ruleFrame], 'f1');
    vi.mocked(wsRegistry.match).mockReturnValue({ endpoint: ep, pathParams: {} });

    const result = await handleWsMessage('/chat', JSON.stringify({ action: 'greet' }));
    expect(result!.body).toBe('{"reply":"matched"}');
  });

  it('falls back to active frame when no match rules match', async () => {
    const defaultFrame = makeFrame({ id: 'f1', messageBody: '{"reply":"default"}' });
    const ruleFrame = makeFrame({
      id: 'f2',
      messageBody: '{"reply":"matched"}',
      sortOrder: 1,
      matchRules: {
        bodyRules: [{ field: 'action', operator: 'equals', value: 'greet' }],
        headerRules: [],
        queryParamRules: [],
        pathParamRules: [],
        combineWith: 'AND',
      },
    });
    const ep = makeEndpoint([defaultFrame, ruleFrame], 'f1');
    vi.mocked(wsRegistry.match).mockReturnValue({ endpoint: ep, pathParams: {} });

    const result = await handleWsMessage('/chat', JSON.stringify({ action: 'bye' }));
    expect(result!.body).toBe('{"reply":"default"}');
  });

  it('uses contains operator in match rules', async () => {
    const defaultFrame = makeFrame({ id: 'f1', messageBody: '{"reply":"default"}' });
    const ruleFrame = makeFrame({
      id: 'f2',
      messageBody: '{"reply":"contains-match"}',
      sortOrder: 1,
      matchRules: {
        bodyRules: [{ field: 'text', operator: 'contains', value: 'hello' }],
        headerRules: [],
        queryParamRules: [],
        pathParamRules: [],
        combineWith: 'AND',
      },
    });
    const ep = makeEndpoint([defaultFrame, ruleFrame], 'f1');
    vi.mocked(wsRegistry.match).mockReturnValue({ endpoint: ep, pathParams: {} });

    const result = await handleWsMessage('/chat', JSON.stringify({ text: 'say hello world' }));
    expect(result!.body).toBe('{"reply":"contains-match"}');
  });
});

describe('handleWsMessage: non-JSON message', () => {
  it('handles non-JSON message without crashing', async () => {
    const frame = makeFrame({ id: 'f1', messageBody: '{"reply":"ok"}' });
    const ep = makeEndpoint([frame]);
    vi.mocked(wsRegistry.match).mockReturnValue({ endpoint: ep, pathParams: {} });

    const result = await handleWsMessage('/chat', 'plain text message');
    expect(result).toBeDefined();
    expect(result!.body).toBe('{"reply":"ok"}');
  });
});

describe('handleWsMessage: template resolution', () => {
  it('calls resolveResponseBody with the frame body', async () => {
    vi.mocked(resolveResponseBody).mockReturnValue('{"resolved":"value"}');
    const frame = makeFrame({ id: 'f1', messageBody: '{{template}}' });
    const ep = makeEndpoint([frame]);
    vi.mocked(wsRegistry.match).mockReturnValue({ endpoint: ep, pathParams: {} });

    const result = await handleWsMessage('/chat', '{}');
    expect(resolveResponseBody).toHaveBeenCalledWith('{{template}}', {}, expect.any(Object));
    expect(result!.body).toBe('{"resolved":"value"}');
  });
});

describe('handleWsMessage: history recording', () => {
  it('records WS message in history', async () => {
    const frame = makeFrame({ id: 'f1', messageBody: '{"reply":"ok"}' });
    const ep = makeEndpoint([frame]);
    vi.mocked(wsRegistry.match).mockReturnValue({ endpoint: ep, pathParams: {} });

    await handleWsMessage('/chat', '{"input":"test"}');
    expect(historyService.recordWs).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/chat', bodyOrParams: '{"input":"test"}' })
    );
  });

  it('records even when no frames exist', async () => {
    const ep = makeEndpoint([]);
    vi.mocked(wsRegistry.match).mockReturnValue({ endpoint: ep, pathParams: {} });

    await handleWsMessage('/chat', 'hello');
    expect(historyService.recordWs).toHaveBeenCalled();
  });
});
