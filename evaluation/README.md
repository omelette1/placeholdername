# Synthetic detection evaluation

This evaluates Changeproof's existing prompt/provider path, not a separate judge model. Fixtures and expected answers are version-controlled synthetic data. `before.ts`/`after.ts` are collected using the production context collector in disposable Git repositories containing only one synthetic `app.ts`. These repositories are fixture construction, never a user's project or backup. Source files are read as text, never executed. `expected.json` is scoring metadata and is never copied to the temporary repository or sent to the model.

Live execution requires an explicit `--live`, an explicit `--max-requests N` (1–12), an authenticated configured backend using Groq, and a matching expected model. Calls are sequential, with no retries or fallback. Throttling stops the run immediately; unattempted cases are not counted as misses. Ordinary npm test uses only local mock services/transport fixtures and never external inference. Reports retain identifiers, category/range proxy outcomes and counts, not source, prompts, responses, model prose or credentials.

Commands and actual results will be documented after implementation verification. No accuracy claim can be made from scripted mock responses.

## Run and interpret

Use `npm run evaluate:ai -- --validate` for local fixture collection (no model requests). For an already-running Groq backend, set REVIEW_ACCESS_TOKEN in the environment and run `npm run evaluate:ai -- --live --max-requests 12 --model openai/gpt-oss-120b --out artifacts/live-evaluation-UNIQUE-DATE.json`. Fixture files must be committed and unchanged. The CLI refuses mock or different-model backends. It never overwrites an existing report. See docs/live-ai-readiness-0.9.0.md for credential setup and limits.

Actual 0.9.0 verification: all 12 fixtures collected and 114 automated tests passed. Full HTTP path was tested with an injected provider transport only. Live smoke and detection evaluation were **not run** because no Groq key was available. No mock-derived accuracy is reported. Actual summaries are in artifacts/live-ai-evaluation-0.9.0.json and artifacts/live-ai-readiness-0.9.0-verification.json.
