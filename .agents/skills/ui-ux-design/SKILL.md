---
name: ui-ux-design
description: Use when designing, reviewing, or refining Fleetora frontend screens, page composition, navigation, forms, tables, dashboards, operational workflows, responsive behavior, or interaction states.
---

# Fleetora UI/UX Design

## Purpose

Design Fleetora as a professional logistics operations SaaS product.

This skill focuses on:

- usability
- information architecture
- interaction design
- dashboard design
- operational workflows
- responsive behavior
- accessibility
- visual hierarchy

It does NOT define Fleetora's visual theme, brand colors, typography system,
or permanent design tokens.

Those are defined by [frontend/DESIGN_SYSTEM.md](../../../frontend/DESIGN_SYSTEM.md). The Fleetora design-system skill guides their application; it does not independently define visual values.

---

# 1. Understand Before Designing

Before creating or significantly changing a UI:

1. Inspect the existing frontend implementation.
2. Read the relevant project rules.
3. Understand the user role using the screen.
4. Understand the task the user is trying to complete.
5. Identify the data and actions available from the backend.
6. Identify important loading, empty, error, success, and permission states.
7. Reuse existing components and patterns when appropriate.

Do not design screens in isolation from the actual Fleetora workflow.

If a critical product decision is unknown, do not invent business behavior.

---

# 2. Fleetora Is an Operations Product

Fleetora is not a marketing website.

It is an operational logistics SaaS application.

Prioritize:

1. clarity
2. speed of understanding
3. operational efficiency
4. discoverability
5. consistency
6. accessibility
7. visual polish

A beautiful interface that makes operational work slower is a bad design.

---

# 3. Design for User Intent

Every screen should have a clear purpose.

Before designing, understand the user's role, workflow, available data and actions, and any dangerous or irreversible decisions. The hierarchy should reflect the job, the information it depends on, and the next step.

## Composition and Fleetora Identity

Answer these seven questions before choosing components:

1. What job is the user trying to complete?
2. Which information deserves attention first?
3. What makes this screen specifically Fleetora?
4. Which elements are functional, and which are merely decorative?
5. Is the density appropriate for this workflow?
6. Does the composition remain strong on desktop and mobile?
7. Could removing an element improve the interface?

Turn the answers into a composition, not a template:

- Follow the user's real sequence: orient, inspect or enter, decide or act, then confirm. Start where the task starts and keep its main working area prominent.
- Choose structure to fit that sequence and the actual content. A focused form, a queue with toolbar and table, an entity summary with history, or a map or board can each fit when the workflow supports it. The task chooses among these options; no composition applies universally across Fleetora.
- Frame a workflow with the established application shell and relevant navigation or context. Use a lighter frame for focused account or public flows when full navigation would distract. Put the page title, necessary orientation, and actions where they help the next step.
- Express Fleetora through truthful operational context—real logistics terminology, available statuses, assignments, timestamps, exception handling, and task-specific controls—alongside restrained use of the canonical design system. Account, profile, and settings pages can express identity through accurate Fleetora naming, task-specific copy, and next-step help that belongs to their real flow.
- Set rhythm with canonical spacing: group related information, separate distinct tasks, and leave open space to focus attention or improve reading. Use asymmetry when it makes the primary workspace and supporting context easier to understand; keep regions aligned to a consistent structure.
- Use the canonical type scale to distinguish page purpose, sections, content, and metadata. Keep application headings proportionate to the task.
- Recompose for mobile: preserve task order and important actions, move or collapse secondary material deliberately, and choose suitable data interactions for narrow screens. Do not simply shrink the desktop composition.

Give supporting content space when it helps users orient, complete a step, understand a state, or recover. Use product facts and available data only. Do not invent metrics, shipments, alerts, trends, claims, or sample history to fill a layout.

---

# 4. Information Hierarchy

Important operational information must be visually easy to scan.

Use hierarchy intentionally through:

- position
- spacing
- grouping
- typography
- emphasis
- labels
- status indicators

Do not make every piece of information equally prominent.

Critical operational states such as:

- delayed shipments
- failed deliveries
- assignment problems
- unavailable workers
- urgent shipments
- operational warnings

must be distinguishable without creating visual noise.

---

# 5. Dashboard Design

Dashboards must answer operational questions.

