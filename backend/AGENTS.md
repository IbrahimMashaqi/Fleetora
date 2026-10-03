# Fleetora Backend — AGENTS.md

## Purpose

This file defines the rules for AI-assisted development inside `backend/`.

These instructions apply to all backend code unless a more specific `AGENTS.md` exists deeper in the directory tree.

The goal is to help AI tools make safe, minimal, architecture-aware changes without inventing product requirements or bypassing Fleetora's security boundaries.

---

# 1. Project Context

Fleetora is a multi-tenant logistics SaaS platform.

The backend is the authoritative source for:

- authentication
- authorization
- tenant isolation
- business rules
- shipment lifecycle rules
- operational data
- database integrity
- audit-sensitive actions
- AI tool authorization and execution

Current backend technologies include:

- NestJS
- TypeScript
- PostgreSQL
- Prisma 8
- JWT authentication
- REST APIs
- Vitest

Do not assume that planned technologies or modules already exist.

---

# 2. Source of Truth

Before implementing a change, distinguish between:

1. current implementation
2. documented target architecture
3. undecided product or architecture decisions

The existing code describes the current implementation.

`../docs/Fleetora_Master_Project_Document.md` describes the intended product and architecture, but not every item in that document is implemented or finalized.

Do not silently resolve conflicts between documentation and code.

If documentation and implementation disagree:

1. identify the conflict
2. determine whether the requested task already implies the intended behavior
3. if the difference affects security, database design, API contracts, tenant boundaries, or core domain behavior, ask before making a major architectural decision

Never invent missing business requirements.

---

# 3. Architecture

Use modular NestJS architecture.

Current/general structure:

```text
src/
├── common/
├── modules/
└── prisma/
```

Do not assume a directory exists merely because documentation mentions it.

Keep features inside their appropriate modules.

Prefer clear module boundaries over large shared services.

---

# 4. Responsibility Boundaries

## Controllers

Controllers handle HTTP concerns.

They may:

- receive requests
- apply guards/decorators
- parse validated DTOs
- call application/domain services
- return responses

Controllers must not contain substantial business logic.

Controllers must not directly implement database workflows.

## Services

Services contain application and business logic.

Examples:

- shipment transitions
- assignments
- permission-sensitive operations
- workflow validation
- transactional operations

Business rules must be enforced server-side.

## Repositories

Use repositories when they provide a meaningful data-access boundary.

Do not create repository abstractions merely to satisfy a pattern.

Repositories should:

- encapsulate meaningful database operations
- preserve tenant scoping
- keep database-specific queries out of domain logic when useful

Do not create interfaces/factories/repositories for trivial operations without a concrete benefit.

---

# 5. Engineering Principles

Use SOLID and clean-code principles pragmatically.

Prefer:

- small focused functions
- explicit behavior
- meaningful names
- composition
- strong types
- minimal duplication
- clear module boundaries

Avoid:

- unnecessary inheritance
- speculative abstractions
- premature infrastructure
- pattern-driven complexity
- hidden side effects
- clever code that reduces readability

Simple and maintainable is preferred over clever and complex.

Do not over-engineer for hypothetical future requirements.

---

# 6. DTOs and Validation

Use DTOs for external API input.

Never use Prisma models directly as request DTOs.

Use `class-validator` and the project's existing validation pipeline.

DTOs must be specific to their operation.

Prefer:

```text
CreateShipmentDto
UpdateShipmentDto
AssignShipmentDto
```

instead of one generic DTO containing unrelated fields.

DTOs define and validate input structure.

DTOs must not contain business logic.

Validation at DTO level does not replace authorization or domain validation.

---

# 7. Authentication

Fleetora uses JWT-based authentication.

Access and refresh token behavior must remain explicit and reviewable.

Do not:

- expose tokens
- log credentials
- expose password hashes
- bypass authentication for convenience
- weaken authentication checks to make a feature work

Authentication proves identity.

Authentication alone does not prove authorization.

