# Synthetic detection evaluation

This evaluates Changeproof's existing prompt/provider path, not a separate judge model. Fixtures and expected answers are version-controlled synthetic data. `before.ts`/`after.ts` are collected using the production context collector in disposable Git repositories containing only one synthetic `app.ts`. These repositories are fixture construction, never a user's project or backup. The AI collection path reads source files as text and never executes them. The separate internal fixture-contract command described below executes only the reviewed built-in cases with complete contracts. `expected.json` is scoring metadata and is never copied to the temporary repository or sent to the model.

Live execution requires an explicit `--live`, an explicit `--max-requests N` (1–12), an authenticated configured backend using Groq, and a matching expected model. Calls are sequential, with no retries or fallback. Throttling stops the run immediately; unattempted cases are not counted as misses. Ordinary npm test uses only local mock services/transport fixtures and never external inference. Reports retain identifiers, category/range proxy outcomes and counts, not source, prompts, responses, model prose or credentials.

Commands and actual results will be documented after implementation verification. No accuracy claim can be made from scripted mock responses.

## Run and interpret

Use `npm run evaluate:ai -- --validate` for local fixture collection (no model requests). For an already-running Groq backend, set REVIEW_ACCESS_TOKEN in the environment and run `npm run evaluate:ai -- --live --max-requests 12 --model openai/gpt-oss-120b --out artifacts/live-evaluation-UNIQUE-DATE.json`. Fixture files must be committed and unchanged. The CLI refuses mock or different-model backends. It never overwrites an existing report. See docs/live-ai-readiness-0.9.0.md for credential setup and limits.

Actual 0.9.0 verification: all 12 fixtures collected and 114 automated tests passed. Full HTTP path was tested with an injected provider transport only. Live smoke and detection evaluation were **not run** because no Groq key was available. No mock-derived accuracy is reported. Actual summaries are in artifacts/live-ai-evaluation-0.9.0.json and artifacts/live-ai-readiness-0.9.0-verification.json.

## Verify the authored fixture contracts

`npm run verify:fixtures` executes only the eight reviewed, committed synthetic
fixtures with complete policy/classification contracts. It checks actual
before/after logging, response projection, ownership and tenant behavior, plus
positive/safe controls. It makes 24 controlled function invocations. The four
missing-context cases are not given invented runtime verdicts.

This is an internal test-set check, not a runtime scanner feature. It accepts no
target-project input, does not run selected/uploaded projects or model-generated
code, and is not imported by the extension. node:vm is not a security sandbox for
untrusted code. No inference request is made by this command. The check confirms
fixture behavior under stubbed contracts, not every LLM interpretation or real-world
accuracy. Use `--out NEW_FILE` to retain its source-free JSON result.

## Select built-in cases explicitly

`--case-ids S01-safe-redaction,U01-unknown-fields` selects and orders exact built-in
cases. It does not accept paths or arbitrary source, and duplicate/unknown IDs
are rejected before sending. Reports retain the full fixture-set hash, explicit
selection and unattempted count. This supports continuing with previously
unattempted cases without silently retrying failures or counting old results as
new calls. Request caps, exact-model checks and no-retry/no-fallback behavior
remain unchanged. See docs/validation-trial-2026-11-19.md for the actual trial.
