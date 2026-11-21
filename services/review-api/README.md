# Changeproof development AI review API (0.18.0)

Requires Node 22+, Git for context collection, and root `npm ci`. From the repository root:

```sh
cp services/review-api/.env.example services/review-api/.env
# Edit .env: REVIEW_ACCESS_TOKEN (32+ random non-whitespace characters), GROQ_API_KEY
npm run start:review-api
```

Default loopback origin: `http://127.0.0.1:4318`. `GET /health` returns provider/model and contract version; `POST /v1/reviews` requires `Authorization: Bearer <REVIEW_ACCESS_TOKEN>`. This is one shared development token, not public-user login. Keep the env file server-side; do not put Groq keys in the extension. The process always binds 127.0.0.1. Remote use requires an operator-managed authenticated HTTPS reverse proxy; deployment, public identity and TLS termination are outside this milestone. Do not expose this development service directly to the internet.

`npm run build:review-api` produces `services/review-api/dist/server.mjs`; from root run `node --env-file=services/review-api/.env services/review-api/dist/server.mjs`. The build externalizes dependencies; keep the root install available. From this directory `npm start`, `npm run build`, `npm test` work too.

`REVIEW_PROVIDER=mock` starts the real HTTP service with an explicitly labeled synthetic, insufficient-context response. It makes no model calls. Test providers inject scripted disclosure/ownership/safe/insufficient-context fixtures; those tests validate the flow and contract, not model accuracy. The Groq adapter uses official chat completions with strict JSON schema and defaults to `openai/gpt-oss-120b`. Set `GROQ_MODEL` to a compatible text model supporting strict structured output. No tools are supplied; Compound/tool models are rejected. No automatic retries or model fallback. Provider throttling/unavailability, malformed/truncated responses and invalid references fail visibly.

Limits: 160,000-byte request; 8 files; 32 context chunks; 120 lines/chunk; 100,000 UTF-8 code bytes; 48,000-byte final output; 12 findings; 6,000 model completion tokens; 45-second provider deadline. Defaults: 2 concurrent requests, 20 authorized valid requests/hour, 2,000,000 submitted bytes/hour. `REVIEW_CONCURRENCY`, `REVIEW_REQUESTS_PER_HOUR`, `REVIEW_BYTES_PER_HOUR`, `REVIEW_TIMEOUT_MS` may lower/raise within server bounds. Failed provider requests consume quota. Quotas are shared for the single development identity, held in memory, reset on restart, and do not work across replicas. The limits are not a cost guarantee. Unauthenticated internet-rate protection is not implemented; use loopback.

There is no request logging, database, prompt/response persistence or error-body echo. Only startup origin/provider is printed. Code, filenames, model text and the access token live in memory during the operation; do not add logging middleware or body-capturing proxies. `/health` intentionally discloses provider/model. Cancellation aborts the backend's provider request when the client disconnects; cancellation may not prevent charges for work already accepted upstream.

Current AI contract 1.2.0 is independent of deterministic report 5.0.0. Grounding validates exact submitted file, before/after revision IDs and contained line ranges. Each finding must include exact source quotes; the contract rejects quotes that do not match referenced submitted chunks. The extension rechecks them against the saved snapshot and exposes clickable quote receipts. A receipt proves only the quoted text and location, not the interpretation, policy assumption, behavior or security. Optional suggested edits are restricted to exact submitted after-context lines and are locally checked before the user can apply them.

## Provider data handling

Reviewed official documentation on 2026-11-18:
- [Chat completions API](https://console.groq.com/docs/api-reference): fixed HTTPS endpoint, bearer authorization, max_completion_tokens and chat messages.
- [Structured outputs](https://console.groq.com/docs/structured-outputs): strict JSON-schema support is model-dependent; all object properties are required and additionalProperties is false.
- [Models](https://console.groq.com/docs/models): default model available in the documented production list.
- [Groq data handling](https://console.groq.com/docs/your-data): usage metadata is retained; inference inputs/outputs are not retained by default, but reliability/abuse logging may retain them up to 30 days unless opted out, subject to legal exceptions. Organization data controls matter. This service does not control Groq's retention or account settings. Check the current policy and your organization's permissions before sending private code.

This feature sends only after explicit preview approval, but that approval sends code to both the configured backend and Groq (unless using the mock provider). Redaction catches only recognizable patterns and sensitive-name string assignments; it does not catch every secret, PII, business information or sensitive identifier. Inspect the complete payload, including file names, before approval. A no-upload deterministic alternative remains available.

## Readiness and evaluation (0.9.0)

See [setup, connection status and synthetic evaluation](../../docs/live-ai-readiness-0.9.0.md). Health now includes a process instance ID but never claims inference. A configured Groq key is not a verified key. The extension's Check AI Connection command explicitly confirms a built-in synthetic request; no workspace code is used. Invalid references now have a distinct sanitized `invalid_reference` error. Provider authentication, model/configuration and rate-limit failures are distinguished without echoing upstream error bodies. AI/deterministic request/report schemas remain unchanged.
