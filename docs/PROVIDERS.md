# Data-provider integration guide

The app operates with manual evidence, CSV and authorized RSS without paid credentials. Configure credentials securely in runtime environment settings; never commit them or enter them into workspace preference JSON. A configured variable indicates presence, not successful provider authentication.

| Variable | Implementation | Destination | Validation |
|---|---|---|---|
| `OPENAI_API_KEY` | OpenAI Responses structured extraction, strict schema, one validation retry | api.openai.com | Not live-tested without key |
| `SEARCH_PROVIDER=brave`, `SEARCH_API_KEY` | Brave web search adapter and admin search form | api.search.brave.com | Interface implemented; live API not tested |
| `CONTACT_ENRICHMENT_API_KEY` | Authorized Apollo candidate search endpoint | api.apollo.io | Interface implemented; account entitlements untested |
| `EMAIL_VERIFICATION_API_KEY` | Reserved extension point only | Provider dependent | No verifier enabled; never marks emails verified automatically |
| `CRON_SECRET` | Reserved for external scheduler integration | None by default | The bundled worker uses DB claims, not a public cron endpoint |

The OpenAI model defaults to `gpt-4.1-mini` and is configurable in settings. Extracted source text is untrusted data; strict output validation and fixed source attribution are mandatory. Qualification, scoring and outreach are separate deterministic stages, avoiding model authority over access or sending. Token and API-call counts are recorded; actual dollar costs are left unknown unless supplied by a provider. Do not present unknown costs as $0.

`SearchProvider` and `ContactProvider` interfaces in `lib/providers.ts` allow additional authorized vendors. Search results are candidates, not confirmed opportunities. Apollo responses are candidates for manual review; candidates are not silently stored as verified contacts. Add a verifier adapter only after checking your provider's current API, permissions and verification semantics. Never guess an email and call it verified.

RSS/Atom and manual URL sources must use HTTPS, an approved hostname, applicable source permissions and source frequency. Robots rules are checked for fetched pages. No authenticated website scraping, CAPTCHA bypass or automatic LinkedIn scraping is implemented. Default source categories are disabled until an administrator configures authorized URLs. EPA, Federal Register, EDGAR, NHTSA, FDA and CPSC may have dedicated APIs, identifying user-agent requirements or rate limits; configure each according to its current official documentation rather than blindly enabling a root webpage.

Local source allowlisting and cloud environment egress allowlisting are separate controls; both must permit a destination. Provider keys are optional and no secret value is required in chat.
