# Fleetora — Backend Engineering Standard

## 1. Purpose

This document defines the engineering standards for Fleetora's backend.

It explains how backend code should be designed, structured, reviewed, and evolved.

The mandatory agent rules remain in:

`backend/AGENTS.md`

The product and domain direction remains in the Fleetora project documentation.

This document focuses on implementation quality.

Fleetora's backend must remain:

- correct
- secure
- tenant-safe
- predictable
- testable
- maintainable
- observable
- simple enough to understand

The goal is not to create the most abstract architecture possible.

The goal is to build a production-quality logistics backend that remains understandable as Fleetora grows.

---

# 2. Engineering Philosophy

Fleetora should use disciplined engineering without unnecessary complexity.

Prefer:

```text
Clear code
→ Explicit business rules
→ Strong boundaries
→ Strong types
→ Database integrity
→ Tests
→ Observability
```

Avoid:

```text
Clever abstractions
→ Hidden behavior
→ Framework magic
→ Premature infrastructure
→ Architecture for hypothetical requirements
```

Every abstraction must solve a real problem.

---

# 3. Backend Responsibility

The Fleetora backend is the authoritative system for operational behavior.

It owns:

- authentication
- authorization
- tenant isolation
- business rules
- domain state transitions
- database integrity
- transactional operations
- operational APIs
- audit behavior
- permission enforcement
- AI tool execution boundaries when AI is introduced

The frontend must never become the authoritative source for these rules.

---

# 4. Architecture Direction

Use modular NestJS architecture.

Conceptually:

```text
src/
├── common/
├── config/
├── prisma/
└── modules/
```

Business capabilities should be organized by feature/domain.

Example direction:

```text
modules/
├── auth/
├── companies/
├── users/
├── merchants/
├── workers/
├── vehicles/
├── warehouses/
├── zones/
├── shipments/
├── assignments/
├── deliveries/
├── notifications/
└── audit/
```

Do not create all modules in advance.

Create a module when its feature is actually being implemented.

---

# 5. Module Boundary

Each module should represent a meaningful backend capability.

A typical module may contain:

```text
shipments/
├── dto/
├── shipment.controller.ts
├── shipment.service.ts
├── shipment.repository.ts
└── shipment.module.ts
```

Additional files should exist only when complexity requires them.

Do not mechanically create:

```text
interfaces/
factories/
adapters/
commands/
handlers/
mappers/
providers/
strategies/
```

for every module.

Architecture should emerge from real requirements.

---

# 6. Controller Responsibility

Controllers are HTTP boundaries.

Controllers may:

- define routes
- receive parameters
- receive validated DTOs
- access authenticated request context
- call application services
- return results

Controllers should not:

- contain business rules
- directly perform complex Prisma queries
- decide shipment transitions
- calculate permissions
- implement tenant ownership logic
- perform multi-step transactions
- contain large data transformations

Preferred:

```text
HTTP Request
→ Controller
→ Service
→ Repository / Prisma
```

Not:

```text
HTTP Request
→ Controller
→ 100 lines of business logic
→ Prisma
```

Controllers should remain easy to scan.

---

# 7. Service Responsibility

Services own application and domain behavior.

Examples:

```text
ShipmentService
WorkerService
AssignmentService
AuthService
```

A service may:

- enforce business rules
- coordinate repositories
- validate resource state
- perform authorization-related domain checks
- coordinate transactions
- create domain events
- call other domain services when necessary

Example:

```text
assignShipment()
```

may need to:

```text
verify shipment
→ verify worker
→ verify tenant ownership
→ verify worker eligibility
→ verify shipment state
→ perform assignment
→ update state if required
→ record history
→ create audit information
```

That belongs in backend service/domain logic.

---

# 8. Repository Responsibility

Repositories are useful when they provide a meaningful database boundary.

They may:

- centralize recurring queries
- enforce tenant-scoped query patterns
- hide complicated persistence operations
- improve testability
- keep Prisma-specific persistence logic out of complex services

Repositories should not contain business decisions.

Example:

Good:

```text
findShipmentById(companyId, shipmentId)
```

Bad:

```text
decideWhetherShipmentCanBeDelivered()
```

The second is domain logic.

---

# 9. Do Not Force Repositories Everywhere

A repository is not mandatory simply because a module exists.

