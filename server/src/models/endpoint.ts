import type { HttpMethod } from './http-method.js';
import type { ResponseVariant } from './response-variant.js';

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
  queryParams?: QueryParam[];
  requestHeaders?: RequestHeader[];
  responseVariants?: ResponseVariant[];
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
