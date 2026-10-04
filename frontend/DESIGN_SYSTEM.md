# Fleetora — Frontend Design System

## 1. Purpose

This document defines how Fleetora's frontend UI should be constructed.

It is Fleetora's canonical source of truth for design tokens, colors, typography, spacing, radii, borders, shadows, surfaces, semantic states, component visual rules, dashboard density, and responsive visual behavior.

It also defines implementation rules for:

- UI primitives
- reusable components
- feature components
- page composition
- forms
- tables
- dialogs
- feedback states
- responsive behavior
- accessibility
- component reuse
- frontend architecture

Section 8 contains the canonical visual specification and values. The remaining sections define how the system is implemented and reused.

[Product design language](../.agents/design/FLEETORA_DESIGN_LANGUAGE.md) explains the design philosophy. Theme files under `.agents/` are supporting AI references and must defer to this document; they do not define alternative tokens or visual directions.

Business rules remain owned by the backend.

---

# 2. Core Rule

Fleetora should have one coherent product interface.

Do not design every page independently.

The preferred hierarchy is:

```text
Design Tokens
    ↓
UI Primitives
    ↓
Shared Product Components
    ↓
Feature Components
    ↓
Pages
```

Pages compose components.

Pages should not become mini design systems.

---

# 3. Component Layers

Fleetora frontend components should conceptually belong to one of four layers.

## 3.1 UI Primitives

Generic reusable interface building blocks.

Examples:

```text
Button
Input
Textarea
Select
Checkbox
Radio
Switch
Badge
Avatar
Tooltip
Popover
Dialog
DropdownMenu
Tabs
Separator
Skeleton
Spinner
```

These components should know nothing about:

- shipments
- workers
- merchants
- vehicles
- warehouses
- Fleetora business rules

Example:

`Button` knows how a button looks and behaves.

It does not know what `Assign Shipment` means.

---

## 3.2 Shared Product Components

Components that are specific to Fleetora's product language but reusable across multiple features.

Examples:

```text
PageHeader
DataTable
StatusBadge
RiskBadge
MetricCard
EmptyState
ErrorState
ConfirmDialog
SearchInput
FilterBar
Pagination
DateDisplay
MoneyDisplay
EntityLink
PageSection
DetailRow
ActivityTimeline
```

These may understand Fleetora presentation concepts.

They must not own backend business rules.

---

## 3.3 Feature Components

Components belonging to one business feature.

Examples:

```text
features/
├── auth/
├── shipments/
├── workers/
├── merchants/
├── vehicles/
├── warehouses/
└── analytics/
```

Shipment examples:

```text
ShipmentTable
ShipmentFilters
ShipmentStatusBadge
ShipmentDetails
ShipmentTimeline
CreateShipmentForm
AssignShipmentDialog
```

Worker examples:

```text
WorkerTable
WorkerStatus
WorkerDetails
WorkerAssignmentList
```

Feature components may understand feature-specific data.

They must still not duplicate backend domain rules.

---

## 3.4 Pages

Pages coordinate the user experience.

Pages may:

- fetch or receive data
- compose feature components
- define page-level layout
- manage route-level states
- connect actions to APIs

Pages should not contain large amounts of reusable UI markup.

If a page becomes difficult to scan because of repeated or complex markup, extract the appropriate component.

---

# 4. Recommended Frontend Structure

The exact structure may evolve with the project, but prefer a clear organization such as:

```text
frontend/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   └── ...
│
├── components/
│   ├── ui/
│   └── shared/
│
├── features/
│   ├── auth/
│   ├── shipments/
│   ├── workers/
│   ├── merchants/
│   └── ...
│
├── lib/
├── hooks/
├── types/
└── public/
```

Do not create directories merely because they appear in this document.

Create them when the implementation requires them.

---

# 5. UI Primitive Rule

Before creating a primitive, ask:

1. Does an equivalent component already exist?
2. Can the existing component be extended cleanly?
3. Is this actually reusable?
4. Does it belong to a feature instead?

Do not create:

```text
BlueButton
GreenButton
ShipmentButton
DashboardButton
SmallBlueButton
```

Prefer one properly designed:

```text
Button
```

with controlled variants.

Example conceptual API:

```tsx
<Button variant="primary">
  Create shipment
</Button>

<Button variant="secondary">
  Cancel
</Button>

<Button variant="ghost">
  View details
</Button>

<Button variant="destructive">
  Delete
</Button>
```

Variants must represent semantic purposes, not arbitrary visual experiments.

---

# 6. Component API Design

Component APIs should be:

- small
- predictable
- typed
- composable
- difficult to misuse

