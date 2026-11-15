import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  clientSourceSecret,
  signClientSource,
  trustedClientAddress,
} from "@/lib/api/client-source.server";

const secret = "action-test-client-source-secret-0123456789";
const reader = (values: Record<string, string>) => (name: string) => values[name.toLowerCase()] ?? null;

test("signs a v1 assertion the backend can verify for exactly one method and path", () => {
  const value = signClientSource({ secret, method: "post", path: "/auth/signin", address: "198.51.100.7", timestamp: 1_763_200_000_000 });
  const [version, timestamp, encoded, signature] = value.split(".");
  expect(version).toBe("v1");
  expect(timestamp).toBe("1763200000000");
  expect(Buffer.from(encoded, "base64url").toString()).toBe("198.51.100.7");
  const expected = createHmac("sha256", secret)
    .update("fleetora-client-source\nv1\nPOST\n/auth/signin\n1763200000000\n198.51.100.7")
    .digest("hex");
  expect(signature).toBe(expected);
});

test("signs an empty address when the client cannot be attributed", () => {
  const value = signClientSource({ secret, method: "POST", path: "/auth/forgot-password", address: "", timestamp: 1_763_200_000_000 });
  expect(value.split(".")[2]).toBe("");
});

test("reads the address only from the deployer-configured trusted header", () => {
  const env = { FLEETORA_TRUSTED_CLIENT_IP_HEADER: "X-Edge-Client-IP" };
  expect(trustedClientAddress(reader({ "x-edge-client-ip": "198.51.100.7" }), env)).toBe("198.51.100.7");
  expect(trustedClientAddress(reader({ "x-edge-client-ip": " 2001:db8::7 " }), env)).toBe("2001:db8::7");
});

test("never trusts forwarding headers when no trusted header is configured", () => {
  const spoofed = reader({ "x-forwarded-for": "203.0.113.9", "x-real-ip": "203.0.113.10", forwarded: "for=203.0.113.11" });
  expect(trustedClientAddress(spoofed, {})).toBe("");
});

test("rejects address lists, invalid values and malformed header names", () => {
  const env = { FLEETORA_TRUSTED_CLIENT_IP_HEADER: "x-edge-client-ip" };
  for (const value of ["203.0.113.9, 10.0.0.1", "not-an-ip", "", "203.0.113.999"]) {
    expect(trustedClientAddress(reader({ "x-edge-client-ip": value }), env)).toBe("");
  }
  expect(trustedClientAddress(reader({ "bad header": "203.0.113.9" }), { FLEETORA_TRUSTED_CLIENT_IP_HEADER: "bad header" })).toBe("");
});

test("requires a strong shared secret before signing anything", () => {
  expect(clientSourceSecret({})).toBeNull();
  expect(clientSourceSecret({ FLEETORA_CLIENT_SOURCE_SECRET: "short" })).toBeNull();
  expect(clientSourceSecret({ FLEETORA_CLIENT_SOURCE_SECRET: secret })).toBe(secret);
});
