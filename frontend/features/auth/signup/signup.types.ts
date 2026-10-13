export type SignupField = "name" | "email" | "password";

export type SignupState =
  | { status: "idle" }
  | {
      status: "error";
      message?: string;
      fieldErrors?: Partial<Record<SignupField, string>>;
      values?: { name: string; email: string };
    }
  | { status: "success"; email: string };

export type SignupInput = { name: string; email: string; password: string };
