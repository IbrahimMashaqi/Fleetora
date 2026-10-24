"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import authStyles from "../auth.module.css";
import { Button } from "@/components/ui/button";
import { resendVerificationAction, verifyEmailAction } from "./verification.action";
import { useOneTimeTokenFragment } from "../one-time-token-fragment";
import { LanguageSwitcher, useLocale } from "@/lib/i18n";
import type {
  ResendVerificationState,
  VerificationState,
} from "./verification.types";

const resendCooldownSeconds = 60;

function BrandHeader() {
  const { t } = useLocale();
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 sm:px-8">
      <div className="flex items-center gap-3">
        <Image
          src="/fleetora-logo.png"
          alt=""
          aria-hidden="true"
          width={40}
          height={40}
          className="size-10 shrink-0 object-contain"
        />
        <span>
          <span className="block text-lg font-semibold leading-6 tracking-tight">
            Fleetora
          </span>
          <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
            {t("Logistics operations")}
          </span>
        </span>
      </div>
      <LanguageSwitcher />
    </header>
  );
}

function StatusMark({ state }: { state: VerificationState["status"] }) {
  const mark =
    state === "verified" || state === "already-verified"
      ? "✓"
      : state === "invalid"
        ? "×"
        : state === "confirmation-required"
          ? "i"
          : "!";

  return (
    <span
      aria-hidden="true"
      className={`grid size-12 place-items-center rounded-full text-xl font-semibold ${
        state === "invalid" || state === "error"
          ? "bg-danger-background text-danger-foreground"
          : "bg-primary-subtle text-accent-foreground"
      } ${state === "verified" || state === "already-verified" ? authStyles["auth-success-mark"] : ""}`}
    >
      {mark}
    </span>
  );
}

