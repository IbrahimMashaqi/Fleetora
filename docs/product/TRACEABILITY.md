# Fleetora — Traceability

Maps each rule / functional requirement to its implementation and tests. Initial fill from [RECONCILIATION.md](RECONCILIATION.md) (2026-11-25, read-only audit; tests were not executed for that audit). Update this file for every rule implemented.

- **Status:** `done` = matches the approved sources · `partial` = exists but incomplete, or conflicts with an owner decision in [DECISIONS.md](DECISIONS.md) · `missing` = not built.
- **Paths:** `be/` = `backend/src/modules/`, `it/` = `backend/test/` (disposable-PostgreSQL integration suites), `fe/` = `frontend/`, `app/` = `apps/merchant_app/lib/`. Unit specs sit next to their source in `be/`.
- Test names are quoted as `file › "test name"`; `…` marks a name shortened in the audit.

## Identity / RBAC

BR-035 / BR-043 access-panel regression (`fix/driver-access-load`, `55390eb0`, 2026-11-26): the Windows launcher now opens the same IPv4 Docker endpoint it probes (`http://127.0.0.1:3000`); a separate IPv6 development API reached through `localhost` returned 404 for `/drivers/:id/access`. `be/drivers/driver-identity.repository.ts` reports normalized-phone account collisions without linking duplicate-phone Workers or disclosing the other account. `fe/features/drivers/driver-access.*` and `components/driver-access.tsx` keep the panel readable and explain invitation blocks in English/Arabic; `components/driver-details.tsx` refreshes access after a phone edit. No schema migration or running-container restart was required.

Regression verification: 17 passed in `it/driver-identity.auth-integration.spec.ts` on owned disposable PostgreSQL (duplicate Workers, own/global account collisions, foreign Worker rejection, invalid legacy phones and existing identity/security cases); 14 passed in `fe/features/drivers/driver-access.action.spec.ts` (public response contract, permissions, tenant checks and additive rollout); 6 passed in `fe/features/drivers/driver-identity.browser.spec.ts` through the isolated browser harness (English/Arabic conflict messages, phone correction and existing activation/access flows); 3 passed in `scripts/fleetora.test.cjs` (mocked launcher execution for local, Neon and Neon rebuild). Backend/frontend type checks and lint passed. The launcher tests mocked Docker, HTTP probes and browser opening; they did not restart the running stack.

Phase 2a verification (2026-11-26): 880 backend unit tests; 244 distinct PostgreSQL integration cases (243 in the full run plus the SDK-gated real Flutter browser case run with the configured toolchain); 9 full-AppModule E2E tests; 406 frontend action tests; 285 isolated browser tests; Flutter analyze clean and 80 Flutter tests passed. Type/lint checks and isolated production builds passed. Both additive migrations applied and strictly verified on owned loopback-only PostgreSQL; no shared database migration was applied. The real Flutter browser case exercised Flutter → actual Nest/PostgreSQL → company dashboard without API mocks.

