# Fleetora Visual Theme

## Status

This is a supporting AI workflow reference.

[FLEETORA_THEME.md](../../../design/FLEETORA_THEME.md) is the authoritative source for Fleetora's color palette and semantic color roles. `frontend/app/globals.css` implements those semantic theme tokens; it is not a competing authority. [frontend/DESIGN_SYSTEM.md](../../../../frontend/DESIGN_SYSTEM.md) remains the reference for component visual rules and other design-system guidance.

Do not invent alternative palettes, typography, spacing systems, or component styles per feature.

---

# 1. Product Personality

Fleetora is a logistics operations platform.

The interface should feel:

- professional
- reliable
- operational
- precise
- modern
- calm
- efficient
- data-oriented

Avoid:

- playful SaaS aesthetics
- excessive gradients
- glassmorphism
- neon colors
- oversized rounded cards
- excessive shadows
- decorative animations
- generic AI-dashboard aesthetics

The UI should prioritize operational clarity over decoration.

---

# 2. Theme Direction

Primary theme:

Light mode.

Dark mode may be added later using the same semantic token architecture.

Do not duplicate component styling to support themes.

Use semantic design tokens.

---

# 3. Brand Direction

Fleetora's approved brand and interactive colors are navy and teal. Use the palette and roles in [FLEETORA_THEME.md](../../../design/FLEETORA_THEME.md).

Use teal for primary actions and interactive emphasis. Navy is for brand and structural UI; sidebar navy is for primary navigation structure.

---

# 4. Core Palette

Use the brand values in [FLEETORA_THEME.md](../../../design/FLEETORA_THEME.md). Do not duplicate or extend the palette independently.

---

# 5. Neutral Palette

Use the light neutral palette and surface aliases in [FLEETORA_THEME.md](../../../design/FLEETORA_THEME.md).

---

# 6. Semantic Colors

Use the operational status colors in [FLEETORA_THEME.md](../../../design/FLEETORA_THEME.md) for statuses, badges, indicators, and alerts only. Do not use status colors as primary action colors.

---

# 7. Light Theme Semantic Tokens

Use the surface, text, border, brand, and status roles in [FLEETORA_THEME.md](../../../design/FLEETORA_THEME.md). `frontend/app/globals.css` implements these semantic tokens.

---

# 8. Application Shell

The application shell should visually separate:

Sidebar
→ Navigation

Top/Header
→ Context and global actions

Main Content
→ Operational work

Recommended structure:

┌──────────────┬──────────────────────────────┐
│              │ Header                       │
│   Sidebar    ├──────────────────────────────┤
│              │                              │
│              │ Main operational content     │
│              │                              │
└──────────────┴──────────────────────────────┘

The main content background uses the application background token.

Cards and important working surfaces use the surface token.

---

# 9. Sidebar

Use the sidebar navy and semantic tokens in [FLEETORA_THEME.md](../../../design/FLEETORA_THEME.md).

The sidebar should feel stable and quiet. Do not use gradients or make every item visually loud. Active navigation must be recognizable.

---

# 10. Typography

