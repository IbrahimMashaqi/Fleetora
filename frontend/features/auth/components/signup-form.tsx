"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signupAction } from "../signup.action";
import type { SignupState } from "../signup.types";

const initialState: SignupState = { status: "idle" };
const companyWorkspaceAreas = ["Users", "Workers", "Vehicles", "Warehouses", "Shipments"] as const;

function SignupProgress({ currentStep }: { currentStep: 1 | 2 }) {
  const steps = ["Account details", "Verify email"] as const;

  return (
    <ol aria-label="Signup progress" className="mb-7 flex items-center">
      {steps.map((label, index) => {
        const step = (index + 1) as 1 | 2;
        const isCurrent = step === currentStep;
        const isComplete = step < currentStep;

        return (
          <li key={label} aria-current={isCurrent ? "step" : undefined} className="flex min-w-0 flex-1 items-center last:flex-none">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                aria-hidden="true"
                className={`grid size-8 shrink-0 place-items-center rounded-full border text-sm font-semibold ${
                  isCurrent
                    ? "border-primary bg-primary text-primary-foreground"
                    : isComplete
                      ? "border-primary bg-primary-subtle text-primary"
                      : "border-border bg-surface-secondary text-muted-foreground"
                }`}
              >
                {step}
              </span>
              <span className={`text-sm ${isCurrent ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                <span className="sm:hidden">{step === 1 ? "Account" : "Verify"}</span>
                <span className="hidden sm:inline">{label}</span>
              </span>
            </div>
            {step === 1 && (
              <span aria-hidden="true" className={`mx-3 h-px min-w-3 flex-1 ${isComplete ? "bg-primary" : "bg-border"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const values = state.status === "error" ? state.values : undefined;

  return (
    <main className="grid min-h-svh grid-cols-1 bg-background text-foreground lg:grid-cols-[minmax(0,1.08fr)_minmax(28rem,0.92fr)] lg:grid-rows-[4rem_minmax(0,1fr)]">
      <header className="flex h-16 items-center border-b border-border bg-surface px-4 sm:px-8 lg:col-span-2 lg:row-start-1 lg:px-12 xl:px-16">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="grid size-9 place-items-center rounded-md bg-brand-navy text-sm font-semibold text-primary-foreground">
            F
          </span>
          <span>
            <span className="block text-lg font-semibold leading-6 tracking-tight">Fleetora</span>
            <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">Logistics operations</span>
          </span>
        </div>
      </header>

      <section
        aria-labelledby="signup-title"
        className="order-1 flex min-w-0 flex-col justify-center px-4 py-10 sm:px-8 sm:py-12 lg:col-start-2 lg:row-start-2 lg:px-10 xl:px-16"
      >
        <div className="mx-auto w-full max-w-md rounded-lg border border-border bg-surface p-5 sm:p-8">
          {state.status === "success" ? (
            <div role="status" className="space-y-4">
              <SignupProgress currentStep={2} />
              <span className="inline-block rounded-md bg-primary-subtle px-3 py-1 text-sm font-medium text-primary">
                Account created
              </span>
              <h1 id="signup-title" tabIndex={-1} className="text-2xl font-semibold leading-8 tracking-tight">
                Check your email
              </h1>
              <p className="text-muted-foreground">
                We sent a verification email to <span className="break-all font-medium text-foreground">{state.email}</span>.
              </p>
              <p className="text-muted-foreground">
                Open the link in the email to verify your account. If you don&apos;t see it, check your spam folder.
              </p>
            </div>
          ) : (
            <>
              <SignupProgress currentStep={1} />
              <div className="mb-6">
                <h1 id="signup-title" className="mt-2 text-2xl font-semibold leading-8 tracking-tight">
                  Create your account
                </h1>
                <p className="mt-2 text-muted-foreground">
                  Set up your Fleetora account to manage logistics operations.
                </p>
              </div>

              <form action={action} aria-busy={pending} className="space-y-5">
                {state.status === "error" && state.message && (
                  <div role="alert" className="rounded-md border border-danger-border bg-danger-background p-3 text-danger-foreground">
                    {state.message}
                  </div>
                )}
                <fieldset disabled={pending} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Full name</Label>
                    <Input
                      id="signup-name"
                      name="name"
                      autoComplete="name"
                      required
                      minLength={2}
                      defaultValue={values?.name}
                      aria-invalid={Boolean(errors?.name)}
                      aria-describedby={errors?.name ? "signup-name-error" : undefined}
                    />
                    {errors?.name && <p id="signup-name-error" role="alert" className="text-danger-foreground">{errors.name}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email address</Label>
                    <Input
                      id="signup-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      defaultValue={values?.email}
                      aria-invalid={Boolean(errors?.email)}
                      aria-describedby={errors?.email ? "signup-email-error" : undefined}
                    />
                    {errors?.email && <p id="signup-email-error" role="alert" className="text-danger-foreground">{errors.email}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <div className="relative">
                      <Input
                        id="signup-password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        required
                        minLength={6}
                        pattern=".*[A-Z].*"
                        title="Use at least 6 characters, including an uppercase letter."
                        className="pr-16"
                        aria-invalid={Boolean(errors?.password)}
                        aria-describedby={errors?.password ? "signup-password-help signup-password-error" : "signup-password-help"}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-controls="signup-password"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-1 top-1 h-8 px-2"
                      >
                        {showPassword ? "Hide" : "Show"}
                      </Button>
                    </div>
                    <p id="signup-password-help" className="text-[13px] leading-[18px] text-muted-foreground">
                      At least 6 characters, including an uppercase letter.
                    </p>
                    {errors?.password && <p id="signup-password-error" role="alert" className="text-danger-foreground">{errors.password}</p>}
                  </div>

                  {state.status === "error" && (
                    <p className="text-[13px] leading-[18px] text-muted-foreground">Re-enter your password before trying again.</p>
                  )}
                  <Button type="submit" className="w-full">
                    {pending ? "Creating account..." : "Create account"}
                  </Button>
                </fieldset>
                <p role="status" aria-live="polite" className="sr-only">
                  {pending ? "Creating your account. Please wait." : ""}
                </p>
              </form>
            </>
          )}
        </div>
      </section>

      <aside
        aria-labelledby="workspace-context-title"
        className="order-2 border-t border-border bg-surface-secondary px-4 py-10 sm:px-8 lg:order-none lg:col-start-1 lg:row-start-2 lg:flex lg:items-center lg:border-r lg:border-t-0 lg:px-10 lg:py-12 xl:px-16"
      >
        <div className="mx-auto w-full max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Company operations</p>
          <h2 id="workspace-context-title" className="mt-3 text-2xl font-semibold leading-8 tracking-tight">
            Your company workspace starts here
          </h2>
          <p className="mt-3 max-w-xl leading-6 text-muted-foreground">
            Fleetora creates a company workspace with your account and assigns you the Company Administrator role.
          </p>

          <figure className="mt-8 overflow-hidden rounded-lg border border-border bg-surface">
            <figcaption className="flex items-center gap-3 border-b border-border bg-surface-secondary px-4 py-3 sm:px-5">
              <svg
                aria-hidden="true"
                className="size-4 shrink-0 text-primary"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.75"
                viewBox="0 0 24 24"
              >
                <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01M16 13v.01M16 16v.01" />
              </svg>
              <span className="text-sm font-medium">Company workspace</span>
            </figcaption>
            <ul aria-label="Company workspace areas" className="grid grid-cols-2 gap-x-4 gap-y-1 px-4 py-3 lg:grid-cols-3 sm:px-5">
              {companyWorkspaceAreas.map((area) => (
                <li key={area} className="flex min-w-0 items-center gap-2.5 py-2 text-sm text-secondary-foreground">
                  <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-primary" />
                  {area}
                </li>
              ))}
            </ul>
          </figure>
        </div>
      </aside>
    </main>
  );
}