If a service performs one simple Prisma operation and no useful persistence abstraction exists, direct use may be acceptable if consistent with the project's established architecture.

Create abstractions because they improve the design.

Not because a diagram says every service requires one.

---

# 10. Dependency Direction

Prefer dependencies flowing toward stable domain behavior.

Conceptually:

```text
Controller
    ↓
Service
    ↓
Repository / Infrastructure
    ↓
Database
```

Avoid circular dependencies between modules.

If two modules continuously depend on each other, reconsider the ownership boundary.

Do not solve poor boundaries using `forwardRef()` by default.

Use it only when the relationship is legitimate and understood.

---

# 11. Domain Rules

Business rules must be explicit.

For example:

```text
Shipment can be assigned only when...
Worker can receive shipment only when...
Shipment can transition to OUT_FOR_DELIVERY only when...
Delivery can be completed only when...
```

Do not scatter these rules across:

- controllers
- DTOs
- frontend
- repositories
- random helper files

Keep related domain rules close to the service/domain capability that owns them.

---

# 12. Shipment State Machine

Shipment status must never be treated as an arbitrary editable field.

Bad:

```text
PATCH /shipments/:id
{
  "status": "DELIVERED"
}
```

if that allows unrestricted transitions.

Preferred conceptual model:

```text
createShipment()
planShipment()
assignShipment()
dispatchShipment()
confirmPickup()
markOutForDelivery()
completeDelivery()
reportFailedDelivery()
rescheduleDelivery()
```

Exact operations depend on the final Fleetora domain decisions.

The important rule is:

**commands express intent; backend rules determine whether the state transition is valid.**

---

# 13. State Transition Validation

State transition logic should have one authoritative implementation.

Conceptually:

```text
Current State
+
Requested Operation
+
Domain Conditions
=
Allowed / Rejected
```

Do not duplicate transition logic in several services.

Transition rules require focused tests.

---

# 14. Multi-Tenancy

Fleetora is a multi-tenant system.

Tenant isolation is a backend invariant.

For tenant-owned resources:

```text
Authenticated User
        ↓
Trusted Tenant Context
        ↓
Authorization
        ↓
Tenant-Scoped Query
        ↓
Resource
```

Never treat a client-provided `companyId` as proof of ownership.

---

# 15. Tenant Context

Tenant identity must originate from trusted authentication/application context.

Conceptually:

```text
JWT identity
→ validated user
→ company membership
→ tenant context
```

Client input may identify a requested resource.

It must not grant access to that resource.

---

# 16. Tenant-Scoped Queries

For tenant-owned resources, prefer queries that include tenant scope.

Preferred concept:

```text
find shipment
where:
  id = shipmentId
  companyId = authenticatedCompanyId
```

instead of:

```text
find shipment by id
then hope someone checked company ownership elsewhere
```

The exact Prisma implementation depends on the schema and Prisma 8 APIs used by Fleetora.

---

# 17. Cross-Tenant Relationships

Tenant isolation is not only about read queries.

Relationships must also be safe.

For example:

```text
Shipment Company A
```

must never be assigned to:

```text
Worker Company B
```

Likewise:

```text
Shipment
→ Warehouse
→ Worker
→ Merchant
→ Vehicle
```

must respect tenant ownership.

Use application checks and database integrity where appropriate.

---

# 18. Platform-Level Access

`PLATFORM_ADMIN` behavior must be explicit.

Do not implement:

```text
if PLATFORM_ADMIN:
    bypassEverything()
```

Platform-level operations should have explicit authorization rules.

Cross-company access should be intentional, scoped, and auditable.

Do not create an invisible universal tenant bypass.

---

# 19. Authentication vs Authorization

Authentication answers:

> Who are you?

Authorization answers:

> Are you allowed to perform this operation?

Tenant validation answers:

> Are you allowed to perform it on this company's resource?

These are separate concerns.

A valid JWT does not automatically authorize an operation.

---

# 20. Authorization Flow

Preferred conceptual order:

```text
Authenticate
    ↓
Validate account state
    ↓
Resolve trusted tenant context
    ↓
Check permission
    ↓
Load tenant-scoped resource
    ↓
Check domain conditions
    ↓
Execute operation
```

The exact implementation may optimize database access, but the security properties must remain.

---

# 21. Guards

Use guards for cross-cutting request authorization where appropriate.

Examples may include:

```text
Authentication Guard
Role / Permission Guard
```

