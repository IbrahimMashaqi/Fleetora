export type VerificationState =
  | { status: "confirmation-required" }
  | { status: "verified" }
  | { status: "already-verified" }
  | { status: "expired" }
  | { status: "invalid" }
  | { status: "error" };

export type ResendVerificationState =
  | { status: "sent" }
  | { status: "already-verified" }
  | { status: "rate-limited"; retryAfterSeconds: number }
  | { status: "error" };
