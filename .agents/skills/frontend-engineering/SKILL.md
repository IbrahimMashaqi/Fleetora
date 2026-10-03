---
name: frontend-engineering
description: Engineering rules for implementing Fleetora's Next.js frontend. Use when creating, modifying, reviewing, debugging, or refactoring frontend code, pages, components, forms, API integrations, authentication flows, loading/error states, and frontend architecture.
---

# Fleetora Frontend Engineering

## Purpose

This skill defines how frontend code should be engineered in Fleetora.

It complements:

- frontend/AGENTS.md
- ui-ux-design skill
- design-system skill
- Fleetora project documentation

Use this skill for implementation quality and frontend architecture.

Do not use it to invent product requirements or backend business rules.

---

# 1. Core Principles

Fleetora frontend should be:

- type-safe
- maintainable
- modular
- predictable
- accessible
- responsive
- operationally efficient

Prefer simple solutions over clever abstractions.

Do not over-engineer.

Do not introduce architecture for hypothetical future requirements.

---

# 2. Next.js Version Awareness

This project may use Next.js APIs and conventions newer than model training knowledge.

Before making framework-sensitive changes:

1. inspect package.json
2. inspect the existing project structure
3. read frontend/AGENTS.md
4. consult the relevant local Next.js documentation under node_modules when required

Do not assume older Next.js conventions are valid.

Do not downgrade Next.js to make an implementation easier.

---

# 3. Existing Architecture First

Before adding code:

1. inspect the relevant route
2. inspect nearby components
3. inspect existing utilities
4. inspect existing API patterns
5. inspect the design system
6. inspect relevant types

Reuse established patterns when they are sound.

Do not create a second architecture beside the existing one.

---

# 4. Feature Organization

Prefer feature-oriented organization for substantial product features.

Example:

features/
└── shipments/
    ├── components/
    ├── api/
    ├── hooks/
    ├── types/
    ├── schemas/
    └── utils/

Not every feature needs every directory.

Create directories only when they contain meaningful responsibilities.

Avoid empty architectural scaffolding.

---

# 5. App Router

Use the Next.js App Router conventions used by the installed project.

Routes belong under `app/`.

Use route groups and nested layouts only when they provide real organizational or UX value.

Keep route files focused.

Do not put large amounts of reusable feature logic directly inside `page.tsx`.

---

# 6. Server and Client Components

Prefer Server Components when client-side behavior is not required.

Use Client Components when the component genuinely needs:

- browser APIs
- local interactive state
- event handlers
- client-only libraries
- interactive hooks

Do not add `"use client"` to entire trees merely for convenience.

Keep client boundaries as narrow as practical.

Do not force Server Components when doing so makes the implementation unnecessarily complex.

---

# 7. Component Design

Components should have clear responsibilities.

Prefer:

- small focused components
- explicit props
- composition
- reusable primitives where reuse actually exists

Avoid:

- giant page components
- deeply nested conditional rendering
- excessive prop drilling
- premature generic components
- abstractions used only once without a clear reason

Extract components when doing so improves readability, reuse, testing, or responsibility separation.

---

# 8. UI and Design System

Do not invent styling independently inside features.

Use the Fleetora design system and theme.

Before creating a new UI primitive:

1. check whether an equivalent already exists
2. reuse it if appropriate
3. extend it if the existing primitive reasonably supports the use case
4. create a new primitive only when necessary

Do not create feature-specific versions of generic buttons, inputs, dialogs, badges, tables, or cards without reason.

---

# 9. Business Logic Boundary

The frontend is not the source of truth for Fleetora business rules.

Do not implement authoritative logic for:

- shipment state transitions
- permissions
- tenant ownership
- assignment validity
- subscription enforcement
- operational authorization

The frontend may reflect backend rules for UX purposes, but the backend must enforce them.

Example:

The frontend may hide an unavailable "Assign Shipment" action.

The backend must still reject an unauthorized assignment request.

---

# 10. API Layer

Centralize backend communication in a clear API layer.

Do not scatter raw fetch calls throughout presentation components.

Feature API functions should communicate intent.

Prefer:

```ts
getShipments()
getShipmentById()
createShipment()
assignShipment()
```
