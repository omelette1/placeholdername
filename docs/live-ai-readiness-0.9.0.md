# Live AI readiness and evaluation — 0.9.0

This extends 0.8.0's collector, backend, provider adapter and existing sidebar/details panel. Deterministic review remains independent; deterministic report 4.0.0 and AI contract 1.0.0 are unchanged. No second findings interface, infrastructure access, patches or target execution is added.

## Status and explicit synthetic check

The existing sidebar now has **AI connection status**. **Refresh AI Status** performs only a bounded GET /health. It distinguishes unavailable/incompatible backend, reachable mock provider, and configured Groq with live inference unverified. A health response never establishes provider authentication or inference. Health includes an opaque process instance ID so a restart, backend/model change or configuration refresh invalidates earlier connection checks. Update the backend together with the extension; older health responses lacking an instance ID are treated as incompatible.

**Check AI Connection** first fetches health, then asks explicitly before sending one built-in five-line synthetic before/after example to POST /v1/reviews. No workspace selection, collector, source, project path or metadata is used. The normal service authentication, provider adapter, output schema and reference validator all apply. There are no retries or model/provider fallbacks. A configured mock remains a mock and is labeled accordingly. Progress is cancellable.

The status shows provider/model, check timestamp, connection/schema/reference-validation pass or failure, and a **separate single-example category/range signal**. Valid empty or insufficient-context responses still pass compatibility but do not become evidence of detection quality. Model claims are not proven by valid references. Status is session-local and refreshed explicitly, not a continuously monitored health check. The setup guide uses the existing reusable details panel.

Provider authentication/configuration/quota errors, schema failures and invalid references have sanitized error codes/messages. No provider error body, key or model prose is added to logs/status reports. Request/response contracts stay separate from health/error metadata.

## Setup (development authentication)

1. From Changeproof, run `npm ci`. Copy `services/review-api/.env.example` to `services/review-api/.env` (ignored by Git).
2. In the server env file set `GROQ_API_KEY`, `REVIEW_PROVIDER=groq`, `GROQ_MODEL=openai/gpt-oss-120b` (or an explicitly chosen compatible model), and a unique random `REVIEW_ACCESS_TOKEN` with 32+ non-whitespace characters. Keep the provider key server-side; never paste it into chat, extension settings, reports or Git. This shared development token is not public-user login.
3. Run `npm run start:review-api`; the service binds to `127.0.0.1:4318`. Existing concurrency/byte/hour quotas and provider timeout still apply. The in-memory quota resets on restart and is not distributed accounting or a hard cost cap.
4. Install `artifacts/changeproof-local-0.9.0.vsix`, reload the existing window once, and optionally set **user** `changeproof.aiBackendUrl`. Remote origins require HTTPS. Run **Changeproof: Set AI Review Access Token** with the development token, not the Groq key; it uses SecretStorage. Project configuration cannot override it.
5. Run **Changeproof: Check AI Connection** and approve the synthetic request. Only after connection is established should you use **AI Review Changes**, with its independent exact payload preview/approval for workspace code. Local **Review Project** needs no AI credentials.

The service can be started with `REVIEW_PROVIDER=mock` for local orchestration testing; mock connection results are never called live inference. The CLI synthetic equivalent is `npm run check:ai -- --live --model openai/gpt-oss-120b` with REVIEW_ACCESS_TOKEN in the CLI environment and an already-running Groq backend. It refuses mock/different-model service identity. Do not put credentials in command arguments or reports.

## Reproducible evaluation

`evaluation/fixtures` has 12 synthetic cases: four explicit regressions, four safe controls, four insufficient-context cases. It covers authorization-header logging, broadened public/private response data, owner/tenant checks, constant safe redaction, visible helper protection, omitted helpers/data classification and an untrusted instruction embedded in a comment. Fixture source declares the policy needed by scored clear cases. Expected outcomes, category, evidence ranges, assumptions and authored ambiguity notes are separate `expected.json` files, never copied into a model request.

