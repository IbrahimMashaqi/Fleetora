import type { DriverScope } from "@/features/drivers/drivers.types";

const eventName = "fleetora-vehicles-changed";

function openChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  try {
    return new BroadcastChannel(eventName);
  } catch {
    return null;
  }
}

export function notifyVehicleChange(scope: DriverScope) {
  window.dispatchEvent(new CustomEvent(eventName, { detail: scope }));
  const channel = openChannel();
  if (!channel) return;
  try {
    channel.postMessage(scope);
  } catch {
    // Local refresh still runs when the browser disallows cross-tab signaling.
  } finally {
    channel.close();
  }
}

export function subscribeToVehicleChanges(
  scope: DriverScope,
  onChange: () => void,
) {
  function receive(value: unknown) {
    if (
      value &&
      typeof value === "object" &&
      "userId" in value &&
      "companyId" in value &&
      value.userId === scope.userId &&
      value.companyId === scope.companyId
    )
      onChange();
  }
  function local(event: Event) {
    if (event instanceof CustomEvent) receive(event.detail);
  }
  window.addEventListener(eventName, local);
  const channel = openChannel();
  if (channel)
    channel.onmessage = (event: MessageEvent<unknown>) => receive(event.data);
  return () => {
    window.removeEventListener(eventName, local);
    channel?.close();
  };
}
