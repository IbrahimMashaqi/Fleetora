/**
 * A live-feed disconnection is only actionable when there are drivers to track.
 * `driverCount` is null until the first snapshot loads.
 */
export function visibleFleetError<T extends string>(error: T | null, driverCount: number | null): T | null {
  if (error === "connection" && driverCount === 0) return null;
  return error;
}
