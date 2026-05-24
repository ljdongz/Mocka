const ADMIN_URL = process.env.MOCKA_ADMIN_URL || `http://localhost:${process.env.ADMIN_PORT || 3000}`;

export async function mockaFetch<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${ADMIN_URL}${path}`, {
      headers: { 'Content-Type': 'application/json', ...options?.headers as Record<string, string> },
      ...options,
    });
  } catch {
    throw new Error(`Mocka server is not reachable at ${ADMIN_URL}. Run \`mocka start\` first.`);
  }

  if (res.status === 204) return undefined as T;

  const data = await res.json();
  if (!res.ok) {
    throw new Error((data as any).error || `Request failed with status ${res.status}`);
  }
  return data as T;
}

export function toolResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

export function toolError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}
