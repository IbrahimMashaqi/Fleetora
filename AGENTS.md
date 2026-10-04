# Fleetora Agent Instructions

## Project Context

Fleetora is a multi-tenant logistics SaaS.

Before making architectural or domain decisions, inspect:

- `docs/Fleetora_Master_Project_Document.md`
- the relevant application `AGENTS.md`
- the existing implementation

The documentation describes the intended product and architecture.
The code describes the current implementation.

If they conflict, do not silently guess.
Identify the conflict and ask when the decision affects architecture,
database design, security, tenant isolation, or API contracts.

---

## Working Method

For every task:

1. Understand the requested outcome.
2. Inspect the relevant existing files.
3. Determine which project skills apply.
4. Read and apply those skills before modifying code.
5. Check the relevant local `AGENTS.md`.
6. Make the smallest correct change.
7. Validate the result.
8. Report what changed and any unresolved issue.

Do not start coding before understanding the affected scope. Read wider architecture when the task touches it.

## Task Paths

Use `docs/CODEX_WORKFLOW.md` for the canonical FAST PATH, DECISION PATH, and proportional verification model. Default to FAST PATH when the request is clear, scoped, reversible, and supported by established Fleetora rules or patterns.

Routine implementation choices—including UI composition and responsive details—do not need user approval. Do not add a brainstorming interview, plan, or checkpoint solely because a task is frontend work or introduces a component. Escalate only for a material unresolved decision. Preserve all applicable security, tenant-isolation, database-safety, and product rules. This repository-level fast path does not erase a mandatory Superpowers plugin gate; see the workflow note. The plugin's own rules give precedence to a current explicit user instruction.

---

## Skill Routing

Fleetora contains specialized skills under:

`.agents/skills/`

Use the relevant skills automatically according to the task.

### Frontend

For frontend implementation, refactoring, Next.js architecture,
React components, API integration, state handling, or TypeScript:

Use:

- `frontend-engineering`

Also use:

- `ui-ux-design` when the task affects user experience, layout,
  interaction, responsive behavior, accessibility, or visual hierarchy.

- `design-system` when the task affects reusable components,
  typography, spacing, colors, tokens, forms, tables, buttons,
  navigation, or visual consistency.

For substantial UI work, these skills should normally be considered together:

`frontend-engineering + ui-ux-design + design-system`

Always follow `frontend/AGENTS.md`.

---

### Backend

For NestJS modules, controllers, services, DTOs, repositories,
business logic, TypeScript backend code, or API implementation:

Use:

- `backend-engineering`

Also use:

- `database-prisma` when the task touches Prisma, schema,
  database queries, relations, migrations, transactions, indexes,
  constraints, or persistence design.

- `backend-security` when the task touches authentication,
  authorization, JWT, refresh tokens, roles, permissions,
  tenant isolation, user/company access, passwords, or sensitive data.

Examples:

Authentication task:

`backend-engineering + backend-security + database-prisma` when persistence is involved.

Shipment CRUD:

`backend-engineering + database-prisma + backend-security`

because Shipment is tenant-owned.

Database schema change:

`database-prisma + backend-engineering`

and include `backend-security` if tenant ownership or authorization
is affected.

Always follow `backend/AGENTS.md`.

---

## Multi-Skill Tasks

Do not assume that every task belongs to exactly one skill.

Use multiple skills when the task crosses concerns.

Example:

Building the shipment management page may require:

- frontend-engineering
- ui-ux-design
- design-system
- backend-engineering
- database-prisma
- backend-security

But only load/apply skills that are relevant to the requested task.

Do not use skills mechanically when they do not apply.

---

## Source of Truth

Use this precedence:

1. Explicit user instruction for the current task
2. Security and tenant-isolation requirements
3. Relevant local `AGENTS.md`
4. Relevant Fleetora skills
5. Approved architecture/domain decisions
6. `docs/Fleetora_Master_Project_Document.md`
7. Existing implementation patterns

Existing code must be inspected before modification.

Do not blindly copy an existing pattern if it violates a higher-priority
security, tenant, or architecture rule.

---

## Architecture Boundaries

Backend owns:

- business rules
- authorization
- tenant isolation
- shipment lifecycle
- data integrity

Frontend owns:

- presentation
- interaction
- client-side state
- API consumption

