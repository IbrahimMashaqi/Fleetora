# AGENTS.md

## Project

Fleetora is a multi-tenant logistics SaaS backend built with:

* NestJS
* TypeScript
* Prisma 8
* PostgreSQL
* JWT
* REST API
* Jest

## Architecture

Use modular NestJS architecture:

```text
src/
├── common/
├── config/
├── prisma/
└── modules/
```

Keep each feature inside its own module.

Controllers handle HTTP concerns only.
Services contain business logic.
Repositories handle database access when needed.
Keep responsibilities separated.
SOLID & Clean Code

Follow SOLID principles and clean code practices.

Single Responsibility: each class/function should have one clear responsibility.
Open/Closed: extend behavior without unnecessary modification of existing code.
Liskov Substitution: implementations must respect their abstractions.
Interface Segregation: prefer small, focused interfaces.
Dependency Inversion: depend on abstractions when there is a real need.

Also:

Prefer composition over unnecessary inheritance.
Keep functions small and focused.
Use meaningful names.
Avoid duplicated logic.
Avoid unnecessary abstractions.
Don't Over-Engineer

Keep the solution as simple as possible.

Do not introduce patterns just because they are popular.
Do not create abstractions without a real use case.
Do not create repositories/interfaces/factories for trivial logic just to follow a pattern.
Do not add unnecessary dependencies.
Do not build infrastructure for hypothetical future requirements.
Prefer the simplest design that solves the current requirement correctly.

Simple and maintainable > clever and complex.

DTOs & Validation

Use DTOs for API input.

Do not use Prisma models as request DTOs.
Validate incoming data with class-validator.
Keep DTOs specific to their use case.
Do not create one huge DTO for multiple unrelated operations.
Do not put business logic inside DTOs.

Example:

CreateShipmentDto
UpdateShipmentDto
AssignShipmentDto

rather than one generic:

ShipmentDto
## Prisma

* Use **Prisma 8** APIs only.
* Never assume Prisma 7 syntax.
* Do not introduce another ORM.
* Keep database access type-safe.
* Use transactions for operations that must be atomic.
* Validate Prisma schema after schema changes.

## Multi-Tenancy

Fleetora is multi-tenant.

* Never allow cross-company data access.
* Always enforce the authenticated user's company/tenant scope.
* Do not blindly trust `companyId` from the request body.
* Authorization must be enforced on the backend.

## Auth & Security

* Use JWT access/refresh tokens.
* Use guards for authentication and authorization.
* Validate all incoming data with DTOs.
* Never expose passwords, tokens, secrets, or database errors.
* Never bypass authorization for convenience.

## Domain Rules

Shipment status transitions are business logic.

Do not allow arbitrary status changes.

Keep business rules inside services/domain logic, not controllers.

## TypeScript

* Avoid `any`.
* Do not use `@ts-ignore` to hide errors.
* Prefer proper types and existing project patterns.
* Keep code simple and readable.

## Development Rules

Before changing code:

1. Inspect existing implementation.
2. Reuse existing patterns.
3. Make the smallest appropriate change.
4. Run build/tests.
5. Check Prisma when database code changes.

Do not:

* Rewrite architecture without being asked.
* Install unnecessary dependencies.
* Make destructive database changes without explicit instruction.
* Modify unrelated files.
* Downgrade Prisma.
* Delete existing functionality.

## AI

The AI layer must use backend which will be coverd later when asked

## Priority

```text
Correctness
→ Security
→ Tenant isolation
→ Business rules
→ Type safety
→ Maintainability
```

When requirements are unclear and the decision affects the database, security, API contracts, or architecture, ask before making a major change.
