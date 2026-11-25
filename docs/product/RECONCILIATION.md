# Fleetora — Phase 0 Reconciliation Audit

- **Date:** 2026-11-25
- **Baseline:** `main` at `8ac55ca3`, branch `docs/product-baseline`
- **Method:** read-only inspection of [backend/src/prisma/contract.prisma](../../backend/src/prisma/contract.prisma), the 10 migrations in `backend/migrations/app/`, backend modules/controllers, `frontend/app` + `frontend/features`, `apps/merchant_app` (Flutter), and test suite names. No code was run against a database; no tests were executed for this audit.
- **Authority:** see [README.md](README.md). AM-05 (merchant owner + optional limited employees) applies.

Legend: **IMPLEMENTED** = matches the docs, with evidence · **PARTIAL** = exists but incomplete · **MISSING** = not built · **CONFLICT** = code behaves differently from an approved source → listed as an **OWNER DECISION**; working code must not be silently changed.

Path shorthand: `be/` = `backend/src/modules/`, `it/` = `backend/test/` (disposable-PostgreSQL integration suites), `fe/` = `frontend/`, `app/` = `apps/merchant_app/lib/`.

---

## Repository facts that frame every area

- **Single backend:** NestJS modular monolith, Prisma contract schema (`contract.prisma`), PostgreSQL. Money is `BigInt` minor units (matches NFR "Financial correctness").
- **Web:** one Next.js company dashboard (`fe/app/app/*`). No platform-admin console.
- **Mobile:** only the **merchant** Flutter app exists (`apps/merchant_app`). **No driver app.**
- **AI:** no `ai/` service in the repo. `AIExecution` / `Notification` / `ProofOfDelivery` / `LocationEvent` models exist in the schema but are not used by any feature (only accessors in `be/prisma/prisma.service.ts`).
- **Roles:** fixed `UserRole` enum `PLATFORM_ADMIN | COMPANY_ADMIN | MERCHANT | ACCOUNTANT`; company capabilities are hard-coded in `capabilities()` in [be/parcels/parcel-domain.ts](../../backend/src/modules/parcels/parcel-domain.ts).
- **Drivers** are `Worker` records with **no login identity**; driver telemetry rejects every request until a trusted driver-auth adapter exists (`UnconfiguredDriverIdentityVerifier` in `be/fleet/driver-telemetry.service.ts`).

---

## 1. Identity / RBAC (FR-SE-01, §3 Actors, §3.1, AM-05)

### IMPLEMENTED
| Requirement | Evidence | Tests |
| --- | --- | --- |
| Password login, rate limits, revocable sessions, email verification, reset (FR-SE-01) | `be/auth/*`, `signin-rate-limiter.ts`, `recovery-rate-limiter.ts`, `token/refresh-token-verifier.ts` | `auth.signin.spec.ts`, `signin-rate-limiter.spec.ts`, `recovery-rate-limiter.spec.ts`, `auth-refresh.spec.ts`, `it/auth-concurrency.auth-integration.spec.ts` |
| Tenant isolation from persisted server identity, not token/body claims (§3.1, NFR Tenant security) | `parcel-domain.ts#company()`, store `write()` re-reads role/company | `it/parcel-http…` "returns scoped 404 for foreign merchants, parcels, drivers, returns and settlements", "rejects a persisted inactive identity even when its JWT is correctly signed"; `it/parcel-operations…` "rejects cross-company merchants, parcels, drivers…" |
| Company staff onboarding + deactivation, never zero admins | `be/staff/*`, `StaffInvitation` | `it/staff.auth-integration.spec.ts` (all 13 cases, e.g. "never leaves a company without an active administrator under concurrent mutual deactivation") |
| **AM-05** merchant OWNER + optional employees with limited permissions; finance only when granted | `MerchantMembership` (role `OWNER/EMPLOYEE`, `permissions` JSON, one active owner index), `be/merchant-access/merchant-access.types.ts` (`FINANCE_VIEW`, `SETTLEMENT_REQUEST` grants), `app/features/merchant_users/*`, `fe/features/merchant-access` | `it/merchant-access…` "separates employee financial grants and enforces revocation on the next request", "allows only one of two concurrent owner acceptances"; `it/merchant-portal…` "supports individual employee permissions without granting finances…" |

