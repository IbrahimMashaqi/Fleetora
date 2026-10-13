import { expect, test } from "@playwright/test";
import { withSessionLock } from "@/lib/auth/session-lock";

test("serializes same-tab session/logout operations without Web Locks", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: undefined, configurable: true });
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const events: string[] = [];
  try {
    const first = withSessionLock(async () => { events.push("refresh-start"); await barrier; events.push("refresh-end"); });
    const second = withSessionLock(async () => { events.push("logout"); });
    await Promise.resolve();
    expect(events).toEqual(["refresh-start"]);
    release(); await Promise.all([first, second]);
    expect(events).toEqual(["refresh-start", "refresh-end", "logout"]);
  } finally {
    release();
    if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
});

test("a rejected fallback operation never blocks later session recovery", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: undefined, configurable: true });
  try {
    await expect(withSessionLock(async () => { throw new Error("fixture failure"); })).rejects.toThrow("fixture failure");
    await expect(withSessionLock(async () => "recovered")).resolves.toBe("recovered");
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
});
