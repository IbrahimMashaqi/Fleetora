"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/layout/app-shell";
import { DashboardOverview } from "@/features/dashboard/components/dashboard-overview";
import { isSessionUser, type SessionUser } from "../login.types";

type SessionGateState =
  | { status: "loading" }
  | { status: "redirecting" }
  | { status: "ready"; user: SessionUser }
  | { status: "error"; kind: "changed" | "unavailable" };

export function SessionGate() {
  const [state, setState] = useState<SessionGateState>({ status: "loading" });
  const [retryKey, setRetryKey] = useState(0);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const checkSession = () => fetch("/api/auth/session", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const request = async (): Promise<Response> => {
      if (typeof navigator !== "undefined" && "locks" in navigator) {
        return await navigator.locks.request("fleetora-session-refresh", checkSession);
      }
      return checkSession();
    };

    void request()
      .then(async (response) => {
        if (cancelled) return;

        if (response.status === 401) {
          setState({ status: "redirecting" });
          router.replace("/login");
          return;
        }

        if (!response.ok) {
          setState({
            status: "error",
            kind: response.status === 409 ? "changed" : "unavailable",
          });
          return;
        }

        const result: unknown = await response.json();
        if (cancelled) return;
        if (!result || typeof result !== "object" || !("user" in result) || !isSessionUser(result.user)) {
          setState({ status: "error", kind: "unavailable" });
          return;
        }

        setState({ status: "ready", user: result.user });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", kind: "unavailable" });
      });

    return () => {
      cancelled = true;
    };
  }, [retryKey, router]);

  if (state.status === "loading" || state.status === "redirecting") {
    return (
      <main aria-busy="true" className="grid min-h-svh place-items-center bg-background px-4 text-foreground/75">
        <p role="status" aria-live="polite">Checking your session…</p>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="grid min-h-svh place-items-center bg-background px-4 py-8 text-foreground">
        <section className="w-full max-w-md" aria-labelledby="session-error-title">
          <h1 id="session-error-title" className="text-xl font-semibold tracking-tight">
            We couldn’t verify your session
          </h1>
          <p className="mt-2 text-sm leading-6 text-foreground/75" role="status" aria-live="polite">
            {state.kind === "changed"
              ? "Your session changed while it was being checked. Please try again."
              : "Fleetora couldn’t reach the session service. Please try again."}
          </p>
          <Button
            type="button"
            className="mt-5 rounded-lg bg-primary-hover text-white hover:bg-primary-active active:bg-primary-active"
            onClick={() => {
              setState({ status: "loading" });
              setRetryKey((current) => current + 1);
            }}
          >
            Try again
          </Button>
        </section>
      </main>
    );
  }

  return (
    <AppShell user={state.user}>
      <DashboardOverview user={state.user} />
    </AppShell>
  );
}