### PARTIAL
- **Role model:** only Company Admin and Accountant exist for staff. No *Operations staff* or *Warehouse staff* role; no customizable roles/permissions (§3.1 "Core company staff roles can be customized"). Accountant can collect/remit/draft/pay company-wide.
- **Membership foundation not live:** `CompanyMembership`, `PlatformAdminGrant`, `AuthorizationContextService` exist but no controller uses them ("legacy auth remains authoritative until approved cutover").
- **Audit:** `ShipmentHistory` and `MerchantAccessEvent` are recorded; there is no general append-only `AuditLog` or forensic access log (FR-SE-04).

### MISSING
- Driver login identity (blocks every driver-side requirement).
- Temporary scoped delegation (§3.1). Platform RBAC beyond `PLATFORM_ADMIN` (FR-PL-04).

### CONFLICT
- None against approved rules. (AM-05 matches current code.)

---

## 2. Merchants + agreements (FR-ME-01..08)

### IMPLEMENTED
| Requirement | Evidence | Tests |
| --- | --- | --- |
| Company-owned merchant record, invitation-based activation (FR-ME-01, part) | `Merchant`, `MerchantInvitation`, `be/merchants/business-merchants.controller.ts`, `be/merchant-access/*` | `it/merchant-access…` "activates an owner and denies token replay…", "rejects company staff and foreign merchant identifiers on invitation paths" |
| One active company per merchant user (FR-ME-01) | `MerchantMembership.userId @unique` | `it/merchant-access…` "denies cross-company existing identity attachment and merchant reassignment" |
| Allowed collection modes COD / PREPAID (FR-ME-04, part) | `Shipment.collectionMode` + `shipment_collection_mode` check | `it/merchant-pricing…` "preserves a prepaid zero collection and the merchant delivery charge" |

### PARTIAL
- **Saved named addresses (FR-ME-05):** merchant has a single `pickupAddress`; pickups carry their own address. No named pickup/return address book.
- **Termination (FR-ME-06):** only `Merchant.active` flag; no termination workflow that blocks new orders while keeping obligations open.
- **Service flags (FR-ME-04):** no per-merchant allow-list for COD/prepaid/urgent/partner.

### MISSING
- Reciprocal acceptance + pause/resume (FR-ME-01), post-exit historical read/export (FR-ME-07, AC-12, S-09), credit/debt limits (FR-ME-08).

### CONFLICT → OWNER DECISION
- **OD-07 Merchant company switch.** PRD S-09/FR-ME-07: merchant "affiliates to Company B" and keeps reading Company A history. Code: `MerchantMembership.userId @unique` and the `(userId, companyId)` FK to `User` (whose `companyId` is fixed) mean one login can only ever belong to one company; a merchant moving companies needs a new account, and old history is not reachable from it.

---

## 3. Pricing (FR-ME-02, FR-ME-03, FR-PL-06)

### IMPLEMENTED
| Requirement | Evidence | Tests |
| --- | --- | --- |
| Area/zone tariffs per plan, merchant discount, named promotion (FR-ME-02) | `DeliveryZone`, `MerchantPlan`, `PlanZoneTariff`, `be/merchant-pricing/pricing-engine.ts` | `pricing-engine.spec.ts`, `merchant-pricing.service.spec.ts`; `it/merchant-pricing…` "applies explicit tariff, merchant discount and named promotion without floating point" |
| Immutable shipment price snapshot (FR-ME-02, AC-01) | `Shipment.pricingPlanVersion/baseDeliveryFeeMinor/…` + `shipment_pricing_snapshot` DB check | `it/merchant-pricing…` "persists final150/fee15 … with an immutable fee snapshot"; `it/merchant-portal…` "…never changes historical terms after plan edits"; `it/phase-a…` "keeps legacy snapshots…" |
| Stale quote / concurrent tariff edit protection | company lock + revision checks | `it/merchant-pricing…` "serializes quote confirmation and concurrent tariff edits on the company lock"; `it/phase-a…` "rejects a stale quote, a merchant without a plan and a foreign zone" |

