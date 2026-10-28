# Hyperion Lead Intelligence

A working, review-first B2B research MVP for Hyperion Global. Next.js 15, React 19, TypeScript, Prisma 6, PostgreSQL 16, a PostgreSQL-backed retry worker, and a responsive, accessible custom CSS interface. Fonts are bundled locally.

The pipeline is **source → signal → company → opportunity → score → authorized contact → outreach draft → human review**. There is no email transport and no automatic sending.

## Quick start

Requirements: Node.js 24, npm, Docker with a working daemon. Use the existing checkout; cloud tasks are isolated, so no worktree is needed.

```bash
cd /workspace/testleads
npm ci
node scripts/init-local.mjs
# Creates .env only if absent, with random admin password and session secret.
node --env-file-if-exists=.env scripts/database.mjs
npm run db:generate
npm run db:migrate
npm run db:seed
npm run build
npm start
# In a second terminal:
npm run worker
```

The database helper starts `hyperion-db` if it exists, or creates it using the DATABASE_URL credentials without logging them. Wait for `docker exec hyperion-db pg_isready -U hyperion` before migrations. New local environments receive a random database password and are bound to loopback. Use independent strong credentials for deployments.

The app listens on port **3000**, with login at `/login`. Local address: `http://localhost:3000`. Cloud onboarding does not expose a browser preview; access requires a port-forwarding mechanism supplied by your client or a separate deployment. Health: `GET /api/health` verifies PostgreSQL connectivity.

Demo administrator: `admin@hyperion.local`; the randomly generated password is `ADMIN_PASSWORD` in ignored `.env`. Do not paste secrets into chat. `npm run db:seed` creates the admin if missing and does not reset existing passwords. It inserts 12 explicitly fictional leads, 13 services, 24 materials, five campaign templates, source categories and scoring settings. Demo contacts use reserved example.com domains and are **not verified**.

For development use `npm run dev`. Tests and utility commands load `.env` through Node's env-file support; Next.js loads it automatically. Docker Compose provides runtime variables and mounts no credential files into source control.

## Implemented workflow

- Secure password login, eight-hour signed HttpOnly sessions, DB-checked role access, admin-created users, audit records and database-backed rate limits.
- Manual source text, authorized HTTPS URL fetching, RSS/Atom ingestion, CSV import; admin source allowlist, robots.txt checks, timeouts and response limits.
- Optional strict OpenAI structured extraction with one validation retry; deterministic, low-confidence rule-based extraction without a key. Facts and commercial inferences are displayed separately.
- Linked companies, facilities, contacts, materials, services, campaigns and source documents; transparent 0–100 scoring and configurable weights.
- Unique normalized company names/domains, source URL duplicate prevention, contact email/LinkedIn uniqueness, normalized-title similarity flags. Duplicates are recorded, never silently merged or deleted.
- Opportunity stages, owners, notes, tasks, history, review approval, draft approval and suppression enforcement.
- Eight outreach artifacts: subject, first-touch, follow-up, LinkedIn connection/follow-up, call opening, voicemail and discovery questions. Four neutral tones; existing-relationship language is intentionally blocked unless a future workflow verifies the relationship.
- Source changes requalify existing opportunities, retain previous evidence in audit history and supersede prior outreach approvals.
- Persisted source jobs, atomic claims, three attempts with exponential backoff, stale worker lease recovery, source frequency, pause/resume and manual reruns.
- Twelve navigation areas, score/industry/geography/service/urgency/stage/owner reporting, source/job status, CSV/XLSX/JSON exports, team settings and audit log.
- Company profile JSON uses per-field `Verified`, `Inferred` or `Unknown` status. Unpopulated information remains unknown. No real research is asserted by demo data.

## Validation

```bash
npm test                # domain/unit checks
npm run typecheck
npm run lint
npm run build
npm run smoke           # requires running app + DB; uses and cleans test fixtures
npm run browser:check   # packaged Chromium; screenshots + axe WCAG AA scans
```

See [validation evidence](docs/VALIDATION.md) for actual results, including any unvalidated capabilities. Smoke tests cover login, roles, CSRF, company/contact creation, ingestion, duplicates, statuses, human approvals, suppression, import/export, source failures, job retries and audit logging. Browser screenshots are in `screenshots/`.

## Integrations and deployment

- [API reference](docs/API.md)
- [Architecture and security](docs/ARCHITECTURE.md)
- [Provider integration guide](docs/PROVIDERS.md)
- [Production deployment](docs/DEPLOYMENT.md)

## Deliberate MVP limits

This is a functional core MVP, not completion of every enterprise feature in the original specification. Live paid-provider behavior is not validated without credentials. Contact discovery returns authorized provider candidates for review; email verification is an extension interface, not a configured verifier. Currency estimates are left unknown, provider dollar costs remain unknown unless reported, and no inferred email is marked verified. The UI does not yet offer every possible company-profile field, custom report dimension, competitor/customer assignment policy, or automatic duplicate merging. Retention removes old lost/disqualified opportunities; full subject-erasure across source evidence and exports needs a separate records-management workflow. There is no MFA, password reset, monitoring deployment or automated database backup service. See security/deployment notes before real contact data or production use.
