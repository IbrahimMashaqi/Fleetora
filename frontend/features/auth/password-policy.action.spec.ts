import { expect, test } from "@playwright/test";
import { signupAction } from "./signup/signup.action";
import { resetPasswordAction } from "./password-recovery/password-recovery.action";

for (const password of ["A" + "a".repeat(72), "A" + "é".repeat(36), "A😀😀a"]) {
  test(`rejects unsupported new password (${Array.from(password).length} characters/${new TextEncoder().encode(password).length} bytes) before transport`, async () => {
    const original = process.env.FLEETORA_API_URL;
    delete process.env.FLEETORA_API_URL;
    try {
      const form = new FormData();
      form.set("name", "Fixture"); form.set("email", "password@example.invalid");
      form.set("password", password); form.set("confirmPassword", password);
      const signup = await signupAction({ status: "idle" }, form);
      const reset = await resetPasswordAction("11111111-1111-4111-8111-111111111111", "a".repeat(64), { status: "idle" }, form);
      expect(signup.status).toBe("error"); expect(reset.status).toBe("error");
      if (signup.status === "error") expect(signup.fieldErrors?.password).toBeTruthy();
      if (reset.status === "error") expect(reset.fieldErrors?.password).toBeTruthy();
      expect(JSON.stringify([signup, reset])).not.toContain(password);
    } finally {
      if (original === undefined) delete process.env.FLEETORA_API_URL;
      else process.env.FLEETORA_API_URL = original;
    }
  });
}