### PARTIAL
- **Tariff history (FR-ME-03 "retain prior prices"):** plans/tariffs are edited in place (`revision` counter); prior prices survive only inside shipment snapshots, not as tariff versions.

### MISSING
- Effective-dated tariff versions (`MerchantTariffVersion` concept).

### CONFLICT → OWNER DECISION
- **OD-01 Tariff change approval (BR-094, verbatim):** "تعديل أسعار التاجر بموافقة شركة التوصيل والتاجر، مع تاريخ سريان محدد وحفظ نسخ الاتفاقية والأسعار القديمة للطرود السابقة." Code: company admin `PATCH /merchant-pricing/plans/:id`, `PUT …/tariffs/:zoneId`, `PUT …/merchants/:id/plan` take effect immediately, with no merchant approval and no effective date.
- **OD-02 Currency (FR-PL-06):** "Single base currency per company." Code: currency is per merchant/zone/plan/shipment with `ILS | USD | EUR | JOD` allowed (`merchant_terms_policy`, `shipment_fee_policy` checks); a company can hold several currencies.

---

## 4. Shipments + states (FR-SH-01..10, §6)

### IMPLEMENTED
| Requirement | Evidence | Tests |
| --- | --- | --- |
| Merchant and staff creation, actual actor kept (FR-SH-01) | `Shipment.requestedBy`; `be/merchant-portal/merchant-parcels.service.ts#create`, `be/parcels/parcel-operations.repository.ts#saveParcel` | `it/merchant-portal…` "accepts an invitation, signs in … and persists final150/fee15…"; `it/parcel-http…` "completes merchant, parcel, delivery…" |
| City + address required, GPS optional (FR-SH-02) | `Shipment.city/destination`, `shipment_coordinates` check | `parcel.dto.spec.ts`, `it/merchant-portal…` "…blocks zone/city mismatch…" |
| Unique tracking ID + QR label PDF, description/weight/pieces (FR-SH-05) | `trackingNumber @unique` (`FL-…`), `GET /merchant/parcels/:id/label`, `app/features/labels/label_pdf.dart` (QR) | merchant app tests under `apps/merchant_app/test` |
| Event history (FR-SH-06, part) | `ShipmentHistory`, `GET /parcels/:id/events` | `parcel-store.spec.ts`, `parcel-query.spec.ts` |
| Excel import with preview, row validation, idempotency (FR-SH-04, part) | `MerchantImport` (`digest` unique), `be/merchant-portal/merchant-imports.service.ts` | `merchant-imports.spec.ts`; `it/merchant-portal…` "previews Excel row errors, imports valid rows exactly once…" |
| Pre/post-pickup corrections via request + review with old/new values (FR-SH-08, part) | `MerchantParcelRequest` (`AMEND/CANCEL`, `previous/proposed`), `be/merchant-portal/merchant-requests.*`, `fe/features/merchant-requests` | `it/merchant-portal…` "requires an auditable company pricing approval after receipt and routes cancellation through controlled return", "allows rejecting an unpriceable amendment…" |
| Paginated server-side search/filters (FR-SH-09, part) | `be/parcels/parcel-filters.ts` | `parcel-query.spec.ts`, `fe/features/operations/operations.*.spec.ts` |
| Explicit, guarded transitions; optimistic revision | `TRANSITIONS`, `assertTransition`, `assertRevision` in `parcel-domain.ts` | `parcel-domain.spec.ts` |

### PARTIAL
- **Import (FR-SH-04):** `.xlsx` only; no CSV, no column mapping, no external API intake.
- **Timeline (FR-SH-06):** no separation of customer-visible simplified timeline vs internal record.
- **Search (FR-SH-09):** no saved views, export, or bulk operational updates.
- **Corrections (FR-SH-08):** no post-delivery non-financial correction flow.

