"use client";

import { createContext, useContext } from "react";
import type { SessionUser } from "@/lib/auth/session.types";

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
