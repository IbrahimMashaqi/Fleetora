"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

type TokenFragmentSnapshot = {
  ready: boolean;
  token: string;
  scope: string;
  locationKey: string;
};

const emptySnapshot: TokenFragmentSnapshot = Object.freeze({
  ready: false,
  token: "",
  scope: "",
  locationKey: "",
});
const tokenFragmentChangedEvent = "fleetora:auth-link-token-fragment-changed";
const validToken = /^[a-f0-9]{64}$/i;

function subscribe(listener: () => void) {
  window.addEventListener(tokenFragmentChangedEvent, listener);
  return () => window.removeEventListener(tokenFragmentChangedEvent, listener);
}

export function useOneTimeTokenFragment(
  scope: string,
  legacyTokenInQuery: boolean,
): TokenFragmentSnapshot {
  const snapshotRef = useRef<TokenFragmentSnapshot>(emptySnapshot);
  const snapshot = useSyncExternalStore(
    subscribe,
    () => snapshotRef.current,
    () => emptySnapshot,
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    const rawFragmentToken = new URLSearchParams(url.hash.slice(1)).get("token");
    const hadFragment = Boolean(url.hash);
    if (legacyTokenInQuery) url.searchParams.delete("token");

    const locationKey = `${url.pathname}${url.search}`;
    const previous = snapshotRef.current;
    const rawCandidate = legacyTokenInQuery
      ? null
      : rawFragmentToken ??
        (previous.scope === scope && previous.locationKey === locationKey
          ? previous.token
          : null);
    const token = rawCandidate && validToken.test(rawCandidate) ? rawCandidate : "";
    snapshotRef.current = { ready: true, token, scope, locationKey };

    url.hash = "";
    if (legacyTokenInQuery || hadFragment) {
      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}`,
      );
    }
    window.dispatchEvent(new Event(tokenFragmentChangedEvent));
  }, [legacyTokenInQuery, scope]);

  return snapshot.scope === scope ? snapshot : emptySnapshot;
}