### MISSING
- Customer tracking link (FR-SH-07), archive of closed shipments (FR-SH-10).

### CONFLICT → OWNER DECISION
- **OD-10 Priority values (FR-SH-05):** PRD "optional priority (normal/high/urgent)". Code enum `ShipmentPriority` has `LOW | NORMAL | HIGH | URGENT`.

---

## 5. Custody + tasks (FR-OP-03..07, FR-OP-10, FR-DR-01, §6, AC-03)

### IMPLEMENTED
| Requirement | Evidence | Tests |
| --- | --- | --- |
| Custody stored separately from status and assignment | `Shipment.custody/locationLabel/locationSource`, `ShipmentHistory.custody` | `it/parcel-operations…` "records structured failure, return custody…" |
| Assignment alone does not move custody (AC-03) | `parcel-operations.repository.ts#assignment` sets only `workerId` + status | `it/phase-a…` "suspended drivers … rejected for pickups and assignment" |
| Reassignment cannot silently clear driver custody (FR-OP-10) | `assignment()` → "Record the current driver handback before reassigning the parcel" | covered in `it/parcel-operations…` cross-company/driver cases |
| Direct delivery without warehouse (FR-OP-04, AC-02 part) | `RECEIVED_FROM_MERCHANT → ASSIGNED → OUT_FOR_DELIVERY → DELIVERED` | `it/merchant-portal…` "groups pickup preferences, requires actual receipt, delivers directly without warehouse…" |
| Optional warehouses, archived warehouses not linkable | `Warehouse.archivedAt`, `receivingWarehouse()` lock | `it/phase-a…` "requires an active own warehouse…", `it/warehouses.auth-integration.spec.ts` |

### PARTIAL
- **Custody record:** one projection column; no `CustodyTransfer` entity with giver/receiver confirmation.
- **Driver box (FR-DR-01):** not exposed (no driver app/identity).

### MISSING
- Task acceptance/rejection and company policy for direct-vs-acceptance assignment (FR-OP-06/07), driver-to-driver transfer (FR-OP-04), nearby suggestions (FR-OP-05, AM-03), absence impact view (FR-DR-03).

### CONFLICT → OWNER DECISION
- **OD-03 Custody without confirmed handover.** PRD §6: "physical custody changes only on confirmed handover"; FR-OP-03 "scan alone does not transfer custody". Code: the staff `OUT_FOR_DELIVERY` transition sets `custody = 'DRIVER'` automatically, and `POST /parcels/:id/location` lets an admin set custody to `DRIVER/COMPANY/WAREHOUSE` directly; neither requires the driver to confirm.
- **OD-09 Assignment as a status.** FR-OP-06: "Keep task assignment … and shipment status distinct." Code: assignment writes `status = 'ASSIGNED'` (a `ShipmentStatus`), so assignment and status are coupled.

---

## 6. Pickups (FR-OP-01..03)

### IMPLEMENTED
| Requirement | Evidence | Tests |
| --- | --- | --- |
| Merchant pickup requests, ad hoc with preferred window, batched parcels (FR-OP-01) | `PickupRequest`, `PickupParcel`, `be/merchant-portal/merchant-pickups.service.ts`, `app/features/pickups/*`, `fe/features/pickups` | `it/merchant-portal…` "groups pickup preferences, requires actual receipt…"; `fe/features/pickups/workflows.*.spec.ts` |
| Partial completion per parcel (RECEIVED/MISSING/DISCREPANT) | `PickupParcel.receipt` + `pickup_parcel_receipt` check | `it/merchant-portal…` "keeps warehouse drop-off pending until authorized staff confirm each actual arrival" |
| One active pickup claim per parcel (FR-OP-01) | `one_active_pickup_per_parcel` unique partial index | `parcel-contract.spec.ts` |
| Warehouse drop-off alternative | `method IN ('COMPANY_PICKUP','WAREHOUSE_DROPOFF')` | as above |