Avoid components with excessive boolean props such as:

```tsx
<Button
  blue
  rounded
  small
  outlined
  bold
  withShadow
/>
```

Prefer semantic APIs:

```tsx
<Button
  variant="secondary"
  size="sm"
>
  Cancel
</Button>
```

Avoid exposing styling implementation details unnecessarily.

---

# 7. Variants

Variants should exist only when they represent legitimate recurring UI differences.

Typical Button variants:

```text
primary
secondary
ghost
destructive
```

Typical sizes:

```text
sm
md
lg
```

Do not add variants for one page unless there is a strong reusable reason.

---

# 8. Design Tokens

Components should consume semantic design tokens.

Avoid repeatedly hard-coding values such as:

```text
#0F9F95
#E3EAF0
#102A43
```

throughout components.

Prefer semantic concepts:

```text
primary
background
foreground
surface
border
muted
success
warning
danger
```

The raw Fleetora palette should be centralized.

Changing a global visual decision should not require editing dozens of components.

---

<a id="visual-2"></a>

## 8.2. Product Visual Direction

Fleetora is an operational logistics SaaS product.

The interface should feel:

- professional
- precise
- calm
- trustworthy
- operational
- modern
- efficient
- information-dense without feeling crowded

Fleetora should look like software used every day to operate a real logistics company.

It should not look like:

- a marketing landing page
- a generic admin template
- a crypto dashboard
- a gaming interface
- a futuristic AI demo
- a collection of disconnected cards
- a heavily animated showcase
- a student-project dashboard

The UI should prioritize operational clarity over decoration.

---

<a id="visual-3"></a>

## 8.3. Core Visual Principles

### 3.1 Operational Clarity

Important information must be recognizable quickly.

Users should be able to scan:

- shipment state
- delivery risk
- worker availability
- exceptions
- assignments
- operational metrics
- alerts
- delivery progress

without carefully reading every element.

### 3.2 Quiet Surfaces

Most of the application should use neutral surfaces.

Strong colors are reserved for:

- actions
- status
- warnings
- errors
- selection
- important operational signals

Do not fill large dashboard areas with saturated colors.

### 3.3 Hierarchy Through Structure

Prefer hierarchy created by:

1. typography
2. spacing
3. layout
4. borders
5. surface contrast
6. semantic color

Do not rely on excessive colors to create hierarchy.

### 3.4 Dense, Not Cramped

Fleetora is an operational dashboard.

It may display significant amounts of information, especially in tables.

Density is desirable.

Crowding is not.

### 3.5 Consistency Over Novelty

The same semantic concept must look the same throughout the application.

Do not invent new visual treatments page by page.

### 3.6 Function Before Decoration

Every visual element should support:

- comprehension
- navigation
- action
- state recognition
- prioritization

Decoration must never compete with operational information.

---

<a id="visual-4"></a>

## 8.4. Brand Foundation

Fleetora's official theme is navy + teal on light neutral surfaces. The approved palette and semantic roles are defined in [FLEETORA_THEME.md](../.agents/design/FLEETORA_THEME.md); reusable CSS variables live in `app/globals.css`.

Brand navy (`#102A43`) supports brand identity and structural UI. Sidebar navy (`#0B1F33`) is reserved for primary navigation. Teal (`#0F9F95`) is the primary action and interactive emphasis color, with `#0B817A` for hover and active states. Teal is not a general page background or operational status color.

Use the semantic tokens `brand-navy`, `sidebar-navy`, `primary`, `primary-hover`, and `primary-active`. Do not reintroduce the former primary-blue palette.

---

<a id="visual-5"></a>

## 8.5. Neutral Palette

Fleetora uses light neutral tones from the approved theme.

```text
Neutral 0      #FFFFFF
Neutral 50     #F5F7FA
Neutral 200    #E3EAF0
Neutral 500    #62748A
Neutral 900    #172B4D
```

Typical usage:

```text
Application background    #F5F7FA
Primary surface           Neutral 0
Secondary surface         Page background
Subtle surface            Page background

Default border            #E3EAF0
Strong border             Use the `border-strong` semantic token where needed.

Primary text              #172B4D
Secondary text            #62748A
Muted text                #62748A
Disabled text             Secondary text with disabled control semantics
```

Light theme semantic aliases:

```text
background          Application background
foreground          Primary text
surface             Primary surface
surface-secondary   Secondary surface
surface-muted       Subtle surface
muted               Subtle surface
muted-foreground    Muted text
border              Default border
border-strong       Strong border
secondary           Subtle surface
secondary-foreground Brand navy
primary-foreground  Neutral 0
focus-ring          Primary
```

