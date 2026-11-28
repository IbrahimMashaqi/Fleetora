// Public input contract only; hashing and credential verification remain backend-owned.
export function newPasswordError(password: string): string | undefined {
  if (Array.from(password).length < 6 || !/[A-Z]/.test(password)) {
    return "Use at least 6 characters, including an uppercase letter.";
  }
  if (new TextEncoder().encode(password).length > 72) {
    return "This password is too long. Use a shorter password.";
  }
}