### PARTIAL
- **Receipt confirmation** is by company staff in the web dashboard, not by the driver; no barcode/QR scan operation (FR-OP-03).

### MISSING
- Scheduled/recurring pickups; driver adding parcels to a pickup task, direct or approval-gated (FR-OP-02, FR-OP-07).

### CONFLICT
- None.

---

## 7. Returns / exchange (FR-EX-05..08, S-05, S-06)

### IMPLEMENTED
| Requirement | Evidence | Tests |
| --- | --- | --- |
| Return record with reason, staged handoff, return fee posted once on merchant handoff | `ParcelReturn`, `be/parcels/returns.controller.ts`, `parcel-ledger.ts` | `it/parcel-operations…` "records structured failure, return custody, and exactly one merchant handoff fee…"; `it/parcel-http…` "records a failed attempt and both return handoff stages…" |
| Failed attempt ≠ automatic return (FR-EX-01) | return is an explicit `POST /returns` | `parcel-attempts.spec.ts` |
| Cancellation after pickup via approval + return (FR-EX-05) | merchant `CANCEL` request → staff review → return | `parcel-cancellation.spec.ts`; `it/merchant-portal…` "…routes cancellation through controlled return" |

### MISSING
- Post-delivery return/exchange as a linked new request (FR-EX-06), exchange leg policy (FR-EX-07), damage/loss incidents (FR-EX-08), reattempt-limit policy (S-05).

### CONFLICT → OWNER DECISION
- **OD-08 Return routing and closure.** PRD §6: "A returned parcel is closed only when the merchant acknowledges physical receipt, regardless of direct or warehouse routing." Code: `TRANSITIONS` force `RETURN_IN_PROGRESS → RETURNED_TO_WAREHOUSE → RETURNED_TO_MERCHANT` (no direct driver→merchant return), and the final handoff is recorded by company staff, not acknowledged by the merchant. `ParcelReturn.shipmentId @unique` also allows only one return per parcel ever.

---

## 8. Obstacles (FR-EX-01..04, AM-04, S-02, AC-05)

### IMPLEMENTED
| Requirement | Evidence | Tests |
| --- | --- | --- |
| Failed attempts recorded with required reason, actor, time | `ParcelAttempt`, `parcel-operations.repository.ts#recordAttempt` | `parcel-attempts.spec.ts` |
| Reattempt is an explicit action (FR-EX-04) | `FAILED_DELIVERY → OUT_FOR_DELIVERY` transition | `parcel-domain.spec.ts` |

### PARTIAL
- **Failure reasons (FR-EX-01):** free text; no standard list + company-custom categories (return reasons are a fixed list, attempts are not).

### MISSING
- The whole AM-04 workflow: Obstacles queue for company and merchant, merchant resolution note/contact correction, `Resolved / Ready for Retry` state.

### CONFLICT
- None.

---

## 9. COD + cashboxes (FR-SH-03, FR-FI-01..09, AM-01, AM-02)

### IMPLEMENTED
| Requirement | Evidence | Tests |
| --- | --- | --- |
| Exact full COD collection per parcel; customer-paid fees included | `CodCollection`, `collectionTotal()`, `assertFullAmount()` | `it/parcel-operations…` "credits only goods when customer pays company delivery and service charges", "requires collection of customer-paid charges even when the goods COD is zero" |
| Idempotent money commands (NFR Consistency) | `MonetaryRequest` (`companyId,key` unique + payload hash) | `it/parcel-operations…` "retries monetary actions exactly once and rejects payload changes and duplicate collection keys" |
| Atomic posting with rollback | store transactions | `it/parcel-operations…` "rolls back a collection and leaves its retry key usable when goods posting fails" |

### PARTIAL
- **Remittance:** `CashRemittance` exists (company receives collected cash) but is one-sided, staff-recorded, and not tied to a driver liability balance.