Account status and other security-sensitive checks must be enforced by the backend according to the approved domain model.

Do not invent authentication flows for new actor types without checking existing requirements.

---

# 8. Authorization

Authorization belongs on the backend.

A valid JWT does not automatically authorize an operation.

Authorization may depend on:

- authenticated user
- role
- permission
- tenant/company
- resource ownership
- resource state
- domain rules

Do not rely on frontend visibility or disabled buttons as authorization.

Never implement security rules only in the client.

---

# 9. Multi-Tenancy

Fleetora is multi-tenant.

Tenant isolation is a critical security boundary.

Never allow one company to access or mutate another company's resources.

Do not trust `companyId` supplied by request bodies as proof of tenant ownership.

Tenant context must come from trusted authenticated/server-side context according to the approved identity model.

Tenant-owned database operations must be scoped appropriately.

When accessing related resources, verify that the relationship does not cross tenant boundaries.

Example:

A shipment belonging to Company A must never be assignable to a worker belonging to Company B.

The existence of foreign keys alone does not prove tenant safety.

For tenant-sensitive changes, consider protection at:

- authentication context
- authorization/service layer
- repository/query layer
- database integrity layer
- tests

Never remove tenant filters for convenience.

---

# 10. Domain Rules

The backend owns Fleetora business rules.

Clients request actions; they do not define whether those actions are valid.

Shipment status changes are domain operations.

Do not allow arbitrary status updates such as:

```text
PATCH shipment
status = anything
```

without domain validation.

Shipment transitions must follow the approved lifecycle/state machine.

Assignment, delivery, proof-of-delivery, cancellation, failure, rescheduling, and similar workflows must be validated by backend domain logic.

If the lifecycle or business rule required by a task has not been decided, do not invent it.

---

# 11. Prisma and Database

Fleetora currently uses Prisma 8.

Use the Prisma APIs and conventions actually present in this repository.

Do not assume syntax from older Prisma versions.

Before modifying Prisma-related code:

1. inspect `prisma.config.ts`
2. inspect `src/prisma/contract.prisma`
3. inspect existing generated/migration workflow
4. follow the repository's actual Prisma 8 setup

Do not introduce another ORM.

Keep database access type-safe.

Use transactions when multiple writes must succeed or fail atomically.

Consider concurrency when operations may modify the same operational resource.

Database constraints should protect important invariants when practical.

Application validation is not always a substitute for database integrity.

---

# 12. Generated Files and Migrations

Do not manually edit generated Prisma artifacts unless the repository explicitly requires it.

Files under generated Prisma output or migration snapshots should be treated as generated artifacts unless verified otherwise.

Schema changes must follow the project's actual Prisma generation/migration workflow.

Never:

- fabricate migration files
- delete migration history casually
- reset a shared database without explicit instruction
- perform destructive schema operations without approval
- modify generated output as a substitute for modifying the source contract

Before a destructive database change, stop and request confirmation.

---

# 13. Transactions and Concurrency

Use transactions for workflows that must remain atomic.

Examples may include:

- creating multiple dependent records
- assignment operations
- state transitions plus history/audit records
- operations that update related resources together

Do not assume a read-then-write sequence is concurrency-safe.

For operations vulnerable to races, reason explicitly about concurrent requests and database constraints.

---

# 14. Errors

Do not leak:

- database internals
- stack traces
- secrets
- password hashes
- tokens
- sensitive infrastructure information

Use the project's existing exception and response patterns.

Do not invent a second incompatible error format without a requirement.

Expected domain failures should become appropriate application/HTTP errors.

Unexpected failures should remain diagnosable through safe server-side logging.

---

# 15. Security

Security-sensitive code requires conservative changes.

Never:

- disable authorization temporarily
- hardcode secrets
- commit credentials
- expose environment values
- trust client-provided ownership information
- bypass validation
- weaken guards to make tests pass
- log sensitive authentication material

Environment files must use placeholders/examples where appropriate.

If a credential appears real or accidentally committed, report it instead of reproducing it.

