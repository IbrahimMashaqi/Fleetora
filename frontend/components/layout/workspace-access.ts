import type { SessionRole } from "@/lib/auth/session.types";

/**
 * Which workspace routes each company role is offered. This is a usability
 * boundary only: the backend still authorizes every read and write.
 */
type WorkspaceUser = { role: SessionRole; company: unknown };

const alwaysAvailable = ["/app", "/app/account"];

/** Every route the workspace shell knows; unregistered paths are left to the router. */
export const workspaceRoutes = [
  "/app",
  "/app/live-map",
  "/app/operations",
  "/app/parcels",
  "/app/pickups",
  "/app/requests",
  "/app/pricing",
  "/app/merchants",
  "/app/drivers",
  "/app/vehicles",
  "/app/warehouses",
  "/app/settings",
  "/app/team",
  "/app/returns",
  "/app/collections",
  "/app/settlements",
  "/app/account",
] as const;

const roleRoutes: Partial<Record<SessionRole, readonly string[]>> = {
  COMPANY_ADMIN: workspaceRoutes,
  OPERATIONS: ["/app/operations", "/app/parcels", "/app/drivers", "/app/pickups", "/app/returns", "/app/requests", "/app/merchants", "/app/vehicles"],
  WAREHOUSE: ["/app/operations", "/app/parcels", "/app/pickups", "/app/returns"],
  ACCOUNTANT: ["/app/operations", "/app/parcels", "/app/merchants", "/app/returns", "/app/collections", "/app/settlements", "/app/requests"],
};

/** Sub-routes that need a narrower role than their parent section. */
const adminOnlyRoutes = ["/app/merchants/accounts"];

export function matchesWorkspaceRoute(pathname: string, href: string) {
  return pathname === href || href !== "/app" && pathname.startsWith(`${href}/`);
}

export function workspaceRoutesFor(user: WorkspaceUser): string[] {
  if (!user.company) return [...alwaysAvailable];
  const routes = roleRoutes[user.role] ?? [];
  return workspaceRoutes.filter(href => alwaysAvailable.includes(href) || routes.includes(href));
}

export function canAccessWorkspaceRoute(user: WorkspaceUser, pathname: string): boolean {
  if (adminOnlyRoutes.some(href => matchesWorkspaceRoute(pathname, href))) {
    return Boolean(user.company) && user.role === "COMPANY_ADMIN";
  }
  const section = workspaceRoutes.filter(href => matchesWorkspaceRoute(pathname, href)).sort((a, b) => b.length - a.length)[0];
  if (!section) return true;
  return workspaceRoutesFor(user).includes(section);
}
