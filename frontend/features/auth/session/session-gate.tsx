"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { isSessionUser, type SessionUser } from "@/lib/auth/session.types";
import { withSessionLock } from "@/lib/auth/session-lock";
import { LanguageSwitcher, useLocale } from "@/lib/i18n";
import { ProtectedSessionContext } from "./session-context";
import { subscribeToSessionChanges } from "./session-events";

type SessionGateState =
  | { status: "loading" }
  | { status: "redirecting" }
  | { status: "signing-out" }
  | { status: "ready"; user: SessionUser }
  | { status: "error"; kind: "changed" | "unavailable" };

async function checkSession(): Promise<SessionGateState> {
  return withSessionLock(async () => {
    const response = await fetch("/api/auth/session", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (response.status === 401) return { status: "redirecting" };
    if (!response.ok) return { status: "error", kind: response.status === 409 ? "changed" : "unavailable" };
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("user" in result) || !isSessionUser(result.user)) return { status: "error", kind: "unavailable" };
    return { status: "ready", user: result.user };
  });
}

export function SessionGate({ children }: { children: (user: SessionUser) => ReactNode }) {
  const { t } = useLocale();
  const [state, setState] = useState<SessionGateState>({ status: "loading" });
  const mounted = useRef(false);
  const signingOut = useRef(false);
  const generation = useRef(0);
  const inFlight = useRef<Promise<SessionGateState> | null>(null);
  const pendingRecheck = useRef(false);
  const router = useRouter();

  const revalidate = useCallback(function run(resetIdentity = false): void {
    if (!mounted.current || signingOut.current) return;
    if (resetIdentity) {
      generation.current++;
      setState({ status: "loading" });
    }
    if (inFlight.current) {
      if (resetIdentity) pendingRecheck.current = true;
      return;
    }
    const requestGeneration = generation.current;
    const task = checkSession().catch(() => ({ status: "error", kind: "unavailable" } as const));
    inFlight.current = task;
    void task.then(result => {
      if (!mounted.current || signingOut.current || generation.current !== requestGeneration) return;
      setState(result);
      if (result.status === "redirecting") {
        signingOut.current = true;
        router.replace("/login");
      }
    }).finally(() => {
      if (inFlight.current === task) inFlight.current = null;
      if (mounted.current && !signingOut.current && pendingRecheck.current) {
        pendingRecheck.current = false;
        run();
      }
    });
  }, [router]);

  const beginLogout = useCallback(() => {
    signingOut.current = true;
    pendingRecheck.current = false;
    generation.current++;
    setState({ status: "signing-out" });
  }, []);

  const reportFailure = useCallback(() => {
    if (!mounted.current) return;
    signingOut.current = false;
    generation.current++;
    setState({ status: "error", kind: "unavailable" });
  }, []);

  useEffect(() => {
    mounted.current = true;
    revalidate();
    const onReturn = () => {
      if (document.visibilityState === "visible") revalidate();
    };
    window.addEventListener("focus", onReturn);
    window.addEventListener("online", onReturn);
    const unsubscribe = subscribeToSessionChanges(() => revalidate(true));
    return () => {
      mounted.current = false;
      window.removeEventListener("focus", onReturn);
      window.removeEventListener("online", onReturn);
      unsubscribe();
    };
  }, [revalidate]);

  if (state.status === "loading" || state.status === "redirecting" || state.status === "signing-out") {
    return (
      <main aria-busy="true" className="relative grid min-h-svh place-items-center bg-background px-4 text-foreground/75">
        <div className="absolute end-4 top-4">
          <LanguageSwitcher />
        </div>
        <p role="status" aria-live="polite">{state.status === "signing-out" ? t("Signing out…") : t("Checking your session…")}</p>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="relative grid min-h-svh place-items-center bg-background px-4 py-8 text-foreground">
        <div className="absolute end-4 top-4">
          <LanguageSwitcher />
        </div>
        <section className="w-full max-w-md" aria-labelledby="session-error-title">
          <h1 id="session-error-title" className="text-xl font-semibold tracking-tight">
            {t("We couldn’t verify your session")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-foreground/75" role="status" aria-live="polite">
            {state.kind === "changed"
              ? t("Your session changed while it was being checked. Please try again.")
              : t("Fleetora couldn’t reach the session service. Please try again.")}
          </p>
          <Button
            type="button"
            className="mt-5 rounded-lg bg-primary-hover text-white hover:bg-primary-active active:bg-primary-active"
            onClick={() => revalidate(true)}
          >
            {t("Try again")}
          </Button>
          <Button asChild variant="outline" className="ms-3 mt-5">
            <Link href="/login">{t("Sign in again")}</Link>
          </Button>
        </section>
      </main>
    );
  }

  return (
    <ProtectedSessionContext.Provider
      key={JSON.stringify([state.user.id, state.user.orgId, state.user.role])}
      value={{ user: state.user, beginLogout, reportFailure }}
    >
      {children(state.user)}
    </ProtectedSessionContext.Provider>
  );
}
