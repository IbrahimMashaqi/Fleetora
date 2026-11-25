# FLEETORA

## Product Requirements Document (PRD)

**AI-Powered, Multi-Tenant Delivery Management SaaS**

- Document version: 1.0 - consolidated requirements baseline
- Prepared: 25 November 2026
- Status: Approved product scope; implementation subject to repository audit
- Audience: Product, Backend, Frontend, Mobile, AI, QA and Architecture teams

Scope authority: approved business decisions BR-001 through BR-137, with BR-025 and BR-067 not approved, plus approved amendments AM-01 through AM-04. Where earlier planning text conflicts, the later approved decision takes precedence.

> This document describes what Fleetora must do, not what the current repository has already implemented. Technical structures and delivery phases are proposals pending codebase verification.

<!-- Converted from Fleetora_Product_Requirements_Document_PRD.pdf (16 pages). Page headers/footers omitted; table text kept verbatim. -->

---

## 1. Document control and source hierarchy

| Item | Definition |
| --- | --- |
| Primary requirements | Approved Fleetora business-rule discussion (BR-001–BR-137, except skipped BR-025 and BR-067). |
| Post-approval amendments | AM-01 accountant cashboxes; AM-02 driver shipment box and delegated payments; AM-03 direct nearby delivery; AM-04 obstacle resolution workflow. |
| Conceptual source | Fleetora_Master_Project_Document.md - strategy, role concepts and initial architecture. |
| Technical companion | Fleetora_Architecture_Database_Implementation_Blueprint.md - proposed boundaries, entities and phased delivery. |
| Decision precedence | Approved amendments > approved business rules > older illustrative master document > proposed technical blueprint. |
| Implementation status | Unknown without a real repository inspection. Proposed entities do not imply existing database tables. |

## 2. Product overview

Fleetora is a B2B multi-tenant SaaS platform for delivery companies. It provides one operational system for merchants, deliveries, driver tasks, custody, warehouses, external logistics partners, collections and settlements, role-based administration, analytics, GPS monitoring and controlled AI assistance.

Problem: fragmented shipment tracking, disconnected cash handling, manual driver coordination, weak proof and custody history, and limited operational visibility lead to delays, disputes and accounting risk.

Outcome: every authorized user can see their relevant operation and financial obligations, while each shipment, physical handover, cash movement and AI-approved action remains traceable.

### 2.1 Product goals

- Make merchant-to-recipient and return workflows reliable with or without warehouse transit.
- Track assignment, physical custody, shipment status and money as separate concepts.
- Provide delivery-company financial control without becoming a full ERP or payroll suite.
- Enable driver-led field operations with safe low-connectivity behavior.
- Provide company-isolated analytics and human-approved AI recommendations.
- Support scalable subscription tiers, audited administration and extensible provider integrations.

### 2.2 Non-goals and deliberate exclusions

- No end-customer Fleetora login or dedicated customer mobile app; optional restricted tracking link only.
- No merchant staff user hierarchy, merchant branches or multibranch accounting.
- No mandatory MFA in the baseline (other authentication hardening remains required).
- No customer partial COD payment at delivery.
- No general internal parcel chat and no merchant operational helpdesk tickets.
- No full WMS, fleet maintenance system, general ledger ERP, bank transfer engine, loan platform or HR payroll.
- No required driver work calendar/cutoff scheduling engine (BR-067 excluded).

## 3. Actors, tenancy and authorization

