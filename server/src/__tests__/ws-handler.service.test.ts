import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock side-effect services before importing the handler
vi.mock('../services/history.service.js', () => ({
  recordWs: vi.fn(),
}));
vi.mock('../services/environment.service.js', () => ({
  getActiveVariables: vi.fn(() => ({})),
}));
vi.mock('../services/settings.service.js', () => ({
  getAll: vi.fn(() => ({ responseDelay: 0 })),
}));

import { reload } from '../services/ws-registry.js';
import { handleWsMessage } from '../services/ws-mock-handler.service.js';
import * as historyService from '../services/history.service.js';
import type { WsEndpoint, WsResponseFrame } from '../models/ws-endpoint.js';
import type { MatchRules } from '../models/response-variant.js';

function makeFrame(overrides: Partial<WsResponseFrame> & { id: string }): WsResponseFrame {
  return {
    wsEndpointId: 'ws-1',
    trigger: 'message',
    label: 'Response',
    messageBody: '{"status":"ok"}',
    delay: null,
    intervalMin: null,
    intervalMax: null,
    memo: '',
    sortOrder: 0,
    matchRules: null,
    ...overrides,
  };
}

function makeEndpoint(overrides: Partial<WsEndpoint> = {}): WsEndpoint {
  return {
    id: 'ws-1',
    path: '/chat',
    name: 'Chat',
    isEnabled: true,
    activeFrameId: 'frame-1',
    createdAt: '',
    updatedAt: '',
    responseFrames: [],
    ...overrides,
  };
}

