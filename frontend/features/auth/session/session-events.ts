const channelName = "fleetora-session";
const invalidationMessage = "session-invalidated";
const localEvent = "fleetora-session-invalidated";

function openChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  try { return new BroadcastChannel(channelName); } catch { return null; }
}

export function notifySessionChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(localEvent));
  const channel = openChannel();
  if (!channel) return;
  try {
    channel.postMessage(invalidationMessage);
  } catch {
    // Cross-tab signaling is optional; local invalidation and focus checks remain.
  } finally { channel.close(); }
}

export function subscribeToSessionChanges(onChange: () => void): () => void {
  window.addEventListener(localEvent, onChange);
  const channel = openChannel();
  if (!channel) return () => window.removeEventListener(localEvent, onChange);
  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (event.data === invalidationMessage) onChange();
  };
  return () => { window.removeEventListener(localEvent, onChange); channel.close(); };
}