| Actor | Core capabilities | Restrictions |
| --- | --- | --- |
| Platform Super Admin | Company onboarding/approval, subscription and feature control, plan-based AI availability, support grants, platform telemetry. | No unapproved operational access to tenant data; scope and audit support access. |
| Company Admin | Company configuration, employee roles, cashbox consolidation, merchant contracts, driver administration, operations and finance oversight. | Bound to own company except explicit partner-facing workflows. |
| Operations staff | Shipment queues, pickup and driver assignment, exceptions, returns, custody supervision and merchant obstacle follow-up. | Financial actions only with explicit finance permission. |
| Accountant | Assigned cashbox, COD handovers, merchant and driver settlements, authorized driver-payment tasks. | Default visibility limited to own cashbox; approval segregation applies. |
| Warehouse staff | Receipts, handovers and transfers; basic warehouse records. | No full inventory/shelf WMS. |
| Merchant | Single account, create/import shipments, saved addresses, service/price agreement, historic exports, obstacles, returns and financial statements. | One active delivery-company affiliation; no merchant employees/branches. |
| Driver | Flutter task handling, custody box, pickup/delivery, POD, COD, payment tasks, obstacle reports, own earnings and GPS work mode. | No arbitrary access to other drivers, merchant accounts or companies. |
| End customer | Optional secure tracking link, direct contact through existing merchant/company channels. | No account/app; no public POD access. |
| Partner | Contract-scoped delivery/return handling with reconciliation. | No open cross-company tenant access. |

### 3.1 Tenancy and access principles

- One company tenant cannot read or mutate another company tenant by supplying its identifier.
- Merchant has only one active company affiliation, with historical read/export access to prior affiliation after termination under retention rules.
- Company employee belongs to one company; temporary delegation is scoped, expires, and does not bypass approval separation.
- Core company staff roles can be customized, while all active drivers have the same basic operational role; assignment eligibility is policy-based.
- Platform staff have separate platform RBAC and audited temporary tenant-support grants.

## 4. Approved functional requirements

### 4.1 Platform, companies and subscriptions

| ID | Requirement / expected behavior | Trace |
| --- | --- | --- |
| FR-PL-01 | Company can request registration; platform may approve or create company directly; main company admin is mandatory. | BR-045 |
| FR-PL-02 | Plan-based feature flags, limits, overrides and subscription billing (flat, per shipment or hybrid). | BR-046,050 |
| FR-PL-03 | Grace/limits after subscription expiry are company/plan configurable; preserve ongoing shipment and settlement obligations. | BR-047 |
| FR-PL-04 | Platform roles, monitored support access, audit/search/export and targeted announcements. | BR-048–053 |
| FR-PL-05 | Company admin manages ordinary company profile; platform owns company activation/subscription controls. | BR-068 |
| FR-PL-06 | Single base currency per company; transactional currency change requires a controlled migration. | BR-066 |

### 4.2 Merchants, agreements and tariff versions

| ID | Requirement / expected behavior | Trace |
| --- | --- | --- |
| FR-ME-01 | One merchant account, one active company relationship; reciprocal acceptance and pause/resume rules. | BR-001–004,079 |
| FR-ME-02 | Merchant-specific price rules by area/service and discount; capture immutable shipment price snapshot. | BR-005–007 |
| FR-ME-03 | Tariff modifications require both merchant and company approval plus an effective date; retain prior prices. | BR-094 |
| FR-ME-04 | Each merchant has allowed service flags (COD, prepaid, urgent, partner fulfillment). | BR-095 |
| FR-ME-05 | Saved named pickup/return addresses; no separate branch entity or merchant staff. | BR-078–080 |
| FR-ME-06 | Merchant can terminate relationship with no new orders, while open disputes, debts, returns and COD obligations remain. | BR-092 |
| FR-ME-07 | After exit, merchant can read/export historical records without exposing them to their next delivery company. | BR-126 |
| FR-ME-08 | Commercial limits for new shipments are not quantity-based; enforce credit, duplication and technical safety. | BR-091,106 |

### 4.3 Shipment creation, content and tracking

