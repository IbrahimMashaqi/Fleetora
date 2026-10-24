import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

export const FLEET_FRESHNESS_SECONDS = 45;
export const TELEMETRY_MIN_INTERVAL_MS = 2000;
export type TelemetryInput = {
  sessionId: string;
  sequence: number;
  latitude: number;
  longitude: number;
  capturedAt: string;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
};
export type ValidTelemetry = Omit<Required<TelemetryInput>, 'capturedAt'> & {
  capturedAt: number;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function within(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}
export function validateTelemetry(input: unknown, now: number): ValidTelemetry {
  if (!input || typeof input !== 'object')
    throw new BadRequestException('Invalid telemetry');
  const value: Record<string, unknown> = Object.fromEntries(
    Object.entries(input),
  );
  const keys = [
    'sessionId',
    'sequence',
    'latitude',
    'longitude',
    'capturedAt',
    'accuracy',
    'speed',
    'heading',
  ];
  const capturedAtText =
    typeof value.capturedAt === 'string' ? value.capturedAt : '';
  const capturedAt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(
    capturedAtText,
  )
    ? Date.parse(capturedAtText)
    : NaN;
  if (
    Object.keys(value).some((key) => !keys.includes(key)) ||
    typeof value.sessionId !== 'string' ||
    !uuid.test(value.sessionId) ||
    !within(value.sequence, 1, 2147483646) ||
    !Number.isInteger(value.sequence) ||
    !within(value.latitude, -90, 90) ||
    !within(value.longitude, -180, 180) ||
    !Number.isFinite(capturedAt) ||
    // Reject calendar/clock rollovers while preserving fractional precision.
    new Date(capturedAt).toISOString().slice(0, 19) !==
      capturedAtText.slice(0, 19) ||
    capturedAt < now - 120000 ||
    capturedAt > now + 30000 ||
    (value.accuracy != null && !within(value.accuracy, 0, 10000)) ||
    (value.speed != null && !within(value.speed, 0, 100)) ||
    (value.heading != null && !within(value.heading, 0, 359.999999))
  )
    throw new BadRequestException('Invalid or stale telemetry');
  return {
    sessionId: value.sessionId,
    sequence: value.sequence,
    latitude: value.latitude,
    longitude: value.longitude,
    capturedAt,
    accuracy: typeof value.accuracy === 'number' ? value.accuracy : null,
    speed: typeof value.speed === 'number' ? value.speed : null,
    heading: typeof value.heading === 'number' ? value.heading : null,
  };
}
export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const r = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) *
      Math.cos(lat2 * r) *
      Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}
export function assertTelemetryOrder(
  input: ValidTelemetry,
  previous: {
    sequence: number;
    latitude: number | null;
    longitude: number | null;
    capturedAt: number;
    receivedAt: number;
    accuracy: number | null;
  },
  now: number,
): void {
  if (
    input.sequence <= previous.sequence ||
    input.capturedAt <= previous.capturedAt
  )
    throw new ConflictException('Telemetry is duplicate or out of order');
  if (
    previous.receivedAt &&
    now - previous.receivedAt < TELEMETRY_MIN_INTERVAL_MS
  )
    throw new HttpException(
      'Telemetry updates are too frequent',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  if (
    previous.latitude !== null &&
    previous.longitude !== null &&
    previous.capturedAt
  ) {
    const tolerance =
      100 +
      Math.min(previous.accuracy ?? 0, 1000) +
      Math.min(input.accuracy ?? 0, 1000);
    if (
      distanceMeters(
        previous.latitude,
        previous.longitude,
        input.latitude,
        input.longitude,
      ) >
      (100 * (input.capturedAt - previous.capturedAt)) / 1000 + tolerance
    )
      throw new BadRequestException('Implausible location jump');
  }
}
