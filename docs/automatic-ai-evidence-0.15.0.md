# Automatic checks on the app's LLM review — 0.15.0

Changeproof now checks its own optional LLM review automatically after a valid
response arrives. Users do not paste that response into the manual claim audit
or tell their personal Codex to check it. The existing sidebar, transmission
preview and explicit approval remain the entry point.

## User flow

1. Open Changeproof's shield sidebar and select the real project.
2. Expand **Optional AI**, choose the context profile and use its preview action.
   AI review still requires saved tracked JS/TS changes against Git HEAD, the
   configured backend and development access token. A committed, unchanged
   showcase has no eligible changes and will not produce a model request.
3. Inspect and approve the exact preview. The configured provider is called once.
4. Changeproof automatically performs independent local evidence checks and
   displays them under **Automatic local evidence checks** in the AI summary.
5. Open an AI finding directly from the summary, read its local status and click
   **Open cited evidence**. One existing results tab is reused.

The manual **Check assistant claims…** tool remains available for other pasted
completion messages. Normal **Scan project** remains a separate local review.

## Actual verification

The app validates response schema/identity and before/after references as before.
Its new bundled local verifier then reads only the submitted files, checks their
current SHA-256 identifiers and HEAD blob identities, and reproduces the redacted
submitted chunks from local content. Changed, replaced or mismatched input never
receives current corroboration. A final context collection checks for changes
during verification. Watchers and existing navigation fingerprint checks continue
to mark later edits stale.

The independent deterministic analyzer compares full local before/after contents
of the submitted files. It does not ask the model to judge itself. The report
uses two statuses:

| Status | Evidence |
| --- | --- |
| Partial static support | For a sensitive-data-exposure finding, CP002 independently reproduces a newly introduced authorization-header-shaped flow to console, with **every** recorded trace step inside the AI finding's cited after-ranges. |
| Unverified | No such independent match was established, or the finding concerns general access-control behavior. This does not refute the AI finding. |

Partial support concerns that narrow static pattern only. It does not prove the
entire model explanation, actual secrets, runtime reachability, impact or correct
application policy. Existing flows are not promoted to newly introduced
regressions. General access-control findings remain unverified. No-finding
responses and free-text summaries never become a security pass.

The checker also adds the existing 0.14 body observations for supported top-level
functions wholly contained in cited after-ranges. Empty or placeholder-shaped
bodies are observations, not proof of incorrect intended behavior. A filled body
is not a correctness pass. Imported/nested/method bindings remain unsupported.

## Boundaries

- No extra provider request, automatic retry, additional upload or model tool
  call. Groq keys remain server-side. No new live inference was performed while
  implementing this feature.
- No execution of target code, suggested commands, tests/builds or live
  infrastructure. The app cannot independently attest test success yet.
- At most the existing request's 8 submitted files are read, with the existing
  1 MiB per-file limit and a 16 MiB combined before/after local-content budget.
  The existing demo/full transmission limits are unchanged.
- The verifier is a trusted bundled CLI receiving JSON over stdin, not a shell
  command. Project hooks, plugins and code are not executed. Evidence checks do
  not log submitted code or model prose.
- A verifier failure leaves the valid model response visible with **evidence
  unavailable**. It does not create fabricated support or silently discard the
  model result. Cancellation remains explicit.
- Local evidence counts are not real-world accuracy, precision or recall. Mock
  providers remain labeled as mocks. Native visual appearance and Cursor have
  not been verified for this update.

See `artifacts/automatic-ai-evidence-0.15.0-verification.json` for actual checks.