Do not use pure black for normal application text.

---

<a id="visual-6"></a>

## 8.6. Semantic Colors

Operational state colors are reserved for badges, indicators, and alerts. Use them only to communicate the corresponding state, with text labels so color is never the sole signal. They are not primary actions or decorative accents.

```text
Success / delivered       #168A55
In progress               #2878C7
Pending / attention       #C77B11
Failed / delayed          #C2414B
```

Use the semantic `success`, `in-progress`, `warning`, and `destructive` tokens and their subtle state surfaces defined in `app/globals.css`. Destructive controls and validation errors use the failure family only when the action or state is genuinely destructive or failed.

---

<a id="visual-7"></a>

## 8.7. Typography

### Primary Font

Use:

`Inter`

Fallback stack:

```css
Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

Fleetora requires strong readability for:

- tables
- metrics
- IDs
- dates
- statuses
- forms
- operational dashboards

Avoid decorative fonts inside the product.

---

<a id="visual-8"></a>

## 8.8. Typography Scale

### Display

```text
Font size:    32px
Weight:       600
Line height:  40px
```

Use rarely.

### Page Title

```text
Font size:    24px
Weight:       600
Line height:  32px
```

### Section Title

```text
Font size:    18px
Weight:       600
Line height:  28px
```

### Card Title

```text
Font size:    16px
Weight:       600
Line height:  24px
```

### Body

```text
Font size:    14px
Weight:       400
Line height:  20px
```

### Body Strong

```text
Font size:    14px
Weight:       500
Line height:  20px
```

### Small

```text
Font size:    13px
Weight:       400
Line height:  18px
```

### Caption

```text
Font size:    12px
Weight:       500
Line height:  16px
```

Do not create arbitrary font sizes when an existing token is sufficient.

---

<a id="visual-9"></a>

## 8.9. Numeric Data

Operational numbers should be easy to compare.

Use tabular numerals when displaying:

- shipment counts
- money
- durations
- timestamps
- percentages
- analytics

Example:

```css
font-variant-numeric: tabular-nums;
```

Large KPI numbers should not become oversized marketing typography.

---

<a id="visual-10"></a>

## 8.10. Spacing System

Use a 4px base grid.

```text
1     4px
2     8px
3     12px
4     16px
5     20px
6     24px
8     32px
10    40px
12    48px
16    64px
```

Preferred spacing:

```text
Icon → text                 8px
Label → input               8px
Related controls            8–12px
Card internal spacing       16–24px
Section spacing             24–32px
Major page sections         32px
```

Avoid arbitrary values unless there is a concrete layout reason.

---

<a id="visual-11"></a>

## 8.11. Border Radius

Fleetora should not look excessively rounded.

Use:

```text
Small       6px
Default     8px
Medium      10px
Large       12px
Full        9999px
```

Typical usage:

```text
Buttons             8px
Inputs              8px
Cards               10px
Dialogs             12px
Status badges       Full
Avatars             Full
```

Avoid large 20–30px radii on ordinary dashboard components.

---

<a id="visual-12"></a>

## 8.12. Borders

Default border uses the `border` token (`#E3EAF0`).

Strong border uses the `border-strong` token.

Use borders to separate information before adding shadows.

Operational dashboards should not make every container appear to float.

---

<a id="visual-13"></a>

## 8.13. Shadows

Shadows must remain subtle.

### Small

```css
0 1px 2px rgb(15 23 42 / 0.05)
```

### Medium

```css
0 4px 12px rgb(15 23 42 / 0.08)
```

Use shadows primarily for:

- dropdowns
- dialogs
- popovers
- floating menus

Normal dashboard cards should usually rely on borders and surfaces.

Avoid dramatic shadows.

---

<a id="visual-14"></a>

## 8.14. Application Shell

Desktop layout concept:

