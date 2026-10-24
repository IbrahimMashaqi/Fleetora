import { describe, expect, it } from 'vitest';
import {
  validateTelemetry,
  assertTelemetryOrder,
  distanceMeters,
} from './telemetry-policy.js';

const now = Date.parse('2026-10-17T12:00:00Z');
const sample = {
  latitude: 31.9,
  longitude: 35.2,
  capturedAt: new Date(now).toISOString(),
  sequence: 1,
  sessionId: '11111111-1111-4111-8111-111111111111',
  accuracy: 5,
  speed: 2,
  heading: 90,
};
describe('trusted driver telemetry policy', () => {
  it('accepts finite real coordinates and optional measurements', () => {
    expect(validateTelemetry(sample, now)).toMatchObject({
      latitude: 31.9,
      heading: 90,
    });
    expect(
      validateTelemetry(
        {
          ...sample,
          accuracy: undefined,
          speed: undefined,
          heading: undefined,
        },
        now,
      ),
    ).toMatchObject({ accuracy: null, speed: null, heading: null });
  });
  it.each([
    { latitude: NaN },
    { longitude: Infinity },
    { latitude: 91 },
    { longitude: -181 },
    { accuracy: -1 },
    { heading: 360 },
    { speed: 101 },
    { sequence: 0 },
    { sequence: 1.2 },
    { workerId: 'spoof' },
    { companyId: 'spoof' },
    { capturedAt: 'yesterday' },
    { sessionId: 'invalid' },
  ])('rejects invalid or identity-bearing input %j', (change) => {
    expect(() => validateTelemetry({ ...sample, ...change }, now)).toThrow();
  });
  it('rejects stale and future captures', () => {
    for (const delta of [-120001, 30001])
      expect(() =>
        validateTelemetry(
          { ...sample, capturedAt: new Date(now + delta).toISOString() },
          now,
        ),
      ).toThrow();
  });
  it('rejects an impossible calendar date normalized into the freshness window', () => {
    const octoberFirst = Date.UTC(2026, 9, 1, 12);
    expect(() =>
      validateTelemetry(
        { ...sample, capturedAt: '2026-09-31T12:00:00Z' },
        octoberFirst,
      ),
    ).toThrow('Invalid or stale telemetry');
  });
  it.each([
    ['2026-10-01T12:00:00Z', 0],
    ['2026-10-01T12:00:00.1Z', 100],
    ['2026-10-01T12:00:00.12Z', 120],
    ['2026-10-01T12:00:00.123Z', 123],
  ])(
    'preserves accepted UTC capture precision for %s',
    (capturedAt, milliseconds) => {
      const octoberFirst = Date.UTC(2026, 9, 1, 12);
      expect(
        validateTelemetry({ ...sample, capturedAt }, octoberFirst).capturedAt,
      ).toBe(octoberFirst + milliseconds);
    },
  );
  it('rejects ordering, frequency and impossible jumps', () => {
    const previous = {
      sequence: 1,
      latitude: 31.9,
      longitude: 35.2,
      capturedAt: now - 5000,
      receivedAt: now - 5000,
      accuracy: 5,
    };
    expect(() =>
      assertTelemetryOrder(validateTelemetry(sample, now), previous, now),
    ).toThrow();
    expect(() =>
      assertTelemetryOrder(
        validateTelemetry({ ...sample, sequence: 2 }, now),
        { ...previous, receivedAt: now - 500 },
        now,
      ),
    ).toThrow();
    expect(() =>
      assertTelemetryOrder(
        validateTelemetry({ ...sample, sequence: 2, latitude: 40 }, now),
        previous,
        now,
      ),
    ).toThrow();
    expect(() =>
      assertTelemetryOrder(
        validateTelemetry({ ...sample, sequence: 2 }, now),
        previous,
        now,
      ),
    ).not.toThrow();
  });
  it('uses geographic distance without swapping longitude/latitude', () => {
    expect(distanceMeters(0, 0, 0, 1)).toBeCloseTo(111195, -1);
  });
});