| Rule / FR | Status | Code path | Test |
| --- | --- | --- | --- |
| FR-SE-01 (login, rate limits, sessions, verification, reset) | done | `be/auth/*` (`signin-rate-limiter.ts`, `recovery-rate-limiter.ts`, `token/refresh-token-verifier.ts`) | `auth.signin.spec.ts`, `signin-rate-limiter.spec.ts`, `recovery-rate-limiter.spec.ts`, `auth-refresh.spec.ts`, `it/auth-concurrency.auth-integration.spec.ts` |
| §3.1 / NFR Tenant security (identity from persisted server state) | done | `be/parcels/parcel-domain.ts#company()`, store `write()` | `it/parcel-http.auth-integration.spec.ts` › "returns scoped 404 for foreign merchants, parcels, drivers, returns and settlements", "rejects a persisted inactive identity even when its JWT is correctly signed"; `it/parcel-operations.auth-integration.spec.ts` › "rejects cross-company merchants, parcels, drivers…" |
| Company staff onboarding / deactivation, never zero admins | done | `be/staff/*`, `StaffInvitation` | `it/staff.auth-integration.spec.ts` › "never leaves a company without an active administrator under concurrent mutual deactivation" |
| BR-042 built-in roles / BR-043 (Phase 2a; custom roles deferred to 2b) | done (built-in part) | `be/parcels/parcel-domain.ts#capabilities`, persisted actor checks in `AccessTokenStrategy`, `ParcelStore.write`, `lockedFleetWrite`; `be/staff` one-role assignment + audit; `fe/features/staff`, operational permission controls | `be/parcels/phase2a-roles.spec.ts`; `it/staff.auth-integration.spec.ts` (role assignment, cross-company/forged actor, concurrent demotion); `it/parcel-operations.auth-integration.spec.ts` (four persisted role matrix); `fe/features/staff/staff.action.spec.ts`; `fe/features/staff/staff.browser.spec.ts` (12 passed, including new role assignment/invitations and Arabic layout) |
| BR-044 delegation / BR-042 custom roles | deferred to Phase 2b | Owner-approved Phase 2a split; no implementation in 2a | — |
| AM-05 (merchant owner + limited employees) | done | `MerchantMembership`, `be/merchant-access/merchant-access.types.ts`, `app/features/merchant_users/*`, `fe/features/merchant-access` | `it/merchant-access.auth-integration.spec.ts` › "separates employee financial grants and enforces revocation on the next request", "allows only one of two concurrent owner acceptances"; `it/merchant-portal.auth-integration.spec.ts` › "supports individual employee permissions without granting finances…" |
| §3.1 staff roles (Operations, Warehouse, customizable) | partial | `UserRole` enum; `capabilities()` in `be/parcels/parcel-domain.ts` | — |
| BR-009, BR-012 (maker-checker, OD-12) | partial | `capabilities()` in `be/parcels/parcel-domain.ts` | — |
| FR-SE-04 (audit / forensic log) | partial | `ShipmentHistory`, `MerchantAccessEvent`, Phase 2a `StaffAccessEvent` / `DriverAccessEvent` | `it/staff.auth-integration.spec.ts` (role-change audit); `it/driver-identity.auth-integration.spec.ts` (invitation/access lifecycle) |
| Membership foundation (`CompanyMembership`, `PlatformAdminGrant`) | partial | `AuthorizationContextService` (not wired) | `it/authorization-persistence.auth-integration.spec.ts` |
| BR-035 / BR-043 driver login identity (Phase 2a identity part) | done (identity part; no driver app) | `DriverAccount`, `DriverInvitation`, `User.authVersion`; `be/drivers/driver-identity.*`, `driver-auth.*`, `driver-phone.ts`; persisted access strategy and driver endpoint/refresh principal boundary; `be/fleet/driver-identity.verifier.ts`; `fe/app/driver/activate`, Route Handler `fe/app/api/driver/activate` (token/password kept out of Server Action argument logs), `fe/features/drivers` copy/wa.me controls | `be/drivers/driver-phone.spec.ts` (22 normalization/rejection cases); `it/driver-identity.auth-integration.spec.ts` (real HTTP, normalized-phone throttling and spoofed source rejection, expiry/replay/reissue/revocation, concurrent acceptance/phone collision, tenant FK, explicit Worker link, session version and persisted principal drift); `it/phase2a.migration-data.auth-integration.spec.ts` (old users/duplicate-phone Workers preserved and unlinked); `fe/features/drivers/driver-access.action.spec.ts`; `driver-identity.browser.spec.ts` (English/Arabic password activation, fragment privacy/change, WhatsApp URL, offboarding) |
| BR-117 / BR-118 suspension and offboarding (Phase 2a) | partial (2a access/task gates done; final settlement deferred) | Suspension remains `Worker.status`, requires a documented reason for new suspensions, and audits suspension/reactivation atomically; security revocation uses inactive driver identity + refresh revocation + session version; offboarding uses `Worker.offboardedAt`. New parcel/pickup/vehicle assignment gates; no custody/COD/history mutations. `DriverAccessEvent` audit | `be/drivers/driver-suspension.spec.ts`; `it/driver-records.auth-integration.spec.ts` (required reason, idempotence and audit); `it/driver-identity.auth-integration.spec.ts` (suspended login, immediate revocation including after reactivation, independent offboarding/recovery); `it/parcel-operations.auth-integration.spec.ts` › "BR-117/118 offboarding blocks new assignment without changing existing custody, COD or history" (concurrent offboarding/assignment); `fe/features/drivers/drivers.browser.spec.ts` (required reason before confirmation) |
| §3.1 temporary delegation; FR-PL-04 platform RBAC | missing | — | — |