export function EmailVerification({
  userId,
  initialState,
  legacyTokenInQuery,
}: {
  userId: string;
  initialState: VerificationState;
  legacyTokenInQuery: boolean;
}) {
  const { t, tMessage } = useLocale();
  const [state, setState] = useState(initialState);
  const tokenSnapshot = useOneTimeTokenFragment(userId, legacyTokenInQuery);
  const token = tokenSnapshot.token;
  const displayState =
    state.status === "confirmation-required" &&
    tokenSnapshot.ready &&
    !/^[a-f0-9]{64}$/i.test(token)
      ? { status: "invalid" as const }
      : state;
  const [resendState, setResendState] =
    useState<ResendVerificationState | null>(null);
  const [isPending, startTransition] = useTransition();
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  useEffect(() => {
    if (secondsRemaining <= 0) return;
    const timeout = window.setTimeout(
      () => setSecondsRemaining((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearTimeout(timeout);
  }, [secondsRemaining]);

  function confirmEmail() {
    if (!userId || !/^[a-f0-9]{64}$/i.test(token) || isPending) return;
    startTransition(async () => {
      const result = await verifyEmailAction(userId, token);
      setState(result);
    });
  }

  function resendEmail() {
    startTransition(async () => {
      const result = await resendVerificationAction(userId);
      setResendState(result);
      if (result.status === "sent") {
        setSecondsRemaining(resendCooldownSeconds);
      } else if (result.status === "rate-limited") {
        setSecondsRemaining(result.retryAfterSeconds);
      }
      if (result.status === "already-verified") {
        setState({ status: "already-verified" });
      }
    });
  }

  let title = "We couldn’t verify your email";
  let description =
    "There was a temporary problem checking this link. Try again, or request a new email.";
  if (displayState.status === "confirmation-required") {
    title = "Verify your email";
    description = "Continue to confirm your email address and activate your Fleetora account.";
  } else if (displayState.status === "verified") {
    title = "Email verified";
    description = "Your Fleetora account is ready. You may now sign in.";
  } else if (displayState.status === "already-verified") {
    title = "Email already verified";
    description = "This Fleetora account is already verified. You may sign in.";
  } else if (displayState.status === "expired") {
    title = "This link has expired";
    description =
      "This verification link is no longer active. Request a new email to continue.";
  } else if (displayState.status === "invalid") {
    title = "This link isn’t valid";
    description =
      "The verification link may be incomplete or no longer active. Request a new email to continue.";
  }

  const canResend =
    Boolean(userId) &&
    (displayState.status === "expired" || displayState.status === "invalid");
  const resendMessage =
    resendState?.status === "sent"
      ? "A new verification email has been sent. Check your inbox and spam folder."
      : resendState?.status === "rate-limited"
        ? "Please wait before requesting another verification email."
        : resendState?.status === "error"
          ? "We couldn’t send the email. Please try again."
          : null;

  return (
    <main className="flex min-h-svh flex-col bg-background text-foreground">
      <BrandHeader />
      <section className="mx-auto flex w-full max-w-3xl flex-1 items-center px-4 py-12 sm:px-8">
        <div
          aria-busy={isPending}
          className={`${authStyles["auth-enter"]} mx-auto w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-9`}
        >
          <StatusMark state={displayState.status} />
          <p className="mt-6 text-sm font-semibold text-accent-foreground">
            {t("Account verification")}
          </p>
          <h1 className="mt-2 text-2xl font-semibold leading-8 tracking-tight">
            {tMessage(title)}
          </h1>
          <p
            aria-live="polite"
            className="mt-3 max-w-md leading-6 text-muted-foreground"
          >
            {tMessage(description)}
          </p>

          {(displayState.status === "verified" ||
            displayState.status === "already-verified") && (
            <>
              <p
                role="status"
                className={`${authStyles["auth-success-state"]} mt-6 rounded-md bg-success-background p-3 text-sm text-foreground`}
              >
                {t("Your email address has been confirmed.")}
              </p>
              <Button asChild className={`${authStyles["auth-action-button"]} mt-7 w-full sm:w-auto`}>
                <Link href="/login">{t("Continue to Login")}</Link>
              </Button>
            </>
          )}

          {displayState.status === "confirmation-required" && (
            <Button
              type="button"
              disabled={isPending || !tokenSnapshot.ready || !/^[a-f0-9]{64}$/i.test(token)}
              onClick={confirmEmail}
              className={`${authStyles["auth-action-button"]} mt-7 w-full sm:w-auto`}
            >
              {isPending
                ? <><span aria-hidden="true" className={`${authStyles["auth-spinner"]} size-4`} />{t("Verifying...")}</>
                : t("Confirm email address")}
            </Button>
          )}

          {displayState.status === "error" && (
            <Button
              type="button"
              disabled={isPending}
              onClick={confirmEmail}
              className={`${authStyles["auth-action-button"]} mt-7 w-full sm:w-auto`}
            >
              {isPending ? <><span aria-hidden="true" className={`${authStyles["auth-spinner"]} size-4`} />{t("Checking...")}</> : t("Try again")}
            </Button>
          )}

          {canResend && (
            <div className="mt-7">
              <Button
                type="button"
                variant="outline"
                disabled={isPending || secondsRemaining > 0}
                onClick={resendEmail}
                className={`${authStyles["auth-action-button"]} w-full sm:w-auto`}
              >
                {isPending
                  ? <><span aria-hidden="true" className={`${authStyles["auth-spinner"]} size-4`} />{t("Sending...")}</>
                  : secondsRemaining > 0
                    ? t("Resend email in {seconds}s", { seconds: secondsRemaining })
                    : t("Resend verification email")}
              </Button>
              {resendMessage && (
                <p
                  role={resendState?.status === "error" ? "alert" : "status"}
                  className={`${authStyles["auth-feedback"]} mt-3 text-sm ${
                    resendState?.status === "error"
                      ? "text-danger-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {resendMessage ? tMessage(resendMessage) : null}
                </p>
              )}
            </div>
          )}

          <p className="mt-8 border-t border-border pt-5 text-sm text-muted-foreground">
            {t("Need to start over?")}{" "}
            <Link
              href="/signup"
              className="font-medium text-accent-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {t("Create an account")}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
