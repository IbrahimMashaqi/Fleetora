---
name: backend-engineering
description: Engineering rules for implementing, reviewing, debugging, and refactoring Fleetora's NestJS backend. Use for backend modules, controllers, services, repositories, DTOs, domain logic, errors, testing, architecture, and TypeScript code quality.
---

# Fleetora Backend Engineering

## Purpose

This skill defines how backend code should be engineered in Fleetora.

It complements:

- root AGENTS.md
- backend/AGENTS.md
- database-prisma skill
- backend-security skill
- Fleetora project documentation

This skill focuses on:

- NestJS architecture
- clean code
- SOLID
- domain boundaries
- maintainability
- backend implementation quality

Do not use this skill to invent product requirements.

---

# 1. Core Engineering Principles

Fleetora backend code should be:

- correct
- secure
- type-safe
- modular
- testable
- maintainable
- explicit
- simple

Prefer straightforward code over clever code.

Do not over-engineer.

Do not introduce abstractions for hypothetical future requirements.

---

# 2. Inspect Before Changing

Before modifying backend code:

1. read root AGENTS.md
2. read backend/AGENTS.md
3. inspect the relevant module
4. inspect related DTOs
5. inspect related services
6. inspect repository/database access
7. inspect existing tests
8. inspect the Prisma contract when data is involved
9. inspect project dependencies when framework behavior matters

Understand the existing implementation before proposing a new structure.

---

# 3. NestJS Module Boundaries

Organize business capabilities as modules.

Example:

```text
src/modules/
├── auth/
├── users/
├── companies/
├── workers/
├── vehicles/
├── warehouses/
├── shipments/
└── assignments/
```
