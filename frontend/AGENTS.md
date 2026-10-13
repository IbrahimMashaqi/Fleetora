# Fleetora Frontend — Agent Instructions

Applies inside `frontend/`. Read the root `../AGENTS.md` and any more specific instructions along the path to the affected files. This file adds frontend-specific rules.

## 1. Inspect before implementing

Fleetora is a multi-tenant logistics platform. The frontend owns presentation, interaction, client state, and API consumption. The backend owns authorization, company isolation, domain rules, and operational writes.

- Inspect the affected route, feature, shared components, API layer, and relevant tests before editing.
- Read `../docs/Fleetora_Master_Project_Document.md` for product or workflow changes. Distinguish approved requirements from conceptual examples and future plans.
- Check `package.json`, actual installed versions, and configuration before assuming dependencies or commands.
- The expected stack is Next.js, React, TypeScript, and Tailwind CSS. Use shadcn/ui, TanStack Query, React Hook Form, Zod, or other libraries only when present and appropriate, or when the task justifies adding them.
- Do not invent backend capabilities, roles, status transitions, or product requirements.
- State a brief plan, implement the authorized change, verify it, and report results. Follow the root workflow without adding unnecessary approval checkpoints.

## 2. Follow the installed Next.js version

- Verify the installed version before relying on version-sensitive APIs, routing, rendering, caching, middleware, or configuration.
- Read relevant local documentation under the installed `next` package's `dist/docs/` when available. Resolve the actual package location; do not assume it is visible at the project root.
- Follow deprecation notices and existing project conventions. If local documentation is unavailable, use official documentation matching the installed version when accessible, and state unresolved uncertainty.
- Preserve applicable framework-generated instructions. Do not remove a generated block merely to shorten the file.

## 3. Keep feature ownership clear

Follow the actual project structure; do not reorganize working code to match a proposed directory tree.

| Location                           | Responsibility                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `app/`                             | Routes, pages, layouts, and route-level boundaries. Keep pages focused on composing features.           |
| `features/<feature>/`              | Feature components, API operations, hooks, schemas, types, and utilities. Create only the files needed. |
| `components/ui/`                   | Existing low-level UI primitives, including shadcn components when used.                                |
| `components/layout/`               | Shared navigation and application shell.                                                                |
| `components/shared/`               | Fleetora components genuinely used across features.                                                     |
| `lib/api/`                         | Shared transport, configuration, authentication handling, and error mapping.                            |
| Shared hooks, providers, and types | Cross-feature concerns with demonstrated shared use.                                                    |
| `public/`                          | Static assets intended for public access. Never place private files or secrets here.                    |

Keep feature-specific code in its feature. Extract shared code when reuse or responsibility warrants it; do not create empty folders, premature generic components, or broad abstractions.

## 4. Use one design system

- Read `DESIGN_SYSTEM.md` when present for implemented tokens, components, and layout rules.
- Read `../.agents/design/FLEETORA_DESIGN_LANGUAGE.md` and `../.agents/design/FLEETORA_THEME.md` when present for intended visual direction and reference palette.
- Use the active design system and shared tokens for implementation. Reference files must not create a second palette. If they conflict materially, identify the conflict before changing global styling; use established tokens for unrelated local work.
- Preserve Fleetora's established navy/teal direction where implemented. Do not invent exact color values or replace the current theme from memory.
- Reuse shared forms, buttons, tables, badges, dialogs, and navigation. Avoid arbitrary colors and inconsistent interaction patterns across screens.
- Do not redesign unrelated areas or change shared primitives for one screen without assessing other consumers.
- Keep product copy clear and relevant to the user's task. Do not expose implementation details in UI.
- Do not use emojis in product UI or project documentation unless requested.
- Apply relevant available frontend, UX, and design-system skills according to the root instructions; do not assume their files exist.

## 5. Build usable, accessible screens

- Support the intended desktop and smaller viewports. Keep forms usable, navigation reachable, and text readable without accidental page-wide horizontal overflow.
- Handle wide tables deliberately with responsive presentation or a contained scroll region.
- Use semantic buttons, links, headings, landmarks, and labeled inputs. Give icon-only actions accessible names.
- Preserve keyboard navigation, visible focus, dialog focus management, and accessible behavior supplied by UI primitives.
- Do not convey important state by color alone. Maintain readable contrast and respect reduced-motion preferences for affected animations.
- Follow existing localization conventions if present, including directionality. Do not introduce a translation system during unrelated work.

## 6. Integrate the real API contract

