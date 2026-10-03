# Fleetora Frontend — Agent Instructions

## Purpose

This file defines the rules for AI-assisted development inside `frontend/`.

These instructions apply to all frontend code unless a more specific `AGENTS.md` exists deeper in the directory tree.

The goal is to keep Fleetora's frontend consistent, maintainable, secure, and aligned with the backend contract without over-engineering.

---

## Project

Fleetora is a multi-tenant B2B logistics and delivery management SaaS.

Frontend technologies currently include:

- Next.js
- React
- TypeScript
- Tailwind CSS
- REST API integration

Additional libraries such as:

- shadcn/ui
- TanStack Query
- React Hook Form
- Zod

may be used when they are already installed or when there is a concrete requirement for them.

Do not assume a dependency exists without checking `package.json`.

The backend is a separate NestJS application and is the authoritative source for business rules, authorization, tenant isolation, and operational data.

---

## Next.js Version Rule

Do not assume this project behaves like older Next.js versions.

Before writing or changing code that depends on Next.js APIs, conventions, routing, rendering, caching, configuration, or file structure:

1. Inspect the installed Next.js version.
2. Read the relevant local Next.js documentation when available under:

```text
node_modules/next/dist/docs/
```

3. Follow deprecation notices and current project conventions.
4. Do not rely only on remembered Next.js behavior.

If Next.js-generated agent instructions exist in this repository, preserve and follow them.

Do not remove generated Next.js agent instructions merely to clean up the file.

---

## Core Principles

Priorities:

1. Correctness
2. User experience
3. Maintainability
4. Type safety
5. Simplicity
6. Consistent UI

Do not over-engineer.

Prefer simple, readable solutions over unnecessary abstractions, global state libraries, or complex architecture.

Before changing code:

- inspect the existing implementation
- inspect the relevant API contract
- reuse established patterns
- make the smallest coherent change

Do not introduce a new library when the existing stack can solve the problem adequately.

---

## Source of Truth

Always distinguish between:

1. current frontend implementation
2. current backend API behavior
3. documented target architecture
4. future or undecided requirements

The existing frontend code describes the current frontend implementation.

The backend defines actual business behavior and API capabilities.

`../docs/Fleetora_Master_Project_Document.md` describes the intended product and architecture, but not every documented feature is necessarily implemented or finalized.

Do not invent missing endpoints, response shapes, permissions, roles, workflows, or business rules.

If documentation and implementation conflict in a way that affects API contracts, authentication, authorization, tenant behavior, or core workflows, identify the conflict instead of silently guessing.

---

## Architecture

Use feature-based organization.

Target structure as the project grows:

```text
app/                    # Routes, pages, layouts
components/
  ui/                   # UI primitives / shadcn components when used
  layout/               # Navbar, Sidebar, dashboard shell
  shared/               # Reusable Fleetora components
features/
  auth/
  shipments/
  workers/
  vehicles/
  warehouses/
  zones/
  analytics/
lib/
  api/                  # Shared API infrastructure
  auth/
  utils/
  constants/
hooks/                  # Truly shared React hooks
providers/              # Global providers
types/                  # Truly shared types
public/                 # Static assets
```

This is a target organization, not a requirement to create empty folders.

Do not create files or directories until they are actually needed.

---

## `app/`

Use `app/` primarily for:

- routing
- pages
- layouts
- route groups
- route-level loading/error boundaries when appropriate

Keep substantial feature implementation out of page files.

Example:

```text
app/
└── (dashboard)/
    └── shipments/
        └── page.tsx
```

A page should primarily compose feature components rather than implement an entire feature.

Avoid giant `page.tsx` files.

---

## `features/`

Each major Fleetora feature should own its feature-specific code.

Example:

```text
features/shipments/
├── components/
├── api/
├── hooks/
├── schemas/
├── types.ts
└── index.ts
```

Do not create every directory automatically.

Create only what the feature actually needs.

Feature-specific:

- components
- hooks
- API functions
- schemas
- types
- utilities

should normally remain inside that feature.

Do not move code into shared directories merely because it might theoretically be reused later.

---

## Shared Components

### `components/ui/`

Use for low-level reusable UI primitives.

If shadcn/ui is installed and used, its components belong here unless the project establishes another convention.

Do not unnecessarily rewrite or duplicate existing UI primitives.

Customize shared primitives only when Fleetora needs consistent project-wide behavior or styling.