```text
┌─────────────────────────────────────────────────────┐
│ Sidebar │                 Main                      │
│         │ ┌───────────────────────────────────────┐ │
│         │ │ Header                                │ │
│         │ ├───────────────────────────────────────┤ │
│         │ │                                       │ │
│         │ │ Page Content                          │ │
│         │ │                                       │ │
│         │ └───────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Sidebar

Expanded width:

`248px`

Collapsed width:

`72px`

Use a dark navy/slate sidebar with these semantic tokens:

```text
sidebar-background          sidebar-navy token
sidebar-foreground          sidebar-foreground token
sidebar-muted               muted-foreground token
sidebar-active-background   brand-navy token
sidebar-active-foreground   white
sidebar-active-indicator    primary teal token
```

The sidebar should feel stable and quiet. Do not use gradients.

The sidebar may contain:

- Fleetora identity
- primary navigation
- secondary navigation where necessary
- account/workspace area

Do not overload the sidebar.

Active navigation should be obvious without becoming visually aggressive.

### Header

Recommended height:

`64px`

May contain:

- page context
- search
- notifications
- quick actions
- user menu

Do not duplicate navigation unnecessarily between sidebar and header.

### Content

Operational tables may use the available viewport width.

Forms and settings pages should use narrower readable containers.

Typical page padding:

```text
Desktop       24–32px
Tablet        20–24px
Mobile        16px
```

---

<a id="visual-16"></a>

## 8.16. Cards

Cards should represent meaningful groups of information.

Default card:

```text
Background      surface token
Border          border token
Radius          10px
Shadow          none or very subtle
Padding         20–24px
```

Do not wrap every piece of content in a card.

Avoid deeply nested cards.

Bad:

```text
Card
└── Card
    └── Card
        └── Card
```

Prefer clear sections and tables when appropriate.

---

<a id="visual-17"></a>

## 8.17. Buttons

### Primary Button

Use for the primary action of a context.

Example:

`Create shipment`

Recommended style:

```text
Background      Primary
Text            White
Height          40px
Radius          8px
```

### Secondary Button

Use for supporting actions.

```text
Background      White
Border          Neutral 300
Text            Neutral 700
```

### Ghost Button

Use for:

- toolbars
- row actions
- low-emphasis controls
- compact navigation actions

### Destructive Button

Use danger styling only for genuinely destructive operations.

Examples:

- delete
- revoke
- irreversible cancellation

Do not show multiple competing primary buttons in the same small context.

---

<a id="visual-18"></a>

## 8.18. Inputs

Default control height:

`40px`

Compact controls may use:

`36px`

Inputs should include:

- visible label
- clear focus state
- validation state
- optional supporting text
- accessible error message

Do not rely on placeholder text as the only label.

Focus state:

```text
Border: Primary
Ring: subtle primary focus ring
```

Disabled controls must remain recognizable but visually lower emphasis.

---

<a id="visual-20"></a>

## 8.20. Tables

Tables are first-class Fleetora components.

They are appropriate for:

- shipments
- workers
- merchants
- vehicles
- users
- operational records
- audit records

Default principles:

- compact but readable rows
- stable column alignment
- clear headers
- predictable actions
- tabular numeric values
- status represented consistently
- row selection only when required

Recommended row height:

`48–52px`

Table headers should be visually quieter than primary page titles.

Do not turn every table row into a floating card on desktop.

---

<a id="visual-30"></a>

## 8.30. Icons

Use one consistent icon family throughout Fleetora.

Recommended icon sizes:

```text
16px
18px
20px
```

Use `24px` when hierarchy requires it.

Icons supplement text.

They should not replace labels for unfamiliar operations.

Do not mix unrelated icon styles.

Avoid decorative icons with no functional or semantic purpose.

---

<a id="visual-31"></a>

## 8.31. Motion

Motion should communicate change, not entertain.

Recommended duration:

```text
Fast        120–150ms
Default     150–200ms
Slow        200–250ms
```

Prefer:

- opacity
- small translation
- controlled expansion

Avoid:

- bouncing
- excessive scaling
- long page transitions
- decorative dashboard animations
- constant movement

Respect reduced-motion preferences.

---

<a id="visual-32"></a>

## 8.32. Responsive Behavior

Fleetora is desktop-first for administrative operations, but must remain usable on smaller screens.

### Desktop

Use:

- full sidebar
- data-rich layouts
- complete operational tables
- multi-column detail layouts where useful

### Tablet

The sidebar may collapse.

Secondary table columns may be hidden when appropriate.

Controls may wrap while preserving hierarchy.

### Mobile Web

Prioritize:

- primary information
- core actions
- readable forms
- useful navigation

Complex operational tables may use:

- controlled horizontal scrolling
- reduced columns
- mobile-specific row presentation

Do not blindly convert every desktop component into cards.

---

Use the frontend framework's established breakpoints rather than inventing page-specific values.

---

<a id="visual-41"></a>

## 8.41. Dark Mode

Fleetora v1 does not require dark mode unless explicitly prioritized.

However, semantic tokens should avoid making future dark-mode support unnecessarily difficult.

Do not duplicate the entire styling system solely to prepare for hypothetical dark mode.

Build the light theme correctly first.

---

<a id="visual-42"></a>

## 8.42. Data Density

Fleetora should support information-dense operational screens.

Density should come from:

- efficient spacing
- strong alignment
- compact controls
- consistent typography
- sensible table layouts

Density must not come from:

- tiny unreadable text
- removing necessary whitespace
- hiding labels
- compressing unrelated information together

The default experience should balance speed and readability.

---

# 9. Status Presentation

Backend domain values are the source of truth.

The frontend may map domain values to presentation.

Example:

```text
backend status
    ↓