| ID | Requirement / expected behavior | Trace |
| --- | --- | --- |
| FR-SH-01 | Merchant and authorized company employee can create shipment; preserve actual actor. | BR-013 |
| FR-SH-02 | Destination city/locality plus descriptive address required; GPS coordinate optional. | BR-014 |
| FR-SH-03 | Support COD or fully prepaid; delivery requires full COD collection, no end-customer partial-payment completion. | BR-088,098 |
| FR-SH-04 | Import Excel/CSV and approved APIs with preview, mapping, validation, duplicate checks and idempotency. | BR-069,077,087 |
| FR-SH-05 | Tracking ID, PDF barcode/QR label, optional priority (normal/high/urgent), basic description/optional weight and piece count. | BR-070,083–085 |
| FR-SH-06 | Maintain event history; distinguish customer-visible simplified timeline from full internal event record. | BR-071 |
| FR-SH-07 | Allow optional revocable expiring customer tracking link without exposing private proof/documents. | BR-072,124 |
| FR-SH-08 | Permit constrained pre/post-pickup corrections and post-delivery nonfinancial corrections with old/new history; protect original POD. | BR-016,086,101,127 |
| FR-SH-09 | Advanced authorized search, saved views, pagination, export, limited safe bulk operational updates. | BR-076,107 |
| FR-SH-10 | Archive eligible closed shipments after company-defined age, retaining access; block when financial/return/dispute obligations open. | BR-125 |

### 4.4 Pickup, assignments, custody and delivery

| ID | Requirement / expected behavior | Trace |
| --- | --- | --- |
| FR-OP-01 | Merchant pickup requests may be scheduled or ad hoc, batched and partially completed; only one incompatible active pickup claim per parcel. | BR-017,081–082 |
| FR-OP-02 | Driver can add eligible registered parcels to a pickup task, directly or after ops approval per company policy. | BR-121 |
| FR-OP-03 | Physical pickup/custody requires confirmation by manual or optional barcode/QR operation; scan alone does not transfer custody. | BR-018,122 |
| FR-OP-04 | Permit merchant-to-customer direct delivery, optional warehouses, driver-to-driver transfers and partner fulfillment. | BR-019–020,036–041 |
| FR-OP-05 | Driver controls route and stop order; nearby eligible deliveries are suggested after pickup, not enforced, and do not require warehouse return. | BR-029, AM-03 |
| FR-OP-06 | Keep task assignment, task acceptance/rejection, physical custody, physical location and shipment status distinct. | BR-026–028,120 |
| FR-OP-07 | Company policy chooses direct assignment vs driver acceptance, and direct vs approval-gated additional pickups. | BR-120–121 |
| FR-OP-08 | POD methods per company/merchant/value policy (e.g. manual, photo, signature, OTP); actual recipient alternative must be recorded. | BR-021,100 |
| FR-OP-09 | Permit pre-payment parcel inspection only where merchant agreement allows it; preserve refusal/damage evidence. | BR-099 |
| FR-OP-10 | Route reassignment or task rejection does not silently clear current driver custody. | BR-020,028,119 |

### 4.5 Failures, obstacle resolution and reverse logistics

| ID | Requirement / expected behavior | Trace |
| --- | --- | --- |
| FR-EX-01 | Delivery attempts have standard reasons plus company-custom categories and actor/time evidence; failed attempt != automatic return. | BR-022,102 |
| FR-EX-02 | Driver can report parcel obstacle (e.g. customer not answering); route to an Obstacles queue for merchant/company. | AM-04 |
| FR-EX-03 | Merchant enters resolution note and permitted contact correction; move case to Resolved/Ready for Retry without changing custody or claiming delivery. | AM-04, BR-074,101 |
| FR-EX-04 | Reattempt/replan remains an explicit operational action, not an automatic consequence of merchant resolution. | AM-04,BR-022 |
| FR-EX-05 | Cancelled after pickup needs company approval and return process; do not close until merchant acknowledges physical receipt. | BR-016,023,104 |
| FR-EX-06 | Post-delivery return/exchange produces linked new tracking request and independent custody/fee history; preserve original delivered event. | BR-096–097 |
| FR-EX-07 | Exchange old-item-first vs independent legs follows merchant agreement; completion requires all required legs. | BR-097 |
| FR-EX-08 | Damage/loss incident documents investigation, evidence, liability assessment and authorized remedy; no automatic blame. | BR-024 |

