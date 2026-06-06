import fetch from 'node:http';

// =============================================================================
// CLI API Client — talks to the PCC API server
// =============================================================================

export function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? 'http://localhost:3001';
}

export function getApiKey(): string {
  const key = process.env.CONTROL_CENTER_API_KEY;
  if (!key) {
    throw new Error(
      'CONTROL_CENTER_API_KEY is not set.\n' +
      'Copy .env.example to .env and set your API key.',
    );
  }
  return key;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await globalThis.fetch(`${getApiBase()}${path}`, {
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }

  const json = await res.json() as { success: boolean; data?: T; error?: string };
  if (!json.success) throw new Error(json.error ?? 'Unknown API error');
  return json.data as T;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await globalThis.fetch(`${getApiBase()}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const responseBody = await res.text();
    throw new Error(`API error ${res.status}: ${responseBody}`);
  }

  const json = await res.json() as { success: boolean; data?: T; error?: string; message?: string };
  if (!json.success) throw new Error(json.error ?? 'Unknown API error');
  return (json.data ?? json.message) as T;
}