presentation mapping
    ↓
StatusBadge
```

Keep this mapping centralized.

Do not write separate mappings in:

```text
dashboard page
shipment table
shipment details
analytics page
```

for the same status.

The frontend must never invent domain states.

---

# 10. Business Logic Boundary

The frontend must not decide whether a domain operation is valid.

Bad:

```text
"If shipment is X, then frontend decides transition Y is allowed."
```

The backend owns that decision.

The frontend may use backend information to improve UX, such as disabling an unavailable action.

But backend authorization and domain validation remain mandatory.

Frontend restrictions are UX.

Backend restrictions are enforcement.

---

# 11. Data Tables

Fleetora is operational software.

A high-quality reusable table system is important.

The table system should eventually support, where required:

- column definitions
- loading state
- empty state
- sorting
- filtering
- pagination
- row actions
- selection
- responsive behavior

Do not implement every possible feature immediately.

Add capabilities when a real feature requires them.

---

# 12. Table Composition

Prefer a composition similar to:

```text
PageHeader

TableToolbar
├── Search
├── Filters
└── Actions

DataTable
├── Header
├── Rows
└── Row Actions

Pagination
```

Do not make `DataTable` responsible for an entire page.

---

# 13. Table Cells

Use specialized presentation where it improves consistency.

Examples:

```text
StatusCell
DateCell
MoneyCell
UserCell
WorkerCell
ActionsCell
```

Do not create trivial wrappers for every cell.

Extract only when there is meaningful repeated presentation or behavior.

---

# 14. Forms

Forms should separate:

```text
UI
Validation
Submission
Server response handling
```

Frontend validation improves UX.

Backend validation remains authoritative.

Never assume frontend validation makes input safe.

---

# 15. Form Components

Common form primitives may include:

```text
FormField
FormLabel
FormDescription
FormMessage
Input
Textarea
Select
Checkbox
```

Feature forms should compose them.

Example:

```text
CreateShipmentForm
    ↓
FormField
Input
Select
Button
```

Do not build completely different field markup for every form.

---

# 16. Validation States

Fields should visually support:

```text
default
focus
disabled
error
```

Where appropriate:

```text
success
```

Error messages should explain the problem.

Bad:

`Invalid input`

Better:

`Phone number must contain between 8 and 15 digits.`

Do not expose backend implementation details.

---

# 17. Loading States

Every asynchronous feature should consider loading behavior.

Use:

```text
Skeleton
Spinner
Button loading state
Table loading state
```

depending on context.

Do not use one full-screen spinner for every operation.

Loading state should be localized whenever possible.

---

# 18. Empty States

Reusable empty states should support:

```text
title
description
optional action
optional icon
```

Example:

```text
No workers found

Workers added to your company will appear here.

[ Add worker ]
```

Do not create large decorative illustrations unless they add genuine value.

---

# 19. Error States

Support multiple error scopes.

## Field Error

For form validation.

## Component Error

For a failed section.

## Page Error

For a failed route-level operation.

## Not Found

For unavailable resources.

## Permission Error

For authenticated users without required access.

Do not represent every error using a toast.

---

# 20. Toasts

Use toasts for temporary feedback.

Good:

```text
Shipment created.
Worker assigned.
Settings saved.
```

Bad:

Using a toast as the only place containing a critical operational warning.

Persistent information should remain visible in the relevant interface.

---

# 21. Dialogs

Dialogs should handle focused actions.

Good:

```text
Delete confirmation
Assignment confirmation
Small focused form
```

Bad:

```text
Entire shipment management page inside a modal
```

Large workflows belong on pages or dedicated panels.

---

# 22. Confirmation Dialog

Use a shared confirmation pattern for dangerous actions.

Conceptually:

```tsx
<ConfirmDialog
  title="Delete worker?"
  description="This action cannot be undone."
  confirmLabel="Delete"
  variant="destructive"
/>
```

Do not implement a different destructive confirmation design in each feature.

---

# 23. Page Header

Operational pages should use a consistent page header.

Conceptual structure:

```text
Title
Description
Actions
```

Example:

```text
Shipments

Manage and monitor company shipments.

