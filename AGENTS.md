# Fleetora — Project Agent Instructions

This file applies to the entire project. Read it before working, then read the `AGENTS.md` files along the path to the affected code. More specific instructions refine these rules within their own scope.

## Project and requirements

Fleetora is a multi-tenant logistics platform with a web frontend, a NestJS backend, and an AI service. The logistics core must work independently of AI.

- Read `docs/Fleetora_Master_Project_Document.md` before product, architecture, or domain changes. If unavailable, report the missing reference instead of inventing requirements.
- Distinguish approved requirements, current implementation, conceptual examples, and future plans. Do not implement roadmap features merely because the document mentions them.
- Inspect code to understand what exists; do not assume documented modules, versions, paths, or integrations are already implemented.
- Apply the user's explicit task within the approved scope. If it changes an established requirement or security boundary, identify the conflict instead of silently choosing.
- Project skills describe implementation methods; they do not authorize new product behavior or override approved requirements.
- Do not transfer requirements from other projects into Fleetora.

## Working method

1. Understand the requested outcome and inspect relevant code and local instructions.
2. State a brief plan covering the change and its verification.
3. Implement the smallest coherent solution using established patterns.
4. Verify the affected behavior and correct failures caused by the change.
5. Report the outcome, evidence, and any remaining limitation.

Carry authorized work through implementation and verification. Do not stop at a proposal when implementation was requested.

Proceed with routine, reversible choices such as naming, component composition, spacing, and internal helpers. Ask only when investigation leaves a material requirement unresolved, especially around domain behavior, public contracts, ownership, security, or destructive operations. Ask the smallest useful question and continue independent work.

When debugging, inspect or reproduce the failure and identify the cause before editing. Avoid speculative patches and silent fallbacks that disguise invalid behavior.

If `docs/CODEX_WORKFLOW.md` exists, follow its applicable workflow and verification guidance. Do not assume it exists or use a missing file as a reason to abandon otherwise clear work.

## Route work to the right area

| Area                              | Instructions and responsibilities                                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `frontend/`                       | Read `frontend/AGENTS.md`. Own presentation, interaction, client state, and API consumption.                                  |
| `backend/`                        | Read `backend/AGENTS.md`. Own identity, authorization, company isolation, domain rules, persistence, and operational history. |
| `ai/`                             | Read `ai/AGENTS.md` if present. Own reasoning, recommendations, agent orchestration, and controlled tool use.                 |
| Shared contracts or configuration | Inspect every affected consumer; keep changes compatible or explicitly handle the required transition.                        |

For tasks spanning applications, trace the actual request and data flow. Complete all authorized affected layers; do not treat a UI change as finished when its required backend behavior is missing.

## Use relevant skills

Inspect available project skills under `.agents/skills/` when present. Read the relevant `SKILL.md` before applying it; never claim to have used a skill that was not available or read.

Typical routing, when these skills exist:

- Frontend implementation: `frontend-engineering`.
- Layout, interaction, accessibility, or responsive behavior: `ui-ux-design`.
- Shared UI components, tokens, typography, or visual consistency: `design-system`.
- Backend implementation: `backend-engineering`.
- Prisma, queries, transactions, constraints, or migrations: `database-prisma`.
- Authentication, permissions, company ownership, or sensitive data: `backend-security`.
- AI work: inspect available AI-specific skills and local instructions; do not invent a skill name or architecture.

Load only relevant skills. A small task does not require every skill associated with its application. If a required skill is missing, explain the gap; otherwise use established project patterns without pretending the skill exists.

## Preserve system boundaries

- The backend is authoritative for business rules, permissions, company ownership, and operational writes.
- Frontend validation improves usability; it does not replace server validation or authorization.
- Database constraints complement application rules and protect important invariants.
- AI must use controlled backend interfaces with trusted actor/company context and normal authorization. Model-generated arguments never grant permissions.
- Do not give AI unrestricted access to operational data or move domain rules into prompts.
- Preserve required approval and audit behavior for AI actions. Do not introduce a new automation system outside the requested scope.

## Company isolation and security

- Resolve ownership and tenant context from trusted server-side identity, not client-supplied fields.
- Scope company-owned reads and writes, including lists, counts, exports, bulk actions, nested relationships, background tasks, caches, and AI retrieval.
- Check related-resource ownership before creating relationships. Foreign keys alone may not prevent cross-company links.
- Keep platform-wide privileges explicit; absent company context must not silently grant global access.
- Never weaken guards, validation, or ownership checks to make functionality work.
- Do not expose secrets, credentials, tokens, password hashes, or full environment values in responses, logs, or generated artifacts.
- Reuse existing error and serialization conventions; return only authorized data.
- Test relevant denied access and cross-company attempts when changing these boundaries.

## Frontend expectations

- Follow the existing theme, design tokens, component system, route structure, and API layer.
- Inspect the user's workflow before designing an interaction. Avoid unnecessary steps or implementation details in product UI.
- Handle loading, empty, error, success, and submission states where relevant.
- Preserve keyboard access, visible focus, labels, readable contrast, and responsive behavior.
- Do not invent endpoints, payload fields, permissions, or successful responses. Use the actual API contract.
- Prevent stale data from appearing under a different signed-in user or company; follow existing session and cache handling.
- Do not redesign unrelated screens or add a second competing design system.

## Backend and data expectations

- Keep controllers focused on HTTP concerns, services on use cases, and persistence in established data-access boundaries.
- Validate external input and restrict writable fields. Keep domain actions, including shipment transitions and assignment, governed by approved rules.
- Use atomic writes where partial completion would break integrity, and address relevant concurrency risks.
- Inspect actual Prisma configuration, source schema, and migration workflow before persistence changes. Do not manually edit generated output.
- Explain schema impact on existing data and inspect generated migrations.
- Do not reset shared databases, delete migration history, perform destructive operations, or apply changes to remote/shared infrastructure without explicit authorization.

## Scope and code quality

- Preserve existing behavior outside the task; avoid unrelated edits and broad rewrites.
- Use actual project versions and commands from configuration. Do not assume tools from memory.
- Prefer clear names, focused units, strong types, and explicit behavior.
- Avoid unchecked casts, error suppression, speculative abstractions, duplicate logic, and unnecessary dependencies.
- Keep production paths complete. Do not substitute fake persistence, placeholder success, or unfinished stubs for required functionality.
- Flag useful out-of-scope work separately instead of silently adding it.

## Verification and completion

Choose checks that provide evidence for the changed behavior. Discover commands from project configuration and apply documented required checks.

- Logic changes: focused success and failure tests plus applicable type or lint checks.
- Security or company-owned data: relevant allowed, denied, and cross-company tests.
- Database changes: applicable Prisma checks, migration inspection, and persistence tests.
- API changes: request/response behavior and affected client compatibility.
- UI changes: affected user flow, meaningful states, responsiveness, and accessibility; use real browser verification when available and appropriate.
- AI changes: tool authorization, tenant context, failure handling, and structured-output behavior where affected.
- Shared configuration or module wiring: relevant build, startup, or integration checks.

Start with focused checks and broaden when shared effects, failures, or unresolved risk justify it. Do not skip tests, remove assertions, or lower checks to make results pass.

Never claim that something works or passes without evidence. State what passed, what failed, and what could not be checked. Do not describe mocked checks as live integration verification.

Use the user's language for explanations and existing project conventions for code. End with a concise account of what changed, why, relevant verification results, and material unresolved issues.

## Do not change any md document unless i tell you