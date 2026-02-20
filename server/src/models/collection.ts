export interface Collection {
  id: string;
  name: string;
  isExpanded: boolean;
  sortOrder: number;
  createdAt: string;
  endpointIds?: string[];
}
