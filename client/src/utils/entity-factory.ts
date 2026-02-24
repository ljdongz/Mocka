import type { QueryParam, RequestHeader } from '../types';

export function createQueryParam(endpointId: string, overrides?: Partial<QueryParam>): QueryParam {
  return {
    id: crypto.randomUUID(),
    endpointId,
    key: '',
    value: '',
    isEnabled: true,
    sortOrder: 0,
    ...overrides,
  };
}

export function createRequestHeader(endpointId: string, overrides?: Partial<RequestHeader>): RequestHeader {
  return {
    id: crypto.randomUUID(),
    endpointId,
    key: '',
    value: '',
    isEnabled: true,
    sortOrder: 0,
    ...overrides,
  };
}

export interface FormDataField {
  id: string;
  key: string;
  value: string;
  type: 'text' | 'file';
  isEnabled: boolean;
}

export function createFormDataField(overrides?: Partial<FormDataField>): FormDataField {
  return {
    id: crypto.randomUUID(),
    key: '',
    value: '',
    type: 'text',
    isEnabled: true,
    ...overrides,
  };
}

export function createKeyValueRow(sortOrder: number): { id: string; key: string; value: string; isEnabled: boolean; sortOrder: number } {
  return {
    id: crypto.randomUUID(),
    key: '',
    value: '',
    isEnabled: true,
    sortOrder,
  };
}
