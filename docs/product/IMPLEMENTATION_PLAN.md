# Fleetora — Implementation Plan

- **Date:** 2026-11-25
- **Inputs:** [RECONCILIATION.md](RECONCILIATION.md) (what exists), [DECISIONS.md](DECISIONS.md) (OD-01..OD-13), [TRACEABILITY.md](TRACEABILITY.md) (status per rule).
- **Principle:** reuse, don't rebuild. Every phase extends the existing NestJS modules, Prisma contract schema, Next.js dashboard and merchant Flutter app. Migrations are additive-only.
- **Ordering constraints from the owner:** OD-02 and OD-13 early; OD-07 last, and no earlier phase may block it.
- **Every phase:** plan first (rule IDs, files, migrations, tests, risks) and wait for approval; tests first, including rejection, permission, cross-tenant and concurrency cases for money and custody; update [TRACEABILITY.md](TRACEABILITY.md).
## Phase 1 — Merchant activation, company currency and priority values

- **Goal:** a staff-created merchant stays PENDING until it accepts the invitation and agreement; each company operates in exactly one currency; parcel priority is `NORMAL | HIGH | URGENT` only.
- **Rule IDs:** OD-13 (BR-002, BR-093), OD-02 (BR-066, FR-PL-06), OD-10 (BR-083, FR-SH-05), FR-ME-01.
- **Reuses:** `Merchant`, `MerchantInvitation`, `MerchantMembership`, `be/merchant-access/*`, `be/parcels/parcel-operations.repository.ts#saveMerchant`, existing currency check constraints, `ShipmentPriority`.
- **Depends on:** none.
- **Exit criteria:** parcel creation, COD collection and settlement are rejected for non-ACTIVE merchants (staff and merchant paths); activation requires recorded merchant acceptance of the agreement; a company has one currency and mismatching merchant/plan/zone/shipment currency is rejected; existing `LOW` parcels are migrated to `NORMAL` by an owner-approved, additive-safe migration with a test, and `LOW` is rejected on every create/update/import path; existing data migration path documented and additive; cross-tenant and concurrent-acceptance tests pass.

## Phase 2 — Staff roles and driver identity

- **Approved split (2026-11-26):** Phase 2a now: built-in staff roles (BR-042 built-in part, BR-043), driver phone/password identity linked explicitly to existing Workers (BR-035), suspension and access/offboarding controls (BR-117, BR-118). Phase 2b deferred: company custom roles (BR-042 custom part) and delegation (BR-044). No driver app in 2a.
- **2a rollout:** additive role/check expansion; existing Admin/Accountant identities retain current access, Workers stay unlinked until invited. Persisted actor enforcement on requests and inside write transactions; role assignment keeps one role and the last-admin guard. Separate staff and driver changes into reviewable PRs when needed.
- **2a verification:** role allow/deny matrix, persisted-role drift and privilege escalation, cross-company IDs, last-admin concurrency; driver phone normalization/uniqueness, invitation expiry/replay/revocation/concurrent acceptance, session revocation, suspension/offboarding task rejection and unchanged custody/COD history. Disposable PostgreSQL migration/strict verification only; no shared database migration.

- **Goal:** missing company roles on top of the existing capability map, and a driver login identity plugged into the existing verifier seam.
- **Rule IDs:** §3.1 (Operations, Warehouse staff roles), FR-SE-01 (driver), BR-027, BR-035.
- **Reuses:** `UserRole`, `capabilities()` in `be/parcels/parcel-domain.ts`, `be/auth/*`, `DriverIdentityVerifier` seam in `be/fleet/driver-telemetry.service.ts`, `Worker`.
- **Depends on:** Phase 1.
- **Exit criteria:** each new role has allowed/denied tests per endpoint; a driver can authenticate and is bound to one `Worker` in one company; telemetry ingestion accepts only verified drivers; cross-company driver attempts are denied.

## Phase 3 — Platform admin and company approval

- **Goal:** self-registered companies stay PENDING until a platform admin approves; platform admin can create companies directly.
- **Rule IDs:** OD-11 (BR-045, FR-PL-01), BR-048, FR-PL-02..05 (approved scope only).
- **Reuses:** `Company.plan`, `Company.suspended`, `PlatformAdminGrant`, `auth.repository.ts#createUserWithDefaultCompany`.
- **Depends on:** Phase 2.
- **Exit criteria:** a PENDING company cannot operate; approval and direct creation are platform-admin only and audited; company users cannot reach platform endpoints; support access requires company approval and is read-only by default.

## Phase 4 — Pricing versions and two-party approval

- **Goal:** price changes become effective-dated tariff versions that need company and merchant approval.
- **Rule IDs:** OD-01 (BR-094), FR-ME-03.
- **Reuses:** `MerchantPlan`, `PlanZoneTariff`, `be/merchant-pricing/pricing-engine.ts`, the shipment price snapshot and company lock.
- **Depends on:** Phase 1.
- **Exit criteria:** an unapproved or future-dated change never prices a parcel; prior versions are retained; existing parcels keep their snapshots; concurrent edit/approval and cross-tenant tests pass.

## Phase 5 — Custody, tasks and obstacles

