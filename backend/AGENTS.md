# Fleetora Backend — Agent Instructions

These instructions apply inside `backend/`. Read any more specific `AGENTS.md` in the affected directory before editing its files.

## 1. Understand the task before editing

Fleetora is a multi-tenant delivery management platform. Its backend owns authentication, authorization, company isolation, business rules, persistence, and operational history. Web, mobile, and AI clients use these rules through controlled interfaces.

- Read `../docs/Fleetora_Master_Project_Document.md` before planning a product or domain change. If it is missing, locate the actual project specification; do not invent its contents.
- Treat approved requirements as intended behavior, and code as evidence of current behavior. A roadmap item or conceptual example is not authorization to implement it.
- Inspect the affected module and its dependencies: DTOs, guards, services, persistence, schema, and relevant tests. Read only the parts needed to understand the change.
- Check `package.json`, configuration, and existing imports before assuming library versions, commands, paths, or available features.
- The expected stack is NestJS, TypeScript, PostgreSQL, and Prisma. Use the actual authentication implementation and test runner present in the project.
- Do not import requirements or design decisions from another project.

## 2. Work in a short, complete loop

1. State a short plan: intended behavior, affected areas, and how you will verify it.
2. Inspect the existing implementation and identify the cause or missing behavior.
3. Implement the smallest coherent change that satisfies the task.
4. Add or update meaningful tests when behavior changes.
5. Run the relevant checks, inspect their results, and correct failures caused by the change.
6. Report what changed, what was verified, and any remaining limitation.

Continue through implementation and verification when the request authorizes them. Do not stop after proposing a plan or generating code.

For routine implementation choices, follow existing patterns and proceed. Ask a focused question only when an unresolved requirement changes the result materially. State the exact ambiguity and its consequence; continue independent work when possible.

Do not claim completion, passing tests, or working behavior without evidence. Distinguish checks that passed, checks that failed, and checks that could not run.

## 3. Keep scope controlled

- Preserve existing functionality and public behavior outside the requested change.
- Fix the cause; do not hide the symptom with a fallback that silently accepts invalid behavior.
- Do not introduce unrelated refactors, broad renames, infrastructure, dependencies, or roadmap features.
- Extend the existing architecture before introducing a competing pattern.
- Do not create interfaces, repositories, factories, or base classes without a concrete benefit.
- If a useful improvement is outside scope, describe it separately instead of implementing it implicitly.
- Avoid placeholder success responses, fake persistence, and unfinished branches in production paths.

## 4. Respect module responsibilities

Follow the structure actually present in the project. Do not reorganize directories to match a diagram in documentation.

- **Controllers:** HTTP routing, validated input, guards, delegation, and response mapping. Keep substantial business logic and database workflows out of controllers.
- **Services:** use cases, business invariants, permission-sensitive actions, and transaction orchestration.
- **Persistence:** use the established Prisma service or meaningful repository boundary. Keep ownership filters explicit and reusable where appropriate.
- **DTOs:** operation-specific external input validation. Do not accept database models as request contracts.
- **Shared code:** genuinely shared behavior; do not turn `common/` into a home for unrelated feature logic.

Prefer focused functions, clear names, strong types, and straightforward control flow. Avoid `any`, unchecked casts, and suppression comments used to conceal errors. Use `unknown` and narrow it for untrusted values.

## 5. Enforce security on every relevant path

Authentication establishes identity; it does not grant unrestricted access.

- Use the existing authentication and authorization mechanisms. Verify that guards are applied and wired into the affected module.
- Enforce role, permission, ownership, account status, and resource-state rules where required by the approved model.
- Never rely on hidden frontend buttons or client validation for security.
- Never accept client-provided role, ownership, account status, or tenant fields as trusted authority.
- Allow only fields the operation is authorized to change. Do not pass an unrestricted request object into database writes.
- Do not bypass guards, weaken validation, or disable security checks to make a feature or test pass.
- Never expose or log passwords, password hashes, authentication tokens, secrets, or full environment values.
- Use existing response serialization and error conventions; return only fields intended for the caller.
- Keep expected domain failures clear, and unexpected failures diagnosable through safe server-side logging.

Do not introduce new account-deactivation semantics, authentication flows, or role privileges without requirements supporting them.

## 6. Preserve company isolation

Company isolation applies to reads and writes, including lists, counts, exports, nested relations, bulk operations, background work, and AI tools.

