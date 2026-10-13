# Fleetora frontend

The current frontend uses Next.js 16.3.8, React 19 and the App Router. Public authentication pages live under `app/`; workflow code lives under `features/auth/`. `/app` uses a reusable protected layout and renders the dashboard feature. Shared server transport and credential operations live under `lib/api/` and `lib/auth/`.

## Local development

From this directory, use the existing installed dependencies and run `npm run dev`. Set the server-only `FLEETORA_API_URL` to the intended backend base URL using your local environment configuration. Never prefix it with `NEXT_PUBLIC_` or put credentials in browser configuration. The default frontend port is 3000; Playwright uses 3100 and a test backend fixture on 3101.

Authentication requires the backend's current contracts. The frontend protected layout controls presentation and session lifecycle; it does not authorize tenant data access.

## Verification

- `npx tsc --noEmit --incremental false` checks TypeScript without updating build metadata.
- `npm run lint` runs the configured ESLint checks.
- `npm run test:actions` runs action tests without starting Next.js.
- `npm run test:isolated` copies the current source to a new temporary directory, runs action/browser tests and maintained layout/primitive probes, then stops its own test server. Optional `-- --output <new-directory> --project=browser` selects an explicit output directory and project. Outputs are retained. Test-only child routes are created only in the isolated copy.
- `npm test` uses the existing Playwright web-server configuration and writes its normal artifacts in this directory.
- `npm run build` performs the normal production build; `npm start` starts that output. Use an isolated source copy when existing `.next` artifacts must be preserved.

The root layout uses Inter through `next/font/google`. Normal builds require Google Fonts downloads. Cache-assisted isolated verification must be labeled supplementary and must not replace the production font configuration. Browser fixtures and action mocks do not prove live-backend integration; backend PostgreSQL tests require a separately proven disposable environment.

## Design and future features

Read `AGENTS.md`, `DESIGN_SYSTEM.md`, the product theme references, and [the security checklist](../docs/PHASE6B_SECURITY_CHECKLIST.md) before extending the application. Keep shared UI, feature presentation, session orchestration, and backend authorization separate. Do not create production routes for test probes or future modules.
