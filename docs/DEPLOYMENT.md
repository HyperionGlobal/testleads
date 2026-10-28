# Production deployment

The current instance runs locally; no public deployment or TLS endpoint has been published.

1. Use a managed PostgreSQL instance (TLS with certificate verification), encrypted storage, regular backups and a tested restore process. Run the committed migrations as a release step.
2. Store DATABASE_URL, AUTH_SECRET, administrator bootstrap values and optional provider keys in your platform's secret manager. Generate independent secrets. Set APP_URL to the canonical HTTPS origin. Do not reuse local demo credentials.
3. Run `npm ci`, `npm run db:generate`, `npm run db:migrate` and `npm run build`. Seed only if demonstration records are wanted. For a clean production bootstrap, set `SEED_DEMO=false` before `npm run db:seed` to create the admin, catalogs and settings without demo opportunities.
4. Start `npm start` as the web process and `npm run worker` as a separate supervised process. They share PostgreSQL and application environment configuration. Persist no state in a web-process filesystem.
5. Terminate TLS at a trusted reverse proxy, enforce request size/time limits and abuse protection, and expose only the web port. Keep PostgreSQL private. Permit only necessary outbound hosts and block internal/reserved address ranges.
6. Check `/api/health`, log in, run `npm run smoke` against a non-production validation environment, and validate provider accounts with an approved real-source corpus. Configure sources deliberately; they start disabled.
7. Add monitoring for failed jobs, worker health, database capacity, retention, audit retention and security events. Perform a security review and implement organization-specific data erasure before real contact-data use.

## Docker Compose

Copy `.env.example` to `.env`, set independent secrets and `POSTGRES_PASSWORD`, set `SEED_DEMO=false` for a non-demo bootstrap, then:

```bash
docker compose up --build -d
docker compose ps
docker compose logs web worker
```

Compose provides the internal `db` hostname, a persistent PostgreSQL volume, health-gated startup, migration/seed step, web and worker. It binds web to host loopback by default; use an HTTPS reverse proxy for external deployment. The Docker image was built successfully here; see validation evidence for runtime checks and proxy-specific build notes. The local app and database were also executed independently.

For upgrading an existing deployment, retain its environment secrets and volume. `migrate deploy` applies only committed migrations. Never use `migrate reset`, reset an existing database, or overwrite an existing `.env` during upgrades.