[ Create shipment ]
```

Avoid giant marketing-style page headings.

---

# 24. Metric Cards

Metrics should use one consistent component.

Conceptual API:

```text
MetricCard
├── label
├── value
├── optional context
└── optional trend
```

Do not create unique colorful cards for every metric.

Color should communicate meaning, not variety.

---

# 25. Badges

Use `Badge` as the primitive.

Build semantic product components on top where useful:

```text
Badge
   ↓
StatusBadge
RiskBadge
```

Do not spread status color decisions throughout feature components.

---

# 26. Icons

Choose one icon library for the application.

Do not mix several libraries unless there is a concrete reason.

Create icon wrapper abstractions only if they provide real value.

Do not create a wrapper merely to rename every icon.

---

# 27. Layout Components

Reusable layout components may include:

```text
AppShell
Sidebar
Header
PageContainer
PageSection
```

These should provide structural consistency.

They should not know feature business logic.

---

# 28. Sidebar

Navigation should be data-driven where practical.

Conceptually:

```text
navigation
├── Overview
├── Shipments
├── Workers
├── Merchants
├── Vehicles
├── Warehouses
└── ...
```

Visibility may depend on permissions.

However:

**hiding a navigation item is not authorization.**

The backend still enforces permissions.

---

# 29. Feature Boundaries

Feature-specific components belong with their feature when they are not globally reusable.

Example:

```text
features/
└── shipments/
    ├── components/
    ├── api/
    ├── hooks/
    ├── types/
    └── utils/
```

Do not force this exact internal structure when a feature contains only one or two files.

Structure should grow with complexity.

---

# 30. API Layer

Do not scatter raw API requests throughout UI components.

Prefer a feature-oriented API layer.

Conceptually:

```text
features/
└── shipments/
    └── api/
        ├── get-shipments
        ├── get-shipment
        ├── create-shipment
        └── assign-shipment
```

Exact implementation may depend on the project's chosen data-fetching approach.

Do not introduce a large API framework before the need exists.

---

# 31. API Types

Frontend types should represent the actual API contract.

Do not manually invent backend response structures when a contract already exists.

Avoid `any`.

Do not hide contract mismatches with type assertions.

A mismatch between frontend expectations and backend responses should be fixed at the contract boundary.

---

# 32. Server and Client Components

Fleetora uses Next.js App Router.

Do not mark components as client components by default.

Use client components when browser-side interactivity requires them.

Examples:

```text
interactive form
dropdown
dialog
client-side state
browser API
```

Keep server-compatible components server-compatible where practical.

Before relying on Next.js-specific APIs or conventions, follow the project's Next.js agent instructions and inspect the relevant documentation installed with the project's actual Next.js version.

Do not assume behavior from older Next.js versions.

---

# 33. State Management

Do not introduce global state for ordinary local UI state.

Prefer the smallest appropriate scope.

Conceptually:

```text
Server data
→ server/data-fetching layer

Form state
→ form

Dialog state
→ component

Cross-application client state
→ global state only when genuinely necessary
```

Do not add a state-management library because a dashboard is expected to become large.

Add one when actual state requirements justify it.

---

# 34. URL State

Where useful, list state should be represented in the URL.

Examples:

```text
search
page
status filter
sorting
```

This improves:

- navigation
- refresh behavior
- shareability
- browser history

Do not put ephemeral UI state into the URL without reason.

---

# 35. Permission-Aware UI

The frontend may use user permissions to:

- hide unavailable navigation
- disable unavailable actions
- explain access restrictions

But it must never be considered the security boundary.

Backend authorization remains authoritative.

---

Prefer logical start/end layout concepts where supported so future RTL support remains practical. This does not introduce Arabic or RTL implementation requirements.

# 36. Responsive Components

Components should not assume one fixed viewport.

Tables, filters, headers, forms, dialogs, and navigation must define responsive behavior intentionally.

Do not blindly use:

```text
desktop layout
→ scale everything down
```

Prioritize information based on user task.

---

# 37. Accessibility

Reusable primitives carry a high accessibility responsibility.

Especially:

```text
Dialog
Dropdown
Select
Tabs
Tooltip
Form controls
```

They must support appropriate:

- keyboard interaction
- focus behavior
- semantics
- ARIA where necessary

Do not replace semantic HTML with generic `div` elements unnecessarily.

Prefer:

```html
<button>
<nav>
<main>
<table>
<label>
```

when those elements represent the actual semantics.

---

# 38. Focus Management

Interactive components must provide visible focus.

Dialogs should manage focus appropriately.

Keyboard users must be able to:

- navigate
- open
- operate
- close

interactive UI.

Never remove focus outlines without providing an accessible replacement.

---

# 39. Component States

Reusable components should consider their relevant states before being considered complete.

For example, a Button may require:

```text
default
hover
active
focus
disabled
loading
```

An Input may require:

```text
default
hover
focus
filled
disabled
error
```

A DataTable may require:

```text
loading
data
empty
error
```

Do not design only the ideal state.

---

# 40. Reuse Rule

Before writing a new component:

```text
Search existing component
        ↓
