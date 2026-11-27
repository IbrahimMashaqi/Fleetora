import "server-only";

export function isActivationProtocolAllowed(url: URL): boolean {
  // Next's build mode is production even for local Docker development. Compose
  // supplies the backend NODE_ENV as trusted server-only deployment metadata.
  const environment = process.env.FLEETORA_ACTIVATION_ENV ?? process.env.NODE_ENV;
  return url.protocol === "https:" || (
    url.protocol === "http:" && environment !== "production" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  );
}
