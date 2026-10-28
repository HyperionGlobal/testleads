# JSON API

All routes are under `/api`. Health and login are public; other routes require `hyperion_session`. Mutations require a matching `Origin` and JSON content type. Errors return `{ "error": "..." }`; validation errors include field issues. Mutation routes use POST. There are no messaging endpoints.

| Route | Method | Purpose |
|---|---|---|
| `/health` | GET | PostgreSQL readiness, mode, emailSending=false |
| `/auth/login` | POST | `{email,password}`; session cookie |
| `/auth/logout` | POST | Clear session |
| `/me` | GET | Current user and role |
| `/opportunities` | GET | Up to 500 ranked opportunities with relations |
| `/opportunities/:id` | GET / POST | Detail; update stage, owner, reviewStatus, contactId |
| `/opportunities/:id/note` | POST | `{body}` |
| `/opportunities/:id/task` | POST | `{title,dueAt?}` |
| `/opportunities/:id/draft` | POST | `{tone}`; suppression gated |
| `/opportunities/:id/approve-draft` | POST | `{draftId}`; approved lead + suppression gate |
| `/opportunities/:id/delete` | POST | Admin deletion with audit |
| `/tasks` | POST | `{id,done}` |
| `/companies` | GET / POST | Records; create `{name,domain?,industry,location}` |
| `/contacts` | GET / POST | Records; create `{name,title,companyId,email?,emailStatus,source,reason}` |
| `/signals` | GET | Facts, inference, evidence, source, confidence |
| `/ingest` | POST | `{title,text,url,company?}`; strict qualification + dedup |
| `/fetch-url` | POST | Admin approved-host fetch `{title,url,company?}` |
| `/imports` | GET / POST | History; upload `{name,csv}`; up to 500 rows, per-row errors |
| `/import-template` | GET | Download CSV template |
| `/export?format=csv\|xlsx\|json` | GET | Export and audit |
| `/sources` | GET / POST | List; admin create or `{id,enabled?,frequency?}` |
| `/jobs` | GET / POST | History; admin immediate run `{sourceId}` |
| `/pipeline` | POST | Admin pause `{paused:boolean}` |
| `/campaigns` | GET | Five templates and linked opportunities |
| `/searches` | GET / POST | Saved filters `{name,filters:{query,stage?,priority?}}` |
| `/search` | POST | Admin Brave search `{query}` |
| `/enrich` | POST | Admin authorized Apollo candidates `{domain}`; review required |
| `/settings` | GET / POST | Settings, weights, provider presence; admin writes |
| `/suppression` | POST | Admin `{value,reason}` exact email/domain |
| `/users` | POST | Admin `{email,name,password,role:ADMIN\|USER}` |
| `/retention` | POST | Admin apply configured opportunity retention |
| `/audit` | GET | Latest 200 audit records |

CSV input columns: `company,title,text,url`; extra columns are accepted but do not become verified facts. Source URLs must be HTTPS. All externally supplied business information starts unverified unless explicit verification evidence is supplied. Manual verified contact entry requires both email and evidence source.

Example request (use a session established by login):

```json
{"company":"Example Company","title":"Warehouse closure announced","text":"Source reports a warehouse closure; scope remains to be verified.","url":"https://example.com/news/warehouse"}
```
