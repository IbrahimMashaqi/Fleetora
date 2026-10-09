"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { resendVerificationAction } from "../verification.action";
import type {
  ResendVerificationState,
  VerificationState,
} from "../verification.types";

const resendCooldownSeconds = 60;

function BrandHeader() {
  return (
    <header className="flex h-16 shrink-0 items-center border-b border-border bg-surface px-4 sm:px-8">
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
            Logistics operations
          </span>
        </span>
      </div>
    </header>
  );
}

function StatusMark({ state }: { state: VerificationState["status"] }) {
  const mark =
    state === "verified" || state === "already-verified"
      ? "✓"
      : state === "invalid"
        ? "×"
        : "!";

  return (
    <span
      aria-hidden="true"
      className={`grid size-12 place-items-center rounded-full text-xl font-semibold ${
        state === "invalid" || state === "error"
          ? "bg-danger-background text-danger-foreground"
          : "bg-primary-subtle text-primary"
      }`}
    >
      {mark}
    </span>
  );
}

export function EmailVerification({
  userId,
  initialState,
}: {
  userId: string;
  initialState: VerificationState;
}) {
  const [state, setState] = useState(initialState);
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

  function verifyAgain() {
    window.location.reload();
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
  if (state.status === "verified") {
    title = "Email verified";
    description = "Your Fleetora account is ready. You may now sign in.";
  } else if (state.status === "already-verified") {
    title = "Email already verified";
    description = "This Fleetora account is already verified. You may sign in.";
  } else if (state.status === "expired") {
    title = "This link has expired";
    description =
      "This verification link is no longer active. Request a new email to continue.";
  } else if (state.status === "invalid") {
    title = "This link isn’t valid";
    description =
      "The verification link may be incomplete or no longer active. Request a new email to continue.";
  }

  const canResend =
    Boolean(userId) &&
    (state.status === "expired" || state.status === "invalid");
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
          className="mx-auto w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-9"
        >
          <StatusMark state={state.status} />
          <p className="mt-6 text-sm font-semibold text-primary">
            Account verification
          </p>
          <h1 className="mt-2 text-2xl font-semibold leading-8 tracking-tight">
            {title}
          </h1>
          <p
            aria-live="polite"
            className="mt-3 max-w-md leading-6 text-muted-foreground"
          >
            {description}
          </p>

          {(state.status === "verified" ||
            state.status === "already-verified") && (
            <p
              role="status"
              className="mt-6 rounded-md bg-success-background p-3 text-sm text-success"
            >
              Your email address has been confirmed.
            </p>
          )}

          {state.status === "error" && (
            <Button
              type="button"
              disabled={isPending}
              onClick={verifyAgain}
              className="mt-7 w-full sm:w-auto"
            >
              {isPending ? "Checking..." : "Try again"}
            </Button>
          )}

          {canResend && (
            <div className="mt-7">
              <Button
                type="button"
                variant="outline"
                disabled={isPending || secondsRemaining > 0}
                onClick={resendEmail}
                className="w-full sm:w-auto"
              >
                {isPending
                  ? "Sending..."
                  : secondsRemaining > 0
                    ? `Resend email in ${secondsRemaining}s`
                    : "Resend verification email"}
              </Button>
              {resendMessage && (
                <p
                  role={resendState?.status === "error" ? "alert" : "status"}
                  className={`mt-3 text-sm ${
                    resendState?.status === "error"
                      ? "text-danger-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {resendMessage}
                </p>
              )}
            </div>
          )}

          <p className="mt-8 border-t border-border pt-5 text-sm text-muted-foreground">
            Need to start over?{" "}
            <Link
              href="/signup"
              className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Create an account
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