### MISSING
- Accountant cashboxes, company computed total, cashbox transfers (AM-01, FR-FI-01/02, S-04, AC-06).
- Driver-held COD liability, two-sided handover evidence, handover disputes (FR-FI-03/04).
- Delegated payee payment tasks and funding reservation (AM-02, FR-FI-05..08, S-03, AC-07/08).
- Expense approval / period close (FR-FI-09).

### CONFLICT → OWNER DECISION
- **OD-04 Delivery vs COD.** FR-SH-03 / AC-04: "delivery requires full COD collection". Code: `DELIVERED` is recorded first; `POST /collections` then requires `status = 'DELIVERED'`. A COD parcel can sit in `DELIVERED` with no collection (the dashboard lists "delivered, uncollected" parcels).
- **OD-05 Partial remittance.** FR-FI-03: "partial remittance with two-sided evidence". Code: remittance must equal the full collection (`assertFullAmount`) and one remittance per collection (`collectionId @unique`); covered by test "rejects partial collection, remittance and payment".

---

## 10. Merchant settlements (FR-ST-01..04)

### IMPLEMENTED
| Requirement | Evidence | Tests |
| --- | --- | --- |
| Proceeds = COD goods − delivery/return fees from snapshots (FR-ST-01) | `MerchantLedgerEntry` (`GOODS/DELIVERY_FEE/RETURN_FEE/ADJUSTMENT/REVERSAL`, `postingKey` unique), `settlementTotals()` | `it/phase-a…` "quotes and stores 150 final / 15 fee, collects 150 and settles 135"; `it/merchant-portal…` "…exposes135 for settlement only after company remittance" |
| Prepare/approve separate from actually paid, with payment proof (FR-ST-02/04) | `MerchantSettlement` `DRAFT → FINALIZED (admin) → PAID` + `SettlementPayment(method, reference, paidAt)` | `it/parcel-operations…` "completes the full delivery, separate cash remittance, admin approval and actual payout…"; `it/parcel-http…` "permits accountant reads while refusing … settlement approval despite forged administrator claims" |
| Append-only adjustments with reversal | `POST /financial/adjustments`, `…/reversal` | `it/parcel-operations…` cases; `fe/features/operations/money.action.spec.ts` |
| Merchant statement + settlement requests (owner/granted employee) | `GET /merchant/statement`, `MerchantSettlementRequest`, `app/features/settlements`, `app/features/accounting` | `it/merchant-portal…` "isolates settlement request history…", "requires current FINANCE_VIEW membership…" |

### PARTIAL
- **Schedules (FR-ST-02):** settlements are on demand only; no per-merchant daily/weekly/monthly schedule.
- **Merchant debt / prepaid billing (FR-ST-01, FR-ST-04):** `settlement_amount` check requires `netPayableMinor > 0`, so a period where the merchant owes the company cannot be settled or invoiced.

### MISSING
- Carry-forward, credit/debt controls, disputed-amount-only holds (FR-ST-03); invoices.

### CONFLICT → OWNER DECISION
- **OD-06 Partial settlement payment.** FR-ST-03: "Support partial settlements". Code: payment must equal the full net payable (`assertFullAmount`) and `SettlementPayment.settlementId @unique` allows one payment per settlement.

---

## 11. Driver finance (FR-CP-01..06, FR-DR-07, S-07, AC-09)

### IMPLEMENTED / PARTIAL
- None. (`Worker.successRate` is the only performance field.)

### MISSING
- Salary/commission policy, commission pools and 100% split, corrections, advances, wage payments, driver earnings statements.

### CONFLICT
- None.

---

## 12. Driver app + GPS (FR-DR-02..06, FR-GP-01..03, FR-OP-08)

