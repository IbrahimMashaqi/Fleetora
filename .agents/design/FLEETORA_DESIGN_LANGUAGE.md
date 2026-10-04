# Fleetora Product Design Language

## 1. Product Design Direction

This document defines design philosophy and product visual language. [FLEETORA_THEME.md](FLEETORA_THEME.md) is the authoritative source for Fleetora's palette and semantic color roles; `frontend/app/globals.css` implements its semantic theme tokens. [frontend/DESIGN_SYSTEM.md](../../frontend/DESIGN_SYSTEM.md) remains the reference for component visual rules and other design-system guidance.

Fleetora is a professional logistics operations product.

The interface should feel like software built for real companies managing real operational work — not a generic admin template, AI-generated dashboard, marketing website, or component showcase.

Internal design direction:

**Fleetora Control**

Core characteristics:

- operational
- precise
- calm
- trustworthy
- modern
- data-aware
- dense when necessary
- visually disciplined
- fast to scan
- professional without feeling corporate or outdated

The product should feel intentionally designed as one coherent system.

---

# 2. Design Principle

Design for operators, not screenshots.

A Fleetora screen should primarily help the user:

- understand what is happening
- identify what needs attention
- make a decision
- perform an action
- verify the result

Visual beauty supports those goals.

It must never compete with them.

---

# 3. Avoid the "AI Dashboard" Look

Do not default to visual patterns commonly produced by generic AI-generated interfaces.

Avoid:

- excessive gradients
- purple/blue gradient themes by default
- glassmorphism everywhere
- glowing cards
- excessive shadows
- oversized rounded cards
- every section inside a card
- random icon containers
- decorative charts without operational value
- huge dashboard titles
- giant KPI numbers without context
- excessive whitespace that reduces information density
- excessive pills
- excessive badges
- arbitrary accent colors
- unnecessary illustrations
- emoji as interface icons
- generic hero sections inside the application
- decorative blur effects
- floating panels without structural purpose
- animations added merely to make the UI feel "modern"

Never design Fleetora as a collection of fashionable components.

Design it as an operational system.

---

# 4. Visual Personality

Fleetora should communicate:

**Control**

The user should feel that operations are understandable and manageable.

**Precision**

Spacing, typography, alignment, tables, filters, statuses, and actions should feel deliberate.

**Trust**

Avoid visual gimmicks.

Critical information should be clear and stable.

**Speed**

Important information should be scannable quickly.

**Depth**

Complex operational information may be dense, but hierarchy must keep it understandable.

---

# 5. Application Shell

Desktop application structure should generally follow:

```text
┌──────────────────────────────────────────────────────────────┐
│ Sidebar │ Page header / contextual actions                  │
│         ├────────────────────────────────────────────────────│
│         │                                                    │
│         │ Main operational workspace                         │
│         │                                                    │
│         │                                                    │
└──────────────────────────────────────────────────────────────┘
```

Use a persistent sidebar for primary product navigation when appropriate.

Potential navigation areas:

- Overview
- Shipments
- Workers
- Vehicles
- Warehouses
- Merchants
- Operations
- Analytics
- Notifications
- Settings

Do not expose navigation items for features that do not exist merely to make the product appear complete.

---

# 6. Sidebar

The sidebar should feel structural, not decorative.

Prefer:

- restrained width
- clear active state
- simple icons
- short labels
- logical grouping
- subtle separators when useful

Avoid:

- large colorful icon backgrounds
- gradients
- oversized logo treatment
- excessive nested menus
- animated navigation
- multiple competing accent colors

The active item should be obvious without becoming visually loud.

---

# 7. Page Header

A standard operational page header should support:

```text
Context / breadcrumb

Page title                         Primary action
Short useful description          Secondary actions
```

Not every page requires a description.

Do not waste vertical space repeating obvious information.

Example:

```text
Operations / Shipments

Shipments                              + New shipment
Manage and monitor active deliveries   Export
```

For highly used operational pages, compactness is preferred.

---

# 8. Color Philosophy

Fleetora should use a restrained neutral foundation with one recognizable brand accent.

The interface should primarily rely on:

- neutral backgrounds
- strong readable foreground colors
- subtle borders
- semantic status colors
- one controlled brand accent

Do not use many brand colors simultaneously.

Color must communicate meaning.

---

# 9. Brand Accent

Fleetora's approved palette uses navy for brand and structural UI, sidebar navy for primary navigation structure, and teal for primary actions and interactive emphasis.

Use the colors and roles in [FLEETORA_THEME.md](FLEETORA_THEME.md). Keep the accent recognizable without dominating operational surfaces.

