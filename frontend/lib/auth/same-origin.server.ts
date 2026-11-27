import "server-only";
import type { NextRequest } from "next/server";

export function hasSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    // NextURL normalizes loopback IPs to localhost. Host retains the actual
    // browser authority; do not substitute client-supplied forwarding headers.
    const target = new URL(`${request.nextUrl.protocol}//${host}`);
    if (
      !["http:", "https:"].includes(target.protocol) ||
      target.host !== host.toLowerCase() ||
      target.username ||
      target.password ||
      target.pathname !== "/" ||
      target.search ||
      target.hash
    )
      return false;
    return origin === target.origin;
  } catch {
    return false;
  }
}
