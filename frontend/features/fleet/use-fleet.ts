"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import type { SessionUser } from "@/lib/auth/session.types";
import { withSessionLock } from "@/lib/auth/session-lock";
import { subscribeToVehicleChanges } from "@/features/vehicles/vehicle-events";
import { trackingAction } from "./fleet.action";
import { FleetReconciler, parseHeadquartersEvent, parseTrackingEvent, record } from "./fleet-state";
import type { FleetConnection, FleetResult, FleetSnapshot, HeadquartersInput } from "./fleet.types";

type Model = {
  key: string;
  snapshot: FleetSnapshot | null;
  loading: boolean;
  error: "unavailable" | "connection" | "access" | null;
  connection: FleetConnection;
  clockOffset: number;
};
type Runtime = {
  key: string;
  active: boolean;
  reconciler: FleetReconciler;
  save: (input: HeadquartersInput) => Promise<FleetResult>;
};
const unavailableMessage = "unavailable" as const;
const connectionMessage = "connection" as const;

export function useFleet(user: SessionUser) {
  const userId = user.id;
  const companyId = user.orgId;
  const allowed = user.role === "COMPANY_ADMIN" && !!companyId && user.company?.id === companyId;
  const key = JSON.stringify([userId, companyId, allowed]);
  const [attempt, setAttempt] = useState(0);
  const [model, setModel] = useState<Model | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const runtime = useRef<Runtime | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!allowed || !companyId) return;
    const scope = { userId, companyId };
    const reconciler = new FleetReconciler(companyId);
    const previous = runtime.current;
    if (previous?.key === key && previous.reconciler.snapshot) reconciler.acceptSnapshot(previous.reconciler.snapshot);
    let socket: Socket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let readyTimer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let cycle = 0;
    let ready = false;
    let snapshotPending = false;
    let refreshAgain = false;
    let stopped = false;
    const current: Runtime = { key, active: true, reconciler, save: async () => ({ status: "changed" }) };
    runtime.current = current;
    const active = () => current.active && runtime.current === current;
    function update(change: Partial<Model>) {
      if (!active()) return;
      setModel(old => ({
        key, snapshot: old?.key === key ? old.snapshot : null,
        loading: true, error: null, connection: "connecting", clockOffset: old?.key === key ? old.clockOffset : 0,
        ...(old?.key === key ? old : {}), ...change,
      }));
    }
    function closeSocket() {
      cycle += 1;
      ready = false;
      if (readyTimer) clearTimeout(readyTimer);
      readyTimer = undefined;
      socket?.removeAllListeners();
      socket?.disconnect();
      socket = null;
    }
    function deny(result: FleetResult): boolean {
      if (result.status !== "changed" && result.status !== "forbidden" && result.status !== "unauthenticated") return false;
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      closeSocket();
      update({ snapshot: null, loading: false, connection: "disconnected", error: "access" });
      return true;
    }
    async function readSnapshot() {
      if (!active() || stopped) return;
      if (snapshotPending) { refreshAgain = true; return; }
      snapshotPending = true;
      try {
        const result = await withSessionLock(() => active() && !stopped
          ? trackingAction(scope, { kind: "snapshot" }) : Promise.resolve<FleetResult>({ status: "changed" }));
        if (!active() || stopped || deny(result)) return;
        if (result.status === "snapshot") {
          const snapshot = reconciler.acceptSnapshot(result.data);
          update({ snapshot, loading: false, error: ready ? null : connectionMessage,
            clockOffset: Date.parse(result.data.serverTime) - Date.now() });
        } else update({ loading: false, error: unavailableMessage });
      } catch (error) {
        unstable_rethrow(error);
        update({ loading: false, error: unavailableMessage });
      } finally {
        snapshotPending = false;
        if (refreshAgain && active() && !stopped) {
          refreshAgain = false;
          void readSnapshot();
        }
      }
    }
    function scheduleReconnect() {
      if (!active() || stopped || retryTimer) return;
      closeSocket();
      failures += 1;
      update({ loading: !reconciler.snapshot, connection: failures > 6 ? "disconnected" : "reconnecting", error: connectionMessage });
      if (!reconciler.snapshot) void readSnapshot();
      if (failures > 6) { update({ loading: false }); return; }
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        void connect();
      }, Math.min(1000 * 2 ** (failures - 1), 30_000));
    }
    async function connect() {
      if (!active() || stopped) return;
      const ticketCycle = ++cycle;
      update({ connection: failures ? "reconnecting" : "connecting" });
      try {
        const result = await withSessionLock(() => active() && !stopped && cycle === ticketCycle
          ? trackingAction(scope, { kind: "ticket" }) : Promise.resolve<FleetResult>({ status: "changed" }));
        if (!active() || stopped || cycle !== ticketCycle || deny(result)) return;
        if (result.status !== "ticket") {
          scheduleReconnect();
          return;
        }
        // The one-use ticket is never reused by Socket.IO's automatic reconnect.
        socket = io(`${result.data.endpoint}/fleet`, {
          path: "/socket.io", transports: ["websocket"], auth: { ticket: result.data.ticket },
          autoConnect: false, reconnection: false, forceNew: true, timeout: 10_000,
        });
        const connectedSocket = socket;
        const currentSocket = () => active() && !stopped && socket === connectedSocket && cycle === ticketCycle;
        socket.on("fleet:ready", (value: unknown) => {
          if (!currentSocket()) return;
          if (!record(value) || value.companyId !== companyId) { scheduleReconnect(); return; }
          ready = true;
          failures = 0;
          if (readyTimer) clearTimeout(readyTimer);
          update({ connection: "connected" });
          void readSnapshot();
        });
        const tracking = (value: unknown) => {
          if (!currentSocket() || !ready) return;
          const event = parseTrackingEvent(value, scope.companyId);
          if (!event) return;
          const known = reconciler.snapshot?.drivers.some(driver => driver.id === event.driverId);
          update({ snapshot: reconciler.acceptTrackingEvent(event) });
          if (reconciler.snapshot && !known) void readSnapshot();
        };
        socket.on("fleet:location-updated", tracking);
        socket.on("fleet:driver-status-changed", tracking);
        socket.on("fleet:headquarters-updated", (value: unknown) => {
          if (!currentSocket() || !ready) return;
          const event = parseHeadquartersEvent(value, scope.companyId);
          if (event) update({ snapshot: reconciler.acceptHeadquartersEvent(event) });
        });
        socket.on("disconnect", () => { if (currentSocket()) scheduleReconnect(); });
        socket.on("connect_error", () => { if (currentSocket()) scheduleReconnect(); });
        readyTimer = setTimeout(() => { if (currentSocket()) scheduleReconnect(); }, 12_000);
        socket.connect();
      } catch (error) {
        unstable_rethrow(error);
        if (active() && cycle === ticketCycle) {
          scheduleReconnect();
        }
      }
    }
    current.save = async input => {
      if (!active() || stopped) return { status: "changed" };
      try {
        const result = await withSessionLock(() => active() && !stopped
          ? trackingAction(scope, { kind: "save-headquarters", input }) : Promise.resolve<FleetResult>({ status: "changed" }));
        if (!active() || stopped) return { status: "changed" };
        if (deny(result)) return result;
        if (result.status === "headquarters" && result.data.headquarters) {
          update({ snapshot: reconciler.acceptHeadquartersEvent({ companyId, headquarters: result.data.headquarters }) });
          if (!reconciler.snapshot) void readSnapshot();
        } else if (result.status === "uncertain" || result.status === "conflict") void readSnapshot();
        return result;
      } catch (error) {
        unstable_rethrow(error);
        return active() ? { status: "uncertain" } : { status: "changed" };
      }
    };
    const unsubscribe = subscribeToVehicleChanges(scope, () => { void readSnapshot(); });
    // Explicit retry also revalidates REST when the realtime transport stays down.
    if (attempt > 0) void readSnapshot();
    void connect();
    return () => {
      current.active = false;
      stopped = true;
      closeSocket();
      if (retryTimer) clearTimeout(retryTimer);
      unsubscribe();
    };
  }, [key, userId, companyId, allowed, attempt]);

  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const saveHeadquarters = useCallback(async (input: HeadquartersInput): Promise<FleetResult> => {
    const current = runtime.current;
    if (!allowed || !current?.active || current.key !== key) return { status: "changed" };
    return current.save(input);
  }, [key, allowed]);
  // Partition during render as well as effect cleanup, so another identity never sees old data.
  const visible = allowed && model?.key === key ? model : null;
  return {
    snapshot: visible?.snapshot ?? null,
    loading: allowed && (visible?.loading ?? true),
    error: allowed ? visible?.error ?? null : "يتطلّب تتبّع الأسطول صلاحية مدير الشركة.",
    connection: visible?.connection ?? (allowed ? "connecting" : "disconnected"),
    now: clock + (visible?.clockOffset ?? 0),
    retry,
    saveHeadquarters,
  };
}
