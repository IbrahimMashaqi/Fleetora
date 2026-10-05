"use client";

import { useActionState, useState } from "react";
import { Schibsted_Grotesk } from "next/font/google";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signupAction } from "../signup.action";
import type { SignupState } from "../signup.types";

const initialState: SignupState = { status: "idle" };
const schibsted = Schibsted_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap" });
const workspaceAreas = [
  ["Users", "Roles and permissions for office staff", "M5 20v-1a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v1M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 11a4 4 0 0 0 0-8M19 15a4 4 0 0 1 3 4v1", "Access & roles"],
  ["Workers", "Drivers and warehouse crews, with shifts", "M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M20 8v6M23 11h-6", "Vehicle assignments"],
  ["Vehicles", "Fleet list, assignments and service dates", "M5 17h14l1-6-2-5H6l-2 5 1 6ZM4 11h16M7 17v2m10-2v2M7 14h.01M17 14h.01", "Shipment assignments"],
  ["Warehouses", "Locations, capacity and stock points", "M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01M16 13v.01M16 16v.01", "Shipment origins"],
  ["Shipments", "Create, assign and track every delivery", "M3 7h11v11H3zM14 11h4l3 3v4h-7zM7 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z", "Worker + vehicle"],
] as const;

function SignupProgress({ currentStep }: { currentStep: 1 | 2 }) {
  const steps = ["Account details", "Verify email"] as const;

  return (
    <ol aria-label="Signup progress" className="flex w-full items-center">
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
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface-secondary text-muted-foreground"
                }`}
              >
                {isComplete ? <svg aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" /></svg> : step}
              </span>
              <span className={`whitespace-nowrap text-sm ${isCurrent ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
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
  const [passwordValue, setPasswordValue] = useState("");
  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const values = state.status === "error" ? state.values : undefined;

  return (
    <main className={`${schibsted.className} flex min-h-svh flex-col bg-background text-foreground`}>
      <header className="flex h-16 shrink-0 items-center border-b border-border bg-surface px-4 sm:px-8 min-[1440px]:px-16">
        <div className="flex items-center gap-3">
          <Image src="/fleetora-logo.png" alt="" aria-hidden="true" width={40} height={40} className="size-10 shrink-0 object-contain" />
          <span>
            <span className="block text-lg font-semibold leading-6 tracking-tight">Fleetora</span>
            <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">Logistics operations</span>
          </span>
        </div>
      </header>

      <div className="flex flex-1 flex-col min-[900px]:grid min-[900px]:grid-cols-[minmax(0,1.125fr)_minmax(432px,1fr)] min-[900px]:gap-x-8 min-[900px]:px-8 min-[900px]:py-12 min-[1440px]:gap-x-12 min-[1440px]:px-16">
      <section
        aria-labelledby="signup-title"
        className="order-1 flex min-w-0 items-center justify-center px-4 py-8 sm:px-8 sm:py-10 min-[900px]:col-start-2 min-[900px]:row-start-1 min-[900px]:px-0 min-[900px]:py-0"
      >
        <div className="mx-auto w-full max-w-[432px] overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          {state.status === "success" ? (
            <div role="status">
              <div className="border-b border-border px-6 py-5">
                <SignupProgress currentStep={2} />
              </div>
              <div className="space-y-4 p-6">
                <span className="inline-flex rounded-md bg-success-background px-3 py-1 text-sm font-medium text-success">
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
            </div>
          ) : (
            <>
              <div className="border-b border-border px-6 py-5">
                <SignupProgress currentStep={1} />
              </div>
              <div className="p-6">
                <div className="mb-5">
                  <h1 id="signup-title" className="text-[32px] font-semibold leading-[38px] tracking-[-0.02em]">
                    Create your Fleetora account
                  </h1>
                  <p className="mt-2 text-sm leading-5 text-muted-foreground">
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
                  <div className="space-y-4">
                    <div className="space-y-2">
                    <Label htmlFor="signup-name" className="text-sm font-semibold">Full name</Label>
                    <Input
                      id="signup-name"
                      name="name"
                      autoComplete="name"
                      required
                      minLength={2}
                      defaultValue={values?.name}
                      placeholder="Enter your full name"
                      aria-invalid={Boolean(errors?.name)}
                      aria-describedby={errors?.name ? "signup-name-error" : undefined}
                      className="h-12 rounded-lg border-form-border text-sm placeholder:text-muted-foreground/70 transition-colors hover:border-muted-foreground/70 focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/25 aria-invalid:focus-visible:ring-danger-foreground/20 motion-reduce:transition-none"
                    />
                    {errors?.name && <p id="signup-name-error" role="alert" className="text-danger-foreground">{errors.name}</p>}
                    </div>

                    <div className="space-y-2">
                    <Label htmlFor="signup-email" className="text-sm font-semibold">Work email</Label>
                    <Input
                      id="signup-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      defaultValue={values?.email}
                      placeholder="name@company.com"
                      aria-invalid={Boolean(errors?.email)}
                      aria-describedby={errors?.email ? "signup-email-error" : undefined}
                      className="h-12 rounded-lg border-form-border text-sm placeholder:text-muted-foreground/70 transition-colors hover:border-muted-foreground/70 focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/25 aria-invalid:focus-visible:ring-danger-foreground/20 motion-reduce:transition-none"
                    />
                    {errors?.email && <p id="signup-email-error" role="alert" className="text-danger-foreground">{errors.email}</p>}
                    </div>

                    <div className="space-y-2">
                    <Label htmlFor="signup-password" className="text-sm font-semibold">Password</Label>
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
                        placeholder="Create a password"
                        onChange={(event) => setPasswordValue(event.currentTarget.value)}
                        aria-invalid={Boolean(errors?.password)}
                        aria-describedby={errors?.password ? "signup-password-help signup-password-error" : "signup-password-help"}
                        className="h-12 rounded-lg border-form-border pr-12 text-sm placeholder:text-muted-foreground/70 transition-colors hover:border-muted-foreground/70 focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/25 aria-invalid:focus-visible:ring-danger-foreground/20 motion-reduce:transition-none"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        aria-controls="signup-password"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-2 size-8 rounded-lg border border-form-border bg-surface p-0 text-muted-foreground hover:bg-surface-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                      >
                        {showPassword ? <svg aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A11 11 0 0 1 12 5c5 0 8.5 4.5 9 7-.2 1.2-1.1 2.5-2.4 3.6M6.2 6.2C4 7.6 2.4 9.8 2 12c.5 2.5 4 7 10 7 1 0 2-.2 2.9-.5" /></svg> : <svg aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>}
                      </Button>
                    </div>
                    <ul id="signup-password-help" aria-label="Password requirements" className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5 text-xs leading-4 text-muted-foreground">
                      {[{ label: "6+ characters", met: passwordValue.length >= 6 }, { label: "One uppercase letter", met: /[A-Z]/.test(passwordValue) }].map((requirement) => {
                        const met = requirement.met;
                        return <li key={requirement.label} className={`flex items-center gap-1.5 ${met ? "text-primary" : ""}`}><span aria-hidden="true" className={`grid size-4 place-items-center rounded-full ${met ? "bg-primary text-primary-foreground" : "border border-form-border"}`}>{met ? <svg className="size-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 12 12"><path strokeLinecap="round" strokeLinejoin="round" d="m2 6 2.5 2.5L10 3" /></svg> : null}</span>{requirement.label}</li>;
                      })}
                    </ul>
                    {errors?.password && <p id="signup-password-error" role="alert" className="text-danger-foreground">{errors.password}</p>}
                    </div>
                  </div>

                  {state.status === "error" && (
                    <p className="text-[13px] leading-[18px] text-muted-foreground">Re-enter your password before trying again.</p>
                  )}
                  <div className="space-y-3">
                    <Button type="submit" className="h-12 w-full rounded-lg text-sm font-semibold focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none">
                      {pending ? "Creating account..." : "Create account"}
                    </Button>
                    <p className="text-center text-[13px] leading-5 text-muted-foreground">
                      Already have an account? <span className="font-semibold text-primary">Sign in</span>
                    </p>
                  </div>
                </fieldset>
                <p role="status" aria-live="polite" className="sr-only">
                  {pending ? "Creating your account. Please wait." : ""}
                </p>
              </form>
              </div>
            </>
          )}
        </div>
      </section>

      <aside
        aria-labelledby="workspace-context-title"
        className="order-2 border-t border-border bg-surface-secondary px-4 py-10 sm:px-8 min-[900px]:col-start-1 min-[900px]:row-start-1 min-[900px]:border-0 min-[900px]:px-0 min-[900px]:py-0"
      >
        <div className="mx-auto w-full max-w-[720px]">
          <div className="mb-6 flex flex-col gap-2">
            <h2 id="workspace-context-title" className="text-[28px] font-semibold leading-9 tracking-[-0.02em]">Your company workspace</h2>
            <p className="leading-6 text-muted-foreground">Fleetora creates your workspace and assigns the Company Administrator role when you sign up.</p>
          </div>

          <section aria-labelledby="connected-operations-title">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 id="connected-operations-title" className="text-sm font-semibold">Connected operations</h3>
              <span className="rounded-full bg-primary-subtle px-2.5 py-1.5 text-xs font-semibold leading-4 text-primary">Workspace preview</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
                <h4 className="text-sm font-semibold">People, fleet and shipments</h4>
                <span className="text-xs leading-4 text-muted-foreground">Available after sign-up</span>
              </div>
              <ul aria-label="Company workspace areas" className="divide-y divide-border px-5">
                {workspaceAreas.map(([area, description, path, relationship]) => (
                  <li key={area} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4 sm:flex-nowrap">
                    <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-subtle text-primary">
                      <svg className="size-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24"><path d={path} /></svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold leading-5 text-foreground">{area}</span>
                      <span className="block text-[13px] leading-5 text-muted-foreground">{description}</span>
                    </span>
                    <span className="ml-14 shrink-0 rounded-full border border-border bg-background px-2 py-1 text-xs font-semibold leading-4 text-muted-foreground sm:ml-auto">{relationship}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </aside>
      </div>
    </main>
  );
}
