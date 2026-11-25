# Fleetora — Owner Decisions

- **Approved:** 2026-11-25 by the product owner.
- **Source of each conflict:** [RECONCILIATION.md](RECONCILIATION.md) (OD-01..OD-13).
- **Authority:** these decisions resolve the listed conflicts between the approved sources and the current code. They sit alongside the authority order in [README.md](README.md); they do not add rules beyond those cited.
- **"Docs win"** means the cited approved rules are implemented as written and the current code must be changed in the target phase. Until then, the existing code stays as is.

| ID | Decision | Rules | Target phase |
| --- | --- | --- | --- |
| OD-01 | Docs win. A merchant price change needs company approval **and** merchant approval, plus an effective date. Tariffs are versioned. Parcels created before the change keep their price snapshot. | BR-094 | Pricing |
| OD-02 | Docs win. One currency per company. | BR-066 | Early |
| OD-03 | Docs win. Custody moves only when the receiving party confirms receipt. Assignment alone, or a scan alone, is not a custody transfer. | BR-018, BR-120, BR-122, AM-02 | Driver app / custody |
| OD-04 | Docs win. Delivery confirmation and full-COD confirmation are **one** driver action. The driver-to-company cash handover is a separate, later step. | BR-098, BR-088, BR-021 | Finance |
| OD-05 | Docs win. Partial driver cash handover is allowed. Driver balance = collected − confirmed handovers − authorized AM-02 use. | BR-033, BR-108, BR-109 | Finance |
| OD-06 | Docs win. Merchant settlements may be paid in partial payments. Approval is not payment. | BR-010, BR-090 | Finance |
| OD-07 | Docs win. A merchant may move to another company. Its history with the previous company is read/export only; no obligations transfer. Built **last**, but no earlier design may block it. | BR-001, BR-092, BR-126 | LAST (design must not block it) |
| OD-08 | Docs win. A return goes direct or via a warehouse, and completes only on merchant confirmation. A parcel may have several returns over time, but only **one active** return at a time, each linked to the original parcel. | BR-023, BR-104, BR-096 | Phase 9 (confirmed); depends on Phase 5 (custody + parcel lifecycle) |
| OD-09 | Docs win. Assignment is a separate task concept, not a parcel status. | BR-120, AM-02 | Driver app / custody |
| OD-10 | Docs win. Priority values are `NORMAL \| HIGH \| URGENT` only. The owner approves the data migration: existing `LOW` parcels become `NORMAL` (additive-safe migration, tested). | BR-083, FR-SH-05 | Phase 1 |
| OD-11 | Docs win. A self-registered company is PENDING until a Fleetora platform admin approves it. A platform admin may also create companies directly. | BR-045 | Platform admin |
| OD-12 | Docs win, with company-configurable thresholds. A money action above a company-set amount needs a second, different approver. Below the threshold a single admin may act, but the action is flagged in the audit log. | BR-009, BR-012 | Finance |
| OD-13 | Docs win. A staff-created merchant is PENDING until the merchant accepts the invitation and the agreement. No parcels, COD or settlements before the merchant is ACTIVE. | BR-002, BR-093 | Merchants (early) |
