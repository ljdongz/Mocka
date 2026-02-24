/**
 * Format a JSON string with 2-space indentation.
 * Returns the original string if parsing fails.
 */
export function formatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}