Can it solve the requirement?
        ↓
Yes → reuse it
No
        ↓
Can it be extended cleanly?
        ↓
Yes → extend it
No
        ↓
Is the requirement reusable?
        ↓
Yes → create shared component
No → keep it feature-local
```

Do not create duplicates because creating a new file is easier than understanding an existing component.

---

# 41. Abstraction Rule

Do not abstract prematurely.

Bad sequence:

```text
Need one table
→ create universal table framework
→ create schema engine
→ create plugin system
→ create 15 abstractions
```

Preferred:

```text
Need table
→ build clean table
→ reuse it
→ observe repeated requirements
→ abstract what actually repeats
```

Fleetora values maintainability over architectural performance art.

---

# 42. Dependency Rule

Before adding a frontend dependency:

1. verify the capability is actually needed
2. check whether the project already provides it
3. evaluate maintenance cost
4. evaluate bundle/runtime implications
5. avoid overlapping libraries

Do not install a library for trivial functionality that can be implemented clearly with existing tools.

---

# 43. Styling Rule

Use the styling approach already adopted by the project.

Do not mix multiple competing styling architectures without a concrete requirement.

Shared values must follow Fleetora design tokens.

Avoid large amounts of one-off arbitrary styling.

One unusual layout may require a special value.

Twenty copies of the same arbitrary value indicate a missing token or component.

---

# 44. Copy and Labels

Reusable components should not unnecessarily own product copy.

Bad:

```tsx
<EmptyState />
```

where it always says:

`No shipments found`

Better:

```tsx
<EmptyState
  title="No shipments found"
  description="Shipments will appear here."
/>
```

Feature-level components may provide feature-specific copy.

---

# 45. Dates and Times

Date and time presentation should be centralized.

Avoid different formats across pages.

The product should eventually define:

- date format
- time format
- timezone behavior
- relative time usage

Until the product contract decides these details, do not invent conflicting formats per feature.

---

# 46. Money and Numbers

Formatting should be centralized where appropriate.

Consider:

- currency
- decimal precision
- thousands separators
- percentages
- units

Do not manually concatenate currency strings throughout components.

---

# 47. IDs and Technical Data

Operational IDs may be useful but should not dominate the UI.

Use muted presentation for technical identifiers unless the workflow depends heavily on them.

Support copy actions where users genuinely need to transfer identifiers.

Do not expose internal database details that users do not need.

---

# 48. Skeletons

Skeletons should resemble the content they replace.

A table should receive a table-like skeleton.

A metric should receive a metric-like skeleton.

Do not show arbitrary gray rectangles disconnected from the final layout.

---

# 49. Progressive Disclosure

Show essential operational information first.

Secondary information may live in:

- expandable sections
- details panels
- tabs
- drawers
- tooltips where appropriate

Do not hide information merely to make a screenshot cleaner.

Do not display every possible field simultaneously either.

---

# 50. Details Pages

Entity details pages should follow a predictable structure.

Conceptually:

```text
Page Header
├── Entity identity
├── Status
└── Actions

Summary

Primary operational information

Related information

History / activity
```

Shipment, worker, merchant, and vehicle pages should feel related as parts of the same product.

---

# 51. Activity and History

Operational history should use a consistent presentation.

Examples:

```text
Shipment created
Worker assigned
Shipment picked up
Delivery failed
Shipment delivered
```

Use a timeline or structured activity list where appropriate.

Do not invent events on the frontend.

Render backend-provided history.

---

# 52. Action Placement

Primary page actions belong near the page header.

Table-level actions belong near the table.

Row-specific actions belong with the row.

Destructive actions should not be visually promoted over routine operations.

Keep action placement predictable across Fleetora.

---

# 53. Search

Use a shared search presentation.

Search inputs should clearly indicate:

- what they search
- whether search is active
- how to clear it

Avoid creating a unique search component for every feature.

---

# 54. Filters

Feature filters may differ in content but should share visual structure.

Examples:

```text
Shipment filters:
Status
Risk
Worker
Date

