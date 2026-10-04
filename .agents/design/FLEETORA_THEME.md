# Fleetora — Product Theme Specification

## 1. Purpose

This document is the authoritative source for Fleetora's approved color palette and semantic color roles.

`frontend/app/globals.css` implements these semantic theme tokens in the frontend. It is an implementation of this specification, not a competing authority. Other visual values and component rules remain covered by [frontend/DESIGN_SYSTEM.md](../../frontend/DESIGN_SYSTEM.md).

Product behavior, authorization rules, API contracts, and business logic belong elsewhere.

---

## 2. Product Visual Direction

See the [canonical product visual direction](../../frontend/DESIGN_SYSTEM.md#visual-2).

---

## 3. Core Visual Principles

See the [canonical core visual principles](../../frontend/DESIGN_SYSTEM.md#visual-3).

---

## 4. Brand Foundation

| Token / role | Value |
| --- | --- |
| Brand navy | `#102A43` |
| Sidebar navy | `#0B1F33` |
| Primary teal | `#0F9F95` |
| Teal hover | `#0B817A` |

Navy is for brand and structural UI. Sidebar navy is for primary navigation structure. Teal is the primary action and interactive emphasis color.

---

## 5. Neutral Palette

| Token / role | Value |
| --- | --- |
| Page background | `#F5F7FA` |
| Surface | `#FFFFFF` |
| Main text | `#172B4D` |
| Secondary text | `#62748A` |
| Borders | `#E3EAF0` |

Use light neutrals for application backgrounds and white for the primary surface.

---

## 6. Semantic Colors

Operational status colors are reserved for badges, indicators, and alerts. Do not use them as primary action colors.

| Operational state | Value |
| --- | --- |
| Success / delivered | `#168A55` |
| In progress | `#2878C7` |
| Pending / attention | `#C77B11` |
| Failed / delayed | `#C2414B` |

The palette in this document is authoritative for Fleetora theme colors. `frontend/app/globals.css` implements these semantic tokens; it does not define a separate palette.

---

## 7. Typography

See the [canonical typography](../../frontend/DESIGN_SYSTEM.md#visual-7).

---

## 8. Typography Scale

See the [canonical typography scale](../../frontend/DESIGN_SYSTEM.md#visual-8).

---

## 9. Numeric Data

See the [canonical numeric data](../../frontend/DESIGN_SYSTEM.md#visual-9).

---

## 10. Spacing System

See the [canonical spacing system](../../frontend/DESIGN_SYSTEM.md#visual-10).

---

## 11. Border Radius

See the [canonical border radius](../../frontend/DESIGN_SYSTEM.md#visual-11).

---

## 12. Borders

See the [canonical borders](../../frontend/DESIGN_SYSTEM.md#visual-12).

---

## 13. Shadows

See the [canonical shadows](../../frontend/DESIGN_SYSTEM.md#visual-13).

---

## 14. Application Shell

See the [canonical application shell](../../frontend/DESIGN_SYSTEM.md#visual-14).

---

## 15. Page Structure

Most operational pages should follow a predictable hierarchy:

```text
Page Header
├── Title
├── Description / context
└── Primary actions

Optional Summary / Metrics

Toolbar
├── Search
├── Filters
├── Sorting
└── Secondary actions

Primary Content
├── Table / list / operational view
└── Pagination

Supporting UI
├── Drawer
├── Dialog
└── Details panel
```

Avoid creating a completely different page composition for every feature.

---

## 16. Cards

See the [canonical cards](../../frontend/DESIGN_SYSTEM.md#visual-16).

---

## 17. Buttons

See the [canonical buttons](../../frontend/DESIGN_SYSTEM.md#visual-17).

---

## 18. Inputs

See the [canonical inputs](../../frontend/DESIGN_SYSTEM.md#visual-18).

---

## 19. Forms

Forms should be structured according to user intent.

Group related fields together.

Prefer:

```text
Recipient information
Shipment details
Pickup information
Delivery information
```

over one uninterrupted list of fields.

Rules:

- keep labels visible
- identify required fields consistently
- place validation close to the affected field
- preserve entered data after recoverable errors
- do not hide important validation until the final submission when it can be shown earlier

Large forms may use sections, but avoid unnecessary multi-step flows.

---

## 20. Tables

See the [canonical tables](../../frontend/DESIGN_SYSTEM.md#visual-20).

---

## 21. Table Actions

Common actions should remain predictable.

Prefer:

- row click for details when appropriate
- one or two frequent inline actions
- overflow menu for secondary actions

Do not display six icon buttons at the end of every row.

Destructive actions should not be visually adjacent to routine actions without clear separation.

---

## 22. Filtering and Search

Operational lists should support efficient scanning.

Search should be visually distinct from structured filters.

Filters should clearly communicate when they are active.

Where appropriate, active filters may appear as removable filter chips.

Do not hide critical filters behind multiple layers of menus.

A user should be able to understand why a result set is filtered.

---

## 23. Status Badges

Status badges should be compact.

Recommended structure:

```text
[ • Status ]
```

Use:

- subtle background
- semantic foreground
- optional status dot

Avoid fully saturated badge backgrounds.

Never communicate critical state using color alone.

Text must always describe the state.

---

## 24. Shipment Status Mapping

Exact lifecycle values must follow the backend domain contract.

The frontend must not invent shipment states.

General visual families:

```text
Initial / neutral states
→ Neutral

Planning / processing
→ In progress (`#2878C7`)

Active delivery
→ In progress (`#2878C7`)

Successful completion
→ Success / delivered (`#168A55`)

Attention / rescheduled
→ Pending / attention (`#C77B11`)

Failure
→ Failed / delayed (`#C2414B`)

On hold / inactive
→ Neutral or amber depending on domain meaning
```

Status mapping should live in one reusable frontend location.

Do not hard-code different colors for the same status on different pages.

---

## 25. Risk Levels

Operational risk is separate from shipment status.

Recommended visual language:

```text
Low
→ neutral or subtle green

Medium
→ amber

High
→ red
```

Always include the textual risk level.

Never use color alone.

AI-generated risk must be distinguishable from deterministic system state when relevant.

---

## 26. Empty States

Empty states should explain:

1. what is empty
2. why it matters
3. what the user can do next

Example:

```text
No shipments yet

Shipments created by your team will appear here.

[ Create shipment ]
```

Avoid giant illustrations for routine empty states.

Do not use jokes or vague copy where operational clarity is more useful.

---

## 27. Loading States

Prefer:

- skeletons for structured content
- inline spinners for small actions
- button loading states for submissions
- localized loading states

Avoid blocking the entire application when only one section is loading.

Prevent layout shift where practical.

Loading UI should approximate the structure of the content being loaded.

---

## 28. Error States

Errors should be:

- specific
- actionable
- close to the affected context

Do not expose:

- stack traces
- raw database errors
- internal exception details
- sensitive implementation information

Forms should preserve valid user input after recoverable errors.

Page-level failures should provide an appropriate retry path where possible.

---

## 29. Destructive Actions

High-impact actions require stronger friction.

Use confirmation dialogs when appropriate.

The dialog must clearly state:

- what will happen
- which resource is affected
- whether the operation can be reversed

Danger styling should be reserved for actual risk.

Do not use danger styling for harmless actions.

---

## 30. Icons

See the [canonical icons](../../frontend/DESIGN_SYSTEM.md#visual-30).

---

## 31. Motion

See the [canonical motion](../../frontend/DESIGN_SYSTEM.md#visual-31).

---

## 32. Responsive Behavior

See the [canonical responsive behavior](../../frontend/DESIGN_SYSTEM.md#visual-32).

---

## 33. Dashboard Metrics

KPI components should emphasize information rather than decoration.

Recommended structure:

```text
Label
Value
Context / delta
```

Example:

```text
Deliveries today

248

+12% from yesterday
```

Metrics should provide context when context matters.

Do not create giant colorful metric cards unless the metric genuinely requires strong attention.

Avoid using green/red deltas without explaining what the change means when direction is ambiguous.

---

## 34. Charts

Charts must answer operational questions.

Every chart should have a clear reason to exist.

Prefer:

- line charts for trends
- bar charts for comparisons
- stacked bars for composition where useful

Use pie or donut charts sparingly.

Avoid:

- 3D charts
- decorative gradients
- excessive chart colors
- unnecessary animations
- charts containing information better represented by a number or table

Chart colors should follow Fleetora semantic and neutral palettes.

---

## 35. Navigation

Navigation should represent the product's information architecture.

Do not add navigation items merely because a page exists.

Navigation groups should remain stable and predictable.

The active destination must be clearly visible.

Icons should support navigation labels rather than replace them.

Avoid deeply nested navigation structures unless product complexity requires them.

---

## 36. Dialogs and Drawers

Use dialogs for:

- confirmations
- focused short forms
- decisions requiring user attention

Use drawers or side panels when maintaining page context is valuable.

Examples:

- shipment details
- quick worker information
- assignment review

Do not put entire complex application pages inside dialogs.

---

## 37. Toasts and Notifications

Use temporary toast notifications for short-lived feedback such as:

- saved successfully
- assignment updated
- operation failed

Do not use toasts for information the user must remember or act on later.

Persistent operational alerts belong in the relevant page or notification system.

Avoid excessive success toasts for trivial interactions.

---

## 38. AI UI

When AI functionality is introduced later, it must follow Fleetora's normal product language.

AI must not transform Fleetora into a chatbot-themed application.

Avoid:

- glowing purple gradients
- magical sparkles everywhere
- futuristic glass panels
- animated AI backgrounds
- excessive AI branding

AI recommendations should appear as operational information.

Example:

```text
Delivery Risk

High

12 shipments may miss today's delivery window.

Evidence
• Zone N3 has elevated load
• Worker capacity is near limit

Recommended action
Review assignments
```

The user must be able to distinguish:

- system fact
- AI analysis
- AI recommendation
- proposed action
- approved action
- executed action

AI-generated information must not visually impersonate confirmed system state.

---

## 39. Accessibility

Target WCAG AA contrast where applicable.

Required:

- keyboard navigation
- visible focus indicators
- semantic HTML
- proper labels
- accessible validation
- meaningful button names
- sufficient color contrast
- logical focus order

Color must never be the only representation of state.

Interactive elements must remain usable without a mouse.

---

## 40. Theme Architecture

Visual values should eventually be represented as reusable semantic tokens.

Example conceptual tokens:

```text
--background
--foreground

--surface
--surface-secondary
--surface-muted

--border
--border-strong

--muted
--muted-foreground

--primary
--primary-hover
--primary-active
--primary-foreground

--success
--success-background
--success-border

--warning
--warning-background
--warning-border

--danger
--danger-background
--danger-border
```

Components should consume semantic tokens instead of repeatedly hard-coding hexadecimal values.

Prefer:

```css
color: var(--foreground);
```

over:

repeating raw palette values in components.

when implementing the design system.

Raw palette values may exist in the token definition layer.

Application components should primarily consume semantic tokens.

---

## 41. Dark Mode

See the [canonical dark mode](../../frontend/DESIGN_SYSTEM.md#visual-41).

---

## 42. Data Density

See the [canonical data density](../../frontend/DESIGN_SYSTEM.md#visual-42).

---

## 43. Information Priority

Every operational screen should establish three levels:

### Primary

Information required for the user's current task.

### Secondary

Useful operational context.

### Tertiary

Metadata, IDs, timestamps, and supporting details.

Do not give all information equal visual weight.

---

## 44. Design Anti-Patterns

Do not:

- overuse gradients
- use glassmorphism as the base UI
- use neon colors
- create huge rounded containers
- use excessive shadows
- create arbitrary colors per page
- use enormous headings inside operational screens
- create decorative cards without information hierarchy
- hide essential actions behind unnecessary menus
- use animations simply because they look impressive
- copy generic dashboard templates without considering Fleetora workflows
- use random icon families
- create different status styles on different pages
- place every section inside a card
- make the interface look like a marketing website
- make the interface look intentionally "AI-generated"

---

## 45. AI-Generated UI Rule

When an AI coding assistant creates Fleetora UI, it must not independently invent a new visual language.

Before implementing UI, it should inspect:

1. existing Fleetora components
2. the canonical frontend/DESIGN_SYSTEM.md
3. frontend `AGENTS.md`
4. relevant feature requirements
5. existing page patterns
6. existing design tokens

Reuse existing primitives and tokens before creating new ones.

If a requested design conflicts with the canonical design system, identify the conflict instead of silently introducing another visual style.

Do not change global theme decisions as a side effect of implementing one page.

---

## 46. Component Creation Rule

Before creating a new reusable component, check whether an existing component already solves the requirement.

Create a reusable component when:

- it appears in multiple contexts
- behavior needs consistency
- accessibility logic should be centralized
- visual semantics must remain consistent

Do not abstract one-off markup prematurely.

Do not create multiple components that solve effectively the same problem with slightly different styling.

---

## 47. Realistic Data Rule

UI implementation and review should consider realistic data.

Test components with:

- long customer names
- long addresses
- long shipment IDs
- missing optional values
- large numeric values
- many table rows
- multiple statuses
- error states
- empty states
- loading states

Do not judge a layout only using short placeholder content.

---

## 48. Content Style

Product copy should be concise and operational.

Prefer:

`Create shipment`

over:

`Begin creating your amazing new shipment`

Prefer:

`Assignment failed`

over:

`Oops! Something went wrong while trying to assign your delivery!`

Avoid:

- exaggerated language
- unnecessary friendliness
- vague errors
- marketing copy inside operational workflows

The interface should communicate professionally and directly.

---

## 49. Product Quality Bar

A Fleetora screen should pass these questions:

1. Can the primary task be identified immediately?
2. Is the most important operational information visually dominant?
3. Can important states be scanned quickly?
4. Are actions clearly distinguished from information?
5. Is the screen usable without understanding color alone?
6. Does it reuse Fleetora patterns?
7. Is unnecessary decoration removed?
8. Does the layout work with realistic amounts of data?
9. Are loading, empty, error, and permission states considered?
10. Does it work at the intended viewport sizes?
11. Are dangerous actions appropriately protected?
12. Does the screen look like part of one coherent product?
13. Are backend domain states represented accurately?
14. Is accessibility considered?
15. Would the screen remain understandable during a busy operational workflow?

If several answers are no, the screen is not finished.

---

## 50. Implementation Principle

The canonical design system is a design contract, not permission to scatter styling values throughout the application.

When implementation begins:

```text
Canonical design system
        ↓
Design tokens
        ↓
UI primitives
        ↓
Reusable product components
        ↓
Feature components
        ↓
Pages
```

Pages should not become the source of truth for styling.

Shared visual behavior should move downward into the appropriate reusable layer.

Do not prematurely build a massive design-system framework.

Create the minimum reusable system necessary to maintain consistency.

---

## 51. Final Principle

Fleetora should feel like a serious logistics operating system.

Its visual hierarchy should come primarily from:

```text
Typography
→ Spacing
→ Structure
→ Surface
→ Borders
→ Semantic color
→ Motion
```

not from decoration.

**Clarity > decoration.**

**Consistency > novelty.**

**Operational usefulness > visual spectacle.**

**Product coherence > page-by-page creativity.**

The goal is not to make Fleetora look impressive in a screenshot.

The goal is to make Fleetora feel reliable, fast, understandable, and professional during real daily operations.
