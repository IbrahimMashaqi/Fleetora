import "server-only";

export function getBackendEndpoint(path: string): URL | null {
  const baseUrl = process.env.FLEETORA_API_URL;
  if (!baseUrl) return null;
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
}

export async function requestBackend(
  endpoint: URL,
  { method, body, bearer, timeoutMs = 15_000 }: {
    method: "GET" | "POST";
    body?: unknown;
    bearer?: string;
    timeoutMs?: number;
  },
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (bearer !== undefined) headers.Authorization = `Bearer ${bearer}`;
  return fetch(endpoint, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export async function readBackendBody(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return null; }
}