## Merchants + agreements

| Rule / FR | Status | Code path | Test |
| --- | --- | --- | --- |
| FR-ME-01 (company-owned merchant, invitation activation) | done (activation part, OD-13) | `Merchant`, `MerchantInvitation`, `be/merchants/business-merchants.controller.ts`, `be/merchant-access/*` | `it/merchant-access.auth-integration.spec.ts` › "activates an owner and denies token replay…", "rejects company staff and foreign merchant identifiers on invitation paths" |
| FR-ME-01 (one active company per merchant user) | done | `MerchantMembership.userId @unique` | `it/merchant-access.auth-integration.spec.ts` › "denies cross-company existing identity attachment and merchant reassignment" |
| BR-002, BR-093 (mutual acceptance before ACTIVE, OD-13) | done | `Merchant.activationStatus` PENDING→ACTIVE, `legacyActivation`, `agreementAcceptedAt/ById`, `agreementTerms` (terms snapshot, Q11) + `merchant_activation_state` check; `be/merchant-access/merchant-agreement.ts`; `POST /merchant/invitations/preview`; OWNER acceptance with `acceptAgreement` + `agreementRevision` activates automatically (Q12); gates: `assertActiveMerchant` in `be/parcels/parcel-domain.ts` (staff parcel create/edit, COD collect, adjustments, settlement preview/draft), `MerchantAccessService.resolve` (all merchant-portal paths); migration `20261125T2029_phase1_merchant_activation` (existing merchants ACTIVE + legacy, Q13 option A); `fe/features/operations` one activation-aware merchant status + ACTIVE-only pickers, `operations.server.ts` forwards the activation filter; `app/features/auth/auth_pages.dart` agreement step; `be/merchant-access/merchant-access.service.ts` HTTPS web invitation URL with fragment token (email + copy-link), `fe/app/merchant/activate/page.tsx` public client-only app handoff and bilingual code fallback | `merchant-access.service.spec.ts`; `mail/invitation-email.spec.ts`; `fe/features/merchant-access/merchant-invitations.action.spec.ts` (safe web URL + ownership checks); `fe/features/merchant-access/merchant-invitations.browser.spec.ts` (English/Arabic status, Balance, copy-link, app handoff, malformed fragments, no token in HTTP requests); `parcels/merchant-activation.spec.ts`; `parcels/merchant-adjustment.spec.ts` (signed PENDING rejection, simultaneous submissions, activation + retry, permissions, foreign merchants; persistence doubles); `it/merchant-access.auth-integration.spec.ts` › "OD-13 merchant activation (BR-002, BR-093)" (PENDING + agreement required, snapshot, stale terms 409, employee does not activate, cross-tenant, concurrent edit vs acceptance), "allows only one of two concurrent owner acceptances"; `it/parcel-operations.auth-integration.spec.ts` › "OD-13/BR-093: no parcels, COD or settlements for a PENDING merchant", "OD-13: a foreign company cannot use or see…"; `it/merchant-portal.auth-integration.spec.ts` (HTTP preview + accept); `it/phase1.migration-data.auth-integration.spec.ts` › "kept every pre-existing merchant ACTIVE, marked legacy…", "rejects inconsistent activation states at the database"; `fe/features/operations/contracts.action.spec.ts` › "OD-13/BR-093: …"; `fe/features/operations/operations.action.spec.ts` › "OD-13/BR-093: forwards the ACTIVE merchant filter for operational pickers"; `apps/merchant_app/test/merchant_api_contract_test.dart` › "OD-13 merchant agreement" (verified 2026-11-26: Flutter analyze clean; full Flutter suite 80 passed) |
| FR-ME-01 reciprocal acceptance, pause/resume | missing | — | — |
| FR-ME-04 (collection modes COD / PREPAID) | partial | `Shipment.collectionMode`, `shipment_collection_mode` check | `it/merchant-pricing.auth-integration.spec.ts` › "preserves a prepaid zero collection and the merchant delivery charge" |
| FR-ME-04 (per-merchant service flags) | missing | — | — |
| FR-ME-05 (saved named addresses) | partial | `Merchant.pickupAddress` | — |
| FR-ME-06 (termination) | partial | `Merchant.active` | — |
| BR-001, BR-092, BR-126, FR-ME-07, AC-12, S-09 (company switch + history, OD-07) | missing | — | — |
| FR-ME-08 (credit / debt limits) | missing | — | — |

