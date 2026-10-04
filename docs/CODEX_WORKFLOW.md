# Fleetora — Codex Engineering Workflow

## 1. Purpose

This document defines how Codex should work inside the Fleetora repository.

It does not replace:

- `AGENTS.md`
- backend engineering standards
- frontend design standards
- product documentation

Instead, it defines the engineering workflow used when analyzing, implementing, debugging, reviewing, or improving Fleetora.

The objective is simple:

> Codex should behave like an engineer working inside an existing product, not like a code generator responding to an isolated prompt.

---

# 2. Source of Truth Hierarchy

Follow the source-of-truth and conflict rules in the root `AGENTS.md` and the applicable local `AGENTS.md`. Inspect current code to establish what is implemented; consult approved product/domain documentation when the task depends on intended behavior.

Do not silently resolve a conflict that affects database design, security, tenant isolation, business rules, public API contracts, authentication, or major architecture. Use the DECISION PATH in this document when that conflict remains material after inspection.

---

# 3. Repository Context

Fleetora currently contains separate areas such as:

```text
/
├── AGENTS.md
├── backend/
│   ├── AGENTS.md
│   └── ENGINEERING_STANDARD.md
├── frontend/
│   ├── AGENTS.md
│   └── DESIGN_SYSTEM.md
└── docs/
    ├── Fleetora_Master_Project_Document.md
    └── CODEX_WORKFLOW.md
```

Do not assume every documented future application or module already exists.

Inspect the repository first.

---

# 4. Scope Resolution

Before doing work, determine which part of Fleetora owns the task.

Examples:

```text
Authentication problem
→ backend

Shipment business rule
→ backend

Database relationship
→ backend

Dashboard layout
→ frontend

Table usability
→ frontend

API integration
→ frontend + existing backend contract

Product/domain ambiguity
→ documentation + user decision
```

Do not spread a change across multiple applications unless the task actually requires it.

---

# 5. Read the Narrowest Relevant Context

Always read the root `AGENTS.md` and the `AGENTS.md` that applies to the files being changed. For cross-stack work, read the local rules for each affected application.

Then inspect the affected implementation and only the adjacent contracts, tests, schemas, or documentation that the change depends on:

- Read `frontend/DESIGN_SYSTEM.md` and the Fleetora design language for visual work.
- Read the actual backend/API contract when adding or changing API integration.
- Read Prisma/schema and migration guidance when persistence or relationships are involved.
- Read product documentation when intended domain behavior is not established in current code or approved requirements.
- Follow file-specific framework instructions. For example, `frontend/AGENTS.md` currently requires the relevant installed Next.js guide before frontend code changes; read the narrow relevant guide it calls for.

Reuse unchanged context already inspected in the current session. Do not repeatedly reread broad documents, unrelated modules, or all tests when the task does not depend on them.

---

# 6. Skills

Installed skills are engineering tools.

Use them deliberately.

A skill should be used when its specialization materially improves the task.

Examples:

```text
UI/UX skill
→ dashboard/page/component design

frontend engineering skill
→ React/Next.js implementation

backend engineering skill
→ NestJS/service/API architecture

clean-code skill
→ focused refactoring or maintainability review

database skill
→ schema/query/index/relationship work

security skill
→ auth/authorization/tenant-sensitive work

testing skill
→ test strategy or implementation

debugging skill
→ investigating unexpected behavior 
```

Do not invoke every skill for every task.

More skills do not automatically produce better engineering.

---

# 7. Skill Selection

Before implementation, ask:

```text
What expertise does this task actually require?
```

Then use the smallest useful skill set.

Example:

```text
Task:
Build shipment management table

Useful:
UI/UX
Frontend engineering

Possibly:
Accessibility

Not automatically required:
Database architecture
Backend refactoring
Security audit
```

Another example:

```text
Task:
Implement shipment assignment API

Useful:
Backend engineering
Database
Testing

Security/tenant expertise:
required because assignment is tenant-sensitive

UI/UX:
not relevant
```

---

# 8. Framework Documentation

Never rely blindly on remembered framework behavior when the repository explicitly requires local/current documentation.

This is especially important for the Fleetora frontend.

If `frontend/AGENTS.md` instructs Codex to inspect the installed Next.js documentation before coding, do so.

