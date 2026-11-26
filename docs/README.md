# Fleetora documentation map

One source of truth per topic. If a document is not listed here as the source, do not use it for requirements.

| Topic | Where | Notes |
| --- | --- | --- |
| Agent / contributor rules | [/AGENTS.md](../AGENTS.md) | The only place for product rules for agents. Area files ([backend/AGENTS.md](../backend/AGENTS.md), [frontend/AGENTS.md](../frontend/AGENTS.md)) hold technical rules only. |
| Product requirements (only source) | [docs/product/](product/README.md) | Start with its README: authority order, PRD, business rules, master project. |
| Owner decisions | [docs/product/DECISIONS.md](product/DECISIONS.md) | OD-01..OD-13. |
| Implementation plan | [docs/product/IMPLEMENTATION_PLAN.md](product/IMPLEMENTATION_PLAN.md) | Ordered phases, exit criteria. |
| Traceability | [docs/product/TRACEABILITY.md](product/TRACEABILITY.md) | Rule / FR → status, code, test. Update for every rule implemented. |
| Repository audit | [docs/product/RECONCILIATION.md](product/RECONCILIATION.md) | Phase 0: code vs. baseline. |
| Engineering workflow | [docs/CODEX_WORKFLOW.md](CODEX_WORKFLOW.md) | How agents work and verify. |
| Backend engineering | [backend/ENGINEERING_STANDARD.md](../backend/ENGINEERING_STANDARD.md), [backend/prisma-8.md](../backend/prisma-8.md) | Backend standard; Prisma workflow. |
| Security gates | [docs/PHASE6B_SECURITY_CHECKLIST.md](PHASE6B_SECURITY_CHECKLIST.md) | Tenant/security checklist for new features. |
| Design | [frontend/DESIGN_SYSTEM.md](../frontend/DESIGN_SYSTEM.md), [.agents/design/](../.agents/design/) | Implemented design system; theme and design language references. |
| Runbooks | [docs/live-fleet-tracking.runbook.txt](live-fleet-tracking.runbook.txt), [backend/deployment/](../backend/deployment/) | Operational procedures. |
| App setup | [frontend/README.md](../frontend/README.md), [backend/README.md](../backend/README.md), [apps/merchant_app/README.md](../apps/merchant_app/README.md) | Local development. |
| Archive | [docs/archive/](archive/) | Superseded. Do not use. |

## Windows startup

Start Docker Desktop in Linux-container mode first. Copy the root `.env.example` to `.env` and replace its secret placeholders. Run these commands from the repository root (or double-click the batch files):

| Command | Result |
| --- | --- |
| `start-fleetora.bat` | Start local PostgreSQL, apply local migrations, start the API and web app, then open `http://localhost:3000` once ready. |
| `start-fleetora.bat neon` | Start only the API and web app, using `DATABASE_URL` from `backend/.env`. Does not start PostgreSQL or run migrations against Neon. |
| `stop-fleetora.bat` | Stop the Compose stack and keep the database volume and local data. |

Append `rebuild` to either start command when Dockerfiles, dependencies, or application source change (for example, `start-fleetora.bat neon rebuild`). Normal starts reuse existing images; Docker builds missing images automatically. Stop the stack before changing database modes. Ports 3000 and 3001 must be free. Startup polls the frontend every two seconds for up to 180 seconds; a timeout prints the last 30 backend and frontend log lines with secrets redacted. Neon migrations remain a separate, explicit operator action. Update Docker Desktop if Compose does not recognize the `!reset` or `!override` tags.
