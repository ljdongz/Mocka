export interface Collection {
  id: string;
  name: string;
  /** Enclosing collection; null at the top level. Deleting a collection deletes its subtree. */
  parentId: string | null;
  isExpanded: boolean;
  sortOrder: number;
  createdAt: string;
  endpointIds?: string[];
}