- **Goal:** custody moves only on confirmed receipt; assignment becomes a task separate from parcel status; AM-04 obstacles workflow.
- **Rule IDs:** OD-03 (BR-018, BR-020, BR-120, BR-122, AM-02), OD-09 (BR-120), FR-OP-03, FR-OP-04, FR-OP-06, FR-OP-07, FR-OP-10, AM-04, FR-EX-01, S-02, AC-03, AC-05.
- **Reuses:** `Shipment.custody`, `ShipmentHistory`, `TRANSITIONS` / `assertRevision`, `PickupParcel.receipt`, `ParcelAttempt`, merchant app.
- **Depends on:** Phase 2.
- **Exit criteria:** no staff transition or location endpoint sets custody without receiver confirmation; `ASSIGNED` is no longer used as the assignment record (existing data handled by an additive migration); reassignment, driver-to-driver transfer and concurrent confirmation tests pass; obstacles visible to company and merchant with resolution.

## Phase 6 — Flutter driver app

- **Goal:** driver app for tasks, custody box, pickup receipt, delivery with POD and COD, limited offline.
- **Rule IDs:** FR-DR-01, FR-DR-05, FR-DR-06, FR-OP-08, FR-OP-09, FR-GP-01.
- **Reuses:** `apps/merchant_app` networking/auth/localization patterns, `ProofOfDelivery`, telemetry pipeline.
- **Depends on:** Phases 2 and 5.
- **Exit criteria:** driver flows run against the real backend contract; offline queue replays idempotently; app tests and real-device or browser verification pass.

## Phase 7 — Finance: COD, driver cash, cashboxes, maker-checker

- **Goal:** delivery and full COD confirmed in one driver action; driver cash liability with partial handovers; accountant cashboxes and delegated payments; threshold-based second approver.
- **Rule IDs:** OD-04 (BR-098, BR-088, BR-021), OD-05 (BR-033, BR-108, BR-109), OD-12 (BR-009, BR-012), AM-01, AM-02, FR-SH-03, FR-FI-01..09, BR-061, AC-04, AC-06..08.
- **Reuses:** `CodCollection`, `CashRemittance`, `MonetaryRequest` idempotency, append-only ledger, `parcel-ledger.ts`.
- **Depends on:** Phases 5 and 6.
- **Exit criteria:** a COD parcel cannot be DELIVERED without full COD; driver balance = collected − confirmed handovers − authorized AM-02 use; above-threshold money actions require a different approver, below-threshold ones are flagged in the audit log; rejection, permission, cross-tenant and concurrency tests pass.

## Phase 8 — Merchant settlements depth

- **Goal:** partial settlement payments, schedules, carry-forward, merchant debt and disputes.
- **Rule IDs:** OD-06 (BR-010, BR-090), FR-ST-01..04, BR-060.
- **Reuses:** `MerchantSettlement`, `SettlementPayment`, `MerchantLedgerEntry`, merchant statement endpoints and app screens.
- **Depends on:** Phase 7.
- **Exit criteria:** several payments per settlement never exceed net payable; approval stays distinct from payment; concurrent payment and cross-tenant tests pass.

## Phase 9 — Returns and exchange

- **Goal:** direct or via-warehouse returns that complete only on merchant confirmation; multiple returns per parcel with one active at a time; post-delivery return/exchange and incidents.
- **Rule IDs:** OD-08 (BR-023, BR-104, BR-096), FR-EX-05..08, S-05, S-06.
- **Reuses:** `ParcelReturn`, `be/parcels/returns.controller.ts`, return fee posting, custody handover from Phase 5.
- **Depends on:** Phase 5 (custody + parcel lifecycle; owner-confirmed for OD-08); Phase 7 for the return-fee and cash parts.
- **Exit criteria:** a second active return is rejected (including concurrently); each return links to the original parcel; the return fee posts exactly once; merchant confirmation is required to close.

## Phase 10 — Partners, driver compensation, GPS history, reports

- **Goal:** remaining approved operational scope.
- **Rule IDs:** FR-OP-04 (partner), FR-ST-05, FR-CP-01..06, FR-DR-07, S-07, AC-09, FR-GP-01..03 (history), FR-SH-07, FR-SH-10, BR-032, BR-036, BR-068, BR-070, BR-074, BR-077, BR-082, BR-086, BR-087.
- **Depends on:** Phases 7 and 8.
- **Exit criteria:** per sub-scope, defined in its own approved plan.

## Phase 11 — AI governance

- **Goal:** tenant-scoped AI service using controlled backend interfaces with approval and audit.
- **Rule IDs:** FR-AI-01..07, S-08, AC-10.
- **Reuses:** replaces the unused `AIExecution` stub with a tenant-scoped design.
- **Depends on:** Phases 3 and 7.
- **Exit criteria:** tool authorization, tenant context, approval and audit tests pass; the logistics core works with AI disabled.

## Phase 12 (LAST) — Merchant company switch

- **Goal:** a merchant may move to another company; prior history is read/export only; no obligations transfer.
- **Rule IDs:** OD-07 (BR-001, BR-092, BR-126), FR-ME-07, AC-12, S-09.
- **Reuses:** `MerchantMembership`, merchant statement and export paths.
- **Depends on:** all earlier phases.
- **Design guard for earlier phases:** do not add new schema or code that ties a merchant login permanently to one company or makes historical records reachable only through the current membership.
- **Exit criteria:** the merchant reads/exports old-company history without write access; the old company keeps its records and obligations; no cross-tenant leak in either direction.
