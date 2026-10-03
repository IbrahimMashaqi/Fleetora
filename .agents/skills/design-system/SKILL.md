---
name: design-system
description: Build, maintain, and enforce Fleetora's frontend design system. Use when working with visual styling, design tokens, colors, typography, spacing, layouts, components, tables, forms, status indicators, navigation, responsive styling, dark mode, or visual consistency.
---

# Fleetora Design System

## Purpose

Maintain a coherent, professional visual system for Fleetora.

Fleetora is an operational logistics SaaS product.

The design system must optimize for:

1. clarity
2. consistency
3. operational readability
4. accessibility
5. scalability
6. professional visual quality

This skill guides application of [frontend/DESIGN_SYSTEM.md](../../../frontend/DESIGN_SYSTEM.md), the sole authority for visual tokens and component rules. Read that document before visual work. Theme/reference files support the workflow and do not define independent values.

For workflow design, information architecture, and UX decisions,
use the `ui-ux-design` skill.

---

# 1. Core Principle

Do not style individual pages independently.

Fleetora should feel like one product.

Prefer:

Design Token
→ Primitive
→ Reusable Component
→ Feature UI
→ Page

over:

Page
→ Random local styles

Repeated visual decisions should come from shared tokens or components.

---

# 2. Visual Direction

Fleetora should feel:

- professional
- operational
- trustworthy
- modern
- precise
- calm
- data-oriented

It should NOT feel:

- playful
- flashy
- futuristic for decoration
- gaming-inspired
- crypto-inspired
- like a generic AI SaaS template
- like a marketing landing page

The product should visually support long operational sessions.

---

# 3. Theme Strategy

Support a token-based theme architecture.

Do not hardcode visual values throughout feature components.

Prefer semantic tokens such as:

- background
- foreground
- surface
- muted
- border
- primary
- secondary
- destructive
- warning
- success
- info

instead of feature components depending directly on raw colors.

Example concept:

```text
Raw palette
    ↓
Semantic tokens
    ↓
Component tokens
    ↓
Components
```