## Pricing

| Rule / FR | Status | Code path | Test |
| --- | --- | --- | --- |
| FR-ME-02 (zone tariffs, discount, promotion) | done | `DeliveryZone`, `MerchantPlan`, `PlanZoneTariff`, `be/merchant-pricing/pricing-engine.ts` | `pricing-engine.spec.ts`, `merchant-pricing.service.spec.ts`; `it/merchant-pricing.auth-integration.spec.ts` › "applies explicit tariff, merchant discount and named promotion without floating point" |
| FR-ME-02, AC-01 (immutable price snapshot) | done | `Shipment.pricingPlanVersion/baseDeliveryFeeMinor/…`, `shipment_pricing_snapshot` check | `it/merchant-pricing.auth-integration.spec.ts` › "persists final150/fee15 … with an immutable fee snapshot"; `it/merchant-portal.auth-integration.spec.ts` › "…never changes historical terms after plan edits"; `it/phase-a-correctness.auth-integration.spec.ts` › "keeps legacy snapshots…" |
| Stale quote / concurrent tariff edit | done | company lock + revision checks | `it/merchant-pricing.auth-integration.spec.ts` › "serializes quote confirmation and concurrent tariff edits on the company lock"; `it/phase-a-correctness.auth-integration.spec.ts` › "rejects a stale quote, a merchant without a plan and a foreign zone" |
| BR-094, FR-ME-03 (two-party approval, effective date, versions, OD-01) | partial | `be/merchant-pricing/*` (in-place edit, `revision` counter) | — |
| BR-066, FR-PL-06 (one currency per company, OD-02) | done | `Company.currency` (signup choice, ILS default) + `companies(id,currency)` key; composite FKs `(companyId,currency)` on merchants, merchant_plans, delivery_zones, shipments, cod_collections, merchant_ledger_entries, merchant_settlements, settlement_payments, merchant_settlement_requests; `be/parcels/company-currency.ts` used by merchant terms, zones, plans, adjustments, settlement preview/draft and merchant settlement requests; migration `20261125T2005_phase1_company_currency` (mixed-currency safety stop + backfill); session `company.currency`; `fe/features/auth/signup/signup-form.tsx` currency select; currency controls locked in `fe/features/operations`, `fe/features/merchant-pricing`. `fe/features/operations/components/merchant-detail.tsx` uses a single Balance heading. Currency change (controlled transition) not built. | `company-currency.spec.ts`; `company-currency-contract.spec.ts`; `auth.service.spec.ts` › "OD-02/BR-066: creates the company in the chosen currency, ILS by default"; `it/phase1.migration-data.auth-integration.spec.ts` › "gave each existing company the one currency its data uses…", "stops the migration (safety stop)…", "rejects money rows whose currency differs…", "refuses to change a company currency while it has money rows…"; `it/parcel-operations.auth-integration.spec.ts` › "OD-02/BR-066: merchant terms, adjustments and settlements use only the company currency", "OD-02/BR-066: each tenant keeps its own currency…"; `it/merchant-portal.auth-integration.spec.ts` › "lists settlement request history…" (USD rejected); `fe/features/auth/signup/signup.action.spec.ts` › "OD-02/BR-066: …"; `fe/features/auth/session/session.action.spec.ts` › "OD-02/BR-066: a tenant session carries exactly one supported company currency"; `fe/features/operations/contracts.action.spec.ts` › "OD-02/BR-066: merchant terms offer only the company currency" |

