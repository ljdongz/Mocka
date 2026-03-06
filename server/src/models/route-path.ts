/** Strip trailing slashes (keep root "/") */
export function normalizePath(p: string): string {
  return p.length > 1 ? p.replace(/\/+$/, '') : p;
}

/** Check if a path contains parameter segments (:param or {param}) */
export function hasParams(path: string): boolean {
  return /(?::[a-zA-Z_]\w*|\{[a-zA-Z_]\w*\})/.test(path);
}

/** Convert a path pattern to a regex and extract param names */
export function compilePattern(path: string): { regex: RegExp; paramNames: string[]; literalCount: number } {
  const paramNames: string[] = [];
  let literalCount = 0;
  const segments = normalizePath(path).split('/');

  const regexStr = segments
    .map(segment => {
      // Match :paramName
      const colonMatch = segment.match(/^:([a-zA-Z_]\w*)$/);
      if (colonMatch) {
        paramNames.push(colonMatch[1]);
        return '([^/]+)';
      }
      // Match {paramName}
      const braceMatch = segment.match(/^\{([a-zA-Z_]\w*)\}$/);
      if (braceMatch) {
        paramNames.push(braceMatch[1]);
        return '([^/]+)';
      }
      // Literal segment — escape regex special chars
      literalCount++;
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');

  return { regex: new RegExp(`^${regexStr}$`), paramNames, literalCount };
}

/** Build registry key from method and path */
export function buildKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${normalizePath(path)}`;
}