The harness constructs an isolated temporary Git baseline containing only synthetic app.ts and calls the production collector. It does not execute fixture code. It uses the same authenticated /v1/reviews route, prompt, adapter and validators as the extension. The metadata is not a hidden prompt or a second permissive analysis path. Live evaluation requires committed, unchanged fixture files, explicit `--live`, an exact `--model` matching health, an access token and explicit `--max-requests` (1–12). Calls are sequential, capped, cancellable, with no retries or fallback. A 429 stops immediately. Output is bounded by the existing AI contract. Model/source text and credentials are not persisted in reports.

Local fixture validation (zero model requests):

```sh
npm run evaluate:ai -- --validate
```

With the service running and the development token in the CLI environment:

```sh
npm run evaluate:ai -- --live --max-requests 12 --model openai/gpt-oss-120b --out artifacts/live-evaluation-UNIQUE-DATE.json
```

For CLI env loading without putting a token in an argument, copy `evaluation/.env.example` to `evaluation/.env` and set only the development token and backend URL there. Never copy GROQ_API_KEY into the evaluation env. Run `node --env-file=evaluation/.env evaluation/run.mjs --live --max-requests 12 --model openai/gpt-oss-120b --out artifacts/live-evaluation-UNIQUE-DATE.json`. The backend alone holds the provider key and calls Groq. Existing report paths are never overwritten.

Reports separate provider/request/schema failures, invalid references, clear-regression proxy hits/misses, safe cases with findings (and total finding count), uncertainty proxies, human-judgment cases and unattempted cases. Failures and capped/throttled unattempted cases are not counted as misses. Provenance includes fixture hash, commit, provider/model and timestamp. No accuracy percentages are produced. Category and before/after range overlap are only a **scoring proxy**; they do not validate reasoning, prove application policy or establish security. All findings still require human review. Insufficient-context examples are explicitly excluded from binary accuracy judgments; a non-empty context request with no asserted regression is an uncertainty proxy only. The rubric was authored/reviewed during implementation, not independently human-adjudicated. No LLM judges its own output.

Ordinary `npm test` performs no external inference and has a fetch guard against non-loopback traffic. Tests with injected Groq transport validate protocol/status handling, not actual live provider operation or accuracy.

## Provider references

Official documentation checked during implementation: [structured outputs](https://console.groq.com/docs/structured-outputs) (strict support is model-dependent), [models](https://console.groq.com/docs/models), and [data handling](https://console.groq.com/docs/your-data). Provider-side usage metadata/retention and organization data controls remain separate from this service's no-code-logging policy. The service never supplies tools, code execution or automatic editing capabilities.

## Actual verification

Verified on **2026-11-19T00:33:54.917Z**:

- **114/114 automated tests passed**, including existing regression checks and the real collector → HTTP API → Groq adapter path with an injected synthetic transport. Ordinary tests sent no external inference requests.
- Backend and extension builds passed. Local production-collector validation processed **12/12 fixtures**, with **zero model requests**.
- The packaged **0.9.0 VSIX** passed installed-extension checks in **VS Code 1.142.0**, in one isolated test-window launch. Native status, explicitly confirmed synthetic mock contract check, SecretStorage, existing sidebar/panel and navigation passed. The existing user window was not modified. Development-host testing was not separately rerun. No manual visual, mouse, screen-reader or webview-paint verification; Cursor untested.
- Native provider/model: **mock / synthetic-test-fixture**. Injected-adapter tests are not live Groq calls.
- Credentials were checked only after implementation and credential-independent verification. No Groq key or development token was available. **Live synthetic smoke: not run. Live detection evaluation: not run. Live provider/model: none. Detection accuracy: not measured.** No fixture hit/miss or uncertainty totals are invented from mocks.
- Raw verification summaries: artifacts/live-ai-readiness-0.9.0-verification.json, artifacts/live-ai-evaluation-0.9.0.json and artifacts/packaged-install-verification-0.9.0.json. Reports contain no credentials, source text or model prose.
- Tested VSIX SHA-256: `1820a76ad993331cba8fd8a955b2c4098ec9abf326a1bbf391315c8c0bcdb366`. No deployment, marketplace publication, automatic fixes, target execution or local backups.