Do not place all domain authorization inside guards.

A guard should not become a giant business-rules engine.

Resource-specific domain conditions usually belong in services.

---

# 22. DTOs

DTOs define API input contracts.

Use separate DTOs for distinct intentions.

Good:

```text
CreateShipmentDto
UpdateShipmentDetailsDto
AssignShipmentDto
ReportDeliveryFailureDto
```

Bad:

```text
ShipmentDto
```

containing every possible shipment property.

DTOs should express operations.

---

# 23. DTO Validation

Validate external input at the system boundary.

Use appropriate validation for:

- required values
- string length
- email
- enums
- numeric ranges
- optional fields
- nested structures

Validation answers:

> Is the request structurally valid?

Business rules answer:

> Is this operation allowed?

Do not confuse the two.

---

# 24. Never Trust IDs

A syntactically valid UUID or ID does not mean:

- the resource exists
- it belongs to the tenant
- the user can access it
- it is valid for the requested operation

All four questions may require separate validation.

---

# 25. Prisma

Fleetora uses Prisma 8.

Use APIs compatible with the actual installed project version.

Before implementing unfamiliar Prisma behavior:

- inspect the existing project
- inspect local documentation where applicable
- verify the Prisma 8 API
- do not assume older Prisma behavior

Do not manually modify generated Prisma files.

---

# 26. Database Schema

The database schema is part of the application's correctness boundary.

Use the database to enforce invariants where practical.

Examples:

```text
unique constraints
foreign keys
not-null constraints
compound uniqueness
indexes
relationship constraints
```

Do not rely entirely on application code for invariants the database can safely enforce.

---

# 27. Transactions

Use transactions when multiple writes form one logical operation.

Examples:

```text
create company + initial administrator

assign shipment + update assignment state + history

complete delivery + proof metadata + shipment transition + history
```

The system should not leave partial business operations after a failure.

---

# 28. Transaction Scope

Transactions should be:

- correct
- focused
- as short as practical

Avoid performing unnecessary slow external operations inside database transactions.

Example:

Do not keep a database transaction open while waiting for:

```text
email provider
push provider
external AI model
file upload
```

Persist the business operation safely, then handle external effects through the appropriate mechanism.

---

# 29. Concurrency

Operational logistics systems can receive competing actions.

Examples:

```text
two administrators assign the same shipment

worker updates shipment while admin reassigns it

duplicate delivery completion request

two requests update the same resource
```

Do not assume requests always happen sequentially.

When concurrency can violate a business invariant, use an appropriate database/application strategy.

Do not add complex locking everywhere preemptively.

Handle concurrency where the domain actually requires it.

---

# 30. Idempotency

Operations susceptible to retries or duplicate delivery should be designed carefully.

Examples:

```text
payment-like actions
delivery completion
external webhook handling
AI-approved write actions
background jobs
```

Idempotency should be introduced where duplicate execution would cause incorrect state.

Do not add idempotency infrastructure to every endpoint without reason.

---

# 31. Error Model

Errors should be predictable.

Differentiate conceptually between:

```text
Validation Error
Authentication Error
Authorization Error
Not Found
Conflict
Domain Rule Violation
Unexpected Internal Error
```

Do not return raw database errors to clients.

Do not expose stack traces in production responses.

---

# 32. Domain Errors

Meaningful business failures should have meaningful errors.

Example:

Bad:

```text
400 Bad Request
"Invalid operation"
```

Better conceptual error:

```text
SHIPMENT_ALREADY_ASSIGNED
```

with a safe human-readable message.

Exact error response structure should remain consistent across the API.

---

# 33. Error Messages

Client-facing messages should be useful without leaking internals.

Do not expose:

```text
SQL
database connection details
JWT secrets
stack traces
filesystem paths
provider credentials
```

Log technical information internally where appropriate.

Return safe information externally.

---

# 34. API Design

REST endpoints should model resources and meaningful operations clearly.

Examples:

```text
GET    /shipments
GET    /shipments/:id
POST   /shipments
PATCH  /shipments/:id
POST   /shipments/:id/assign
POST   /shipments/:id/dispatch
POST   /shipments/:id/complete-delivery
```

Exact routes should follow the finalized API contract.

Avoid turning every operation into generic `update`.

Important domain actions deserve explicit intent.

---

# 35. API Consistency