### 4.6 Drivers and their field workspace

| ID | Requirement / expected behavior | Trace |
| --- | --- | --- |
| FR-DR-01 | Every driver has a logical shipment custody box containing only confirmed physically held shipments, not merely assigned tasks. | AM-02 |
| FR-DR-02 | Company may suspend/reactivate or offboard driver; open custody, COD, vehicle and compensation obligations remain traceable. | BR-117–118 |
| FR-DR-03 | Unplanned absence shows impacted tasks for manual reschedule/reassignment; do not auto-redistribute custody. | BR-119 |
| FR-DR-04 | A driver has one actively assigned vehicle; track basic vehicle registry/availability only. | BR-031–032 |
| FR-DR-05 | Driver chooses available/busy; company can suspend/limit assignment; no detailed driver permission subclasses. | BR-030,035 |
| FR-DR-06 | In limited offline mode, cached tasks, attempts and notes may be queued; final POD/COD/custody confirmation requires server connection. | BR-123 |
| FR-DR-07 | Driver sees detailed own earnings, advances, deductions and payments, plus separately displayed COD liability and exports. | BR-116 |

### 4.7 Cashboxes, COD and delegated payee payments

| ID | Requirement / expected behavior | Trace |
| --- | --- | --- |
| FR-FI-01 | Each accountant has a separately accountable active cashbox; manager can see cashboxes and a computed company total. | AM-01 |
| FR-FI-02 | Cashbox-to-cashbox transfer has sending and receiving confirmation, ledger movement and role-based approval; not revenue. | AM-01 |
| FR-FI-03 | Driver COD receipts and company handovers support partial remittance with two-sided evidence and discrepancy review. | BR-033,061 |
| FR-FI-04 | Driver and accountant COD handover disagreements capture declared vs counted amount, dispute reviewer and resolution; no automatic wage deduction. | BR-109 |
| FR-FI-05 | A company admin/authorized accountant assigns a driver a merchant/other-payee invoice-payment task, separate from salary payment. | AM-02 |
| FR-FI-06 | Payment task source is either accountant-issued cash or explicitly reserved authorized COD held by driver. | AM-02 |
| FR-FI-07 | Document payment task approval, fund handover/reservation, actual payee acknowledgement/evidence, reconciliation and reversal/dispute. | AM-02 |
| FR-FI-08 | Prevent double funding, cash/merchant-liability misclassification, duplicate payout and completed status before actual receipt. | AM-02,BR-012 |
| FR-FI-09 | Maintain auditable operational ledger and company expense approval/period close, but not full ERP or bank accounting. | BR-009,012,062–064 |

### 4.8 Merchant and partner settlements

| ID | Requirement / expected behavior | Trace |
| --- | --- | --- |
| FR-ST-01 | COD merchant proceeds less delivery/return/other agreed fees are computed from immutable snapshots; prepaid fees billed or offset where allowed. | BR-006–008,089 |
| FR-ST-02 | Settlement schedule by merchant may be daily, weekly, monthly or on demand; prepare/review/approve vs actually paid are separate. | BR-090 |
| FR-ST-03 | Support partial settlements, outstanding carry-forward, credit/debt controls and disputed-amount-only holds. | BR-010,060,091 |
| FR-ST-04 | Allow approved offsets or separate invoices and record payment proof; do not treat planned payout as confirmed. | BR-008,011 |
| FR-ST-05 | Support internal and external delivery partners, entrusted transfers, returns, commission/fee arrangements and partial settlements. | BR-037–041 |

### 4.9 Driver commissions, wages and advances

