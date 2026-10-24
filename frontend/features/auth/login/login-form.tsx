"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useState } from "react";
import styles from "./login.module.css";
import authStyles from "../auth.module.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoginRouteIllustration } from "./login-route-illustration";
import { loginAction } from "./login.action";
import type { LoginState } from "./login.types";
import { LanguageSwitcher, useLocale } from "@/lib/i18n";

const initialState: LoginState = { status: "idle" };

export function LoginForm({ logoutUnconfirmed = false, passwordReset = false }: { logoutUnconfirmed?: boolean; passwordReset?: boolean }) {
  const { t, tMessage } = useLocale();
  const [state, action, pending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const values = state.status === "error" ? state.values : undefined;

  return (
    <main className="min-h-svh bg-background text-foreground">
      <div className="flex min-h-svh flex-col lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(440px,0.92fr)]">
        <LoginRouteIllustration />
        <div className="order-1 flex min-h-[calc(100svh-148px)] flex-col bg-background lg:order-2 lg:min-h-svh">
          <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border/70 bg-background px-4 sm:px-8 min-[1440px]:px-16">
            <Link href="/login" aria-label={t("Fleetora sign in")} className="flex items-center gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <Image src="/fleetora-logo.png" alt="" aria-hidden="true" width={40} height={40} className="size-10 object-contain" />
              <span><span className="block text-lg font-semibold leading-6 tracking-tight">Fleetora</span><span className="mt-0.5 block text-xs leading-4 text-secondary-foreground">{t("Logistics operations")}</span></span>
            </Link>
            <LanguageSwitcher />
          </header>
          <div className={`${styles["login-content"]} flex flex-1 items-center justify-center px-4 py-8 sm:px-8 sm:py-10 lg:px-10 xl:px-16`}>
            <section aria-labelledby="login-title" className={`${authStyles["auth-enter"]} w-full max-w-[432px] overflow-hidden rounded-xl border border-border bg-surface shadow-sm`}>
              <div className="p-6 sm:p-8">
                <div className="mb-6">
                  <h1 id="login-title" className="text-[32px] font-semibold leading-[38px] tracking-[-0.02em]">{t("Welcome back")}</h1>
                  <p className="mt-2 text-sm leading-5 text-muted-foreground">{t("Sign in to continue to your Fleetora workspace.")}</p>
                </div>
                {passwordReset && <p role="status" className={`${authStyles["auth-feedback"]} mb-5 rounded-md border border-success-border bg-success-background p-3 text-sm text-foreground`}>{t("Your password has been updated. Sign in with your new password.")}</p>}
                {logoutUnconfirmed && <p role="status" className={`${authStyles["auth-feedback"]} mb-5 rounded-md border border-warning-border bg-warning-background p-3 text-sm text-foreground`}>{t("You're signed out on this device. We couldn't confirm that the server ended the session.")}</p>}
                <form action={action} aria-busy={pending} className="space-y-5">
                  {state.status === "error" && state.message && <div role="alert" className={`${authStyles["auth-feedback"]} rounded-md border border-danger-border bg-danger-background p-3 text-sm`}>{tMessage(state.message)}</div>}
                  <fieldset disabled={pending} className={`${authStyles["auth-fields"]} space-y-5`}>
                    <div className="space-y-2">
                      <Label htmlFor="login-email" className="text-sm font-semibold">{t("Work email")}</Label>
                      <Input id="login-email" name="email" type="email" dir="ltr" autoComplete="email" required defaultValue={values?.email} placeholder="name@company.com" aria-invalid={Boolean(errors?.email)} aria-describedby={errors?.email ? "login-email-error" : undefined} className="h-12 rounded-lg text-sm" />
                      {errors?.email && <p id="login-email-error" role="alert" className={`${authStyles["auth-feedback"]} text-sm text-danger-foreground`}>{tMessage(errors.email)}</p>}
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="login-password" className="text-sm font-semibold">{t("Password")}</Label>
                        <Link href="/forgot-password" className={`${authStyles["auth-text-link"]} rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}>{t("Forgot password?")}</Link>
                      </div>
                      <div className="relative">
                        <Input id="login-password" name="password" dir="ltr" type={showPassword ? "text" : "password"} autoComplete="current-password" required minLength={6} placeholder={t("Enter your password")} aria-invalid={Boolean(errors?.password)} aria-describedby={errors?.password ? "login-password-error" : undefined} className="h-12 rounded-lg pe-12 text-sm" />
                        <Button type="button" variant="ghost" aria-controls="login-password" aria-label={showPassword ? t("Hide password") : t("Show password")} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)} className="absolute end-2 top-2 size-8 min-h-8 rounded-lg border border-form-border bg-surface p-0 text-secondary-foreground transition-colors hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                          {showPassword ? <svg aria-hidden="true" focusable="false" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A11 11 0 0 1 12 5c5 0 8.5 4.5 9 7-.2 1.2-1.1 2.5-2.4 3.6M6.2 6.2C4 7.6 2.4 9.8 2 12c.5 2.5 4 7 10 7 1 0 2-.2 2.9-.5" /></svg> : <svg aria-hidden="true" focusable="false" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>}
                        </Button>
                      </div>
                      {errors?.password && <p id="login-password-error" role="alert" className={`${authStyles["auth-feedback"]} text-sm text-danger-foreground`}>{tMessage(errors.password)}</p>}
                    </div>
                    <Button type="submit" className={`${authStyles["auth-primary-action"]} h-12 w-full rounded-lg text-sm font-semibold focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`}>
                      {pending ? <><span aria-hidden="true" className={`${authStyles["auth-spinner"]} size-4`} />{t("Signing in...")}</> : t("Sign in")}
                    </Button>
                  </fieldset>
                  <p role="status" aria-live="polite" className="sr-only">{pending ? t("Signing in. Please wait.") : ""}</p>
                </form>
              </div>
              <div className="border-t border-border bg-surface-secondary px-6 py-4 text-center text-[13px] leading-5 text-secondary-foreground">{t("New to Fleetora?")} <Link href="/signup" className={`${authStyles["auth-text-link"]} rounded-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}>{t("Create an account")}</Link></div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
