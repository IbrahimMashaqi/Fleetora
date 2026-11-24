import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { headers } from "next/headers";

// Must match the backend's ClientSourceService (backend/src/modules/auth/client-source.ts).
export const clientSourceHeader = "X-Fleetora-Client-Source";
const minimumSecretLength = 32;
const headerName = /^[A-Za-z0-9-]{1,64}$/;

type Env = Record<string, string | undefined>;

/** The HMAC key shared only between this server and the backend. */
export function clientSourceSecret(env: Env = process.env): string | null {
  const value = env.FLEETORA_CLIENT_SOURCE_SECRET;
  return value && value.length >= minimumSecretLength ? value : null;
}

/**
 * Next.js only fills X-Forwarded-For when it is absent, so a browser can choose it.
 * The address is therefore read solely from a header the deployer names in
 * FLEETORA_TRUSTED_CLIENT_IP_HEADER, which their edge proxy must overwrite with a
 * single address. Without that configuration the client is left unattributed ("").
 */
export function trustedClientAddress(read: (name: string) => string | null, env: Env = process.env): string {
  const name = env.FLEETORA_TRUSTED_CLIENT_IP_HEADER?.trim();
  if (!name || !headerName.test(name)) return "";
  const value = read(name)?.trim() ?? "";
  return isIP(value) ? value : "";
}

export function signClientSource({ secret, method, path, address, timestamp }: {
  secret: string; method: string; path: string; address: string; timestamp: number;
}): string {
  const signature = createHmac("sha256", secret)
    .update(`fleetora-client-source\nv1\n${method.toUpperCase()}\n${path}\n${timestamp}\n${address}`)
    .digest("hex");
  return `v1.${timestamp}.${Buffer.from(address, "utf8").toString("base64url")}.${signature}`;
}

const productionSecretError =
  `FLEETORA_CLIENT_SOURCE_SECRET must be configured (at least ${minimumSecretLength} characters) in production`;

/**
 * Signed source assertion for one backend request. Outside production it is undefined
 * when not configured; in production a missing or weak secret fails the call, because
 * the backend would otherwise count every web client as this server's single address.
 */
export async function clientSourceFor(method: "POST", endpoint: URL, env: Env = process.env): Promise<string | undefined> {
  const secret = clientSourceSecret(env);
  if (!secret) {
    if (env.NODE_ENV !== "production") return undefined;
    console.error(productionSecretError);
    throw new Error(productionSecretError);
  }
  let address = "";
  try {
    const incoming = await headers();
    address = trustedClientAddress((name) => incoming.get(name), env);
  } catch {
    return undefined;
  }
  return signClientSource({ secret, method, path: endpoint.pathname, address, timestamp: Date.now() });
}