Keep consistent conventions for:

- resource naming
- pagination
- filtering
- sorting
- error responses
- timestamps
- IDs
- optional values

Do not invent a different API style for every module.

---

# 36. Pagination

List endpoints that can grow significantly should support pagination.

Examples:

```text
shipments
workers
merchants
notifications
audit records
```

Do not load an entire tenant's operational dataset because development data is currently small.

Pagination strategy should fit actual query requirements.

---

# 37. Filtering

Filtering should happen server-side for operational datasets.

Example:

```text
GET /shipments?status=...&workerId=...&page=...
```

Do not require the frontend to download thousands of records and filter them locally.

Validate filter input.

Apply tenant scope regardless of filters.

---

# 38. Sorting

Only expose supported sorting fields.

Do not blindly convert arbitrary user-provided field names into database ordering.

Use an allowlist or typed mapping.

---

# 39. Data Exposure

API responses should expose what clients need.

Do not automatically return complete database records.

Sensitive/internal fields may include:

```text
password hashes
refresh token hashes
verification tokens
internal secrets
provider metadata
internal-only audit information
```

Use explicit response shaping where necessary.

---

# 40. Passwords

Passwords must:

- be validated
- be hashed
- never be logged
- never be returned
- never be stored in plaintext

Password-reset flows must use secure, expiring, single-purpose mechanisms.

Do not reuse security tokens across unrelated purposes unless explicitly designed and reviewed.

---

# 41. Tokens

Access and refresh tokens have different purposes.

Access token:

```text
short-lived API authentication
```

Refresh token:

```text
longer-lived session renewal
```

Refresh token handling should support revocation.

Token material must never appear in logs.

---

# 42. Account State

Authentication must consider account state.

A correct password is not enough if the account is:

```text
disabled
suspended
deleted
otherwise unauthorized
```

Company/account lifecycle rules must eventually be enforced consistently across login and authenticated requests.

---

# 43. Secrets

Secrets belong in environment configuration or an appropriate secrets system.

Never commit:

```text
real passwords
JWT secrets
database credentials
SMTP credentials
API keys
private tokens
```

Example environment files should use safe placeholders.

If a real secret is accidentally committed, removing it from the latest file is not sufficient.

Treat it as compromised and rotate it.

---

# 44. Logging

Logs should help answer:

```text
What happened?
When?
Where?
For which request?
For which safe entity identifiers?
Did it succeed?
Why did it fail?
```

Logs must not expose secrets.

Avoid unnecessary personal data.

---

# 45. Structured Logging

Prefer structured logging when Fleetora introduces its production logging layer.

Useful context may include:

```text
requestId
userId
companyId
module
operation
resourceId
duration
result
```

Never include sensitive authentication material.

---

# 46. Audit vs Logs

Operational logs and audit records are not the same.

Logs help engineers operate the system.

Audit records answer:

```text
Who performed an important business action?
What changed?
When?
On which resource?
```

Important Fleetora actions may eventually require audit records.

Examples:

```text
shipment assignment
shipment reassignment
permission changes
delivery completion
sensitive administrative actions
AI-approved actions
```

---

# 47. Audit Integrity

Audit information should not be casually editable through normal CRUD operations.

Where audit is required, design retention and deletion behavior deliberately.

Do not accidentally cascade-delete critical audit history merely because a parent resource was deleted.

---

# 48. Domain Events

Domain events may be useful when one business action needs secondary reactions.

Example:

```text
ShipmentDelivered
        ↓
Audit
Notification
Analytics update
AI event processing later
```

Do not introduce an event bus merely because events sound architecturally sophisticated.

Start with direct behavior when simple.

Introduce event infrastructure when decoupling has concrete value.

---

# 49. External Side Effects

External side effects include:

```text
email
push notifications
file storage
third-party APIs
AI services
```

Do not allow external failures to silently corrupt domain state.

Decide explicitly whether an external action is:

- required for transaction success
- retryable afterward
- best effort

---

# 50. Background Jobs

Background processing should be introduced for real asynchronous work.

Examples:

```text
large notification batches
retryable external operations
analytics processing
long-running AI analysis
```

Do not add Redis or queues solely because production architectures often contain them.

---

# 51. File Uploads

When proof-of-delivery uploads are implemented:

- validate file type
- validate size
- control access
- generate safe object identifiers
- avoid trusting client filenames
- store metadata appropriately
- keep large binary content outside PostgreSQL unless there is a deliberate reason otherwise

The database should generally store references and metadata.

---

# 52. Time

Store timestamps consistently.

Operational events must have authoritative server timestamps where required.

Do not trust a client timestamp as the sole source of truth for sensitive operational events.

Client-reported time may be stored separately when useful.

---

# 53. Timezones

Database timestamps and user-facing timezone behavior are separate concerns.

Keep backend storage consistent.

Do not bake one company's local timezone into global business logic unless the domain explicitly requires it.

---

# 54. TypeScript

Prefer explicit, useful types.

Avoid:

```ts
any
```

Do not hide errors with:

```ts
@ts-ignore
```

Use:

```text
DTO types
domain types
Prisma-generated types
explicit interfaces where useful
```

Do not create duplicate types without reason.

---

# 55. Null and Undefined

Handle optional data intentionally.

Do not rely on accidental JavaScript truthiness for domain decisions.

Bad:

```text
if (value) ...
```

when:

```text
0
false
""
```

may be legitimate values.

Model absence deliberately.

---

# 56. Naming

Names should communicate intent.

Good:

```text
assignShipmentToWorker()
validateShipmentTransition()
findWorkerForCompany()
```

Weak:

```text
handleData()
process()
doAction()
updateThing()
```

Avoid abbreviations that save a few characters while making the domain harder to understand.

---

# 57. Functions

Functions should have a focused responsibility.

If a function:

- validates input
- queries five models
- sends email
- updates state
- builds response objects
- handles every error

it likely needs decomposition.

Do not split functions merely to satisfy arbitrary line-count rules.

Split by responsibility.

---

# 58. Comments

Comments should explain:

- why
- constraints
- non-obvious domain decisions

Avoid comments that simply repeat the code.

Bad:

```ts
// Find user by ID
const user = ...
```

Useful:

```text
Explain why a particular concurrency check exists.
Explain why an unusual tenant constraint is required.
```

---

# 59. Clean Code

Clean code in Fleetora means:

- readable names
- focused responsibilities
- explicit domain behavior
- minimal duplication
- predictable control flow
- limited hidden side effects
- useful types
- meaningful tests

Clean code does not mean maximizing the number of classes and interfaces.

---

# 60. SOLID

Apply SOLID where it improves the design.

Do not turn SOLID into ceremony.

For example:

Dependency inversion is useful when there is a meaningful abstraction boundary.

It does not mean every two-line service requires:

```text
Interface
Abstract class
Factory
Provider
Adapter
Implementation
```

Engineering judgment comes first.

---

# 61. DRY

Avoid meaningful duplication.

But do not combine unrelated concepts merely because two functions currently contain similar lines.

Duplicated syntax is sometimes less harmful than a false abstraction.

Abstract shared concepts, not coincidental code.

---

# 62. Testing Strategy

Fleetora backend testing should eventually include:

```text
Unit
Integration
E2E
```

Different tests answer different questions.

---

# 63. Unit Tests

Unit tests are useful for deterministic domain logic.

High-value examples:

```text
shipment state transitions
assignment eligibility
permission decisions
risk calculation algorithms
pricing/plan limits when introduced
```

Test behavior, not implementation trivia.

---

# 64. Integration Tests

Integration tests should validate boundaries such as:

```text
service + database
tenant isolation
database constraints
transactions
auth flows
repository behavior
```

Tenant isolation deserves explicit negative tests.

Example:

```text
User Company A
attempts to read Shipment Company B
→ denied / not exposed
```

---

# 65. E2E Tests

E2E tests should validate important user/system workflows.

Eventually:

```text
authenticate
→ create shipment
→ assign worker
→ progress delivery
→ submit proof
→ complete shipment
```

Do not attempt exhaustive E2E coverage for every validation branch.

Use the appropriate testing layer.

---

# 66. Security Tests

Security-sensitive behavior requires negative tests.

Examples:

```text
invalid token
expired token
disabled user
wrong role
wrong tenant
cross-company relationship
forbidden transition
invalid refresh token
```

A happy-path test alone does not establish security.

---

# 67. Tenant Test Rule

Any new tenant-owned resource should trigger the question:

> Where is the test proving another company cannot access or attach this resource?

If there is no answer, the implementation is incomplete.

---

# 68. Test Naming

