"use client";

import Link from "next/link";
import { useState } from "react";
import { useProtectedSession } from "@/features/auth/session/session-context";

export default function ProtectedChild() {
  const { user } = useProtectedSession();
  const [draft, setDraft] = useState("");
  return <section>
    <h2>Nested protected content</h2>
    <p>{user.name}</p>
    <label>Probe draft<input value={draft} onChange={event => setDraft(event.target.value)} /></label>
    <Link href="/app">Dashboard content</Link>
  </section>;
}
