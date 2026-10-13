"use client";

import { useActionState, useState } from "react";
import { Schibsted_Grotesk } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import styles from "./signup.module.css";
import authStyles from "../auth.module.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signupAction } from "./signup.action";
import type { SignupState } from "./signup.types";

const initialState: SignupState = { status: "idle" };
const schibsted = Schibsted_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap" });

function SignupProgress({ currentStep }: { currentStep: 1 | 2 }) {
  const steps = ["Account details", "Verify email"] as const;

  return (
    <ol aria-label="Signup progress" className={`${styles["signup-progress"]} flex w-full items-center`}>
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
                    ? "border-primary-hover bg-primary-hover text-primary-foreground"
                    : isComplete
                      ? "border-primary-hover bg-primary-hover text-primary-foreground"
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
      <header className={`${styles["signup-page-header"]} flex h-16 shrink-0 items-center border-b border-border/70 bg-background px-4 sm:px-8 min-[1440px]:px-16`}>
        <div className="flex items-center gap-3">
          <Image src="/fleetora-logo.png" alt="" aria-hidden="true" width={40} height={40} className="size-10 shrink-0 object-contain" />
          <span>
            <span className="block text-lg font-semibold leading-6 tracking-tight">Fleetora</span>
            <span className="mt-0.5 block text-xs leading-4 text-secondary-foreground">Logistics operations</span>
          </span>
        </div>
      </header>

      <div className={`${styles["signup-page-layout"]} flex flex-1 flex-col min-[900px]:grid min-[900px]:grid-cols-[minmax(0,1.125fr)_minmax(432px,1fr)] min-[900px]:gap-x-8 min-[900px]:px-8 min-[900px]:py-12 min-[1440px]:gap-x-12 min-[1440px]:px-16`}>
      <section
        aria-labelledby="signup-title"
        className={`${styles["signup-form-panel"]} order-1 flex min-w-0 items-center justify-center px-4 py-8 sm:px-8 sm:py-10 min-[900px]:col-start-2 min-[900px]:row-start-1 min-[900px]:px-0 min-[900px]:py-0`}
      >
        <div className={`signup-card ${authStyles["auth-enter"]} mx-auto w-full max-w-[432px] overflow-hidden rounded-xl border border-border bg-surface shadow-sm`}>
          {state.status === "success" ? (
            <div role="status">
              <div className={`${styles["signup-card-progress"]} border-b border-border px-6 py-5`}>
                <SignupProgress currentStep={2} />
              </div>
              <div className={`${styles["signup-card-content"]} ${authStyles["auth-success-state"]} space-y-4 p-6`}>
                <span className="inline-flex rounded-md bg-success-background px-3 py-1 text-sm font-medium text-foreground">
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
              <div className={`${styles["signup-card-progress"]} border-b border-border px-6 py-5`}>
                <SignupProgress currentStep={1} />
              </div>
              <div className={`${styles["signup-card-content"]} p-6`}>
                <div className={`${styles["signup-heading-group"]} mb-5`}>
                  <h1 id="signup-title" className="text-[30px] font-semibold leading-9 tracking-[-0.02em]">
                    Create your account
                  </h1>
                  <p className="mt-2 text-sm leading-5 text-muted-foreground">
                    Set up a Fleetora workspace for your logistics team.
                  </p>
                </div>

              <form action={action} aria-busy={pending} className={`${styles["signup-form"]} space-y-5`}>
                {state.status === "error" && state.message && (
                  <div role="alert" className={`${authStyles["auth-feedback"]} rounded-md border border-danger-border bg-danger-background p-3 text-foreground`}>
                    {state.message}
                  </div>
                )}
                <fieldset disabled={pending} className={`${authStyles["auth-fields"]} ${styles["signup-fieldset"]} space-y-5`}>
                  <div className={`${styles["signup-fields"]} space-y-4`}>
                    <div className="signup-field space-y-2">
                    <Label htmlFor="signup-name" className="text-sm font-semibold">Full name</Label>
                    <Input
                      id="signup-name"
                      name="name"
                      autoComplete="name"
                      required
                      minLength={2}
                      defaultValue={values?.name}
                      placeholder="Your full name"
                      aria-invalid={Boolean(errors?.name)}
                      aria-describedby={errors?.name ? "signup-name-error" : undefined}
                      className={`${styles["signup-field-input"]} h-12 rounded-lg text-sm`}
                    />
                    {errors?.name && <p id="signup-name-error" role="alert" className={`${authStyles["auth-feedback"]} text-danger-foreground`}>{errors.name}</p>}
                    </div>

                    <div className="signup-field space-y-2">
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
                      className={`${styles["signup-field-input"]} h-12 rounded-lg text-sm`}
                    />
                    {errors?.email && <p id="signup-email-error" role="alert" className="text-danger-foreground">{errors.email}</p>}
                    </div>

                    <div className="signup-field space-y-2">
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
                        className={`${styles["signup-field-input"]} h-12 rounded-lg pr-12 text-sm`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        aria-controls="signup-password"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword(!showPassword)}
                        className={`${styles["signup-password-toggle"]} absolute right-2 top-2 size-8 min-h-8 rounded-lg border border-form-border bg-surface p-0 text-muted-foreground hover:bg-surface-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`}
                      >
                        {showPassword ? <svg aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A11 11 0 0 1 12 5c5 0 8.5 4.5 9 7-.2 1.2-1.1 2.5-2.4 3.6M6.2 6.2C4 7.6 2.4 9.8 2 12c.5 2.5 4 7 10 7 1 0 2-.2 2.9-.5" /></svg> : <svg aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>}
                      </Button>
                    </div>
                    <ul id="signup-password-help" aria-label="Password requirements" className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5 text-xs leading-4 text-muted-foreground">
                      {[{ label: "6+ characters", met: Array.from(passwordValue).length >= 6 }, { label: "One uppercase letter", met: /[A-Z]/.test(passwordValue) }].map((requirement) => {
                        const met = requirement.met;
                        return <li key={requirement.label} className={`flex items-center gap-1.5 ${met ? "text-accent-foreground" : ""}`}><span aria-hidden="true" className={`grid size-4 place-items-center rounded-full ${met ? "bg-primary-hover text-primary-foreground" : "border border-form-border"}`}>{met ? <svg className="size-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 12 12"><path strokeLinecap="round" strokeLinejoin="round" d="m2 6 2.5 2.5L10 3" /></svg> : null}</span>{requirement.label}</li>;
                      })}
                    </ul>
                    {errors?.password && <p id="signup-password-error" role="alert" className={`${authStyles["auth-feedback"]} text-danger-foreground`}>{errors.password}</p>}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Button type="submit" className={`${authStyles["auth-primary-action"]} h-12 w-full rounded-lg text-sm font-semibold focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none`}>
                      {pending ? <><span aria-hidden="true" className={`${authStyles["auth-spinner"]} size-4`} />Creating account...</> : "Create account"}
                    </Button>
                    <p className="text-center text-[13px] leading-5 text-secondary-foreground">
                      Already have an account? <Link href="/login" className={`${authStyles["auth-text-link"]} rounded-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}>Sign in</Link>
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
        className={`signup-workspace-panel ${authStyles["auth-enter"]} ${authStyles["auth-enter-delayed"]} order-2 flex flex-col justify-center border-t border-border bg-surface-secondary px-4 py-8 sm:px-8 min-[900px]:col-start-1 min-[900px]:row-start-1 min-[900px]:border-0 min-[900px]:px-0 min-[900px]:py-0`}
      >
        <div className="mx-auto w-full max-w-[520px]">
          <div className={`${styles["signup-workspace-heading"]} mb-7 flex flex-col gap-2`}>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary-foreground">Fleetora workspace</p>
            <h2 id="workspace-context-title" className={`${styles["signup-workspace-title"]} text-[28px] font-semibold leading-9 tracking-[-0.02em]`}>Operations, connected.</h2>
            <p className="max-w-md text-sm leading-6 text-secondary-foreground">Your team, fleet and delivery work come together in one company workspace.</p>
          </div>
          <div className="border-l-2 border-primary pl-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/75">Your starting role</p>
            <h3 className="mt-2 text-lg font-semibold leading-6 text-foreground">Company Administrator</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-secondary-foreground">Manage your company&apos;s users, workers, vehicles, warehouses, zones and shipments.</p>
          </div>
        </div>
      </aside>
      </div>
    </main>
  );
}