Frontend must not become the authority for business rules.

The database complements backend enforcement with appropriate
constraints and integrity rules.

---

## Multi-Tenancy

Fleetora is multi-tenant.

Treat tenant isolation as a system-wide invariant.

Whenever working with company-owned resources, consider:

- authenticated company context
- authorization
- resource ownership
- query scoping
- cross-tenant relationships
- negative cross-tenant tests

Never trust `companyId` from request input as authorization.

---

## Before Editing

Inspect before modifying.

For backend work, inspect:

- affected module
- DTOs
- service
- repository/data access
- Prisma schema when relevant
- auth/security context
- tests

For frontend work, inspect:

- affected route
- components
- existing design patterns
- API layer
- loading/error handling
- responsive behavior

Do not create duplicate architecture without checking what already exists.

---

## Database Changes

Before changing the database:

1. Read `database-prisma` skill.
2. Inspect the current Prisma contract.
3. Inspect affected relationships.
4. Check tenant ownership.
5. Check indexes and constraints.
6. Determine migration impact.

Never edit generated Prisma files manually.

Never perform destructive database operations without explicit approval.

---

## Security-Sensitive Changes

Before changing authentication, authorization, tenant isolation,
roles, permissions, password handling, or token behavior:

1. Read `backend-security`.
2. Inspect the existing auth implementation.
3. Identify the security boundary.
4. Add negative/security tests where appropriate.

Do not weaken security to make a feature easier to implement.

---

## UI Work

Do not produce generic starter-template UI.

When implementing Fleetora UI:

1. Understand the workflow.
2. Use the design system.
3. Apply UX principles.
4. Preserve visual consistency.
5. Handle loading, empty, error, and success states.
6. Consider responsiveness and accessibility.

Do not redesign unrelated areas unless requested.

---

## Decision Handling

Proceed autonomously when ambiguity is limited to reversible implementation details and existing requirements, code, or project rules support a reasonable choice. Do not ask the user to approve routine component composition, naming, spacing, responsive behavior, or other local choices.

Use the DECISION PATH in `docs/CODEX_WORKFLOW.md` only when investigation leaves a material decision unresolved—for example, one affecting database design, authentication, authorization, tenant isolation, API contracts, business behavior, major architecture, destructive operations, or another difficult-to-reverse outcome.

When blocked, ask the minimum question needed to resolve that decision and explain its impact. Continue independent work that does not depend on the answer. Do not turn a choice between acceptable reversible implementations into a user decision.

---

## Problem Solving

When a bug or architectural problem is reported:

Do not immediately patch symptoms.

First:

1. reproduce or inspect the problem
2. identify the root cause
3. identify affected layers
4. apply relevant skills
5. propose the smallest robust fix
6. implement
7. validate

Avoid temporary hacks unless explicitly requested.

---

## Code Quality

Prefer:

- clear code
- strong typing
- small focused units
- explicit business rules
- predictable behavior
- testable architecture

Avoid:

- `any`
- unnecessary abstractions
- speculative infrastructure
- duplicated logic
- giant services/components
- hidden side effects
- premature optimization

---

## Validation

Choose the least costly checks that provide adequate evidence for the changed scope, using the risk matrix in `docs/CODEX_WORKFLOW.md`. Do not run every test, lint, type-check, and build command by default for a localized change.

Keep required tests and broader checks for behavior, cross-cutting changes, and release-risk work. Database, authentication, authorization, and tenant-isolation changes retain their focused safety checks; proportional verification does not lower those standards.

Do not claim something works if it was not verified. Clearly state what was and was not tested.

---

## Git Discipline

Do not:

- modify unrelated files
- delete functionality without instruction
- rewrite large areas unnecessarily
- commit secrets
- force push
- reset user changes
- run destructive Git commands

Keep diffs focused and reviewable.

---

## Final Response After Work

After completing a coding task, report concisely:

1. What was changed
2. Why it was changed
3. Files affected
4. Validation performed
5. Remaining risks or decisions, if any

Do not provide a long tutorial unless requested.

---

## Core Principle

Use AI as an engineering agent, not as a code generator.

Inspect first.
Choose the relevant skills.
Understand the domain.
Respect architecture and security boundaries.
Implement the smallest correct solution.
Verify the result.