| ID | Requirement / expected behavior | Trace |
| --- | --- | --- |
| FR-CP-01 | Driver compensation may be fixed salary, per-event commission or both; statement separately reviewed and paid. | BR-034,111 |
| FR-CP-02 | Commission policy varies by operation and locality; eligibility is based on actual qualified event and effective policy snapshot. | BR-112 |
| FR-CP-03 | Allow approved percentage split of a commission pool across documented participating drivers, totaling 100%. | BR-113 |
| FR-CP-04 | Commission corrections are authorized independent financial adjustments with preserved original and no duplicate correction. | BR-114 |
| FR-CP-05 | Driver advance requires approval and actual cash-disbursement confirmation; subsequent deduction is authorized and COD-isolated. | BR-110 |
| FR-CP-06 | Wages/commissions can be paid partially via cash and recorded bank transfers, with evidence but no direct in-product bank execution. | BR-111,115 |

### 4.10 GPS, reporting and operational analytics

| ID | Requirement / expected behavior | Trace |
| --- | --- | --- |
| FR-GP-01 | During explicitly active work mode, capture driver location and detailed path/trip/stops with adaptive frequency and offline point synchronization. | BR-128–129 |
| FR-GP-02 | Never represent stale point as live; show captured time and permission/connection status. | BR-128–129 |
| FR-GP-03 | Live viewing requires operations authorization; historical track access requires separate permission and logged access; own driver track visible. | BR-130 |
| FR-RP-01 | Provide company-scoped advanced reports, exports, scheduled statements, defined KPIs and optional company-specific performance targets. | BR-056–059 |
| FR-RP-02 | Alerts track missing goals, driver/merchant/partner performance and deduplicated recipients/states, without inventing mandatory SLAs. | BR-057–058 |

### 4.11 AI agents and external provider governance

| ID | Requirement / expected behavior | Trace |
| --- | --- | --- |
| FR-AI-01 | Agent can read permitted tenant-scoped data and produce explanations and proposed actions; operational writes require human approval and backend enforcement. | BR-131 |
| FR-AI-02 | Available agents are controlled by plan entitlement and Super Admin exception; company admin grants agent-use permission. | BR-132 |
| FR-AI-03 | Monthly AI execution quotas, alerts, no duplicate charged runs, and centrally granted override. | BR-133 |
| FR-AI-04 | Record source summary, operational reasons, agent/version, approval, revalidation and outcome; never store model hidden reasoning/secrets. | BR-134 |
| FR-AI-05 | Manual/scheduled trigger with idempotent schedule firing; scheduled runs propose rather than autonomously modify. | BR-135 |
| FR-AI-06 | Revalidate proposal eligibility at approval and execution; exclude stale actions, present changed scope to human reviewer. | BR-136 |
| FR-AI-07 | Approved internal or external model providers only; data minimization, explicit retention/privacy checks and cross-tenant isolation. | BR-137 |

### 4.12 Security, evidence and information handling

| ID | Requirement / expected behavior | Trace |
| --- | --- | --- |
| FR-SE-01 | Password-based secure login, rate limits, revocable sessions and audit; no baseline mandatory MFA. | BR-054 |
| FR-SE-02 | POD is accessible to authorized delivery-company staff and relevant merchant only; not via public customer tracking link. | BR-075,124 |
| FR-SE-03 | Private typed attachments, protected temporary download links, malware checks and lifecycle retention. | BR-075 |
| FR-SE-04 | Append-only important event/financial/AI audit, period-aware corrections and forensic access logs. | BR-012,053,062 |
| FR-SE-05 | Data export/offboarding, category-specific retention and secure erasure where lawful; archive != deletion. | BR-055,125 |

## 5. Core workflow acceptance scenarios

**S-01 Merchant to customer, no warehouse**
Merchant creates COD order with versioned price -> driver confirms pickup custody -> nearby recommendation optional -> driver collects full COD -> permitted POD recorded -> DELIVERED. No warehouse visit required.

**S-02 Obstacle resolved by merchant**
Driver records unanswered call with standard reason -> obstacle in merchant/company queues -> merchant records verified alternate phone/retry note -> item appears Resolved/Ready for Retry -> authorized new attempt occurs; earlier failed attempt and custody unchanged.