Do not add KPI cards simply because dashboards usually contain cards.

Every metric must have a reason to exist.

Prefer metrics that help users answer questions such as:

- How many shipments require attention?
- How many deliveries succeeded or failed?
- What is currently delayed?
- Which workers are overloaded?
- What changed recently?
- Where are operational problems occurring?

Avoid decorative analytics.

When appropriate, allow users to move from a metric to the underlying records.

---

# 6. Tables

Fleetora will contain data-heavy operational interfaces.

Tables are appropriate for resources such as:

- shipments
- workers
- merchants
- vehicles
- warehouses
- users
- assignments

Tables should support scanning and action.

Consider when relevant:

- search
- filters
- sorting
- pagination
- status
- priority
- dates
- ownership
- row actions
- bulk actions
- column visibility

Do not overload tables with every database field.

Show what users need for the task.

Use a detail page, drawer, dialog, or expandable area for secondary information when appropriate.

---

# 7. Filters

Operational filters should be obvious and useful.

Prefer domain-relevant filters such as:

- shipment status
- priority
- worker
- merchant
- warehouse
- date range
- delivery state

Users should understand when filters are active.

Provide a clear way to reset filters.

Avoid hiding frequently used filters behind unnecessary interaction.

---

# 8. Forms

Forms should minimize cognitive load.

Use:

- logical grouping
- clear labels
- appropriate input types
- useful defaults
- contextual help when necessary
- inline validation
- clear error messages

Do not rely on placeholders as labels.

Do not expose internal database concepts unless users genuinely need them.

For long workflows, divide information into understandable sections.

Do not create multi-step forms unless the complexity justifies them.

---

# 9. Actions

Every page should have a clear action hierarchy.

Distinguish:

- primary actions
- secondary actions
- contextual actions
- destructive actions

Do not create multiple competing primary buttons.

Dangerous actions must be visually and behaviorally distinguishable.

Confirmation should be used when an action is:

- destructive
- difficult to reverse
- operationally significant

Do not add confirmation dialogs to harmless actions.

---

# 10. Status Design

Statuses are central to Fleetora.

Status representation must be:

- consistent
- readable
- accessible
- semantically meaningful

Do not rely on color alone.

Use text labels with appropriate visual indicators.

The frontend may DISPLAY shipment states and available actions.

It must not invent shipment transition rules.

Business transition rules belong to the backend.

---

# 11. Required UI States

Every data-driven screen should consider:

## Loading

Communicate that data is being retrieved.

Avoid unnecessary layout shifts.

Use skeletons when they meaningfully preserve layout.

## Empty

Explain why the screen is empty when possible.

Provide a relevant next action if one exists.

Bad:

"No data."

Better:

"No shipments have been created yet."

with an appropriate action when the user has permission.

## Error

Explain what failed in understandable language.

Provide retry behavior when useful.

Do not expose raw backend errors.

## Success

Provide feedback when an important action completes successfully.

Avoid excessive success notifications for trivial interactions.

## Permission

Users may have different permissions.

Do not show actions users cannot perform unless there is a UX reason to show them disabled.

Never treat hidden UI as authorization.

Backend authorization remains mandatory.

---

# 12. Responsive Design

Recompose for each relevant viewport; do not treat mobile as a shrunken desktop.

- Preserve the task's scan order and important actions.
- Reflow or reorder regions when that makes the next step clearer.
- Collapse navigation according to the existing product pattern.
- Keep tables and other dense data usable with an intentional narrow-screen interaction.
- Move secondary information out of the primary path without making essential information hard to reach.
- Maintain readable type, spacing, focus states, and touch targets.

---

# 13. Accessibility

Use semantic HTML whenever possible.

Ensure:

- keyboard navigation
- visible focus states
- proper labels
- sufficient contrast
- meaningful button text
- accessible form errors
- appropriate heading hierarchy
- accessible dialogs
- non-color status indicators

Interactive elements must behave like interactive elements.

Do not use generic div elements as buttons when semantic elements exist.

---

# 14. Avoid Generic AI and Decorative Patterns

Treat these as design failures when they have no task-based reason:

- A centered card layout used by default for unrelated workflows.
- Large empty areas that create no focus, separation, or readability.
- The same interchangeable SaaS page structure across distinct Fleetora workflows.
- Gradients, decorative blobs, or glassmorphism without product meaning.
- Excessively rounded cards or cards nested inside cards.
- Oversized marketing typography or hero sections inside the application.
- Random icons or icon containers used as decoration.
- Fake metrics or operational data invented only to fill space.
- Visual complexity that does not help users understand, navigate, decide, act, or recover.
- Decorative charts, shadows, animations, badges, or illustrations without a real communication job.

Choose layout and visual emphasis from the task, content, existing product context, and design system. A card, centered form, icon, chart, or open area earns its place when it supports that screen's job.

---

# 15. Density

Tune density to the workflow, data volume, and scan frequency.

- Operational queues should surface relevant records and controls efficiently.
- Forms should give related fields room to read and complete.
- Dashboards should show only metrics that answer a real operational question.
- Use whitespace to create focus, separate task regions, and support readability.
- Keep text and controls comfortable and accessible; density never justifies crowding or unreadable type.

---

# 16. Navigation and Page Framing

Navigation should reflect Fleetora's actual product structure and the user's current task.

- Reuse the established application shell for workflows that belong inside it.
- Keep focused public or account flows as light as their entry path and next step allow.
- Show enough context for users to know where they are and what they can do next: a relevant section label or breadcrumb, a clear page title, and contextual actions where useful.
- Group existing areas logically. Do not invent modules or add full navigation merely to make a page look more like an application.
- Avoid deep nesting unless the workflow justifies it.

---

# 17. Component Reuse

Before creating a new UI pattern:

1. inspect existing components
2. reuse appropriate components
3. extend existing components when reasonable
4. create a new reusable component only when there is a genuine repeated pattern

Do not force unrelated interfaces into one overly generic component.

---

# 18. UX and Backend Boundaries

The frontend must not become the source of truth for business rules.

The UI may:

- display allowed actions
- guide workflows
- validate obvious input
- improve interaction

The backend must enforce:

- permissions
- tenant isolation
- shipment transitions
- assignment rules
- business invariants
- security-sensitive validation

Never assume hiding a button prevents an operation.

---

# 19. Fleetora-Specific Thinking

When designing Fleetora interfaces, think in terms of logistics operations.

Important concepts may include:

- shipment
- worker
- merchant
- assignment
- vehicle
- warehouse
- zone
- delivery
- proof of delivery
- operational status
- priority
- risk
- notifications

Do not invent unsupported domain behavior.

Consult project documentation and existing backend contracts when behavior matters.

---

# 20. Design Review

Before considering a UI task complete, review:

### Purpose
Does the screen clearly support its intended task?

### Hierarchy
Can the user identify important information quickly?

### Actions
Is the primary action obvious?

### States
Are loading, empty, error, success, and permission states handled?

### Data
Is the right information visible without unnecessary clutter?

### Consistency
Does the interface reuse existing Fleetora patterns?

### Responsive
Does it work intentionally across relevant screen sizes?

### Accessibility
Can it be used with keyboard and assistive technologies?

### Domain
Does it respect Fleetora workflows and backend ownership of business rules?

### Product-specific composition quick check

| Check | Review |
|---|---|
| Composition | Does it follow the user's task and put the right information first? |
| Fleetora identity | Is it grounded in accurate workflow context, page framing, and restrained brand use? |
| Purpose | Does each prominent element support a task, product meaning, or necessary state? |
| Density and responsive behavior | Is density appropriate, and does the composition hold together on desktop and mobile? |
| Restraint | Could removing an element make the task clearer? |

### Quality
Does it look like a deliberate operational product rather than a generic generated template?

---

# 21. When Implementing

If the task includes implementation rather than design only:

1. inspect existing frontend code
2. inspect applicable AGENTS.md instructions
3. read the canonical frontend/DESIGN_SYSTEM.md
4. verify relevant backend/API contracts
5. design the interaction
6. implement the smallest coherent solution
7. verify responsive behavior
8. verify all important UI states
9. check accessibility
10. run relevant frontend validation

Do not redesign unrelated parts of the application without being asked.

---

# 22. Decision Rule

When choosing between two UI approaches, prefer the one that makes the user's operational task:

- easier to understand
- faster to complete
- harder to perform incorrectly
- easier to recover from errors
- more consistent with Fleetora

Do not choose an approach merely because it looks more visually impressive.