Tests should describe behavior.

Prefer:

```text
rejects assignment when worker belongs to another company
```

over:

```text
test assignShipment #4
```

A failing test should communicate what contract was violated.

---

# 69. Mocking

Mock external boundaries where appropriate.

Do not mock the exact code being tested.

Over-mocking can create tests that pass while the real system is broken.

Use real database integration tests where database behavior is the subject of the test.

---

# 70. Performance

Do not optimize without evidence.

But avoid obviously dangerous patterns.

Watch for:

```text
N+1 queries
unbounded list endpoints
huge nested includes
repeated database lookups
large synchronous work
```

Correctness first.

Then measure.

Then optimize.

---

# 71. Database Indexes

Indexes should follow real access patterns.

Likely operational query dimensions may include:

```text
companyId
status
workerId
warehouseId
createdAt
scheduled dates
```

Do not add indexes blindly.

When implementing a high-volume query, consider its expected filtering and ordering pattern.

---

# 72. Observability

Important operations should eventually be observable through:

```text
logs
metrics
traces where justified
audit records
health checks
```

Do not add a large observability platform before the backend has meaningful workflows.

But do not write code that makes later observability impossible.

---

# 73. Request Correlation

Production request logging should eventually support a request/correlation identifier.

This makes it possible to follow:

```text
incoming request
→ service
→ database operation
→ external effect
→ failure
```

across logs.

---

# 74. API Documentation

Public/internal application APIs should remain discoverable.

When Swagger/OpenAPI is part of the existing backend, keep endpoint documentation aligned with actual behavior.

Do not document behavior that the implementation does not enforce.

---

# 75. Backward Compatibility

During early development, breaking API changes may be acceptable.

But they should still be deliberate.

Once frontend/mobile consumers depend on an API:

- identify breaking changes
- coordinate contract changes
- avoid accidental response changes

Do not silently rename fields consumed by another application.

---

# 76. Database Changes

Before changing the Prisma contract:

1. understand existing relations
2. understand current data implications
3. understand tenant implications
4. understand uniqueness/constraint implications
5. understand migration impact
6. validate the resulting Prisma contract
7. review generated migration behavior

Do not make destructive schema changes casually.

---

# 77. Generated Files

Generated files are outputs.

Do not manually patch generated Prisma contracts/types as the primary implementation.

Change the source contract and use the project's supported generation workflow.

---

# 78. Migration Safety

Before applying a migration to important data, inspect what it does.

High-risk operations include:

```text
DROP
column type conversion
adding NOT NULL to populated tables
changing uniqueness
cascade behavior
relationship restructuring
```

Development convenience must not normalize unsafe production migration habits.

---

# 79. Review Before Coding

Before implementing a backend feature:

1. read the relevant project documentation
2. inspect the current module
3. inspect related Prisma models
4. inspect authentication/tenant context
5. identify the business rule
6. identify authorization requirements
7. identify transaction requirements
8. identify tests
9. identify API contract impact

Then implement.

---

# 80. Small Changes

Prefer focused changes.

A shipment endpoint should not unexpectedly cause:

```text
auth rewrite
folder restructure
dependency migration
formatting of unrelated modules
database redesign
```

unless the feature genuinely requires those changes and they are explicitly approved.

Small diffs are easier to understand and review.

---

# 81. Refactoring

Refactor when there is evidence of a design problem.

Examples:

```text
duplicated domain logic
service with multiple unrelated responsibilities
hard-to-test business behavior
repeated unsafe queries
unclear boundaries
```

Do not perform repository-wide refactors during unrelated feature work.

---

# 82. New Dependencies

Before adding a dependency:

1. identify the concrete requirement
2. check existing project capabilities
3. evaluate maintenance/security impact
4. confirm compatibility
5. prefer mature, focused dependencies

Do not add libraries for functionality already cleanly handled by the platform or framework.

---

# 83. AI Coding Assistant Workflow

When an AI coding assistant works on Fleetora backend code, it should follow this workflow:

```text
Understand request
      ↓
Read applicable AGENTS.md
      ↓
Inspect relevant code
      ↓
Inspect schema/domain documentation
      ↓
Identify tenant/security implications
      ↓
Identify business invariants
      ↓
Propose smallest appropriate implementation
      ↓
Implement
      ↓
Run targeted tests
      ↓
Run type/build/lint validation
      ↓
Inspect final diff
```

