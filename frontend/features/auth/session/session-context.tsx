"use client";

import { createContext, useContext } from "react";
import type { CompanyCurrency, SessionUser } from "@/lib/auth/session.types";

type ProtectedSession = {
  user: SessionUser;
  beginLogout: () => void;
  reportFailure: () => void;
};

export const ProtectedSessionContext = createContext<ProtectedSession | null>(null);

export function useProtectedSession(): ProtectedSession {
  const session = useContext(ProtectedSessionContext);
  if (!session) throw new Error("Protected content must be rendered inside SessionGate.");
  return session;
}

/** OD-02 / BR-066: the signed-in company's single currency (null without a company). */
export function useCompanyCurrency(): CompanyCurrency | null {
  return useProtectedSession().user.company?.currency ?? null;
}