## Shipments + states

| Rule / FR | Status | Code path | Test |
| --- | --- | --- | --- |
| FR-SH-01 (merchant/staff creation, actor kept) | done | `Shipment.requestedBy`, `be/merchant-portal/merchant-parcels.service.ts#create`, `be/parcels/parcel-operations.repository.ts#saveParcel` | `it/merchant-portal.auth-integration.spec.ts` › "accepts an invitation, signs in … and persists final150/fee15…"; `it/parcel-http.auth-integration.spec.ts` › "completes merchant, parcel, delivery…" |
| FR-SH-02 (city + address, GPS optional) | done | `Shipment.city/destination`, `shipment_coordinates` check | `parcel.dto.spec.ts`; `it/merchant-portal.auth-integration.spec.ts` › "…blocks zone/city mismatch…" |
| FR-SH-05 (tracking ID, QR label, details) | done | `trackingNumber @unique`, `GET /merchant/parcels/:id/label`, `app/features/labels/label_pdf.dart` | `apps/merchant_app/test` |
| BR-083, FR-SH-05 (priority `NORMAL \| HIGH \| URGENT`, `LOW` → `NORMAL` migration, OD-10, Phase 1) | done | `ShipmentPriority` enum, `shipments_priority_check`, `be/parcels/parcel.dto.ts#ParcelInputDto.priority`, migration `20261125T1948_phase1_priority` (LOW → NORMAL data step), `fe/features/operations/components/operation-forms.ts#parcelFields` | `parcel.dto.spec.ts` › "OD-10/BR-083: rejects priority %s on create and edit"; `src/prisma/parcel-contract.spec.ts` › "OD-10/BR-083: limits stored priority to NORMAL, HIGH and URGENT"; `it/phase1.migration-data.auth-integration.spec.ts` › "migrated existing LOW parcels to NORMAL…", "rejects LOW at the database for inserts and updates" (fixture `it/migration-fixtures/01-phase1-priority.sql`); `fe/features/operations/contracts.action.spec.ts` › "OD-10/BR-083: parcel priority offers only Normal, High and Urgent" |
| FR-SH-04 (Excel import, preview, idempotency) | partial | `MerchantImport`, `be/merchant-portal/merchant-imports.service.ts` | `merchant-imports.spec.ts`; `it/merchant-portal.auth-integration.spec.ts` › "previews Excel row errors, imports valid rows exactly once…" |
| BR-077 (saved import column mappings) | missing | — | — |
| FR-SH-06 (event history / timeline) | partial | `ShipmentHistory`, `GET /parcels/:id/events` | `parcel-store.spec.ts`, `parcel-query.spec.ts` |
| FR-SH-08 (corrections via request + review) | partial | `MerchantParcelRequest`, `be/merchant-portal/merchant-requests.*`, `fe/features/merchant-requests` | `it/merchant-portal.auth-integration.spec.ts` › "requires an auditable company pricing approval after receipt and routes cancellation through controlled return", "allows rejecting an unpriceable amendment…" |
| BR-086 (authorized status correction) | missing | — | — |
| FR-SH-09 (server-side search/filters) | partial | `be/parcels/parcel-filters.ts` | `parcel-query.spec.ts`, `fe/features/operations/operations.*.spec.ts` |
| Guarded transitions, optimistic revision | done | `TRANSITIONS`, `assertTransition`, `assertRevision` in `be/parcels/parcel-domain.ts` | `parcel-domain.spec.ts` |
| BR-074 (instructions / notes with author) | partial | `Shipment.instructions/notes/customerNotes` | — |
| BR-087 (duplicate prevention) | partial | `MerchantImport.digest`; `Shipment.merchantReference` not unique | `merchant-imports.spec.ts` |
| BR-070 (labels) | partial | `app/features/labels/label_pdf.dart` | `apps/merchant_app/test` |
| FR-SH-07 (customer tracking link) | missing | — | — |
| FR-SH-10 (archive) | missing | — | — |

## Custody + tasks

