# Fleetora product documentation

This folder holds the approved product baseline for Fleetora and the reconciliation of that baseline against the repository.

## Files

| File | What it is |
| --- | --- |
| [PRD.md](PRD.md) | Product Requirements Document v1.0 (converted from the approved PDF; FR ids and BR/AM traces unchanged). |
| [BUSINESS_RULES.md](BUSINESS_RULES.md) | Business rule inventory BR-001–BR-137 and amendments AM-01–AM-05. |
| [MASTER_PROJECT.md](MASTER_PROJECT.md) | Master project document: strategy, roles, conceptual architecture, approved amendments AM-01–AM-04. |
| [ARCHITECTURE_BLUEPRINT.md](ARCHITECTURE_BLUEPRINT.md) | Proposed architecture/database blueprint. A proposal, not a decision. |
| [RECONCILIATION.md](RECONCILIATION.md) | Phase 0 audit: what the repository implements against this baseline, and the open owner decisions. |

## Authority order

When sources disagree, the higher entry wins:

1. **AM-01..AM-05** — approved amendments (in [BUSINESS_RULES.md](BUSINESS_RULES.md)). AM-05 (approved 2026-11-25) supersedes the "no merchant staff" parts of BR-078–BR-080 and of the PRD.
2. **BR-094..BR-137** — verbatim approved business rules (in [BUSINESS_RULES.md](BUSINESS_RULES.md)).
3. **[PRD.md](PRD.md)** — consolidated functional requirements.
4. **[ARCHITECTURE_BLUEPRINT.md](ARCHITECTURE_BLUEPRINT.md)** — proposal only; never treated as an approved requirement.
5. **[docs/merchant-business-model.txt](../merchant-business-model.txt)** — historical; superseded wherever it conflicts with the sources above.

## BR-001..BR-093

These rules are approved, but their verbatim approval text is not on file (BUSINESS_RULES.md holds placeholders only). Do not implement from the placeholders. Instead:

1. Use the PRD requirements that cite the rule in their Trace column.
2. If the behavior is still unclear after that, the item is **BLOCKED**: ask the product owner before implementing.

## Status of these documents

The PRD describes required product behavior, not what is built. See [RECONCILIATION.md](RECONCILIATION.md) for what the repository actually implements.