### `components/layout/`

Use for application-wide layout components such as:

- Sidebar
- Navbar
- Dashboard shell
- Navigation
- User menu

Do not duplicate application shell components across pages.

### `components/shared/`

Use for reusable Fleetora-specific components that genuinely span multiple features.

Examples may include:

- EmptyState
- LoadingState
- ConfirmDialog
- PageHeader
- shared DataTable utilities

Do not place feature-specific components here prematurely.

---

## UI and Design System

Fleetora should look like one coherent product.

Use the project's established design system and theme tokens.

Do not introduce arbitrary visual styles independently inside each feature.

Use semantic design concepts such as:

- primary
- secondary
- background
- foreground
- muted
- border
- success
- warning
- destructive

Do not hard-code random colors throughout feature components.

Do not create separate visual identities for shipments, workers, vehicles, analytics, or other features.

A Shipment screen and Worker screen should clearly belong to the same product.

[DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) is the sole visual source of truth for tokens and component rules. Theme/reference documents under `.agents/` support AI workflows and must defer to it.

Do not redesign the product or change global theme conventions during an unrelated feature task.

---

## Responsive Design

Fleetora's web dashboard must remain usable across supported desktop and smaller viewport sizes.

When implementing UI:

- avoid fixed layouts that unnecessarily break on smaller screens
- consider table overflow
- consider navigation behavior
- preserve readable spacing
- ensure forms remain usable
- avoid accidental horizontal page overflow

Do not attempt to turn the web dashboard into the worker mobile application.

The dedicated worker mobile application is a separate product surface.

---

## Accessibility

Use semantic HTML where practical.

Interactive elements must be keyboard-accessible.

Buttons should be buttons.

Links should be links.

Form fields should have appropriate labels.

Do not communicate important state using color alone.

Use accessible names for icon-only actions.

Preserve focus behavior when implementing dialogs, menus, forms, and other interactive UI.

Do not remove accessibility behavior provided by established UI primitives.

---

## API Contract

The frontend consumes the backend API.

The frontend must not invent backend behavior.

Do not invent:

- endpoints
- HTTP methods
- request fields
- response fields
- pagination formats
- error formats
- permissions
- status transitions
- allowed actions

When implementing against an API, inspect the actual backend contract or implementation first.

If the required backend capability does not exist, identify the missing contract instead of mocking it as if it were real production behavior.

Mocks are acceptable for explicitly requested prototypes or isolated UI development, but must be clearly identified as mocks.

---

## API Integration

Keep API communication separate from UI rendering.

Feature-specific API operations should normally live under:

```text
features/<feature>/api/
```

Example:

```text
features/shipments/api/
```

Shared API infrastructure belongs under:

```text
lib/api/
```

This may include:

- HTTP client
- base URL configuration
- request configuration
- authentication handling
- shared response/error handling

Do not put every endpoint in one giant API file.

Do not scatter raw HTTP requests throughout components.

UI components should not need to understand transport-level implementation details unnecessarily.

---

## API Types

Do not manually invent API response types.

Types representing backend data must match the actual backend contract.

Do not create several conflicting versions of the same backend entity across features.

When API types are generated or shared through an approved contract mechanism, prefer that mechanism.

Frontend presentation types may differ from backend transport types when there is a real UI-specific reason.

Keep the conversion explicit.

Never change a frontend type merely to hide an API mismatch.

---

## Server and Client Components

Prefer Server Components by default when supported by the installed Next.js version and the current application architecture.

Use `"use client"` only when client-side behavior is actually required.

Examples include:

- React state
- event handlers
- browser APIs
- interactive forms
- client-side hooks
- client-side query libraries

Do not add `"use client"` to every component.

Keep client boundaries as small as practical.

Before making assumptions about current Next.js Server/Client Component behavior, follow the Next.js Version Rule above.

---

## State Management

Do not introduce Redux, Zustand, or another global state library unless there is a demonstrated requirement.

Prefer:

- React state for local UI state
- URL/search params for shareable filters and navigation state
- a server-state library such as TanStack Query when installed and justified
- React Context/providers for genuinely global frontend concerns

Do not copy server data into global client state without a reason.

Do not create two competing sources of truth for the same data.

---

## Forms

For simple forms, use the simplest approach that fits the existing project.

For non-trivial forms, React Hook Form and Zod may be used when they are part of the installed project stack.

Keep feature-specific validation close to the feature.

Example:

```text
features/
└── shipments/
    └── schemas/
        └── shipment.schema.ts
```

Frontend validation exists for user experience.

It is not a security boundary.

Backend validation remains authoritative.

Do not reproduce complex backend business rules in frontend schemas.

---

## Business Logic Boundary

The frontend must not become a second implementation of Fleetora's domain logic.

The backend owns:

- shipment lifecycle validation
- assignment rules
- delivery rules
- authorization
- tenant isolation
- operational invariants
- sensitive state changes

The frontend may present available actions and validate basic input for UX.

It must not independently decide whether a sensitive domain transition is valid.

For example, do not create a frontend-only shipment state machine and assume it is authoritative.

If the backend exposes allowed actions or transition information, use that contract.

The backend remains authoritative even if the frontend hides an invalid action.

---

## Authentication

Authentication is controlled by the backend.

The frontend may be responsible for the user-facing flow around:

- login
- logout
- session state
- unauthorized responses
- protected navigation
- role/permission-aware presentation

Do not invent token storage or refresh behavior without inspecting the actual backend authentication contract.

Do not expose tokens through logs or UI.

Do not hard-code credentials.

Do not assume authentication implementation details based on generic tutorials.

---

## Authorization

Frontend authorization is for UX, not security.

The frontend may:

- hide unavailable actions
- disable unavailable controls
- adjust navigation
- show role-appropriate interfaces

But the backend remains the final authorization boundary.

Never assume an operation is safe merely because the UI hides it from other roles.

Do not duplicate the backend permission engine unnecessarily.

---

## Multi-Tenancy

Fleetora is multi-tenant.

Frontend code must not assume all operational data belongs to one global company.

The backend is responsible for enforcing tenant isolation.

Do not treat client-provided `companyId` values as trusted authorization data.

Do not add UI mechanisms that allow arbitrary tenant ownership overrides unless explicitly supported by the backend contract and product requirements.

Platform-level interfaces, if introduced, must follow their explicit backend authorization contract.

Do not invent platform-admin tenant-switching behavior.

---

## Data-Heavy Screens

Fleetora contains data-heavy screens such as:

- shipments
- workers
- vehicles
- warehouses
- analytics

Use consistent patterns for:

- pagination
- search
- filtering
- sorting
- status badges
- row actions
- bulk actions when actually supported
- loading states
- error states
- empty states

Do not build a completely different table interaction model for every feature.

Do not assume client-side pagination/filtering when the backend contract uses server-side operations.

---

## Loading, Error, Empty, and Success States

Every data-driven feature should consider:

- loading
- error
- empty
- success

Do not leave unexplained blank screens.

Do not treat an empty dataset as an error.

Do not expose raw backend/database errors directly to users.

Provide useful retry behavior where appropriate.

Use route-level or component-level boundaries according to the actual Next.js architecture and feature needs.

---

## User Feedback

State-changing operations should provide clear feedback.

Users should be able to understand whether an operation:

- is in progress
- succeeded
- failed
- requires correction
- requires confirmation

Do not show success before the backend confirms success.

For destructive or operationally significant actions, use confirmation when appropriate.

Avoid excessive notifications for trivial interactions.

---

## TypeScript

Use strict TypeScript.

Avoid:

```ts
any
```

Do not use:

```ts
// @ts-ignore
```

merely to hide type problems.

Prefer:

- proper types
- type inference where clear
- discriminated unions where useful
- narrow component props
- existing project types

Do not duplicate the same API/domain type unnecessarily.

Do not weaken types just to make compilation pass.

---

## Naming

Use clear and consistent names.

Components:

```text
ShipmentTable
ShipmentForm
ShipmentDetails
ShipmentStatusBadge
```

Hooks:

```text
useShipments
useShipment
useCreateShipment
```

API functions:

```text
getShipments
getShipment
createShipment
updateShipment
deleteShipment
```

Use the project's established filename convention consistently.

If kebab-case is established:

```text
shipment-table.tsx
shipment-form.tsx
use-shipments.ts
```

Do not rename existing files solely to enforce a preferred convention during unrelated work.

---

## Code Quality

Prefer small components with one clear responsibility.

Avoid:

- huge page components
- giant utility files
- duplicate API logic
- duplicate UI patterns
- unnecessary abstractions
- premature generic components
- global state for local problems
- deeply nested component logic
- unnecessary wrappers

Extract code when there is a concrete readability, reuse, testing, or responsibility benefit.

