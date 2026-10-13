let pendingSessionOperation: Promise<void> = Promise.resolve();

export async function withSessionLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks && typeof navigator.locks.request === "function") {
    return navigator.locks.request("fleetora-session-refresh", operation);
  }
  // The fallback serializes this tab only; cross-tab ordering still needs Web Locks.
  const result = pendingSessionOperation.then(operation);
  pendingSessionOperation = result.then(() => undefined, () => undefined);
  return result;
}