---

# 16. Audit and Operational History

Important operational actions should be auditable where required by the domain.

Do not silently overwrite meaningful operational history when the system requires traceability.

When implementing sensitive state-changing workflows, consider:

- actor
- action
- target resource
- timestamp
- previous state
- resulting state
- relevant metadata

Do not invent a full audit infrastructure unless the task requires it, but avoid designs that make future auditing impossible.

---

# 17. AI Boundary

The AI layer is not the source of truth for Fleetora business rules.

The backend remains authoritative for:

- authentication
- authorization
- tenant isolation
- domain validation
- database writes
- sensitive operational actions

Future AI services must interact with operational capabilities through controlled backend interfaces/tools.

Do not give an AI service unrestricted direct database access.

Do not move core Fleetora business rules into prompts.

AI-generated actions must still pass normal backend authorization and domain validation.

Detailed AI architecture belongs to the AI service rules when that service is introduced.

---

# 18. TypeScript

Avoid `any`.

Do not use `@ts-ignore` or equivalent mechanisms merely to hide type errors.

Prefer:

- explicit domain types
- inferred types where clear
- existing project types
- narrow interfaces
- typed return values where useful

Do not duplicate generated database types unnecessarily.

Keep code readable and predictable.

---

# 19. Testing

Fleetora currently uses Vitest.

Do not assume Jest APIs or configuration unless the repository explicitly introduces Jest later.

Add or update tests when behavior changes.

Prioritize tests for:

- authentication
- authorization
- tenant isolation
- shipment lifecycle rules
- assignment rules
- state transitions
- validation
- cross-company access attempts
- transactional behavior
- security-sensitive failure cases

Test negative paths, not only successful requests.

A tenant-sensitive feature is not complete if cross-tenant failure behavior is untested.

---

# 20. Before Changing Code

Before implementation:

1. read the relevant module
2. inspect related DTOs, services, repositories, guards, and schema
3. check relevant documentation
4. identify existing patterns
5. identify security and tenant implications
6. determine whether the requested behavior is already decided

Do not begin with a rewrite.

Prefer the smallest coherent change that satisfies the requirement.

---

# 21. After Changing Code

Verify the smallest relevant scope first.

Depending on the change, run:

- relevant tests
- type checking
- linting
- backend build
- Prisma validation/generation checks

For database changes, inspect the resulting schema/migration changes before considering the task complete.

Do not claim a change works if it has not been verified.

If verification cannot be run, state that explicitly.

---

# 22. Scope Control

Do not modify unrelated files.

Do not:

- rewrite architecture without being asked
- rename broad directory structures casually
- install dependencies without a concrete requirement
- downgrade Prisma
- replace working libraries merely because another library is preferred
- implement future roadmap features during an unrelated task
- delete existing functionality without approval

Keep diffs focused and reviewable.

---

# 23. Decision Escalation

Stop and ask before making a major decision when requirements are unclear and the decision affects:

- database schema
- tenant ownership
- authentication model
- authorization model
- role semantics
- public API contracts
- shipment lifecycle
- destructive migrations
- security boundaries
- external infrastructure
- irreversible data behavior

For small implementation details that do not change architecture or product behavior, follow existing project patterns instead of asking unnecessarily.

---

# 24. Definition of Done

A backend change is not complete merely because code was generated.

For the relevant scope, verify:

- behavior matches the requested requirement
- types are correct
- input is validated
- authorization is enforced
- tenant isolation is preserved
- business rules remain server-side
- database integrity is preserved
- errors are handled safely
- tests cover important success and failure paths
- relevant checks pass
- unrelated files were not modified

---

# 25. Priority Order

When trade-offs occur, prioritize:

```text
Correctness
→ Security
→ Tenant Isolation
→ Data Integrity
→ Business Rules
→ Type Safety
→ Maintainability
→ Simplicity
→ Performance Optimization
```

Do not sacrifice correctness or security for convenience.

Do not sacrifice simplicity for speculative scalability.