| Rule / FR | Status | Code path | Test |
| --- | --- | --- | --- |
| Custody separate from status (column) | done | `Shipment.custody/locationLabel/locationSource`, `ShipmentHistory.custody` | `it/parcel-operations.auth-integration.spec.ts` › "records structured failure, return custody…" |
| AC-03 (assignment alone does not move custody) | done | `parcel-operations.repository.ts#assignment` | `it/phase-a-correctness.auth-integration.spec.ts` › "suspended drivers … rejected for pickups and assignment" |
| FR-OP-10 (reassignment cannot clear driver custody) | done | `assignment()` handback guard | `it/parcel-operations.auth-integration.spec.ts` (cross-company / driver cases) |
| FR-OP-04 (direct delivery without warehouse) | done | `TRANSITIONS` `RECEIVED_FROM_MERCHANT → ASSIGNED → OUT_FOR_DELIVERY → DELIVERED` | `it/merchant-portal.auth-integration.spec.ts` › "groups pickup preferences, requires actual receipt, delivers directly without warehouse…" |
| BR-036 (warehouses, optional) | partial | `Warehouse.archivedAt`, `receivingWarehouse()`; no transfer | `it/phase-a-correctness.auth-integration.spec.ts` › "requires an active own warehouse…"; `it/warehouses.auth-integration.spec.ts` |
| BR-018, BR-020, BR-120, BR-122, FR-OP-03, §6 (confirmed custody handover, OD-03) | partial | `OUT_FOR_DELIVERY` sets `custody = 'DRIVER'`; `POST /parcels/:id/location` | — |
| BR-120, FR-OP-06 (assignment ≠ status, OD-09) | partial | `ShipmentStatus.ASSIGNED` | — |
| FR-DR-01 (driver custody box) | missing | — | — |
| FR-OP-06/07 (task accept/reject, policy) | missing | — | — |
| FR-OP-04 (driver-to-driver transfer) | missing | — | — |
| FR-OP-05, AM-03 (nearby suggestions) | missing | — | — |
| FR-DR-03 (absence impact) | missing | — | — |
| BR-027, BR-035 (service-zone visibility / filtering) | missing | — | — |

## Pickups

| Rule / FR | Status | Code path | Test |
| --- | --- | --- | --- |
| FR-OP-01 (pickup requests, window, batching) | done | `PickupRequest`, `PickupParcel`, `be/merchant-portal/merchant-pickups.service.ts`, `app/features/pickups/*`, `fe/features/pickups` | `it/merchant-portal.auth-integration.spec.ts` › "groups pickup preferences, requires actual receipt…"; `fe/features/pickups/workflows.*.spec.ts` |
| Per-parcel receipt (RECEIVED/MISSING/DISCREPANT) | done | `PickupParcel.receipt`, `pickup_parcel_receipt` check | `it/merchant-portal.auth-integration.spec.ts` › "keeps warehouse drop-off pending until authorized staff confirm each actual arrival" |
| FR-OP-01 (one active pickup claim per parcel) | done | `one_active_pickup_per_parcel` index | `parcel-contract.spec.ts` |
| Warehouse drop-off | done | `method IN ('COMPANY_PICKUP','WAREHOUSE_DROPOFF')` | as above |
| FR-OP-03 (driver receipt, scan) | partial | staff confirmation in dashboard | — |
| BR-082 (pickup failure reasons, reschedule, fees) | partial | `PickupParcel.receipt` | — |
| FR-OP-02, FR-OP-07 (scheduled pickups, driver-added parcels) | missing | — | — |

## Returns / exchange

