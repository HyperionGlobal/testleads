# Validation evidence

Executed in the cloud workspace on October 26, 2026. This records current-instance checks; it does not claim a public deployment, published snapshot or restoration into a fresh cloud task.

| Check | Result |
|---|---|
| Node / PostgreSQL | Node 24.19.0; PostgreSQL 16 container running with persistent volume |
| Frozen dependency refresh | `npm ci` completed; lockfile retained |
| Prisma generation | Passed with PostgreSQL JavaScript driver adapter |
| Initial migration | Applied to main development database |
| Fresh-database migration | Applied to separate empty database; 36 tables; second deploy reported no pending migrations; test database removed |
| Seed repeatability | Admin/catalog/settings/12 fictional opportunities seeded; repeated seeding succeeds without duplicating opportunities or overwriting existing admin password |
| Type checking | `npm run typecheck` passed |
| Lint | `npm run lint` passed |
| Unit/domain tests | `npm test`: 13 passed, 0 failed, 0 skipped |
| Production build | `npm run build` passed; application and API routes generated |
| HTTP functional smoke | 21 passed on production server; temporary accounts and domain fixtures cleaned |
| Browser runtime | No page errors; sign-in, dashboard, opportunities, source settings, opportunity detail and outreach rendered |
| Responsive layout | 390×844 mobile dashboard and companies navigation checked; no document horizontal overflow |
| Accessibility automation | axe WCAG 2 A/AA and 2.1 AA scans: dashboard, opportunities, data sources, settings; 0 reported violations after contrast fixes |
| Screenshots | Desktop dashboard, opportunities, detail, outreach, sources, settings and mobile dashboard in `screenshots/` |
| Dependency audit | `npm audit --omit=dev --audit-level=moderate`: zero vulnerabilities at validation time |
| Reusable install | `bash scripts/cloud-install.sh` executed successfully, including npm ci, generation, migrations, seed and production build |
| Reusable startup | `bash scripts/cloud-start.sh` executed and rerun; expected application health returned with PostgreSQL connected |
| Docker image | `hyperion-lead-intelligence:local` built successfully as a non-root application image; network/trust adaptation described below |
| Docker runtime | Container started on validation port 3001, health verified PostgreSQL, all 21 HTTP smoke checks passed against container; temporary container removed |

HTTP smoke exercises authentication failures/success, secure cookie flags, unauthenticated denial, standard-user role denial, origin CSRF checks, company/contact creation, strict ingestion validation, complete source-to-draft flow, URL duplicates, separate facts/inferences, status validation and linking, lead approval before draft approval, suppression gates, changed-source requalification and superseded approvals, CSV import, CSV/XLSX/JSON export contents, source failure/backoff/terminal failure after exactly three attempts, and audit records.

The source-failure checks intentionally emit `job_failed` logs. Those are passing negative-path tests, not unresolved setup errors. Test fixtures use reserved example.com domains. No emails are sent.

## Network diagnosis and trust

The first Prisma download was blocked by the egress policy. The required `binaries.prisma.sh` domain was saved; subsequent migration/generation succeeded with checksum verification intact. Browser CDN access remained restricted, so browser validation uses the trusted npm-distributed `@sparticuz/chromium` artifact instead. Its default `--disable-web-security` launch argument is removed in the test harness so normal Origin behavior and application CSRF checks remain enabled.

Docker build initially could not resolve public DNS or the platform proxy hostname inside its build namespace. The successful build used the existing environment HTTP(S) proxy, an explicit host mapping for that proxy, and the supplied CA certificate as an ephemeral BuildKit secret during npm installation. A runtime check also exposed copied-file permissions; source ownership was corrected for the non-root node user and the rebuilt container passed health and all HTTP smoke checks. No TLS or package verification was disabled; no credentials or CA secret were copied into the image. Ordinary deployment networks can build without these environment-specific flags.

## Not validated / limits

- Live OpenAI, Brave, Apollo and email-verification service behavior: no provider credentials supplied. No actual email verifier is enabled. Prompt-injection unit coverage tests the deterministic fallback and schema boundary; it is not a live-model red-team evaluation.
- Default source categories are disabled; no official source is represented as having been researched by seed data. Manual evidence ingestion, feed normalization and failure/retry handling were tested. Source-specific authorization, terms, API entitlements and production feed reliability still need validation.
- Accessibility automation covers the four named screens, plus a responsive navigation check; it is not a full manual assistive-technology audit.
- Full enterprise data erasure, advanced customer/competitor assignment policies, all report permutations, and provider-backed automatic contact verification are outside the implemented core scope.
- No public HTTPS deployment, production security audit, backup restore drill, publication or new-task restoration was performed.

See `README.md` and the other docs for implemented scope and production prerequisites.
