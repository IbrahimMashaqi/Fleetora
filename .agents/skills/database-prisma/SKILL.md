---
name: database-prisma
description: Database engineering rules for Fleetora using Prisma 8 and PostgreSQL. Use when modifying schemas, models, relations, queries, transactions, indexes, constraints, migrations, tenant-scoped persistence, or reviewing database code.
---

# Fleetora Database & Prisma Engineering

## Purpose

This skill defines database engineering rules for Fleetora.

Fleetora uses:

- PostgreSQL
- Prisma 8
- multi-tenant relational data

This skill focuses on:

- schema design
- Prisma usage
- relational integrity
- tenant integrity
- transactions
- concurrency
- indexes
- uniqueness
- migrations
- query safety
- database performance

It complements:

- root AGENTS.md
- backend/AGENTS.md
- backend-engineering skill
- backend-security skill
- Fleetora project documentation

The database is not merely storage.

It should protect important invariants whenever reasonably possible.

---

# 1. Inspect Before Changing

Before modifying database-related code:

1. inspect `backend/src/prisma/contract.prisma`
2. inspect `backend/prisma.config.ts`
3. inspect existing migrations/snapshots
4. inspect generated Prisma artifacts
5. inspect the affected NestJS modules
6. inspect existing relationships
7. inspect relevant business rules
8. inspect existing data assumptions
9. inspect the installed Prisma version and project scripts

Do not assume conventional Prisma project structure if this repository uses a different Prisma 8 workflow.

---

# 2. Prisma Version

Fleetora uses Prisma 8.

Use APIs and workflows compatible with the version actually installed in the repository.

Do not:

- assume Prisma 6 or 7 syntax
- downgrade Prisma
- replace Prisma with another ORM
- copy migration commands blindly from older tutorials

When uncertain about Prisma behavior, inspect the installed package/version and local documentation before modifying code.

---

# 3. Source of Truth

Treat the project's Prisma contract/source definition as the source for database model changes.

Do not manually modify generated files to simulate schema changes.

Generated files should be regenerated through the project's supported workflow.

Do not manually edit migration snapshots unless the project's Prisma workflow explicitly requires it.

---

# 4. Model the Domain, Not the UI

Database models should represent domain concepts and invariants.

Do not shape the database around one frontend screen.

Examples of domain concepts include:

- Company
- User
- Merchant
- Worker
- Vehicle
- Warehouse
- Zone
- Shipment
- Assignment
- Delivery
- ProofOfDelivery
- Notification
- AuditLog

Only introduce models that are actually required by approved product/domain decisions.

Do not create speculative tables.

---

# 5. Multi-Tenant Ownership

Fleetora is multi-tenant.

Company-owned resources must have an explicit and reliable ownership path.

When practical, tenant-owned root resources should carry `companyId`.

Examples:

```text
Worker.companyId
Vehicle.companyId
Warehouse.companyId
Shipment.companyId
Merchant.companyId
```
