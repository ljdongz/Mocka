export interface MatchRule {
  field: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'regex';
  value: string;
}

export interface MatchRules {
  bodyRules: MatchRule[];
  headerRules: MatchRule[];
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
