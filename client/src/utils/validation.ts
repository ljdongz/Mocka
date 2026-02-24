export function validatePath(path: string): string | null {
  if (!path.trim()) return 'Path is required';
  return null;
}

export function validateCollectionName(name: string): string | null {
  if (!name.trim()) return 'Name is required';
  return null;
}

export function validateStatusCode(code: number): boolean {
  return code >= 100 && code <= 599;
}