Use the font, type scale, and tabular numeral rules in the [canonical visual specification](../../../../frontend/DESIGN_SYSTEM.md#visual-7), [canonical visual specification](../../../../frontend/DESIGN_SYSTEM.md#visual-8), and [canonical visual specification](../../../../frontend/DESIGN_SYSTEM.md#visual-9).

Use one primary UI font family and avoid oversized marketing typography.

---

# 11. Spacing Scale

Use the spacing scale and contextual spacing in the [canonical visual specification](../../../../frontend/DESIGN_SYSTEM.md#visual-10) and shell padding in the [canonical visual specification](../../../../frontend/DESIGN_SYSTEM.md#visual-14). Do not introduce arbitrary spacing without reason.

---

# 12. Density

Fleetora uses:

Medium operational density.

The UI should display useful information without feeling cramped.

Avoid both extremes:

Too dense
→ difficult scanning

Too spacious
→ poor operational efficiency

Tables may use slightly higher density than forms and dashboard cards.

---

# 13. Border Radius

Use the radius scale and component assignments in the [canonical visual specification](../../../../frontend/DESIGN_SYSTEM.md#visual-11).

Keep rounding restrained. Avoid unnecessary pill-shaped controls.

---

# 14. Borders

Use the default and strong borders in the [canonical visual specification](../../../../frontend/DESIGN_SYSTEM.md#visual-12). Prefer borders over heavy shadows for ordinary surfaces.

---

# 15. Shadows

Use the shadow values and elevation rules in the [canonical visual specification](../../../../frontend/DESIGN_SYSTEM.md#visual-13). Cards use borders and surfaces; reserve elevation for menus, dialogs, and popovers.

---

# 16. Buttons

Use the visual rules in the [canonical visual specification](../../../../frontend/DESIGN_SYSTEM.md#visual-17) and the variants defined in frontend/DESIGN_SYSTEM.md section 7.

Use primary buttons for the dominant action. Do not place competing primary buttons beside each other without reason.

---

# 17. Inputs

Use control sizing, focus treatment, and radius from the [canonical visual specification](../../../../frontend/DESIGN_SYSTEM.md#visual-18) and [canonical visual specification](../../../../frontend/DESIGN_SYSTEM.md#visual-11).

Keep labels visible and errors near their fields. Never rely only on placeholders.

---

# 18. Tables

Tables are a major Fleetora UI primitive.

Recommended:

Header:
subtle neutral background or white
medium/semibold labels

Rows:
white surface

Row separators:
subtle borders

Hover:
neutral-50 / neutral-100

Selected:
subtle primary tint

Numeric values:
consistent alignment

Actions:
right aligned where appropriate

Status:
badge + readable text

Avoid excessive vertical row padding.

Operational data should remain scan-friendly.

---

# 19. Status Badges

Status badges should be compact.

Use:

subtle semantic background
semantic foreground
short readable label

Do not use fully saturated badge backgrounds unless emphasis is critical.

Do not define shipment-specific color mappings until the shipment state model is finalized.

Once defined, status mapping must be centralized.

---

# 20. Cards

Use the card styling in the [canonical visual specification](../../../../frontend/DESIGN_SYSTEM.md#visual-16).

Cards represent meaningful information groups. Do not create a card around every block of content.

---

# 21. Metric Cards

Metric cards should prioritize:

Label
→ Value
→ Context / change

Example:

Total Shipments
1,284
+8.2% from previous period

The metric is visually dominant.

Supporting context is secondary.

Avoid decorative illustrations inside operational metric cards unless useful.

---

# 22. Forms

Forms should be visually calm.

Group related fields.

Use section headings for long forms.

Do not display very wide inputs when the data is naturally short.

Use sensible maximum widths.

Critical/destructive actions should be visually separated from normal form actions.

---

# 23. Icons

Use icon sizing from the [canonical visual specification](../../../../frontend/DESIGN_SYSTEM.md#visual-30).

Use one simple, outlined, modern icon family that remains readable at small sizes. Large decorative icons should be rare.

---

# 24. Charts

Chart colors should be restrained.

Primary series:
Teal

Additional series should use accessible semantic or muted complementary colors.

Do not use rainbow palettes by default.

Grid lines should remain subtle.

Labels and tooltips must prioritize readability.

Charts should never be added merely to fill dashboard space.

---

# 25. Empty States

Empty states should explain:

1. what is empty
2. why it may be empty
3. what the user can do next

Avoid oversized illustrations unless they genuinely improve the experience.

Operational empty states should remain concise.

---

# 26. Loading

Use skeletons when layout is known.

Use spinners for small localized operations.

Avoid blocking the entire application for a small action.

Buttons performing asynchronous actions should communicate loading state.

---

# 27. Error States

Errors must be actionable.

Prefer:

"Could not load shipments. Try again."

over:

"Something went wrong."

Use destructive styling only where appropriate.

Do not expose raw backend/database errors.

---

# 28. Responsive Direction

Desktop is the primary dashboard environment.

The interface must still adapt intentionally to smaller screens.

Recommended breakpoints should follow the frontend framework/design system rather than arbitrary page-specific values.

On smaller screens:

- prioritize primary operational data
- collapse secondary navigation appropriately
- avoid horizontal page overflow
- allow complex tables to adapt intentionally
- keep primary actions accessible

Do not simply shrink desktop UI.

---

# 29. Accessibility

Target WCAG AA contrast where applicable.

Interactive elements require visible focus states.

Do not communicate status through color alone.

Buttons and controls require sufficient target size.

Form errors must be associated with the relevant fields.

Icons used as controls require accessible names.

---

# 30. RTL Readiness

Fleetora may eventually support Arabic.

Do not unnecessarily encode layout assumptions that make RTL difficult.

Prefer logical layout concepts where supported.

Examples:

start / end

instead of unnecessarily coupling behavior to:

left / right

Do not implement Arabic/RTL unless required by the feature, but avoid architectural choices that make it unnecessarily difficult later.

---

# 31. Dark Mode Direction

Dark mode is not required for the first implementation unless explicitly requested.

However, components should use semantic tokens so dark mode can be added without rewriting feature components.

Do not hardcode white/black throughout components when semantic tokens exist.

---

# 32. Visual Anti-Patterns

Do not introduce:

- gradients everywhere
- glassmorphism
- glowing elements
- giant hero typography
- excessive rounded cards
- unnecessary animations
- decorative blobs
- random colors
- excessive shadows
- dashboard cards solely to fill space
- fake charts
- meaningless statistics
- visual complexity without operational value

---

# 33. Implementation Rule

Before implementing a visual component:

1. inspect the existing design system
2. reuse tokens
3. reuse primitives
4. reuse components where appropriate
5. extend the system only when necessary

Never invent a parallel visual language inside a feature.

---

# 34. Current Fleetora Theme Summary

Fleetora visual identity:

Light operational dashboard
+ dark navy sidebar
+ teal primary actions
+ light neutral surfaces
+ restrained semantic colors
+ compact status badges
+ medium information density
+ subtle borders
+ minimal shadows
+ restrained rounding
+ clear typography
+ data-first layouts

The result should feel like a serious logistics operations product.
