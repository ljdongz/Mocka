export type RecordProtocol = 'http' | 'stomp';
export type FrameDirection = 'in' | 'out';

export interface RequestRecord {
  id: string;
  /** HTTP method, or the STOMP command for frame-log rows */
  method: string;
  /** URL path, or the STOMP destination (connection path for CONNECT/DISCONNECT) */
  path: string;
  statusCode: number;
  bodyOrParams: string;
  requestHeaders: string;
  responseBody: string;
  timestamp: string;
  protocol: RecordProtocol;
  /** stomp only — 'in' = client → server, 'out' = server → client */
  direction: FrameDirection | null;
  /** stomp only */
  sessionId: string | null;
}
