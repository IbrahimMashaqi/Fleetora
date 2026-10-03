# Fleetora Frontend — Agent Instructions

## Project

Fleetora is a B2B logistics and delivery management SaaS.

Frontend stack:

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- REST API
- TanStack Query when needed
- React Hook Form + Zod for forms and validation

The backend is a separate NestJS application.

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

Prefer simple, readable solutions over unnecessary abstractions, state-management libraries, or complex architecture.

Before changing code, inspect the existing implementation and reuse established patterns.

Do not introduce a new library when the existing stack can solve the problem.

---

## Architecture

Use feature-based organization.

```text
app/                  # Routes, pages, layouts
components/
  ui/                 # shadcn/ui components
  layout/             # Navbar, Sidebar, dashboard shell
  shared/             # Reusable Fleetora components
features/
  auth/
  shipments/
  workers/
  vehicles/
  warehouses/
  zones/
  analytics/
lib/
  api/                # API client/infrastructure
  auth/
  utils/
  constants/
hooks/                # Shared React hooks
providers/            # Global providers
types/                # Shared types
public/               # Static assets
```

### `app/`

Use `app/` primarily for:

- Routing
- Pages
- Layouts
- Route groups

Keep business logic out of pages whenever practical.

Example:

```text
app/
└── (dashboard)/
    └── shipments/
        └── page.tsx
```

The page should compose feature components rather than contain the entire feature implementation.

### `features/`

Each major business feature should own its feature-specific code.

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

Do not create every folder/file automatically. Add them when the feature actually needs them.

Feature-specific components, hooks, schemas, API functions, and types should normally stay inside the feature.

### `components/ui/`

This directory contains shadcn/ui components.

Do not unnecessarily rewrite or duplicate shadcn components.

Customize them only when Fleetora needs a consistent project-wide behavior or style.

### `components/layout/`

Use for application-wide layout components such as:

- Sidebar
- Navbar
- Dashboard shell
- Navigation
- User menu

Do not duplicate these components inside every page.

### `components/shared/`

Use for reusable Fleetora-specific components that are not owned by a single feature.

Examples:

- DataTable utilities
- EmptyState
- LoadingState
- ConfirmDialog
- PageHeader

Do not put feature-specific components here just because they might be reused later.

---

## UI and Design System

Use shadcn/ui as the foundation for the UI.

Use Tailwind CSS for styling.

Keep the design system consistent across all features.

Global design tokens should define concepts such as:

- Primary
- Secondary
- Background
- Foreground
- Muted
- Border
- Success
- Warning
- Destructive

Do not hard-code random colors throughout feature components.

For example, avoid creating different shades of blue for different features.

A Shipment page and a Worker page should look like parts of the same product.

---

## Feature Ownership

Fleetora is developed by two developers.

Each developer may own a complete feature end-to-end:

```text
Feature
├── Backend
└── Frontend
```

A feature owner is responsible for understanding and implementing the complete user flow.

Frontend code must follow the backend API contract.

Do not invent API behavior that does not exist in the backend.

When an API contract changes, update the frontend and coordinate with the backend implementation.

---

## API Integration

Keep API communication separate from UI components.

Prefer:

```text
features/shipments/api/
```

for shipment-specific API operations.

Use:

```text
lib/api/
```

for shared API infrastructure such as:

- HTTP client
- Base URL
- Request configuration
- Common error handling
- Authentication handling

Do not put every API function into one giant API file.

---

## Server and Client Components

Prefer Next.js Server Components by default.

Use `"use client"` only when client-side behavior is required, such as:

- React state
- Event handlers
- Browser APIs
- Interactive forms
- Client-side hooks
- TanStack Query

Do not add `"use client"` to every component.

Keep the client boundary as small as practical.

---

## State Management

Do not introduce Redux, Zustand, or another global state library unless there is a demonstrated need.

Prefer:

- React state for local UI state
- URL/search params for shareable filter state
- TanStack Query for server state
- React Context/providers only for genuinely global concerns

Do not duplicate server state unnecessarily.

---

## Forms

Use React Hook Form for non-trivial forms.

Use Zod for validation when appropriate.

Keep validation rules close to the feature:

```text
features/
└── shipments/
    └── schemas/
        └── shipment.schema.ts
```

Frontend validation improves UX but does not replace backend validation.

Never assume frontend validation is a security boundary.

---

## TypeScript

Use strict TypeScript.

Avoid:

```ts
any;
```

Do not use:

```ts
// @ts-ignore
```

unless there is a documented and unavoidable reason.

Prefer explicit types and type inference where appropriate.

Do not duplicate the same type in multiple places unnecessarily.

---

## Loading, Error, and Empty States

Every data-driven feature should consider:

- Loading state
- Error state
- Empty state
- Success state

For example:

```text
Loading
   ↓
Success → data
   ↓
Empty → empty state
   ↓
Error → error state
```

Do not leave blank screens when data is loading or unavailable.

---

## Authentication and Authorization

Authentication is handled by the backend.

The frontend must correctly handle:

- Login
- Logout
- Access token/session state
- Unauthorized responses
- Protected routes
- User roles/permissions

Do not rely on frontend authorization for security.

The backend remains the final authorization boundary.

The frontend should only hide/disable UI that the current user cannot use.

---

## Multi-Tenancy

Fleetora is a multi-tenant SaaS.

Frontend code must not assume that data belongs to a single global company.

The backend is responsible for enforcing tenant isolation.

Do not allow the frontend to manually override tenant ownership or treat client-provided company IDs as trusted authorization data.

---

## Tables and Data-Heavy Screens

Fleetora contains data-heavy screens such as:

- Shipments
- Workers
- Vehicles
- Warehouses
- Analytics

Prefer reusable patterns for:

- Pagination
- Search
- Filtering
- Sorting
- Status badges
- Row actions
- Loading states
- Empty states

Do not build a completely different table pattern for every feature.

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

Use kebab-case for filenames where consistent with the project:

```text
shipment-table.tsx
shipment-form.tsx
use-shipments.ts
```

---

## Code Quality

Prefer small components with one clear responsibility.

Avoid:

- Huge page components
- Giant utility files
- Duplicate API logic
- Duplicate UI patterns
- Deep unnecessary abstractions
- Premature generic components
- Global state for local problems

Extract code when there is a real reason, not merely to create more files.

---

## Git and Collaboration

Each feature should be developed in its own branch.

Example:

```text
feature/FLEET-23-shipments
feature/FLEET-24-workers
```

Keep commits focused.

Example:

```text
feat(shipments): add shipment table
feat(shipments): add shipment creation form
fix(shipments): handle empty shipment state
```

Do not mix unrelated features or refactors into the same commit.

Avoid modifying another developer's feature without coordination.

---

## Before Making Changes

Always:

1. Inspect the relevant existing code.
2. Understand the current architecture.
3. Check existing reusable components.
4. Check the API contract.
5. Identify whether the change belongs to `app`, `features`, `components`, `lib`, or another layer.
6. Make the smallest clean change that solves the problem.

Do not rewrite working code unnecessarily.

---

## Before Finishing

Check:

- TypeScript errors
- ESLint errors
- Build errors
- Loading state
- Error state
- Empty state
- Responsive behavior
- Authentication/authorization behavior
- API error handling

If tests exist for the affected area, run the relevant tests.

---

## Important Rule

Do not build architecture for architecture's sake.
Do not use emojis

Fleetora is a graduation project that should become a production-quality SaaS foundation.

Prefer:

```text
Simple
→ Clear
→ Consistent
→ Testable
→ Maintainable
```

over unnecessary enterprise complexity.
