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
