import { expect, test } from "@playwright/test";
import { canAccessWorkspaceRoute, workspaceRoutesFor } from "@/components/layout/workspace-access";
import type { SessionRole } from "@/lib/auth/session.types";

const user = (role: SessionRole, company = true) => ({ role, company: company ? { id: "c1" } : null });

test("company administrators reach every registered workspace route", () => {
  for (const path of ["/app", "/app/live-map", "/app/settings", "/app/team", "/app/merchants/accounts", "/app/settlements/new", "/app/pricing"]) {
    expect(canAccessWorkspaceRoute(user("COMPANY_ADMIN"), path)).toBe(true);
  }
});

test("URL-only routes outside a role's navigation are denied", () => {
  const denied: [SessionRole, string][] = [
    ["ACCOUNTANT", "/app/pricing"], ["ACCOUNTANT", "/app/pickups"], ["ACCOUNTANT", "/app/live-map"],
    ["ACCOUNTANT", "/app/settings"], ["ACCOUNTANT", "/app/team"], ["ACCOUNTANT", "/app/drivers"],
    ["ACCOUNTANT", "/app/merchants/accounts"],
    ["OPERATIONS", "/app/settlements/new"], ["OPERATIONS", "/app/settlements"], ["OPERATIONS", "/app/collections"],
    ["OPERATIONS", "/app/pricing"], ["OPERATIONS", "/app/settings"], ["OPERATIONS", "/app/warehouses"],
    ["OPERATIONS", "/app/merchants/accounts"], ["WAREHOUSE", "/app/merchants"], ["MERCHANT", "/app/parcels"],
  ];
  for (const [role, path] of denied) expect(canAccessWorkspaceRoute(user(role), path), `${role} ${path}`).toBe(false);
});

test("navigation routes and their detail pages stay reachable", () => {
  const allowed: [SessionRole, string][] = [
    ["ACCOUNTANT", "/app/settlements/new"], ["ACCOUNTANT", "/app/settlements/abc"], ["ACCOUNTANT", "/app/merchants/m1"],
    ["OPERATIONS", "/app/parcels/p1"], ["OPERATIONS", "/app/vehicles"], ["OPERATIONS", "/app/merchants/m1"],
    ["WAREHOUSE", "/app/pickups"], ["MERCHANT", "/app"], ["MERCHANT", "/app/account"],
  ];
  for (const [role, path] of allowed) expect(canAccessWorkspaceRoute(user(role), path), `${role} ${path}`).toBe(true);
});

test("a user without company context reaches only overview and account", () => {
  expect(canAccessWorkspaceRoute(user("COMPANY_ADMIN", false), "/app")).toBe(true);
  expect(canAccessWorkspaceRoute(user("COMPANY_ADMIN", false), "/app/account")).toBe(true);
  expect(canAccessWorkspaceRoute(user("COMPANY_ADMIN", false), "/app/parcels")).toBe(false);
});

test("unregistered paths are left to the router", () => {
  expect(canAccessWorkspaceRoute(user("ACCOUNTANT"), "/app/test-child")).toBe(true);
  expect(canAccessWorkspaceRoute(user("ACCOUNTANT"), "/app/parcelsx")).toBe(true);
});

test("navigation lists only reachable routes", () => {
  expect(workspaceRoutesFor(user("OPERATIONS"))).not.toContain("/app/settlements");
  expect(workspaceRoutesFor(user("ACCOUNTANT"))).toContain("/app/settlements");
  for (const role of ["COMPANY_ADMIN", "ACCOUNTANT", "OPERATIONS", "WAREHOUSE"] as SessionRole[]) {
    for (const href of workspaceRoutesFor(user(role))) expect(canAccessWorkspaceRoute(user(role), href)).toBe(true);
  }
});
