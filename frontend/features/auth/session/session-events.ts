const channelName = "fleetora-session";
const invalidationMessage = "session-invalidated";

function openChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  try { return new BroadcastChannel(channelName); } catch { return null; }
}

export function notifySessionChange() {
  const channel = openChannel();
  if (!channel) return;
  try {
    channel.postMessage(invalidationMessage);
  } catch {
    // Cross-tab signaling is optional; local invalidation and focus checks remain.
  } finally { channel.close(); }
}

export function subscribeToSessionChanges(onChange: () => void): () => void {
  const channel = openChannel();
  if (!channel) return () => {};
  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (event.data === invalidationMessage) onChange();
  };
  return () => channel.close();
}
