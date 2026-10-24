# Security gates for future Fleetora features

Apply these boundaries to existing tenant modules and future work. This checklist defines security gates; the implemented modules and currently enabled authorization model must be verified in source. It does not activate the Phase 7B.1 authorization cutover.

## Existing enforcement

- Authentication guards reload the current database user, role and company state.
- Tenant users require an active company; platform administrators must be companyless.
- Session responses expose an allowlisted public identity.
- The frontend protected layout supplies presentation and lifecycle state. It does not authorize Server Component execution or tenant data.
- Refresh rotation uses unique signed JWTs and a versioned full-token verifier under a database row lock.

## Required before exposing a tenant-owned operation

- Derive actor and tenant from verified server authentication, never submitted role or company fields.
- Apply authentication to every relevant HTTP endpoint, Server Action, server data read, export and background task.
- Authorize the action and resource explicitly. A valid token or platform role must not imply unrestricted access.
- Scope reads, lists, counts, mutations, cache keys and exports by the authenticated company.
- Check that related workers, warehouses, vehicles, requesters and other resources belong to the same permitted company.
- Use transactions for dependent writes and appropriate concurrency controls for shared state.
- Add negative cross-company tests for both access and relationship attachment.
- Test unauthorized Server Component payloads; hiding client content is insufficient.
- Invalidate feature state/cache after logout and identity/company changes; handle backend 401/403 without refresh loops.
- Define safe audit events for sensitive operations: actor, tenant, action, resource and outcome. Never record passwords, tokens or secrets. Retention and platform access require product approval.
- Resolve ownership for tenantless operational records, including AIExecution, before exposing them.

## Product and deployment decisions still required

Banks/Company mapping; Orders/Shipments and Drivers/Workers terminology; permission and platform-admin powers; organization lifecycle; multi-organization membership; access revocation and device-session policy; legacy long-password transition; distributed abuse controls; durable email delivery and timing privacy; supported browser coordination guarantees; normal production font/build infrastructure.

The checklist is an implementation gate, not a claim that future operational authorization already exists.