Use canonical design tokens and validate their application for accessibility.

---

# 10. Neutral Palette

The neutral palette should carry most of the interface.

Use neutrals for:

- application background
- surfaces
- borders
- primary text
- secondary text
- disabled states
- separators
- table structure

Prefer slightly cool or balanced neutrals rather than strongly tinted backgrounds.

Avoid pure black and pure white everywhere when softer neutral steps provide better hierarchy.

---

# 11. Semantic Colors

Semantic color is reserved for meaning.

Conceptual mapping:

```text
Success / delivered / healthy
→ Success / delivered (`#168A55`)

Warning / delayed / attention
→ Pending / attention (`#C77B11`)

Danger / failed / destructive / critical
→ Failed / delayed (`#C2414B`)

In progress / active operational state
→ In progress (`#2878C7`)
```

Never rely on color alone.

Combine status color with:

- text
- icon
- label
- shape

where appropriate.

---

# 12. Status System

Shipment and operational statuses are important Fleetora primitives.

Status presentation must be consistent across:

- tables
- detail pages
- filters
- timelines
- analytics
- alerts

Statuses should not each receive arbitrary unrelated colors.

Group colors semantically.

Example:

```text
Neutral lifecycle state
→ neutral

Active/in-progress
→ informational

Successful terminal state
→ success

Attention required
→ warning

Failed/critical
→ danger
```

The exact shipment lifecycle comes from the backend/domain model, not from the design system.

---

# 13. Typography

Typography should feel functional and premium.

Prefer a modern sans-serif optimized for application interfaces.

Typography hierarchy should come primarily from:

- size
- weight
- spacing
- contrast

not decorative styling.

Avoid excessive font sizes.

Application screens are not marketing pages.

Typical hierarchy:

```text
Page title
Section title
Component title
Body
Secondary text
Metadata
Label
```

Use tabular numerals where useful for operational data.

---

# 14. Density

Fleetora is operational software.

Do not design everything with marketing-site spacing.

Users may need to inspect:

- dozens of shipments
- worker states
- delivery statuses
- dates
- addresses
- priorities
- exceptions

Use comfortable but efficient density.

Provide breathing room around major regions while keeping data-heavy components compact.

---

# 15. Spacing

Use a consistent spacing scale.

Do not invent arbitrary values per component.

Spacing should establish relationships:

```text
small
→ elements belonging together

medium
→ fields/components in the same region