### IMPLEMENTED
| Requirement | Evidence | Tests |
| --- | --- | --- |
| Driver records, suspend/reactivate (FR-DR-02 part) | `Worker`, `be/drivers/*`, `fe/features/drivers` | `it/driver-records…` "suspends idempotently and reactivates to offline"; `drivers.*.spec.ts` |
| One vehicle per driver, basic vehicle registry (FR-DR-04) | `Worker.vehicleId @unique`, `be/vehicles/*` | `vehicles*.spec.ts`, `it/vehicle-deletion.auth-integration.spec.ts` |
| Live location: consented sharing session, ordering/frequency/jump rejection, capture vs receive time (FR-GP-01/02 part) | `DriverTrackingState`, `be/fleet/telemetry-policy.ts`, `fleet.gateway.ts`, `fe/app/app/live-map` | `it/fleet-tracking…` "rejects duplicates/out of order/frequency/jumps…", "stops sharing without erasing last known coordinates…"; `telemetry-policy.spec.ts`; `fe/features/fleet/*.spec.ts` |
| Live view restricted to authorized company staff (FR-GP-03 part) | socket tickets, persisted role check | `it/fleet-tracking…` "enforces persisted role and company rather than stale token claims" |

### PARTIAL
- **Ingestion disabled:** "denies all driver ingestion until a trusted auth adapter is configured" (test in `it/fleet-tracking…`). Only the latest point is stored; no path/trip/stop history and no historical-access permission (FR-GP-01/03).
- **Driver availability (FR-DR-05):** `WorkerStatus` is `ACTIVE | OFFLINE | ON_BREAK | SUSPENDED`, set by staff; no driver-chosen available/busy.

### MISSING
- Flutter driver app, driver authentication, task list, custody box, POD capture (`ProofOfDelivery` unused; FR-OP-08), pre-payment inspection (FR-OP-09), limited offline queue (FR-DR-06).

### CONFLICT
- None.

---

## 13. Partners (FR-OP-04 partner part, FR-ST-05, §3 Partner)

### MISSING
- Entirely: no partner entity, agreement, handoff or partner settlement.

---

## 14. AI (FR-AI-01..07, S-08, AC-10)

### PARTIAL
- Legacy schema only: `AIExecution`, `AIAgentType`, `AIExecutionStatus` (with `WAITING_FOR_APPROVAL`) exist but are unused, and `AIExecution` has no `companyId` (would need tenant scoping before use).

### MISSING
- AI service, provider governance, agents, entitlements, quotas, schedules, proposal/approval/revalidation, AI audit.

### CONFLICT
- None.

---

## 15. Platform admin / subscriptions (FR-PL-01..06)

### IMPLEMENTED
| Requirement | Evidence | Tests |
| --- | --- | --- |
| Main company admin mandatory, never zero admins (FR-PL-01 part) | signup creates `COMPANY_ADMIN` atomically; staff last-admin guard | `auth.service.spec.ts`; `it/staff…` "refuses self-deactivation, including for the only active administrator" |
| Suspended company blocks access paths | `Company.suspended` | `it/staff…` "refuses acceptance for a suspended company…"; `it/fleet-tracking…` "rejects inactive, unverified and suspended principals" |

### PARTIAL
- `Company.plan` enum (`TRIAL/BASIC/PRO/ENTERPRISE`) and `PlatformAdminGrant` table exist, but no platform endpoints or console use them.

### MISSING
- Platform approval flow, plan feature flags/limits/overrides, subscription billing, grace rules, support-access grants, announcements, platform audit/search (FR-PL-02..05).

### CONFLICT → OWNER DECISION
- **OD-11 Company registration.** FR-PL-01: "Company can request registration; platform may approve or create company directly". Code: public `POST /auth/signup` immediately creates an active `TRIAL` company plus its `COMPANY_ADMIN` (`auth.repository.ts#createUserWithDefaultCompany`); there is no platform approval step.

---

## Summary counts

Counted as line items in the sections above (one table row or bullet each; a MISSING bullet may group several related requirements).

