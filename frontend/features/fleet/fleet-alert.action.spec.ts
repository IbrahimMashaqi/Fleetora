import { expect, test } from "@playwright/test";
import { visibleFleetError } from "./fleet-alert";

test("a disconnected live feed is not an alert while the company has no drivers", () => {
  expect(visibleFleetError("connection", 0)).toBeNull();
});

test("a disconnected live feed is shown once drivers exist", () => {
  expect(visibleFleetError("connection", 2)).toBe("connection");
});

test("access and availability failures are always shown", () => {
  expect(visibleFleetError("unavailable", 0)).toBe("unavailable");
  expect(visibleFleetError("access", 0)).toBe("access");
  expect(visibleFleetError("unavailable", null)).toBe("unavailable");
});

test("without a snapshot a connection failure is still reported", () => {
  expect(visibleFleetError("connection", null)).toBe("connection");
  expect(visibleFleetError(null, 0)).toBeNull();
});
