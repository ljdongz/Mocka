export interface Environment {
  id: string;
  name: string;
  variables: Record<string, string>;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}
