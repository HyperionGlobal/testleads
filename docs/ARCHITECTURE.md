# Architecture and security

## Components

Next.js renders the authenticated workspace and exposes a cookie-authenticated JSON API. Prisma uses the JavaScript PostgreSQL adapter. PostgreSQL stores records, job leases, rate counters, settings and audit events. A separate worker polls every 15 seconds, enqueues due sources and runs up to five jobs per tick sequentially. Database compare-and-update claims prevent concurrent processing of the same job; advisory locks prevent scheduler enqueue races. Failed jobs retry at 30, 60 and 120 seconds up to three attempts, with expired leases recovered after 15 minutes. Host rules and enabled flags are checked at execution.

Source documents are treated as untrusted data. Retrieval is bounded to 2 MB and 20 seconds, HTTPS only, approved exact hosts, at most three redirects, DNS rejection for private/reserved addresses, and robots.txt permission. Missing robots.txt (404) permits retrieval; other robots errors fail closed. This is an initial SSRF defense, supplemented by the deployment egress proxy. Production network egress must also reject private/internal address ranges to address DNS rebinding and routing differences. Admin approval of a hostname is not a license to scrape: source-specific terms and API policies still apply.

A strict Zod schema validates extraction before a transaction writes a document, signal, company and opportunity. The AI system prompt isolates source text and rejects instructions in it; the source URL must match the supplied source. A malformed response gets one retry and creates no signal. Prompt isolation is a defense, not proof against all prompt injection. Untrusted source content is rendered as React text, never executable HTML.

Qualification, weighted scoring, material/service matching and outreach use deterministic functions rather than letting an AI choose authorization, destinations or actions. Services include documentation and questions before quoting. The AI never receives credentials, database tools or email-sending tools. OpenAI use is optional; without it, rule-based outputs have 35% confidence and explicitly require verification. Production extraction and prompt-injection behavior require a keyed evaluation corpus before deployment.

## Data model

`prisma/schema.prisma` and the committed SQL migration define users/roles, companies, facilities, contacts, source documents, signals, opportunities, services, materials, campaigns, drafts, activities, notes, tasks, tags, searches, imports, exports, suppression, scoring, settings, audit, jobs, usage and rate limits. Opportunity links are many-to-many where appropriate. `User.role` is an ADMIN/USER application enum validated on write, rather than a separate roles join table. Company qualification fields live in structured JSON with provenance status; unknown fields are not fabricated.

## Security controls and limits

- bcrypt password hashes; random local bootstrap credentials in ignored mode-0600 `.env`.
- HS256 sessions signed with a 32+ character secret, eight-hour expiry, HttpOnly/SameSite=Lax cookies, Secure when APP_URL is HTTPS. Each request reloads role and session version from the database.
- Mutation Origin must exactly match APP_URL. Set APP_URL to your canonical HTTPS origin in deployment.
- Admin-only source/settings/job/provider/team/retention actions; standard users can research and review leads. Authentication enforced server-side for pages and API calls.
- Persistent per-user limits and login limits. Configure trusted reverse-proxy limits as well for production abuse resistance.
- Input validation and length limits; no raw HTML rendering; security headers and CSP. Next.js requires inline bootstrap scripts; CSP currently permits unsafe-inline. Stronger nonce CSP is a production enhancement.
- CSV formula neutralization; XLSX cells are plain string values.
- Exact business-email/domain suppression gates draft generation and approval. No sending endpoint or SMTP dependency exists.
- Secrets stay in runtime environment bindings; no secrets settings endpoint. Encrypt managed secrets and database volumes with your deployment provider. Local `.env` is permission-protected, not an encrypted vault.
- Application deletion of an opportunity cascades draft/note/task/activity records and emits an audit event. Company/contact/source retention and full data-subject erasure are not automated by this MVP. Configure production retention, access, backups and erasure before real use.
- Health verifies DB connectivity but does not reveal secrets. Audit logs contain actors and actions, never passwords or provider keys.

A production security review, backup/restore drill, real provider validation and operational monitoring remain deployment responsibilities.