| Area | Implemented | Partial | Missing | Conflict |
| --- | --- | --- | --- | --- |
| 1 Identity/RBAC | 4 | 3 | 2 | 0 |
| 2 Merchants + agreements | 3 | 3 | 1 | 1 |
| 3 Pricing | 3 | 1 | 1 | 2 |
| 4 Shipments + states | 8 | 4 | 1 | 1 |
| 5 Custody + tasks | 5 | 2 | 1 | 2 |
| 6 Pickups | 4 | 1 | 1 | 0 |
| 7 Returns/exchange | 3 | 0 | 1 | 1 |
| 8 Obstacles | 2 | 1 | 1 | 0 |
| 9 COD + cashboxes | 3 | 1 | 4 | 2 |
| 10 Settlements | 4 | 2 | 1 | 1 |
| 11 Driver finance | 0 | 0 | 1 | 0 |
| 12 Driver app + GPS | 4 | 2 | 1 | 0 |
| 13 Partners | 0 | 0 | 1 | 0 |
| 14 AI | 0 | 1 | 1 | 0 |
| 15 Platform/subscriptions | 2 | 1 | 1 | 1 |
| **Total** | **45** | **22** | **19** | **11** |

## OWNER DECISIONS (ranked by impact)

| # | Decision needed | Docs say | Code does |
| --- | --- | --- | --- |
| OD-01 | Tariff change approval | BR-094: merchant + company approval, effective date, keep versions | Admin edits apply immediately, no merchant approval/effective date |
| OD-02 | Currency model | FR-PL-06: one base currency per company | Per-merchant/shipment currency, 4 allowed |
| OD-03 | Custody transfer | Only on confirmed handover | Staff transition / location endpoint sets `DRIVER` custody directly |
| OD-04 | Delivery vs COD | Delivery requires full COD collection | Delivered first, COD collected later |
| OD-05 | Partial driver remittance | Allowed with two-sided evidence | Full amount only, one per collection |
| OD-06 | Partial settlement payment | Allowed | Full net payable only, one payment |
| OD-07 | Merchant company switch | Merchant can move and keep history | One login = one company forever |
| OD-08 | Return routing/closure | Direct or warehouse; merchant acknowledges | Warehouse stage forced; staff records handoff; one return per parcel |
| OD-09 | Assignment vs status | Distinct concepts | `ASSIGNED` is a shipment status |
| OD-10 | Priority values | normal/high/urgent | LOW/NORMAL/HIGH/URGENT |
| OD-11 | Company registration | Request + platform approval, or platform creates | Self-signup creates active TRIAL company |

## Proposed phase order (reuse, don't rebuild)

1. **Phase 1 — Owner decisions + identity gaps.** Resolve OD-01..OD-11 first; they change what later phases build. Then add the missing staff roles (Operations, Warehouse) on top of the existing capability map, a **driver identity** that plugs into the existing `DriverIdentityVerifier` seam, and platform approval/plan flags using the existing `Company.plan`/`suspended` and `PlatformAdminGrant`.
2. **Phase 2 — Custody + obstacles on the existing parcel core.** Add confirmed custody handover (OD-03), task acceptance policy, and the AM-04 Obstacles queue/merchant resolution using `ParcelAttempt`, `ShipmentHistory` and the merchant app. Reuse transitions, revisions and the pickup receipt model.
3. **Phase 3 — Flutter driver app.** New app beside `apps/merchant_app`, reusing its networking/auth/localization patterns: tasks, custody box, pickup receipt, POD (`ProofOfDelivery`), COD capture, limited offline; turns on the already-built telemetry pipeline.
4. **Phase 4 — Cash: driver COD liability, accountant cashboxes, transfers, delegated payment tasks.** Build on `CodCollection`, `CashRemittance`, `MonetaryRequest` idempotency and the append-only ledger pattern.
5. **Phase 5 — Settlements depth.** Schedules, carry-forward, debt/invoice, partial payments (per OD-06), on the existing `MerchantSettlement` + ledger.
6. **Phase 6 — Returns/exchange depth, then partners.** Linked post-delivery returns/exchange and incidents on `ParcelReturn`; partner entities last.
7. **Phase 7 — Driver compensation, GPS history, reports/archive.**
8. **Phase 8 — AI governance**, replacing the unused `AIExecution` stub with a tenant-scoped design.