describe('handleWsMessage', () => {
  beforeEach(() => {
    reload([]);
    vi.clearAllMocks();
  });

  it('returns null when no endpoint matches the path', async () => {
    const result = await handleWsMessage('/unknown', 'hello');
    expect(result).toBeNull();
  });

  it('returns empty body when endpoint has no frames', async () => {
    reload([makeEndpoint({ responseFrames: [] })]);
    const result = await handleWsMessage('/chat', 'hello');
    expect(result).not.toBeNull();
    expect(result!.body).toBe('');
  });

  it('records WS history when endpoint has no frames', async () => {
    reload([makeEndpoint({ responseFrames: [] })]);
    await handleWsMessage('/chat', 'hello');
    expect(historyService.recordWs).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/chat', bodyOrParams: 'hello' }),
    );
  });

  describe('frame selection', () => {
    it('returns the active frame when no rules match', async () => {
      const frame1 = makeFrame({ id: 'frame-1', messageBody: '{"frame":1}' });
      const frame2 = makeFrame({ id: 'frame-2', messageBody: '{"frame":2}' });
      reload([makeEndpoint({
        activeFrameId: 'frame-2',
        responseFrames: [frame1, frame2],
      })]);

      const result = await handleWsMessage('/chat', '{}');
      expect(result!.body).toBe('{"frame":2}');
    });

    it('falls back to first frame when activeFrameId not found', async () => {
      const frame = makeFrame({ id: 'frame-1', messageBody: '{"first":true}' });
      reload([makeEndpoint({
        activeFrameId: undefined,
        responseFrames: [frame],
      })]);

      const result = await handleWsMessage('/chat', '{}');
      expect(result!.body).toBe('{"first":true}');
    });

    it('selects frame matching body rule (equals operator)', async () => {
      const defaultFrame = makeFrame({ id: 'frame-default', messageBody: '{"type":"default"}', sortOrder: 1 });
      const rules: MatchRules = {
        bodyRules: [{ field: 'action', operator: 'equals', value: 'ping' }],
        headerRules: [],
        queryParamRules: [],
        pathParamRules: [],
        combineWith: 'AND',
      };
      const ruleFrame = makeFrame({
        id: 'frame-rule',
        messageBody: '{"type":"pong"}',
        matchRules: rules,
        sortOrder: 0,
      });
      reload([makeEndpoint({
        activeFrameId: 'frame-default',
        responseFrames: [ruleFrame, defaultFrame],
      })]);

      const result = await handleWsMessage('/chat', '{"action":"ping"}');
      expect(result!.body).toBe('{"type":"pong"}');
    });

    it('selects frame matching body rule (contains operator)', async () => {
      const rules: MatchRules = {
        bodyRules: [{ field: 'message', operator: 'contains', value: 'hello' }],
        headerRules: [],
        queryParamRules: [],
        pathParamRules: [],
        combineWith: 'AND',
      };
      const ruleFrame = makeFrame({ id: 'frame-rule', messageBody: '{"reply":"hi"}', matchRules: rules });
      const defaultFrame = makeFrame({ id: 'frame-default', messageBody: '{"reply":"..."}' });
      reload([makeEndpoint({
        activeFrameId: 'frame-default',
        responseFrames: [ruleFrame, defaultFrame],
      })]);

      const result = await handleWsMessage('/chat', '{"message":"say hello world"}');
      expect(result!.body).toBe('{"reply":"hi"}');
    });

    it('selects frame matching body rule (regex operator)', async () => {
      const rules: MatchRules = {
        bodyRules: [{ field: 'cmd', operator: 'regex', value: '^ping\\d+$' }],
        headerRules: [],
        queryParamRules: [],
        pathParamRules: [],
        combineWith: 'AND',
      };
      const ruleFrame = makeFrame({ id: 'frame-rule', messageBody: '{"pong":true}', matchRules: rules });
      const defaultFrame = makeFrame({ id: 'frame-default', messageBody: '{}' });
      reload([makeEndpoint({
        activeFrameId: 'frame-default',
        responseFrames: [ruleFrame, defaultFrame],
      })]);

      const result = await handleWsMessage('/chat', '{"cmd":"ping42"}');
      expect(result!.body).toBe('{"pong":true}');
    });

    it('matches nested body fields via dot notation', async () => {
      const rules: MatchRules = {
        bodyRules: [{ field: 'user.role', operator: 'equals', value: 'admin' }],
        headerRules: [],
        queryParamRules: [],
        pathParamRules: [],
        combineWith: 'AND',
      };
      const adminFrame = makeFrame({ id: 'admin-frame', messageBody: '{"access":"granted"}', matchRules: rules });
      const defaultFrame = makeFrame({ id: 'default-frame', messageBody: '{"access":"denied"}' });
      reload([makeEndpoint({
        activeFrameId: 'default-frame',
        responseFrames: [adminFrame, defaultFrame],
      })]);

      const result = await handleWsMessage('/chat', '{"user":{"role":"admin"}}');
      expect(result!.body).toBe('{"access":"granted"}');
    });

    it('falls back to default when rule does not match', async () => {
      const rules: MatchRules = {
        bodyRules: [{ field: 'action', operator: 'equals', value: 'ping' }],
        headerRules: [],
        queryParamRules: [],
        pathParamRules: [],
        combineWith: 'AND',
      };
      const ruleFrame = makeFrame({ id: 'frame-rule', messageBody: '{"pong":true}', matchRules: rules });
      const defaultFrame = makeFrame({ id: 'frame-default', messageBody: '{"default":true}' });
      reload([makeEndpoint({
        activeFrameId: 'frame-default',
        responseFrames: [ruleFrame, defaultFrame],
      })]);

      const result = await handleWsMessage('/chat', '{"action":"other"}');
      expect(result!.body).toBe('{"default":true}');
    });
  });

  describe('non-JSON messages', () => {
    it('handles non-JSON message without throwing', async () => {
      const frame = makeFrame({ id: 'frame-1', messageBody: '{"ok":true}' });
      reload([makeEndpoint({ responseFrames: [frame] })]);

      const result = await handleWsMessage('/chat', 'this is not json');
      expect(result).not.toBeNull();
      expect(result!.body).toBe('{"ok":true}');
    });

    it('records non-JSON message as raw bodyOrParams', async () => {
      const frame = makeFrame({ id: 'frame-1', messageBody: 'pong' });
      reload([makeEndpoint({ responseFrames: [frame] })]);

      await handleWsMessage('/chat', 'ping');
      expect(historyService.recordWs).toHaveBeenCalledWith(
        expect.objectContaining({ bodyOrParams: 'ping' }),
      );
    });
  });

  describe('template resolution', () => {
    it('resolves environment variable placeholders in response body', async () => {
      const { getActiveVariables } = await import('../services/environment.service.js');
      vi.mocked(getActiveVariables).mockReturnValue({ API_URL: 'https://api.example.com' });

      const frame = makeFrame({ id: 'frame-1', messageBody: '{"url":"{{API_URL}}"}' });
      reload([makeEndpoint({ responseFrames: [frame] })]);

      const result = await handleWsMessage('/chat', '{}');
      expect(result!.body).toBe('{"url":"https://api.example.com"}');
    });

    it('resolves $body helper in response body', async () => {
      const frame = makeFrame({ id: 'frame-1', messageBody: '{"echo":"{{$body \'name\'}}"}' });
      reload([makeEndpoint({ responseFrames: [frame] })]);

      const result = await handleWsMessage('/chat', '{"name":"Alice"}');
      expect(result!.body).toBe('{"echo":"Alice"}');
    });
  });

  describe('path params', () => {
    it('extracts path params and passes them to rule matching', async () => {
      const rules: MatchRules = {
        bodyRules: [],
        headerRules: [],
        queryParamRules: [],
        pathParamRules: [{ field: 'roomId', operator: 'equals', value: 'vip' }],
        combineWith: 'AND',
      };
      const vipFrame = makeFrame({ id: 'vip-frame', messageBody: '{"access":"vip"}', matchRules: rules });
      const defaultFrame = makeFrame({ id: 'default-frame', messageBody: '{"access":"normal"}' });
      reload([makeEndpoint({
        id: 'ws-rooms',
        path: '/rooms/:roomId',
        activeFrameId: 'default-frame',
        responseFrames: [vipFrame, defaultFrame],
      })]);

      const result = await handleWsMessage('/rooms/vip', '{}');
      expect(result!.body).toBe('{"access":"vip"}');
    });

    it('resolves $pathParams helper in response body', async () => {
      const frame = makeFrame({ id: 'frame-1', messageBody: '{"room":"{{$pathParams \'roomId\'}}"}' });
      reload([makeEndpoint({
        id: 'ws-rooms',
        path: '/rooms/:roomId',
        responseFrames: [frame],
      })]);

      const result = await handleWsMessage('/rooms/lobby', '{}');
      expect(result!.body).toBe('{"room":"lobby"}');
    });
  });

  describe('history recording', () => {
    it('records successful WS exchange with response body', async () => {
      const frame = makeFrame({ id: 'frame-1', messageBody: '{"status":"ok"}' });
      reload([makeEndpoint({ responseFrames: [frame] })]);

      await handleWsMessage('/chat', '{"ping":true}');
      expect(historyService.recordWs).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/chat',
          bodyOrParams: '{"ping":true}',
          responseBody: '{"status":"ok"}',
        }),
      );
    });
  });
});
