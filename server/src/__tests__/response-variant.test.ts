import { describe, it, expect } from 'vitest';
import { evaluateRule, matchesRules, getNestedValue } from '../models/response-variant.js';
import type { MatchRule, MatchRules } from '../models/response-variant.js';

describe('evaluateRule', () => {
  it('equals: matches exact value', () => {
    const rule: MatchRule = { field: 'name', operator: 'equals', value: 'John' };
    expect(evaluateRule(rule, 'John')).toBe(true);
    expect(evaluateRule(rule, 'Jane')).toBe(false);
  });

  it('contains: matches substring', () => {
    const rule: MatchRule = { field: 'name', operator: 'contains', value: 'oh' };
    expect(evaluateRule(rule, 'John')).toBe(true);
    expect(evaluateRule(rule, 'Jane')).toBe(false);
  });

  it('startsWith: matches prefix', () => {
    const rule: MatchRule = { field: 'name', operator: 'startsWith', value: 'Jo' };
    expect(evaluateRule(rule, 'John')).toBe(true);
    expect(evaluateRule(rule, 'Jane')).toBe(false);
  });

  it('endsWith: matches suffix', () => {
    const rule: MatchRule = { field: 'name', operator: 'endsWith', value: 'hn' };
    expect(evaluateRule(rule, 'John')).toBe(true);
    expect(evaluateRule(rule, 'Jane')).toBe(false);
  });

  it('regex: matches pattern', () => {
    const rule: MatchRule = { field: 'name', operator: 'regex', value: '^J.+n$' };
    expect(evaluateRule(rule, 'John')).toBe(true);
    expect(evaluateRule(rule, 'Jane')).toBe(false);
  });

  it('returns false for undefined input', () => {
    const rule: MatchRule = { field: 'name', operator: 'equals', value: 'test' };
    expect(evaluateRule(rule, undefined)).toBe(false);
  });

  it('regex: returns false for invalid regex', () => {
    const rule: MatchRule = { field: 'x', operator: 'regex', value: '[invalid' };
    expect(evaluateRule(rule, 'test')).toBe(false);
  });
});

describe('getNestedValue', () => {
  it('extracts nested value by dot path', () => {
    const obj = { user: { address: { city: 'NYC' } } };
    expect(getNestedValue(obj, 'user.address.city')).toBe('NYC');
  });

  it('returns undefined for missing path', () => {
    expect(getNestedValue({ a: 1 }, 'b.c')).toBeUndefined();
  });

  it('returns undefined for null input', () => {
    expect(getNestedValue(null, 'a')).toBeUndefined();
  });
});

describe('matchesRules', () => {
  const makeRules = (overrides: Partial<MatchRules>): MatchRules => ({
    bodyRules: [],
    headerRules: [],
    queryParamRules: [],
    pathParamRules: [],
    combineWith: 'AND',
    ...overrides,
  });

  it('AND mode: returns true when all rules pass', () => {
    const rules = makeRules({
      combineWith: 'AND',
      bodyRules: [
        { field: 'name', operator: 'equals', value: 'John' },
        { field: 'age', operator: 'equals', value: '30' },
      ],
    });
    expect(matchesRules(rules, { name: 'John', age: 30 }, {})).toBe(true);
  });

  it('AND mode: returns false when one rule fails', () => {
    const rules = makeRules({
      combineWith: 'AND',
      bodyRules: [
        { field: 'name', operator: 'equals', value: 'John' },
        { field: 'age', operator: 'equals', value: '99' },
      ],
    });
    expect(matchesRules(rules, { name: 'John', age: 30 }, {})).toBe(false);
  });

  it('OR mode: returns true when at least one rule passes', () => {
    const rules = makeRules({
      combineWith: 'OR',
      bodyRules: [
        { field: 'name', operator: 'equals', value: 'John' },
        { field: 'name', operator: 'equals', value: 'Jane' },
      ],
    });
    expect(matchesRules(rules, { name: 'John' }, {})).toBe(true);
  });

  it('OR mode: returns false when no rules pass', () => {
    const rules = makeRules({
      combineWith: 'OR',
      bodyRules: [
        { field: 'name', operator: 'equals', value: 'Alice' },
        { field: 'name', operator: 'equals', value: 'Bob' },
      ],
    });
    expect(matchesRules(rules, { name: 'John' }, {})).toBe(false);
  });

  it('returns false for empty rules', () => {
    const rules = makeRules({});
    expect(matchesRules(rules, {}, {})).toBe(false);
  });

  it('evaluates header rules', () => {
    const rules = makeRules({
      headerRules: [{ field: 'authorization', operator: 'startsWith', value: 'Bearer' }],
    });
    expect(matchesRules(rules, {}, { authorization: 'Bearer token123' })).toBe(true);
    expect(matchesRules(rules, {}, { authorization: 'Basic abc' })).toBe(false);
  });

  it('evaluates query param rules', () => {
    const rules = makeRules({
      queryParamRules: [{ field: 'page', operator: 'equals', value: '1' }],
    });
    expect(matchesRules(rules, {}, {}, { page: '1' })).toBe(true);
    expect(matchesRules(rules, {}, {}, { page: '2' })).toBe(false);
  });

  it('evaluates path param rules', () => {
    const rules = makeRules({
      pathParamRules: [{ field: 'id', operator: 'equals', value: '42' }],
    });
    expect(matchesRules(rules, {}, {}, undefined, { id: '42' })).toBe(true);
    expect(matchesRules(rules, {}, {}, undefined, { id: '99' })).toBe(false);
  });

  it('AND mode across multiple rule types', () => {
    const rules = makeRules({
      combineWith: 'AND',
      bodyRules: [{ field: 'name', operator: 'equals', value: 'John' }],
      headerRules: [{ field: 'x-api-key', operator: 'equals', value: 'secret' }],
    });
    expect(matchesRules(rules, { name: 'John' }, { 'x-api-key': 'secret' })).toBe(true);
    expect(matchesRules(rules, { name: 'John' }, { 'x-api-key': 'wrong' })).toBe(false);
  });
});
