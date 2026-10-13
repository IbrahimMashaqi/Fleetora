"use client";

import { flushSync, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { logoutAction } from "./logout.action";
import { withSessionLock } from "@/lib/auth/session-lock";
import { unstable_rethrow } from "next/navigation";
import { useProtectedSession } from "@/features/auth/session/session-context";
import { notifySessionChange } from "@/features/auth/session/session-events";

function LogoutSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="ghost"
      disabled={pending}
      className="min-h-10 w-full justify-start rounded-md border border-white/10 px-3 text-sidebar-foreground hover:border-white/20 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar-navy"
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4">
        <path d="M8 3.5H5.25A1.25 1.25 0 0 0 4 4.75v10.5a1.25 1.25 0 0 0 1.25 1.25H8m4-3 3.5-3.5L12 6.5m3.5 3.5H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {pending ? "Signing out…" : "Log out"}
    </Button>
  );
}

export function LogoutControl({ className }: { className?: string }) {
  const { beginLogout, reportFailure } = useProtectedSession();
  async function signOut() {
    // Form actions run in a transition; remove identity before awaiting the lock.
    flushSync(beginLogout);
    const pendingLogout = withSessionLock(logoutAction);
    // Register logout in the shared lock before other tabs queue a fresh check.
    notifySessionChange();
    try {
      await pendingLogout;
    } catch (error) {
      unstable_rethrow(error);
      reportFailure();
    }
  }

  return (
    <form action={signOut} className={className}>
      <LogoutSubmitButton />
    </form>
  );
}