- Resolve tenant context from trusted authenticated/server-side state according to the existing identity model.
- Scope resource lookup by both resource identity and company ownership. Knowing a resource ID does not establish access.
- Validate that related resources belong to the permitted company before linking them.
- Scope updates and deletes as carefully as reads. Never remove ownership filters to make a query succeed.
- Keep platform-wide access explicit and permission-controlled; a missing company ID must not silently grant global access.
- Foreign keys prove relationships exist; they do not necessarily prove company ownership matches.
- Test attempted access to another company's data, including related-resource assignment where relevant.

## 7. Implement domain actions explicitly

- Shipment transitions must follow the approved lifecycle. Do not expose arbitrary status mutation through a generic update endpoint.
- Validate the current state, actor permissions, required inputs, and related-resource conditions before performing an action.
- Assignment must enforce the approved ownership, availability, and conflict rules. Do not invent capacity or scheduling rules.
- Preserve required shipment events and audit records when changing operational state.
- Keep business rules in the backend; client applications and AI prompts must not become alternative authorities.
- When the specification describes conceptual statuses or roles, confirm the concrete enum and supported transitions in the approved model before changing them.

## 8. Protect database integrity

- Inspect the actual Prisma configuration, source schema, generation setup, and migration workflow before changing persistence.
- Modify source contracts rather than generated Prisma output. Regenerate using the project's supported commands when needed.
- Use constraints for important invariants where appropriate, alongside application validation.
- Make related writes atomic when partial completion would leave invalid data. Include required state history in the same transaction where possible.
- Consider concurrent requests. A transaction alone does not automatically make a read-then-write check safe; use suitable constraints, conditional updates, locking, or isolation when necessary.
- Handle uniqueness and conflict errors using the existing application error pattern.
- For schema changes, explain existing-data compatibility, inspect the generated migration, and test the relevant behavior.
- Do not delete migration history, reset shared databases, or perform destructive data/schema changes without explicit authorization.
- Do not run migrations against a remote or shared database merely because local schema files changed.

## 9. Keep external work and AI controlled

- Reuse existing integration, configuration, timeout, and error-handling patterns.
- Do not hold a database transaction open across slow external calls unless the design specifically requires it.
- Where retries or duplicate requests matter, prevent duplicate effects using the established mechanism.
- AI tools must receive trusted actor/company context and use normal backend authorization and domain checks.
- Do not give AI unrestricted operational database access or let a model-generated argument grant permissions.
- Implement approvals and action history according to the approved feature requirements; do not invent a separate automation system during unrelated work.

## 10. Verify according to the change

Discover runnable commands from the project. Do not assume a test runner or invent scripts.

| Change | Required evidence |
| --- | --- |
| Documentation or formatting | Inspect the edited content; check affected syntax or formatting if applicable. |
| Local logic or DTO validation | Focused behavior tests, including relevant invalid inputs; applicable type/lint checks. |
| Endpoint or API contract | Relevant request/response tests, validation, error behavior, and compatibility with callers. |
| Authentication or authorization | Allowed and denied paths; verify enforcement on each affected entry point. |
| Company-owned resource | Same-company success, cross-company rejection, and related ownership checks. |
| Shipment state or assignment | Valid action, invalid state, conflict, and required history; concurrency checks when relevant. |
| Schema or persistence | Prisma validation/generation as needed, migration inspection, and affected persistence tests. |
| Module wiring, dependencies, or configuration | Applicable build/type checks and a focused startup or integration check. |

Tests should prove observable behavior rather than repeat implementation details. Keep existing test expectations meaningful; do not skip tests, remove assertions, or weaken checks to obtain a passing result.

Start with the smallest relevant verification scope. Broaden it when shared behavior, failures, or unresolved risk justify it. Follow additional documented project checks when applicable.

## 11. Communicate clearly

- Use the user's language for explanations. Follow existing conventions for code, identifiers, and technical documentation.
- Explain the outcome and its practical effect before implementation details.
- Keep updates short and useful: findings, decisions, blockers, and verification results.
- In the final response, summarize the change, relevant checks and results, and material unresolved issues.
- If blocked, state the specific missing information or failing prerequisite. Never disguise incomplete work as success.

Correctness, security, company isolation, and data integrity are mandatory. Within those boundaries, prefer the simplest maintainable implementation that fulfills the approved requirement.