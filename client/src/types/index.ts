export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface Endpoint {
  id: string;
  method: HttpMethod;
  path: string;
  name: string;
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

export interface MatchRule {
  field: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'regex';
  value: string;
}

export interface MatchRules {
  bodyRules: MatchRule[];
  headerRules: MatchRule[];
  queryParamRules: MatchRule[];
  pathParamRules: MatchRule[];
  combineWith: 'AND' | 'OR';
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
  matchRules: MatchRules | null;
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

export type Theme = 'dark' | 'light';
export type Language = 'en' | 'ko';

export interface Settings {
  port: number;
  responseDelay: number;
  autoSaveEndpoints: boolean;
  historyToast: boolean;
  theme: Theme;
  language: Language;
}

export interface ServerStatus {
  running: boolean;
  port: number;
  localIp: string;
}

export interface Environment {
  id: string;
  name: string;
  variables: Record<string, string>;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}
