export type PasswordRecoveryField = "email" | "password" | "confirmPassword";

export type ForgotPasswordState =
  | { status: "idle" }
  | { status: "error"; message?: string; fieldErrors?: Partial<Record<PasswordRecoveryField, string>>; email?: string }
  | { status: "success" };

export type ResetPasswordState =
  | { status: "idle" }
  | { status: "error"; message?: string; fieldErrors?: Partial<Record<PasswordRecoveryField, string>> }
  | { status: "success" };