Do not create files merely to make the directory tree look architectural.

---

## Performance

Do not prematurely optimize.

Avoid obvious problems such as:

- unnecessary repeated API requests
- avoidable large client bundles
- unnecessary client components
- expensive computations during every render
- rendering huge unpaginated datasets
- loading assets far larger than needed

Use Next.js capabilities according to the installed version and local documentation.

Measure before introducing complicated performance infrastructure.

---

## Security

Never expose:

- secrets
- private environment variables
- credentials
- sensitive tokens
- internal infrastructure details

Only expose environment variables intentionally designed for browser use.

Do not use frontend checks as protection for sensitive operations.

Do not render unsanitized untrusted HTML.

Do not weaken security behavior to make development easier.

---

## Feature Ownership

A Fleetora feature may span both backend and frontend.

The feature owner should understand the complete user flow.

Frontend code must follow the actual backend API contract.

When a contract changes, coordinate the frontend behavior with the backend implementation.

Do not independently redesign the backend contract from frontend code.

---

## Git and Collaboration

Keep changes focused.

Do not mix unrelated refactors with feature implementation.

Avoid modifying another feature unnecessarily.

Do not rewrite working code merely to match personal style.

Follow the team's current branch and commit conventions when they exist.

Suggested commit style:

```text
feat(shipments): add shipment table
feat(shipments): add shipment creation form
fix(shipments): handle empty shipment state
```

Do not treat suggested branch or commit naming as architecture requirements.

---

## Before Making Changes

Always:

1. inspect the relevant existing code
2. inspect the installed dependencies
3. understand the current feature structure
4. inspect reusable components
5. inspect the actual backend API contract
6. check relevant Fleetora documentation
7. determine whether the change belongs to `app`, `features`, `components`, `lib`, or another layer
8. consider loading/error/empty behavior
9. consider authorization and tenant implications
10. make the smallest clean change that solves the requirement

Do not begin by rewriting existing architecture.

---

## Before Finishing

For the affected scope, check:

- TypeScript errors
- ESLint errors
- build errors
- relevant tests
- loading state
- error state
- empty state
- responsive behavior
- accessibility
- authentication behavior
- authorization-aware UI behavior
- API error handling
- consistency with the design system

Do not claim the feature works if relevant verification was not performed.

If a check could not be run, state that clearly.

---

## Scope Control

Do not:

- rewrite architecture without being asked
- modify unrelated files
- install dependencies without a concrete requirement
- replace existing libraries unnecessarily
- create speculative infrastructure
- implement future roadmap features during unrelated work
- duplicate backend business rules
- invent backend capabilities
- redesign the global UI during a small feature task

Keep diffs focused and reviewable.

---

## Decision Escalation

Ask before making a major decision when requirements are unclear and the decision affects:

- API contracts
- authentication flows
- authorization behavior
- tenant behavior
- major navigation structure
- shared design-system architecture
- global state architecture
- major dependency additions
- domain workflows
- destructive user actions

For small implementation details that do not alter architecture or product behavior, follow existing project patterns instead of asking unnecessarily.

---

## Definition of Done

A frontend feature is not complete merely because the page renders.

For the relevant scope, verify:

- it uses the real API contract
- types are correct
- loading behavior exists
- errors are handled
- empty states are handled where applicable
- successful operations provide appropriate feedback
- authorization-aware UI is correct
- tenant assumptions are safe
- responsive behavior is reasonable
- accessibility basics are preserved
- the design system is followed
- relevant checks pass
- unrelated files were not changed

---
## Fleetora Design Language

Before designing or substantially modifying Fleetora UI, read:

`../.agents/design/FLEETORA_DESIGN_LANGUAGE.md`

Use it for design philosophy and product visual language. Read [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) for the canonical visual specification; the design language does not define competing tokens.

For UI tasks, combine it with the relevant project skills:

- `ui-ux-design`
- `design-system`
- `frontend-engineering`

Do not invent a new visual language per screen.
Do not default to generic AI-generated dashboard aesthetics.


## Important Rule

Do not build architecture for architecture's sake.

Do not use emojis in Fleetora product UI or generated project documentation unless explicitly requested.

Fleetora is a graduation project intended to become a production-quality SaaS foundation.

Prefer:

```text
Simple
→ Clear
→ Consistent
→ Testable
→ Maintainable
```

over unnecessary enterprise complexity.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
