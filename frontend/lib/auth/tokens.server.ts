import "server-only";

export type TokenPair = { accessToken: string; refreshToken: string };

export function parseTokenPair(value: unknown): TokenPair | null {
  if (!value || typeof value !== "object" || !("success" in value) || value.success !== true || !("data" in value) || !value.data || typeof value.data !== "object") return null;
  const data = value.data;
  if (!("accessToken" in data) || typeof data.accessToken !== "string" || data.accessToken.length === 0 || !("refreshToken" in data) || typeof data.refreshToken !== "string" || data.refreshToken.length === 0) return null;
  return { accessToken: data.accessToken, refreshToken: data.refreshToken };
}