Do not begin by generating files based only on the feature name.

---

# 84. AI Assistant — Required Questions

Before a major backend change, determine:

```text
Who can perform this operation?

Which tenant owns the resource?

What data is trusted?

What data is client input?

What business rule applies?

Can this operation partially fail?

Does it need a transaction?

Can requests race?

What should be audited?

What tests prove the security boundary?
```

If a missing answer materially affects architecture, database design, security, or API contracts, surface the decision instead of inventing it.

---

# 85. AI Assistant — Forbidden Behavior

An AI coding assistant must not:

- bypass authorization to make tests pass
- trust request `companyId`
- weaken types with `any`
- hide errors using `@ts-ignore`
- manually edit generated Prisma files
- introduce another ORM
- silently change database architecture
- invent undocumented domain rules
- install unnecessary dependencies
- expose secrets
- remove security checks for convenience
- rewrite unrelated modules
- create speculative infrastructure
- treat frontend validation as security
- assume a successful build proves tenant isolation

---

# 86. Code Review Checklist

For every meaningful backend change, review:

### Correctness

- Does it implement the requested behavior?
- Are edge cases handled?

### Security

- Is authentication required?
- Is authorization enforced?
- Can another tenant access the resource?
- Is client input trusted incorrectly?
- Are secrets or sensitive fields exposed?

### Domain

- Are business rules centralized?
- Are state transitions legal?
- Are related resources valid?

### Database

- Are queries tenant-scoped?
- Are constraints appropriate?
- Is a transaction needed?
- Can concurrent requests violate an invariant?

### API

- Are DTOs specific?
- Are errors predictable?
- Is response shape consistent?

### Quality

- Are names clear?
- Is logic duplicated?
- Is complexity justified?
- Were unrelated files changed?

### Tests

- Happy path?
- Invalid input?
- Unauthorized?
- Forbidden?
- Wrong tenant?
- Domain conflict?
- Transaction failure where relevant?

---

# 87. Definition of Done — Backend Feature

A backend feature is not complete merely because the endpoint returns `200`.

A meaningful Fleetora backend feature should satisfy, where applicable:

- API contract implemented
- DTO validation implemented
- authentication enforced
- authorization enforced
- tenant isolation enforced
- domain rules enforced
- database relationships valid
- transaction boundaries correct
- errors handled consistently
- sensitive data protected
- relevant unit/integration/E2E tests added
- negative security cases tested
- lint/type/build checks pass
- Prisma validation performed when schema changes
- documentation updated when contracts change
- no unrelated architectural changes

Not every checkbox applies to every tiny change.

But each must be considered.

---

# 88. Definition of Done — Tenant-Owned Resource

For any new tenant-owned resource, completion requires answering:

```text
How is company ownership represented?

How is company scope derived?

How are list queries scoped?

How are detail queries scoped?

How are create operations scoped?

How are update/delete operations scoped?

How are relationships prevented from crossing tenants?

Where is the negative cross-tenant test?
```

If these questions cannot be answered, the resource is not tenant-safe.

---

# 89. Definition of Done — Domain Operation

For an important operation such as assignment or delivery completion:

```text
Preconditions defined
Authorization defined
Tenant ownership validated
State transition validated
Atomic writes identified
Concurrency considered
History/audit considered
Errors defined
Tests implemented
```

This is more important than simply exposing a route.

---

# 90. Priority Order

When engineering tradeoffs occur, use this order:

```text
Correctness
→ Security
→ Tenant Isolation
→ Data Integrity
→ Business Rules
→ Type Safety
→ Testability
→ Maintainability
→ Performance
→ Convenience
```

Developer convenience must not override tenant isolation or data integrity.

---

# 91. Final Engineering Principle

Fleetora should not become complicated merely because it is intended to become a serious product.

Serious engineering means making important guarantees explicit.

For Fleetora, those guarantees are:

```text
A user can perform only authorized actions.

A company cannot access another company's data.

Invalid domain transitions cannot corrupt operations.

Related resources cannot silently cross tenant boundaries.

Important multi-write operations do not partially succeed.

External input is validated.

Sensitive information is protected.

The database supports application correctness.

Critical behavior is tested.

The code remains understandable by the next engineer.
```

Build the simplest implementation that can truthfully guarantee those properties.

Then evolve the architecture when real product complexity demands it.