large
→ separate sections
```

Consistency matters more than excessive whitespace.

---

# 16. Border Radius

Use restrained radius.

Fleetora should not look like every element is a floating rounded card.

Use moderate radius for:

- buttons
- inputs
- menus
- dialogs
- cards where cards are justified

Avoid extremely rounded application containers.

Pills should mainly be reserved for elements whose semantics benefit from that shape.

---

# 17. Borders and Elevation

Prefer borders and surface contrast over heavy shadows.

Use shadows primarily when elevation has meaning:

- dropdown
- popover
- modal
- floating overlay

Normal content regions should generally not require dramatic shadows.

---

# 18. Cards

A card is not the default container.

Use cards when they represent a meaningful independent unit.

Good examples:

- KPI summary
- operational alert
- worker availability summary
- shipment exception
- analytics block

Do not wrap:

- every heading
- every form section
- every table
- every paragraph

inside separate cards automatically.

Use layout, borders, spacing, and typography instead.

---

# 19. Tables

Tables are first-class Fleetora components.

They should support operational scanning.

Consider:

- clear column hierarchy
- aligned numeric values
- restrained row height
- useful sorting
- useful filtering
- pagination
- selection when actions require it
- contextual row actions
- status visibility
- loading states
- empty states

Avoid horizontal clutter.

Do not display every database field because it exists.

Columns should reflect the user's task.

---

# 20. Shipment Table

A shipment table may eventually prioritize information such as:

```text
Tracking / reference
Recipient or merchant
Destination
Status
Assigned worker
Priority
Relevant time
Risk / exception
Actions
```

Exact fields must come from the implemented domain/API.

Do not invent unavailable data for visual completeness.

---

# 21. Row Actions

Common actions should be visible or easy to discover.

Use contextual menus for secondary actions.

Avoid placing many buttons in every table row.

Destructive actions should never visually compete with the primary workflow.

---

# 22. Filters

Operational filters are important.

Prefer a coherent filtering model:

```text
Search | Status | Worker | Date | More filters
```

Active filters should be easy to identify and clear.

Do not create enormous permanent filter panels unless the workflow justifies them.

For advanced workflows, use an intentional expandable filter region or side panel.

---

# 23. Forms

Forms should feel deliberate and easy to complete.

Use:

- clear labels
- appropriate input types
- concise helper text
- inline validation
- logical grouping
- predictable keyboard behavior

Avoid placeholder-only labels.

Do not make every field full-width without considering information structure.

Long operational forms may use sections.

---

# 24. Buttons

Maintain a clear hierarchy:

```text
Primary
Secondary
Tertiary / ghost
Destructive
```

A page should rarely contain many competing primary buttons.

Button text should describe the action:

Good:

- Create shipment
- Assign worker
- Save changes
- Mark as delivered

Weak:

- Submit
- Continue
- Confirm

when the action can be named more precisely.

---

# 25. Icons

Use one coherent icon family.

Icons should:

- improve recognition
- support navigation
- clarify actions
- reinforce status

Do not use icons merely to fill empty space.

Avoid:

- emoji
- mixed icon styles
- decorative icon bubbles everywhere

Icons should generally be visually secondary to text.

---

# 26. Dashboard

The Fleetora overview should answer operational questions.

Examples:

- What is happening today?
- How many shipments require attention?
- Are deliveries progressing normally?
- Which workers are overloaded?
- Where are failures occurring?
- What changed recently?

Do not make the dashboard a gallery of unrelated charts.

---

# 27. KPI Design

KPIs need context.

Weak:

```text
1,284
Shipments
```

Better:

```text
Today's shipments
1,284
+8.2% vs previous comparable period
```

Only show comparisons when the backend provides meaningful comparable data.

Do not fabricate trend indicators.

---

# 28. Charts

Charts must answer a question.

Before adding a chart, identify:

- what question it answers
- which decision it supports
- whether a table or number would communicate it better

Avoid:

- decorative donut charts
- unnecessary 3D effects
- excessive legends
- many unrelated chart colors
- charts with fake/sample data in production UI

---

# 29. Operational Attention

Fleetora should visually distinguish normal operations from items requiring attention.

Use a controlled attention model.

Examples:

- delayed shipment
- failed delivery
- worker unavailable
- assignment conflict
- high operational risk

Do not make normal information visually loud.

Attention should remain scarce enough to mean something.

---

# 30. Detail Pages

Detail screens should establish clear hierarchy.

For a shipment, conceptually:

```text
Shipment identity + status + primary actions

Important operational summary

Delivery / assignment information

Timeline / history

Recipient / merchant information

Supporting metadata
```

Do not render the database schema directly as a detail page.

Design around the operational workflow.

---

# 31. Timeline

Shipment history should eventually use a clear chronological timeline.

Each event should communicate:

- what happened
- when
- relevant actor
- relevant contextual information

Do not turn timelines into decorative activity feeds.

---

# 32. Empty States

Empty states must distinguish:

**True empty state**

The user has not created anything yet.

**Filtered empty state**

Data exists but no results match the filters.

**Permission state**

The user cannot access the resource.

**Error state**

Data could not be loaded.

Do not use the same generic "No data" message for all four.

---

# 33. Loading States

Avoid unnecessary full-screen spinners.

Prefer:

- skeletons when layout is known
- localized loading states
- disabled action feedback
- progress indicators for meaningful long-running operations

Keep the surrounding interface stable where possible.

---

# 34. Error States

Errors should explain:

- what failed
- what the user can do next

Avoid exposing technical backend errors.

Good operational error messages are concise and actionable.

---

# 35. Confirmation

Do not ask for confirmation for harmless actions.

Require confirmation when consequences justify interruption.

Examples:

- destructive deletion
- high-impact reassignment
- irreversible workflow action

Confirmation copy should state the consequence, not merely ask "Are you sure?"

---

# 36. Notifications and Toasts

Toasts are for transient feedback.

Use them for:

- successful action
- recoverable action error
- short operational confirmation

Do not put critical long-lived information exclusively inside a toast.

Persistent operational issues need persistent UI.

---

# 37. Modals

Do not use modals for every workflow.

Use dialogs for:

- short focused actions
- confirmation
- small forms
- context that should not navigate away

Use dedicated pages or panels for complex workflows.

---

# 38. Motion

Motion should communicate state change.

Use subtle motion for:

- menu opening
- dialog transitions
- panel transitions
- state feedback

Avoid:

- bouncing
- glowing
- dramatic entrance animation
- staggered animation across every dashboard card
- animation that slows frequent workflows

Fleetora should feel responsive, not theatrical.

---

# 39. Responsive Design

Desktop is important for operational administration, but layouts must adapt intentionally.

Do not simply shrink desktop screens.

On smaller screens:

- prioritize essential information
- collapse secondary navigation appropriately
- transform tables when necessary
- preserve important actions
- avoid horizontal chaos

Mobile worker workflows will eventually have their own product context.

---

# 40. Accessibility

Accessibility is part of product quality.

Ensure:

- keyboard navigation
- visible focus states
- semantic markup
- sufficient contrast
- accessible labels
- appropriate ARIA only when needed
- touch target sizing
- non-color status communication

Do not remove focus outlines without an accessible replacement.

---

# 41. Design Tokens

Visual values should come from tokens.

Conceptually:

```text
color.background
color.surface
color.surfaceMuted