**S-03 Driver delegated cash payment**
Accountant approves invoice payment -> selects authorized cashbox handover OR reserved available driver-held COD -> driver receives funding authority -> actual beneficiary receives money with proof -> journal and liability reconciliation -> task completes exactly once.

**S-04 Accountant cashbox transfer**
Accountant A authorizes 1,000 transfer to Accountant B -> A records handover -> B confirms count -> balanced transaction updates A and B boxes -> company total remains unchanged by transfer.

**S-05 Failed delivery and return**
Attempt failure logged -> reattempt limit/policy applied -> return pickup/transfer tracked -> merchant physically acknowledges return -> only then closed as returned.

**S-06 Driver exchange**
Merchant creates exchange linked to delivered original -> replacement and reverse collection legs tracked separately -> apply old-item-first vs independent policy -> merchant confirms returned old item -> exchange closed.

**S-07 Shared driver commission**
Company authorizes eligible 10-unit commission pool -> two drivers share 30/70 based on accepted participation -> allocate once -> show in approved statements -> correcting distribution generates a new approved adjustment.

**S-08 AI suggestion with stale data**
Agent recommends reassignment for 15 shipments -> operator reviews later -> current-status revalidation eliminates ineligible parcels -> operator approves revised set -> backend rechecks at execution -> individual results logged.

**S-09 Merchant company transition**
Merchant ends relationship with Company A after obligations managed -> affiliates to Company B -> can read/export A history as allowed -> B never gains A data or liabilities.

## 6. State and accounting invariants

- A parcel can be assigned to a driver without the driver holding it; physical custody changes only on confirmed handover.
- A completed COD delivery requires full end-customer COD collection. Partial internal remittances and merchant settlements remain allowed.
- A returned parcel is closed only when the merchant acknowledges physical receipt, regardless of direct or warehouse routing.
- Merchant obstacle resolution is neither proof of delivery nor an automatic retry or custody change.
- Driver parcel box reflects custody, while driver task list reflects assignments; never conflate the two.
- A company cash total is calculated from accountant-owned cashboxes; an inter-cashbox transfer does not create revenue.
- A driver payment task is not paid when created, assigned or funded; it completes only after real payee evidence and proper reconciliation.
- COD held by drivers represents accountable collection and liability; explicit COD-funded payouts must reserve spendable balance and settle the correct underlying liability.
- Posted financial entries and established POD evidence cannot be silently edited; use approved adjustments and immutable history.
- Approved AI command is revalidated against current tenant, permission, shipment and amount rules at actual execution.

## 7. Non-functional requirements

| Area | Requirement / testable expectation |
| --- | --- |
| Tenant security | Cross-company resource IDs must never allow disclosure or mutation; cover API, reports, object storage, merchants with prior affiliates and partner handoffs. |
| Authorization | Server-side RBAC plus domain policies checked for every sensitive operation, with separation of requester/approver where applicable. |
| Consistency | Transactional/conditional updates for custody and financial operations; idempotent payment, event, import, reconciliation and AI commands. |
| Financial correctness | Store monetary amounts as exact decimals or integer minor units; enforce single company currency and reconciled, append-only journal. |
| Availability | Graceful backend/network error handling, safe retry behavior and visible synchronization status in driver app. |
| Privacy | GPS only in active work mode, historic access permission, data minimization for external AI, signed attachment URLs and retention controls. |
| Observability | Structured events with tenant, actor, correlation ID and operation outcome; redact secrets/PII in logs. |
| Performance | Use paginated server-side search and company-aware indexes; validate throughput and GPS retention with realistic load tests before promising fixed SLAs. |
| Accessibility | Support Arabic/English where product UI requires it, readable error states and mobile-friendly controls. |
| Recoverability | Database restore procedures, safe migrations and confirmation that financial/custody records remain consistent after recovery. |

## 8. Data model (proposed logical entities)

