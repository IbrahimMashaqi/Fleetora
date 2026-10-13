export type LoginState =
  | { status: "idle" }
  | { status: "error"; message?: string; fieldErrors?: { email?: string; password?: string }; values?: { email?: string } };