color.textPrimary
color.textSecondary
color.textMuted

color.border
color.borderStrong

color.brand
color.brandHover

color.success
color.warning
color.danger
color.info

space.*
radius.*
shadow.*
font.*
```

The implementation format should follow the frontend stack.

Do not scatter arbitrary design constants throughout components.

---

# 42. Light and Dark Themes

The design system should be capable of supporting light and dark themes.

However:

Do not duplicate two unrelated visual identities.

Both themes must preserve:

- hierarchy
- semantics
- brand identity
- component behavior

If dark mode is not part of the current implementation scope, do not delay core product development solely to build it.

---

# 43. Component Consistency

Repeated patterns should become reusable components when repetition is real.

Likely primitives eventually include:

- Button
- Input
- Select
- Checkbox
- Badge
- StatusBadge
- Dialog
- Dropdown
- Tooltip
- DataTable
- EmptyState
- PageHeader
- FilterBar
- Pagination
- Skeleton

Do not build a giant design system upfront before actual screens establish requirements.

---

# 44. UX Copy

Fleetora copy should be:

- concise
- operational
- specific
- calm
- professional

Avoid robotic or generic AI copy.

Avoid:

- "Oops!"
- "Awesome!"
- "Magic"
- "Supercharge"
- unnecessary exclamation marks

Prefer:

```text
Shipment assigned

Unable to assign shipment
The selected worker is unavailable.

No shipments match these filters.
Clear filters to view all shipments.
```

---

# 45. AI-Generated UI Guardrail

When generating a new screen, never begin by assembling arbitrary cards.

First determine:

1. Who uses this screen?
2. What are they trying to accomplish?
3. What information do they need first?
4. What action is most important?
5. What requires attention?
6. What can remain secondary?
7. What happens when there is no data?
8. What happens when loading fails?
9. What happens on smaller screens?

Then choose components.

Workflow determines layout.

Not the other way around.

---

# 46. Product Authenticity

Fleetora should feel like a product that has evolved around logistics workflows.

Therefore:

- use domain terminology consistently
- expose meaningful operational context
- prioritize exceptions
- preserve information density
- design workflows end-to-end
- keep interactions predictable

Do not create visual complexity to simulate product maturity.

Product maturity should come from coherent behavior.

---

# 47. Progressive Disclosure

Do not show everything simultaneously.

Primary information should be immediately visible.

Secondary details may live in:

- expandable regions
- detail pages
- contextual menus
- drawers
- tooltips where appropriate

Use progressive disclosure to manage operational complexity without hiding essential information.

---

# 48. Design Review Checklist

Before considering a screen complete, review:

### Product

- Does this solve the actual workflow?
- Is the primary action obvious?
- Is important information easy to scan?
- Are exceptions visible?

### Visual

- Is hierarchy clear?
- Is spacing consistent?
- Are colors meaningful?
- Are there unnecessary cards?
- Are there unnecessary effects?

### UX

- Loading state?
- Empty state?
- Error state?
- Success feedback?
- Destructive action handling?
- Keyboard accessibility?
- Responsive behavior?

### Engineering

- Uses design tokens?
- Reuses appropriate primitives?
- Avoids duplicated component logic?
- Matches actual API/domain data?
- Does not implement backend business rules in the client?

---

# 49. Final Visual Test

Before accepting a design, ask:

> Does this look like software a logistics company could operate with for eight hours every day?

Then ask:

> Does any part exist mainly because it makes the screenshot look impressive?

If the second answer is yes, reconsider it.

---

# 50. Fleetora Design Signature

Fleetora's visual identity should come from the combination of:

**restrained brand accent**
+
**excellent information hierarchy**
+
**operational density**
+
**precise typography**
+
**consistent status language**
+
**high-quality tables and filters**
+
**subtle interaction**
+
**domain-specific workflows**

Not from gradients