Worker filters:
Status
Vehicle
Availability
```

Use the same filtering language and interaction model where practical.

---

# 55. Pagination

Pagination should be consistent across operational lists.

The system may support:

- page navigation
- page size
- total results

depending on backend capabilities.

Do not create frontend-only pagination assumptions that conflict with the API contract.

---

# 56. Product Component Examples

Fleetora will likely benefit from a small set of strong shared components:

```text
AppShell
Sidebar
Header

PageHeader
PageSection

Button
Input
Select
Textarea
Checkbox

Badge
StatusBadge
RiskBadge

DataTable
TableToolbar
Pagination

MetricCard

EmptyState
ErrorState
LoadingState

Dialog
ConfirmDialog
Drawer

SearchInput
FilterBar

DateDisplay
MoneyDisplay

ActivityTimeline
```

This is a direction, not a requirement to create all of them immediately.

Only create components when implementation requires them.

---

# 57. What Not to Build Yet

Do not build a massive internal UI framework before Fleetora has real screens.

Do not create:

- dozens of unused primitives
- a universal form engine
- a universal page generator
- schema-driven UI for every feature
- a plugin architecture
- a custom CSS framework
- a component abstraction for every HTML element

Build the real product.

Extract patterns as they become real.

---

# 58. AI Coding Assistant Rules

When an AI coding assistant works on Fleetora frontend UI, it must:

1. Read the applicable `AGENTS.md`.
2. Read this canonical design system, including section 8.
3. Inspect existing components.
4. Inspect the target feature.
5. Inspect the current Next.js documentation required by the project's agent instructions.
6. Reuse existing components and patterns.
7. Avoid inventing new global visual conventions.
8. Avoid unnecessary dependencies.
9. Preserve backend ownership of business rules.
10. Implement loading, empty, error, and success behavior where relevant.
11. Check responsive behavior.
12. Check accessibility.
13. Run the relevant lint/type/build checks.
14. Review the final diff for unrelated changes.

The assistant must not respond to every UI task by generating a completely new visual style.

---

# 59. UI Review Checklist

Before considering a frontend feature complete, review:

### Structure

- Does it use existing layout patterns?
- Are feature and shared components separated sensibly?
- Is the page readable at code level?

### Visual consistency

- Does it follow Fleetora theme tokens?
- Are typography and spacing consistent?
- Are semantic colors used correctly?

### States

- Loading?
- Empty?
- Error?
- Disabled?
- Success?
- Permission denied where relevant?

### Interaction

- Are actions clear?
- Are dangerous actions protected?
- Is feedback visible?

### Data

- Does it handle long content?
- Does it handle missing optional values?
- Does it handle realistic data volume?

### Responsive behavior

- Desktop?
- Tablet where relevant?
- Small viewport where relevant?

### Accessibility

- Keyboard?
- Focus?
- Labels?
- Semantic elements?
- Color independence?

### Architecture

- Did frontend business logic leak from backend responsibilities?
- Was an existing component unnecessarily duplicated?
- Was an unnecessary dependency introduced?

---

# 60. Definition of Done — UI Component

A reusable UI component is done when:

- its responsibility is clear
- its API is typed
- relevant visual states are implemented
- focus behavior is correct
- disabled behavior is correct where applicable
- it follows Fleetora tokens
- it works with realistic content
- it does not duplicate an existing component
- it does not contain feature-specific business logic unless it is a feature component

---

# 61. Definition of Done — Page

A page is not done merely because it renders.

A Fleetora page should have:

- correct page hierarchy
- appropriate loading behavior
- appropriate empty behavior
- appropriate error behavior
- working primary actions
- realistic responsive behavior
- consistent product styling
- correct API integration
- no duplicated backend business rules
- accessibility fundamentals
- no obvious console/type/lint failures

---

# 62. Design Decision Priority

When choosing between two frontend implementations, use this order:

```text
Correctness
→ Usability
→ Accessibility
→ Consistency
→ Clarity
→ Maintainability
→ Performance
→ Visual polish
→ Novelty
```

Visual polish matters.

It does not justify breaking the product model.

---

# 63. Final Principle

Fleetora's frontend should behave like one product built by one product team.

Not like a collection of pages generated independently.

The implementation hierarchy is:

```text
Canonical Design System
      ↓
Design Tokens
      ↓
UI Primitives
      ↓
Shared Product Components
      ↓
Feature Components
      ↓
Pages
```

Prefer reuse over duplication.

Prefer semantic components over arbitrary styling.

Prefer simple architecture over speculative abstraction.

Prefer operational clarity over visual spectacle.

Build the smallest coherent system that can grow with the real product.