| Rule / FR | Status | Code path | Test |
| --- | --- | --- | --- |
| Return record, reason, staged handoff, fee once | done | `ParcelReturn`, `be/parcels/returns.controller.ts`, `parcel-ledger.ts` | `it/parcel-operations.auth-integration.spec.ts` › "records structured failure, return custody, and exactly one merchant handoff fee…"; `it/parcel-http.auth-integration.spec.ts` › "records a failed attempt and both return handoff stages…" |
| FR-EX-01 (failed attempt ≠ automatic return) | done | explicit `POST /returns` | `parcel-attempts.spec.ts` |
| FR-EX-05 (cancellation after pickup via return) | done | merchant `CANCEL` request → review → return | `parcel-cancellation.spec.ts`; `it/merchant-portal.auth-integration.spec.ts` › "…routes cancellation through controlled return" |
| BR-023, BR-096, BR-104, §6 (direct/warehouse, merchant confirms, one active, OD-08, Phase 9) | partial | `TRANSITIONS` (warehouse stage forced), `ParcelReturn.shipmentId @unique` | — |
| FR-EX-06/07 (post-delivery return, exchange) | missing | — | — |
| FR-EX-08 (damage / loss incidents) | missing | — | — |
| S-05 (reattempt-limit policy) | missing | — | — |

## Obstacles

| Rule / FR | Status | Code path | Test |
| --- | --- | --- | --- |
| Failed attempt with reason, actor, time | done | `ParcelAttempt`, `parcel-operations.repository.ts#recordAttempt` | `parcel-attempts.spec.ts` |
| FR-EX-04 (explicit reattempt) | done | `FAILED_DELIVERY → OUT_FOR_DELIVERY` | `parcel-domain.spec.ts` |
| FR-EX-01 (standard + custom failure reasons) | partial | free text | — |
| AM-04, S-02, AC-05 (Obstacles queue, merchant resolution) | missing | — | — |

## COD + cashboxes

| Rule / FR | Status | Code path | Test |
| --- | --- | --- | --- |
| BR-088 (exact full COD incl. customer-paid fees) | done | `CodCollection`, `collectionTotal()`, `assertFullAmount()` | `it/parcel-operations.auth-integration.spec.ts` › "credits only goods when customer pays company delivery and service charges", "requires collection of customer-paid charges even when the goods COD is zero" |
| NFR Consistency (idempotent money commands) | done | `MonetaryRequest` | `it/parcel-operations.auth-integration.spec.ts` › "retries monetary actions exactly once and rejects payload changes and duplicate collection keys" |
| Atomic posting with rollback | done | store transactions | `it/parcel-operations.auth-integration.spec.ts` › "rolls back a collection and leaves its retry key usable when goods posting fails" |
| BR-098, BR-021, FR-SH-03, AC-04 (delivery + COD one action, OD-04) | partial | `DELIVERED` before `POST /collections` | — |
| BR-033, BR-108, BR-109, FR-FI-03 (partial handover, driver balance, OD-05) | partial | `CashRemittance` (full amount, `collectionId @unique`) | `it/parcel-operations.auth-integration.spec.ts` › "rejects partial collection, remittance and payment" |
| FR-FI-04 (handover disputes) | missing | — | — |
| AM-01, FR-FI-01/02, S-04, AC-06 (accountant cashboxes, transfers) | missing | — | — |
| AM-02, FR-FI-05..08, S-03, AC-07/08 (delegated payee tasks) | missing | — | — |
| FR-FI-09 (expenses, period close) | missing | — | — |
| BR-061 (COD reconciliation, investigations) | missing | — | — |

## Merchant settlements

| Rule / FR | Status | Code path | Test |
| --- | --- | --- | --- |
| FR-ST-01 (proceeds from snapshots) | done | `MerchantLedgerEntry`, `settlementTotals()` | `it/phase-a-correctness.auth-integration.spec.ts` › "quotes and stores 150 final / 15 fee, collects 150 and settles 135"; `it/merchant-portal.auth-integration.spec.ts` › "…exposes135 for settlement only after company remittance" |
| FR-ST-02/04, BR-090 (approval separate from payment, proof) | done | `MerchantSettlement` `DRAFT → FINALIZED → PAID`, `SettlementPayment` | `it/parcel-operations.auth-integration.spec.ts` › "completes the full delivery, separate cash remittance, admin approval and actual payout…"; `it/parcel-http.auth-integration.spec.ts` › "permits accountant reads while refusing … settlement approval despite forged administrator claims" |
| BR-012 (append-only adjustments + reversal) | partial | `POST /financial/adjustments`, `…/reversal` (no second approver, OD-12) | `it/parcel-operations.auth-integration.spec.ts`; `fe/features/operations/money.action.spec.ts` |
| Merchant statement + settlement requests | done | `GET /merchant/statement`, `MerchantSettlementRequest`, `app/features/settlements`, `app/features/accounting` | `it/merchant-portal.auth-integration.spec.ts` › "isolates settlement request history…", "requires current FINANCE_VIEW membership…" |
| BR-010, FR-ST-03 (partial payments, carry-forward, OD-06) | partial | `SettlementPayment.settlementId @unique`, `assertFullAmount` | — |
| FR-ST-02 (schedules) | partial | on-demand only | — |
| FR-ST-01/04 (merchant debt, invoices) | partial | `settlement_amount` check (`netPayableMinor > 0`) | — |
| BR-060 (merchant financial disputes) | missing | — | — |