- Inspect the actual backend endpoint, DTO/schema, documented contract, or approved generated client before adding API integration.
- Match methods, URLs, fields, response shapes, pagination, and errors. Do not adjust types or cast responses merely to hide a mismatch.
- Keep feature API operations near the feature and shared transport in the established API layer. Avoid scattered raw requests and giant endpoint files.
- Reuse approved generated/shared types when available. Keep UI transformations explicit and avoid conflicting copies of entity types.
- If a capability is missing, identify it. Implement the backend only when the task authorizes that scope and after reading its instructions.
- Mocks are allowed for explicitly scoped prototypes or isolated tests. Keep them distinguishable from production integration and never present them as real persistence.
- Use backend-supported filtering, sorting, and pagination. Do not imply a filter searches all records when it only searches the current page.

## 7. Place rendering and state deliberately

- Prefer Server Components where supported by the actual architecture. Add `"use client"` for required interactivity, hooks, or browser APIs, keeping the boundary as small as practical.
- Keep server-only code and credentials outside client imports. Do not use browser globals in server rendering paths.
- Use local state for local interactions, URL parameters for shareable navigation/filter state, and the installed server-state mechanism for remote data.
- Avoid duplicate sources of truth, unnecessary global state libraries, and effects that only derive values from existing state.
- Keep query/cache keys scoped to the authenticated user and company where appropriate. Prevent previous-session data from appearing after logout or identity/company changes.
- Handle stale requests and mutation invalidation using established mechanisms. Do not show obsolete results after filters or identity change.
- Inspect caching behavior for authenticated server requests; private company data must not become shared cached output.

## 8. Forms and mutation feedback

- Follow existing form and validation patterns. Use operation-specific schemas matching accepted backend input.
- Client validation improves usability; the server remains authoritative for permissions and domain rules.
- Associate validation errors with fields, preserve useful input after failure, and provide clear progress and completion feedback.
- Prevent accidental duplicate submissions while a request is pending. Do not claim success before backend confirmation.
- Use optimistic updates only when failure recovery is clear and the operation supports them; do not imply a sensitive action succeeded prematurely.
- Use confirmation for consequential actions when appropriate to the established workflow. Do not add extra confirmation to every routine interaction.
- Handle loading, empty, error, success, and pending states relevant to the feature. Distinguish an empty collection from a failed request.
- Provide useful retry behavior where safe, without exposing raw infrastructure errors or repeatedly retrying invalid input.

## 9. Authentication, permissions, and data safety

- Inspect the existing session, token transport, refresh, logout, and protected-navigation behavior before changing it. Do not create a competing auth flow or storage scheme.
- Role-aware UI improves usability; every protected operation still requires backend enforcement.
- Never treat client-provided company IDs or hidden controls as authorization. Do not invent company switching or platform-admin privileges.
- Handle unauthorized and forbidden responses according to their distinct meaning and existing conventions. Avoid refresh loops and redirect loops.
- Expose only configuration intentionally meant for the browser. Public environment variables are not secrets.
- Do not log credentials, tokens, sensitive response bodies, or private environment values.
- Render untrusted text safely; do not insert unsanitized HTML. Validate untrusted navigation targets before redirecting.

## 10. Quality and performance

- Use clear names, narrow props, strong types, and focused components. Follow existing filename conventions.
- Avoid `any`, unchecked assertions, suppression comments used to conceal errors, and disabled checks.
- Do not rewrite working code for personal style or install a library without a concrete need.
- Avoid repeated requests, oversized client bundles/assets, expensive repeated render work, and huge unpaginated datasets.
- Measure suspected performance problems before adding complex optimizations. Use framework capabilities according to the installed version.

## 11. Verify and report

Discover runnable checks from project configuration. Follow applicable documented requirements, including `../docs/CODEX_WORKFLOW.md` when present.

- For behavior changes, test the relevant successful and failing user paths. Add meaningful coverage where needed; do not test implementation details for their own sake.
- For UI changes, inspect the affected screen in a real browser when available: intended viewport sizes, keyboard/focus behavior, and relevant loading/error/empty states. Check runtime errors and network behavior when integration is affected.
- For auth/session changes, verify denied access, expiration/logout behavior, and cache clearing or partitioning as relevant.
- Run applicable type/lint checks. Use a production build for framework, shared wiring, or broader integration changes when warranted; do not run every check for isolated copy edits.
- Keep existing tests meaningful. Do not skip tests, remove assertions, or weaken validation to obtain passing results.
- If browser or backend access is unavailable, state what was verified locally and what remains unverified. Mocked tests do not prove live integration.

A feature is complete when the requested user flow works with its supported contract, relevant states and accessibility are handled, and appropriate checks provide evidence. Report the outcome, affected areas, verification results, and material unresolved issues concisely in the user's language.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block may be generated and re-added by `next dev`. Verify the installed generator at `node_modules/next/dist/server/lib/generate-agent-files.js` when investigating generated instructions. Preserve applicable generated guidance and resolve any restored wording according to the user's project instructions.

## Do not change any md document unless i tell you

<!-- END:nextjs-agent-rules -->