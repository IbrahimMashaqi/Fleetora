import { expect, test } from "@playwright/test";
import { loginAction } from "./login.action";

for (const apiUrl of [undefined, "invalid-backend-url"]) {
  test(`returns a safe login error when backend configuration is ${apiUrl ? "malformed" : "missing"}`, async () => {
    const originalApi = process.env.FLEETORA_API_URL;
    try {
      if (apiUrl === undefined) delete process.env.FLEETORA_API_URL;
      else process.env.FLEETORA_API_URL = apiUrl;
      const form = new FormData();
      form.set("email", "fixture@example.com");
      form.set("password", "FixturePassword");
      const result = await loginAction({ status: "idle" }, form);
      expect(result).toEqual({ status: "error", message: apiUrl
        ? "We couldn't reach Fleetora. Check your connection and try again."
        : "Sign in is temporarily unavailable. Please try again later.", values: { email: "fixture@example.com" } });
    } finally {
      if (originalApi === undefined) delete process.env.FLEETORA_API_URL;
      else process.env.FLEETORA_API_URL = originalApi;
    }
  });
}
