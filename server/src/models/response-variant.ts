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

/** Check if a single match rule passes against a value */
export function evaluateRule(rule: MatchRule, actual: string | undefined): boolean {
  if (actual === undefined || actual === null) return false;
  const a = String(actual);
  switch (rule.operator) {
    case 'equals': return a === rule.value;
    case 'contains': return a.includes(rule.value);
    case 'startsWith': return a.startsWith(rule.value);
    case 'endsWith': return a.endsWith(rule.value);
    case 'regex': try { return new RegExp(rule.value).test(a); } catch { return false; }
    default: return false;
  }
}

/** Get nested value from object by dot-path */
export function getNestedValue(obj: any, path: string): any {
  if (obj == null || typeof obj !== 'object') return undefined;
  return path.split('.').reduce((cur, key) => cur?.[key], obj);
}

/** Check if a variant's match rules are satisfied by the request */
export function matchesRules(rules: MatchRules, body: any, headers: Record<string, string>): boolean {
  const results: boolean[] = [];

  for (const rule of rules.bodyRules ?? []) {
    const val = getNestedValue(body, rule.field);
    results.push(evaluateRule(rule, val !== undefined ? String(val) : undefined));
  }
  for (const rule of rules.headerRules ?? []) {
    const val = headers[rule.field.toLowerCase()];
    results.push(evaluateRule(rule, val));
  }

  if (results.length === 0) return false;
  return rules.combineWith === 'OR' ? results.some(Boolean) : results.every(Boolean);
}