Use the version actually installed by the project.

Do not assume an older Next.js API or convention remains valid.

The same principle applies to Prisma 8 and other version-sensitive technologies.

---

# 9. Work Modes

Every task should conceptually fall into one of these modes.

```text
DISCOVER
PLAN
IMPLEMENT
DEBUG
REVIEW
REFACTOR
```

Do not confuse them.

---

# 10. DISCOVER Mode

Use DISCOVER when the request requires understanding the current system.

Examples:

```text
How does auth work?

Why do we have this relation?

Where should shipment assignment live?

What already exists for merchants?
```

In DISCOVER mode:

- inspect files
- trace relevant code
- inspect schema
- inspect documentation
- identify existing patterns
- report findings

Do not modify files unless explicitly asked.

---

# 11. PLAN Mode

Use PLAN when a separate sequence of work reduces architectural, coordination, or implementation risk. Sensitive subject matter calls for deeper inspection and the required safety checks, but does not automatically require a standalone plan for a clear, localized change.

Examples that may justify a plan, depending on scope and complexity:

- database schema changes
- authentication changes
- tenant architecture
- RBAC
- shipment lifecycle
- major API contracts
- cross-application features
- significant refactoring

A plan should identify:

```text
Goal
Current state
Relevant files
Proposed change
Security/tenant implications
Database implications
API implications
Tests
Risks
Open decisions
```

Planning should reduce uncertainty.

It should not become an essay for a trivial change.

---

# 12. IMPLEMENT Mode

Use IMPLEMENT when requirements are sufficiently clear.

Before writing code:

```text
Understand
→ Inspect
→ Select skills
→ Read relevant documentation
→ Determine smallest correct change
→ Implement
```

After writing:

```text
Validate
→ Test
→ Review diff
→ Report
```

---

# 13. DEBUG Mode

Debugging begins with evidence.

Use:

```text
Observed behavior
→ Expected behavior
→ Reproduction
→ Relevant logs/errors
→ Code path
→ Hypothesis
→ Verification
→ Fix
→ Regression test
```

Do not begin by randomly rewriting suspicious code.

Do not install dependencies simply because an error message looks unfamiliar.

Find the cause first.

---

# 14. REVIEW Mode

Review code differently from implementation.

Review should prioritize:

```text
Correctness
Security
Tenant isolation
Business rules
Data integrity
Regression risk
Tests
Maintainability
```

Do not spend most review effort on formatting while missing authorization problems.

Findings should explain:

```text
What is wrong?
Where?
Why does it matter?
How can it fail?
```

---

# 15. REFACTOR Mode

Refactoring should preserve behavior unless explicitly stated otherwise.

Before refactoring:

- understand existing behavior
- identify the concrete design problem
- verify tests where possible
- define the refactor boundary

Do not mix large refactoring with unrelated feature development.

---

# 16. FAST PATH and DECISION PATH

Choose a path by impact and unresolved risk, not by whether work involves frontend code, a new component, or multiple valid implementation details.

## FAST PATH

Use FAST PATH when the task is clear and scoped, reversible, consistent with Fleetora architecture and approved behavior, and does not change a sensitive contract or unresolved domain decision.

```text
Inspect relevant context
→ Load only relevant skills
→ Implement the smallest coherent change
→ Run proportional verification
→ Review the diff and report concisely
```

On this path:

- Make reasonable reversible choices from Fleetora conventions and continue without approval checkpoints.
- Derive routine UI composition, visual hierarchy, responsive behavior, and component choices from Fleetora's design system and UI/UX guidance. Do not ask the user to choose between routine layout alternatives.
- Do not require brainstorming solely because work is frontend, visual, or introduces a component.
- Create a plan only when complexity, dependencies, or risk make one useful; a component or endpoint alone is not a plan trigger.
- Read only relevant context and skills. Reuse unchanged findings from the current session.
- Do not add dependencies or abstractions without a concrete need.
- Do not run broad suites, builds, or repeated checks when narrower evidence is sufficient.

## DECISION PATH

Use DECISION PATH for work that touches a sensitive surface below or has a material unresolved decision affecting it:

- database schema, data model, migrations, or destructive data operations
- authentication, authorization, security boundaries, or tenant isolation
- public API contracts or cross-module architecture
- domain/business behavior or workflow semantics not established by requirements
- major dependency choices or difficult-to-reverse architecture
- conflicting authoritative project rules

First inspect applicable rules, current implementation, and approved requirements. A sensitive task requires the investigation and verification appropriate to its risk, but it does not automatically require a user question or standalone plan. If the requested behavior and approved rules resolve the decision, implement within that scope. Multiple valid reversible implementations do not qualify by themselves; choose the simplest compliant option.

If a material decision remains unresolved, stop dependent implementation and ask the minimum question needed to unblock it. Explain what is blocked and why it matters. Do not ask a series of preference questions. Continue independent work where possible. Keep existing database, security, tenant-isolation, and product safeguards intact.

# 17. Superpowers Constraint

Keep Superpowers available and follow a specialized workflow when its trigger genuinely applies. Repository instructions cannot disable a mandatory plugin workflow. The installed brainstorming skill currently says it must run before creative work and requires an explicit approval gate for its bounded path; its companion using-superpowers skill says direct current-user instructions take precedence over skills. Therefore, Fleetora rules alone cannot promise to bypass that plugin gate. Its broad creative-work trigger can still capture routine UI or component work; bypassing that gate requires an explicit current-user instruction under the plugin's own precedence. Honor an applicable mandatory plugin instruction unless the current user explicitly directs otherwise, and do not invoke brainstorming merely because a task is frontend when the user's instruction or the skill's applicable scope says it is not required. Verification-before-completion still requires fresh evidence for any success claim; the scope and cost of verification should follow the risk matrix below.

---

# 18. Backend Workflow

For backend tasks:

```text
1. Read applicable AGENTS.md
2. Read ENGINEERING_STANDARD.md when relevant
3. Inspect current module
4. Inspect related DTOs
5. Inspect Prisma contract if persistence is involved
6. Trace authentication/tenant context
7. Identify business invariants
8. Identify transaction requirements
9. Identify tests
10. Implement smallest correct change
11. Run targeted validation
12. Inspect diff
```

Never begin by creating a large architecture around a simple endpoint.

---

# 19. Backend Security Gate

For any tenant-owned backend feature, explicitly answer:

```text
Who is authenticated?

What company owns this resource?

Where does company context come from?

What permission is required?

Can another company reference this resource?

Are related resources from the same company?

Can the operation race?

Does it require a transaction?

What negative test proves isolation?
```

If these questions matter and are unanswered, the feature is not ready.

---

# 20. Frontend Workflow

For frontend tasks, read root and frontend rules, then inspect the affected route/components and nearby patterns. Keep further inspection tied to the change:

- For visual work, apply the canonical design system, Fleetora design language, and UI/UX guidance.
- For API integration, inspect the actual contract and affected loading/error/success behavior.
- For framework-sensitive code, follow the installed Next.js guidance required by `frontend/AGENTS.md`, using the relevant guide rather than broad unrelated docs.
- Load only the frontend, UI/UX, design-system, accessibility, or other skills that materially apply.
- Implement the smallest change, preserve established behavior, check the relevant responsive and accessibility dimensions, and select validation from Section 28.
- Review the final diff for scope and unintended contract or state changes.

Do not generate an isolated "pretty dashboard" that ignores the Fleetora design system.

---

# 21. Design Before JSX

For substantial UI work, determine the structure before implementation.

Think in terms of:

```text
User goal
→ Information hierarchy
→ Primary action
→ Secondary actions
→ Operational state
→ Layout
→ Components
→ Responsive behavior
```

Not:

```text
Open JSX
→ Add cards
→ Add gradients
→ Add icons
→ Hope it looks professional
```

---

# 22. Fleetora UI Quality Gate

Before accepting a page, ask:

```text
Does it look like Fleetora?

Can the user identify the important operational information quickly?

Is hierarchy clear?

Is density appropriate?

Are statuses consistent?

Are actions obvious?

Are loading/empty/error states handled?

Does it work at required viewport sizes?

Is accessibility acceptable?

Did we reuse tokens/components?

Did we avoid unnecessary visual noise?
```

---

# 23. Avoid Generic AI UI

Do not default to common generated-dashboard patterns.

Avoid unnecessary:

- giant welcome headings
- gradient blobs
- excessive rounded cards
- decorative KPI cards
- random colored icons
- glassmorphism
- fake charts
- meaningless animations
- excessive whitespace
- placeholder operational data presented as real

Fleetora should look intentionally designed for logistics operations.

---

# 24. API Contract Workflow

When frontend consumes backend functionality:

1. inspect the actual backend contract
2. identify request shape
3. identify response shape
4. identify error behavior
5. identify authentication requirement
6. implement typed frontend integration

Do not invent backend endpoints from frontend assumptions.

If the required endpoint does not exist, report that boundary.

---

# 25. Database Workflow

Before changing the database:

```text
Read current contract
→ Trace relationships
→ Understand tenant ownership
→ Determine required invariant
→ Determine cardinality
→ Consider existing data
→ Design change
→ Review migration impact
→ Validate
→ Test
```

Do not treat schema design as field addition.

Relationships are part of the domain model.

---

# 26. Migration Gate

Before applying a migration, inspect for:

```text
DROP
data loss
NOT NULL changes
unique constraints
foreign-key changes
cascade changes
type conversion
large table rewrite
```

Never casually apply destructive migrations to important environments.

---

# 27. Testing Workflow

Tests should follow risk.

For a simple utility:

```text
focused unit test
```

For a domain rule:

```text
unit + relevant integration
```

For tenant-sensitive data access:

```text
integration negative tests
```

For important workflow:

```text
E2E
```

Do not chase coverage percentage while missing critical business behavior.

---

# 28. Proportional Verification

Use the cheapest checks that adequately cover the changed scope. Run commands from the affected package and use existing scripts; do not install dependencies or invent a test harness just to satisfy a checklist. A check is required when the applicable local rules, changed behavior, or risk calls for it. Broader checks are optional unless that risk or a user request justifies them.

| Change scope | Minimum useful evidence | Add broader verification when |
|---|---|---|
| Agent/workflow documentation only | Review the focused diff, links, and consistency across affected instructions; no product test, lint, type check, or build is implied. | Documentation tooling or link validation is specifically part of the task. |
| Local styling, copy, or isolated component with unchanged behavior | Review the diff and the affected UI/responsive/accessibility details. Run a focused check if one exists and is useful; use lint/type checks when the code change warrants them. | Shared tokens/components or multiple routes are affected. |
| Feature behavior or API integration | Relevant feature tests when available, plus type/lint checks appropriate to the changed package. | Framework boundaries, shared integration, or broad user journeys changed; add the relevant suite/build. |
| Backend business logic | Focused unit/integration coverage for the changed rule, plus applicable backend type/build checks. | The behavior crosses modules or materially affects workflows; expand relevant integration coverage. |
| Database/schema/migration | Prisma validation and the repository-required schema/generation checks, migration review, and tests for affected persistence behavior. | Existing data, multiple relations, or rollout compatibility raises migration risk. |
| Authentication, authorization, security, or tenant isolation | Focused negative/security tests and checks of each affected enforcement layer; preserve backend and database safeguards. Tenant-sensitive behavior must retain cross-tenant failure coverage. | The boundary spans modules or clients; add broader integration/build checks for those boundaries. |
| Cross-cutting or release-risk change | Targeted checks in each touched package and a diff review. | Run broader suites and production builds when they provide meaningful coverage of the changed boundaries or are explicitly requested. |

Do not weaken sensitive verification to save time. Avoid repeating unchanged checks during iterative edits; run fresh verification before making a claim that a check passes. Report the checks actually run and any that remain relevant but unrun.

---

# 29. Final Diff Review

Before considering implementation complete, inspect the diff.

Check:

```text
Did we modify only intended files?

Did generated files change unexpectedly?

Did package files change unexpectedly?

Did we expose secrets?

Did we introduce any?

Did we weaken authorization?

Did we accidentally change API behavior?

Did we duplicate existing functionality?

Did we leave debugging code?

Did we add unnecessary dependencies?
```

The diff is part of the engineering process.

---

# 30. Dependency Rule

Do not install a package immediately because a feature exists.

First ask:

```text
Can the existing stack solve this cleanly?
```

Add a dependency only when it provides concrete value.

If adding one, verify:

- compatibility
- maintenance
- security
- necessity
- project conventions

