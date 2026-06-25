export interface HttpRequestRecord {
  protocol: 'http';
  id: string;
  method: string;
  path: string;
  statusCode: number;
  bodyOrParams: string;
  requestHeaders: string;
  responseBody: string;
  timestamp: string;
}

export type RequestRecord = HttpRequestRecord;
