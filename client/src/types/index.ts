export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface Endpoint {
  id: string;
  method: HttpMethod;
  path: string;
  activeVariantId: string | null;
  isEnabled: boolean;
  requestBodyContentType: string;
  requestBodyRaw: string;
  createdAt: string;
  updatedAt: string;
  queryParams: QueryParam[];
  requestHeaders: RequestHeader[];
  responseVariants: ResponseVariant[];
}

export interface QueryParam {
  id: string;
  endpointId: string;
  key: string;
  value: string;
  isEnabled: boolean;
  sortOrder: number;
}

export interface RequestHeader {
  id: string;
  endpointId: string;
  key: string;
  value: string;
  isEnabled: boolean;
  sortOrder: number;
}

export interface ResponseVariant {
  id: string;
  endpointId: string;
  statusCode: number;
  description: string;
  body: string;
  headers: string;
  delay: number | null;
  memo: string;
  sortOrder: number;
}

export interface Collection {
  id: string;
  name: string;
  isExpanded: boolean;
  sortOrder: number;
  createdAt: string;
  endpointIds: string[];
}

export interface RequestRecord {
  id: string;
  method: string;
  path: string;
  statusCode: number;
  bodyOrParams: string;
  requestHeaders: string;
  responseBody: string;
  timestamp: string;
}

/** Server DTO — all values are strings (SQLite key-value store) */
export interface SettingsDTO {
  port: string;
  responseDelay: string;
  autoSaveEndpoints: string;
  historyToast: string;
}

/** Client model — properly typed */
export interface Settings {
  port: number;
  responseDelay: number;
  autoSaveEndpoints: boolean;
  historyToast: boolean;
}

export interface ServerStatus {
  running: boolean;
  port: string;
  localIp: string;
}