---

# 31. Search and External Documentation

Use external search when current information is required.

Examples:

- framework breaking changes
- unfamiliar current APIs
- dependency behavior
- security advisories
- official migration guidance

Prefer official documentation for technical contracts.

Do not use random blog posts as authority when primary documentation exists.

---

# 32. Local Documentation First

If the project contains version-specific local documentation, prefer it for that installed version.

For example:

```text
frontend/node_modules/next/dist/docs/
```

when required by Fleetora's Next.js instructions.

This prevents implementation based on stale framework knowledge.

---

# 33. Product Documentation

Product documentation defines intent.

Do not treat every future idea in the master document as an instruction to implement it immediately.

Differentiate:

```text
Current requirement
Planned architecture
Future roadmap
Example
Recommendation
```

Only implement what the current task requires.

---

# 34. No Speculative Infrastructure

Do not create:

```text
Redis
queues
microservices
event buses
AI infrastructure
WebSockets
generic abstraction frameworks
```

because Fleetora may eventually use them.

Introduce infrastructure when a current requirement justifies it.

---

# 35. No Silent Architecture Changes

If solving a task requires changing a foundational decision, surface it.

Examples:

```text
User ↔ Worker relationship

Merchant account cardinality

Tenant membership model

Shipment state model

Subscription model

Authentication session model
```

Do not bury a domain decision inside a migration.

---

# 36. Preserve Existing Work

Do not delete or rewrite existing implementation simply because another design appears cleaner.

First determine:

```text
Why does this code exist?

Is it currently used?

Is it incorrect?

Is replacement required by the task?
```

Refactor intentionally.

---

# 37. Work Incrementally

For large features, prefer vertical increments.

Example:

```text
Shipment list
→ shipment details
→ shipment creation
→ assignment
→ lifecycle actions
```

rather than creating 40 files across the repository before any workflow works.

Each increment should leave the repository understandable.

---

# 38. Feature Completion

Do not equate:

```text
file created
```

with:

```text
feature implemented
```

A feature may require:

```text
backend behavior
database behavior
authorization
validation
UI states
tests
error handling
documentation
```

Report accurately what was completed.

---

# 39. Reporting After Implementation

After significant implementation, Codex should summarize concisely:

```text
What changed

Why

Files changed

Validation performed

Remaining limitations / decisions
```

Do not produce a massive narrative unless requested.

---

# 40. Reporting Failures

If validation fails, do not hide it.

Report:

```text
Command/check
Result
Likely cause
Whether caused by this change
```

Do not claim completion when required validation remains broken.

---

# 41. Questions and Approval Boundaries

Do not ask for approval to carry out the clearly requested, scoped work or for ordinary reversible implementation choices. Ask only after relevant inspection leaves a material product, security, contract, architecture, or data decision unresolved, as defined in Section 16. Ask the minimum question needed; do not bundle unrelated preferences.

Retain explicit approval boundaries already established by Fleetora rules for destructive database/data operations and other difficult-to-reverse actions. A request to implement a feature does not authorize silently changing its API contract, security guarantees, or unresolved domain behavior.

---

# 42. Example — Frontend Feature

Request:

> Build the Fleetora shipments page.

Workflow:

```text
Read frontend rules
→ Read Next.js local docs
→ Read canonical design system and design philosophy
→ Inspect current frontend
→ Inspect actual shipment API
→ Use UI/UX + frontend skills
→ Define operational information hierarchy
→ Build page/components
→ Add loading/empty/error states
→ Validate responsive behavior
→ Run checks
→ Review diff
```

Do not start by generating dashboard cards.

---

# 43. Example — Backend Feature

Request:

> Add shipment assignment.

Workflow:

```text
Read backend rules
→ Inspect Shipment + Worker schema
→ Inspect tenant/auth model
→ Determine allowed states
→ Determine worker eligibility
→ Determine cross-tenant constraints
→ Determine transaction
→ Determine history/audit behavior
→ Implement API/service/persistence
→ Add positive + negative tests
→ Validate Prisma if changed
→ Run backend checks
→ Review diff
```

---

# 44. Example — Bug

Request:

> Login succeeds for a disabled user.

Workflow:

