/** Extract path parameter names from a path pattern */
export function extractPathParams(path: string): string[] {
  const params: string[] = [];
  for (const segment of path.split('/')) {
    const colonMatch = segment.match(/^:([a-zA-Z_]\w*)$/);
    if (colonMatch) {
      params.push(colonMatch[1]);
      continue;
    }
    const braceMatch = segment.match(/^\{([a-zA-Z_]\w*)\}$/);
    if (braceMatch) {
      params.push(braceMatch[1]);
    }
  }
  return params;
}

/** Check if a path contains parameter segments */
export function hasPathParams(path: string): boolean {
  return /(?::[a-zA-Z_]\w*|\{[a-zA-Z_]\w*\})/.test(path);
}
