export type PasswordChangeField = "oldPassword" | "newPassword" | "confirmPassword";

export type PasswordChangeState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message?: string; fieldErrors?: Partial<Record<PasswordChangeField, string>> }
  | { status: "unauthenticated" }
  | { status: "session-changed"; message: string }
  | { status: "uncertain"; message: string };