```text
Reproduce
→ Trace controller/service/repository
→ Inspect account-state model
→ Confirm intended rule
→ Add failing regression test
→ Implement smallest fix
→ Test login
→ Test refresh/authenticated access if affected
→ Review diff
```

Do not rewrite authentication.

---

# 45. Example — Unclear Domain Requirement

Request:

> Add merchant users.

If it is unclear whether one merchant supports one or multiple users:

```text
Inspect product documentation
→ Inspect current schema
→ Determine whether existing decision exists
```

If still unresolved and schema cardinality depends on it:

```text
STOP implementation
→ explain alternatives
→ request domain decision
```

Do not silently choose a cardinality.

---

# 46. Recommended Prompt Pattern

When assigning work to Codex, prompts should preferably contain:

```text
Goal
Scope
Constraints
Expected behavior
Validation
```

Example:

```text
Goal:
Implement shipment listing for company administrators.

Scope:
Backend only.

Constraints:
Follow Fleetora AGENTS.md and backend engineering standards.
Tenant isolation is mandatory.
Do not change the Prisma schema unless required.
Do not install dependencies.

Expected behavior:
Return only shipments belonging to the authenticated company.
Support pagination and status filtering.

Validation:
Run the focused tests and checks appropriate to the change's risk. Expand verification for database, security, tenant-isolation, or cross-module impact.
```

This is much stronger than:

```text
make shipment api
```

---

# 47. Analysis Prompt Pattern

For investigation:

```text
Analyze only. Do not modify files.

Goal:
Understand how authentication and tenant context currently work.

Inspect:
- auth module
- token handling
- Prisma User/Company models
- relevant project documentation

Return:
1. Current behavior
2. Security gaps
3. Conflicts with documented architecture
4. Smallest recommended next step

Do not invent missing requirements.
```

---

# 48. Planning Prompt Pattern

For multi-step or architecture-level DECISION PATH work. A sensitive domain alone is not a plan trigger; retain its required investigation and safety checks even when a focused implementation needs no separate plan.

```text
Plan only. Do not modify files.

Goal:
[feature]

First inspect the current implementation and applicable Fleetora rules.

Return:
- relevant files
- current behavior
- proposed implementation
- database impact
- tenant/security impact
- API impact
- tests
- unresolved decisions

Stop if an unresolved product decision materially changes the architecture.
```

---

# 49. Implementation Prompt Pattern

Once the plan is approved:

```text
Implement the approved plan.

Follow all applicable Fleetora AGENTS.md files and engineering/design standards.

Requirements:
- keep the change focused
- preserve unrelated behavior
- do not add unnecessary dependencies
- enforce tenant/security rules
- add relevant tests
- run appropriate validation
- inspect the final diff

At the end report:
- files changed
- behavior implemented
- validation results
- remaining issues
```

---

# 50. Review Prompt Pattern

For reviewing work:

```text
Review the current diff.

Do not modify files.

Prioritize:
1. correctness
2. security
3. tenant isolation
4. business rules
5. data integrity
6. regression risk
7. tests
8. maintainability

For each finding provide:
- severity
- file/location
- problem
- failure scenario
- recommended fix

Do not report cosmetic preferences unless they materially affect maintainability.
```

---

# 51. Fleetora Engineering Loop

Choose the path by task risk. The routine loop is:

```text
UNDERSTAND
    ↓
INSPECT RELEVANT SCOPE
    ↓
LOAD RELEVANT SKILLS
    ↓
IMPLEMENT
    ↓
VERIFY PROPORTIONALLY
    ↓
REVIEW DIFF
    ↓
REPORT
```

Use the DECISION PATH and plan when material uncertainty or complexity requires them. Repeat only the steps needed to close the task.

---

# 52. Final Principle

Codex is not responsible for inventing Fleetora.

Codex is responsible for helping engineer Fleetora correctly.

The expected behavior is:

```text
Understand before changing.

Inspect before assuming.

Use specialized skills when useful.

Use current documentation for version-sensitive technology.

Keep business rules in their correct owner.

Treat tenant isolation as a system invariant.

Design UI around operational work, not decoration.

Prefer small, reviewable changes.

Test the dangerous cases, not only the happy path.

Surface product decisions instead of hiding them in code.

Never confuse generated code with completed engineering.
```