This is a proposed logical model to guide Prisma design, not a claim that these tables exist today. Exact cardinality, retention and migration strategy must be validated against the current codebase.

| Domain | Proposed entities |
| --- | --- |
| Identity | Company, CompanyUser, PlatformUser, Role, Permission, UserRole, Delegation, MerchantCompanyAgreement |
| Merchant | Merchant, MerchantAddress, MerchantServicePermission, MerchantTariffVersion, TariffRule |
| Shipment | Shipment, ShipmentEvent, ShipmentAttempt, ShipmentTask, TaskAssignmentEvent, CustodyTransfer, DeliveryProof |
| Exceptions | ShipmentObstacle, ObstacleResolution, DeliveryFailureReason, Incident, ReturnExchangeRequest |
| Facilities/partners | Warehouse, Zone, Vehicle, PartnerAgreement, PartnerHandoff, PickupBatch |
| Finance | FinancialTransaction, FinancialEntry, Cashbox, CashboxAssignment, CashboxTransfer, DriverCODCollection, DriverCashHandover, CashDispute, MerchantSettlement, SettlementLine |
| Delegated payment | DriverPaymentTask, PaymentTaskFunding, PaymentTaskDisbursement |
| Driver compensation | DriverCommissionPolicyVersion, DriverCommissionAccrual, DriverCommissionAllocation, DriverAdvance, DriverEarningsStatement, DriverPayment |
| GPS | DriverWorkSession, DriverLocationPoint, DriverTrip, DriverStop |
| AI | AIProvider, AgentDefinition, CompanyAgentEntitlement, AIExecution, AIRecommendation, AIProposedAction, AIApproval, AISchedule, AIUsageCounter |
| Supporting | Attachment, AuditLog, OutboxEvent, Subscription, Plan, FeatureEntitlement |

### 8.1 Database constraints requiring explicit design

- Unique tracking ID and scoped external order/idempotency keys.
- At most one active merchant-company affiliation; at most one active accountant cashbox assignment per accountant.
- Confirm a custody handover and update shipment custody projection in one transaction.
- Ensure payment tasks have one approved source and prevent reusing reserved COD or cash funding.
- Validate all percentages of an approved commission pool sum to 100%; never duplicate event accrual.
- Ensure every child company/merchant reference is tenant-compatible; cross-company partner access must be explicitly scoped.
- Archive and retention jobs cannot close or delete records with unresolved finance or custody obligations.

## 9. Solution architecture - proposed

Web: Next.js portal surfaces for Fleetora platform staff, company operations/finance and single-account merchants. Mobile: Flutter driver app. Core API: NestJS modular monolith responsible for all business invariants. Persistence: PostgreSQL with Prisma and private object storage. AI: Python FastAPI/LangGraph service calling allow-listed backend tools. Async: background workers/queue for scheduled operations, exports, archive and AI tasks as justified by scale.

Design rule: AI, web and Flutter never bypass NestJS domain authorization to post money, change custody or mark a shipment delivered. The current repo may implement a subset of this target architecture.

### 9.1 Recommended module boundaries

- Platform & Subscription
- Identity & Policy
- Merchants & Commercial Agreements
- Shipments & Pricing
- Pickup/Task Assignment
- Custody & Warehouse
- Exceptions/Returns/Partners
- Cashboxes & Operational Ledger
- COD & Merchant Settlements
- Driver Payments & Compensation
- GPS & Reporting
- AI Governance
- Attachments & Audit

## 10. Delivery scope and release sequence