## Driver finance

| Rule / FR | Status | Code path | Test |
| --- | --- | --- | --- |
| FR-CP-01..06, FR-DR-07, S-07, AC-09 | missing | — | — |

## Driver app + GPS

| Rule / FR | Status | Code path | Test |
| --- | --- | --- | --- |
| FR-DR-02 (driver records, suspend/reactivate) | partial | `Worker`, `be/drivers/*`, `fe/features/drivers` | `it/driver-records.auth-integration.spec.ts` › "suspends idempotently and reactivates to offline"; `drivers.*.spec.ts` |
| FR-DR-04 (one vehicle per driver) | done | `Worker.vehicleId @unique`, `be/vehicles/*` | `vehicles*.spec.ts`, `it/vehicle-deletion.auth-integration.spec.ts` |
| BR-032 (vehicle status / breakdowns) | partial | `Vehicle` | — |
| FR-GP-01/02 (consented live location, validation) | partial | `DriverTrackingState`, `be/fleet/telemetry-policy.ts`, `fleet.gateway.ts`, `fe/app/app/live-map` | `it/fleet-tracking.auth-integration.spec.ts` › "rejects duplicates/out of order/frequency/jumps…", "stops sharing without erasing last known coordinates…", "denies all driver ingestion until a trusted auth adapter is configured"; `telemetry-policy.spec.ts`; `fe/features/fleet/*.spec.ts` |
| FR-GP-03 (live view restricted) | partial | socket tickets, persisted role check | `it/fleet-tracking.auth-integration.spec.ts` › "enforces persisted role and company rather than stale token claims" |
| FR-DR-05 (driver availability) | partial | `WorkerStatus` (staff-set) | — |
| FR-OP-08 (POD), FR-OP-09, FR-DR-06, driver app | missing | `ProofOfDelivery` model unused | — |

## Partners

| Rule / FR | Status | Code path | Test |
| --- | --- | --- | --- |
| FR-OP-04 (partner part), FR-ST-05 | missing | — | — |

## AI

| Rule / FR | Status | Code path | Test |
| --- | --- | --- | --- |
| FR-AI-01..07, S-08, AC-10 | missing | `AIExecution` legacy model, unused, no `companyId` | — |

## Platform admin / subscriptions

| Rule / FR | Status | Code path | Test |
| --- | --- | --- | --- |
| FR-PL-01 (main admin mandatory, never zero admins) | done | signup creates `COMPANY_ADMIN`; staff last-admin guard | `auth.service.spec.ts`; `it/staff.auth-integration.spec.ts` › "refuses self-deactivation, including for the only active administrator" |
| Suspended company blocks access | done | `Company.suspended` | `it/staff.auth-integration.spec.ts` › "refuses acceptance for a suspended company…"; `it/fleet-tracking.auth-integration.spec.ts` › "rejects inactive, unverified and suspended principals" |
| BR-045, FR-PL-01 (PENDING until platform approval, OD-11) | partial | `auth.repository.ts#createUserWithDefaultCompany` (active TRIAL) | — |
| FR-PL-02..05 (plans, billing, support access, audit) | partial | `Company.plan`, `PlatformAdminGrant` (unused) | — |
| BR-048 (support access with company approval) | missing | — | — |
| BR-068 (company profile editing) | missing | headquarters location only | — |
