# Fleetora product documentation

This folder holds the approved product baseline for Fleetora and the reconciliation of that baseline against the repository.

## Files

| File | What it is |
| --- | --- |
| [PRD.md](PRD.md) | Product Requirements Document v1.0 (converted from the approved PDF; FR ids and BR/AM traces unchanged). |
| [BUSINESS_RULES.md](BUSINESS_RULES.md) | Business rule inventory BR-001–BR-137 and amendments AM-01–AM-05. |
| [BR_001_093_RECOLLECTED.md](BR_001_093_RECOLLECTED.md) | Owner-confirmed recollection of BR-001–BR-093 (not verbatim). |
| [MASTER_PROJECT.md](MASTER_PROJECT.md) | Master project document: strategy, roles, conceptual architecture, approved amendments AM-01–AM-04. |
| [ARCHITECTURE_BLUEPRINT.md](ARCHITECTURE_BLUEPRINT.md) | Proposed architecture/database blueprint. A proposal, not a decision. |
| [RECONCILIATION.md](RECONCILIATION.md) | Phase 0 audit: what the repository implements against this baseline, and the open owner decisions. |

## Authority order

When sources disagree, the higher entry wins:

1. **AM-01..AM-05** — approved amendments (in [BUSINESS_RULES.md](BUSINESS_RULES.md)). AM-05 (approved 2026-11-25) supersedes the "no merchant staff" parts of BR-078–BR-080 and of the PRD.
2. **BR-094..BR-137** — verbatim approved business rules (in [BUSINESS_RULES.md](BUSINESS_RULES.md)).
3. **BR-001..BR-093** — owner-confirmed recollection (2026-11-25, not verbatim), in [BUSINESS_RULES.md](BUSINESS_RULES.md); source list in [BR_001_093_RECOLLECTED.md](BR_001_093_RECOLLECTED.md).
4. **[PRD.md](PRD.md)** — consolidated functional requirements.
5. **[ARCHITECTURE_BLUEPRINT.md](ARCHITECTURE_BLUEPRINT.md)** — proposal only; never treated as an approved requirement.
6. **[docs/merchant-business-model.txt](../merchant-business-model.txt)** — historical; superseded wherever it conflicts with the sources above.

## BR-001..BR-093

These rules are approved, but their verbatim approval text is not on file. Each now carries a one-sentence meaning recollected and confirmed by the owner on 2026-11-25. Special statuses: BR-025 and BR-067 are SKIPPED (not approved), BR-065 is SUPERSEDED BY AM-01, BR-079 is PARTLY SUPERSEDED BY AM-05.

1. Use the recollected meaning together with the PRD requirements that cite the rule in their Trace column.
2. If the behavior is still unclear after that, the item is **BLOCKED**: ask the product owner before implementing.

## Status of these documents

The PRD describes required product behavior, not what is built. See [RECONCILIATION.md](RECONCILIATION.md) for what the repository actually implements.