| Phase | Deliverables | Exit criteria |
| --- | --- | --- |
| 0 | Repository audit, schema/API/UI/test inventory, requirement gap matrix. | Implemented / partial / missing evidence established. |
| 1 | Tenant identity, roles, merchant affiliation, feature/plan controls. | Tenant leakage and permission tests pass. |
| 2 | Shipment lifecycle, pricing snapshot, assignments/custody, direct delivery, driver parcel box, obstacle queue. | Complete direct merchant-to-recipient journey and obstacle retry. |
| 3 | Driver Flutter workflows: pickup, QR/manual, COD, POD, offline limited. | Real-device happy path and retry/idempotency test. |
| 4 | Returns, exchange and delivery partner workflows. | Confirmed return and partner-hand-off flows. |
| 5 | Immutable finance ledger, accountant cashboxes, COD, merchant settlements and delegated payment tasks. | Cash reconciliation and no-double-spend concurrency coverage. |
| 6 | Compensation/commissions, advances, partner finance, reports. | 100% commission allocation and independent payment confirmation. |
| 7 | GPS route storage, privileged history, exports and archive. | Work-only collection and restricted access verified. |
| 8 | AI provider governance, agents, quotas, schedules, proposal/approval/revalidation. | No unsafe direct writes and no cross-tenant agent access. |
| 9 | Load, security, backup/restore, release runbooks. | Documented launch gates pass. |

### 10.1 Suggested graduation demo slice

Demonstrate tenant authorization; merchant onboarding and one approved tariff; shipment creation; driver pickup, parcel custody box and nearby direct delivery; one obstacle and merchant resolution; secure POD/COD collection; a thin accurate accountant/merchant settlement; one AI recommendation requiring a human-approved and revalidated backend action. The full PRD is product scope, not a promise to build every feature in the first demo.

## 11. Acceptance criteria and definition of done

- AC-01 A merchant can create a shipment with a valid agreement and immutable price snapshot; cross-tenant access returns authorization failure.
- AC-02 A driver can physically pick up a parcel and directly deliver an eligible nearby one without warehouse transit.
- AC-03 Assignment does not mutate custody until a valid handover is confirmed.
- AC-04 A customer who offers only partial COD cannot complete delivery; a failed attempt or reschedule is recorded.
- AC-05 A merchant handles an obstacle with a note, which becomes ready for retry without silently reporting delivery.
- AC-06 A cashbox transfer preserves company cash total while changing separate accountant balances exactly once.
- AC-07 A driver payee payment task is funded via one audited authorized source and closed only on evidence of actual payment.
- AC-08 Duplicate, concurrent or repeated payment and COD-funded task requests cannot spend the same funds twice.
- AC-09 A commission pool split has a fully explained allocation of 100% and no duplicate paid entitlement.
- AC-10 AI suggestions are tenant-scoped, quota-checked, auditable, human-reviewed and revalidated immediately prior to execution.
- AC-11 Historical GPS routes are unavailable without explicit permission and are never recorded outside work mode.
- AC-12 Historical merchant export remains readable after a company switch without exposing prior data to new company.

Every shipped feature also requires tests at the service and API boundaries, permission checks, failure states, data migration review where relevant, documentation and functional review by the product owner.

## 12. Open technical verification items

The following are engineering verification tasks, not additional Business Rule questions:

- Inspect live repository, Prisma version, existing migrations, deployed module boundaries, endpoints, test coverage and UI status.
- Select object storage, maps/geocoding provider and actual queue/scheduling approach from operational constraints.
- Validate accountant cashbox/accounting journal postings and driver COD-funded disbursement against real reconciliation examples.
- Confirm retention periods, evidence privacy and approved external model provider data processing terms.
- Test background GPS location and permissions on Android and iOS; measure battery and network impact.
- Validate agreed launch scope and release readiness against implementation capacity and test results.

## 13. Requirements traceability notes

The PRD consolidates decisions into implementation-oriented requirements instead of restating all 137 deliberation prompts. The final 15-question cycle concluded at BR-137. BR-025 and BR-067 were not approved. AM-01 specifically overrides BR-065 on cashboxes; AM-02–AM-04 extend existing logistics and financial concepts. See the approved discussion and the two source Markdown documents for full rationale and detailed policies.

Some requirements are intentionally configurable by delivery company or merchant agreement. Configuration does not override platform tenant isolation, immutable financial controls, human approval for AI changes, or the requirement to establish real custody and payment evidence.
