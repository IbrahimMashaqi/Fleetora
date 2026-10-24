"use client";

import { flushSync, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { logoutAction } from "./logout.action";
import { withSessionLock } from "@/lib/auth/session-lock";
import { unstable_rethrow } from "next/navigation";
import { useProtectedSession } from "@/features/auth/session/session-context";
import { notifySessionChange } from "@/features/auth/session/session-events";
import { useLocale } from "@/lib/i18n";
import styles from "@/components/layout/app-shell.module.css";

function LogoutSubmitButton() {
  const { pending } = useFormStatus();
  const { t } = useLocale();

  return (
    <Button
      type="submit"
      variant="ghost"
      disabled={pending}
      className={styles.sidebarItem}
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-5">
        <path d="M8 3.5H5.25A1.25 1.25 0 0 0 4 4.75v10.5a1.25 1.25 0 0 0 1.25 1.25H8m4-3 3.5-3.5L12 6.5m3.5 3.5H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {pending ? t("Signing out...") : t("Log out")}
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
