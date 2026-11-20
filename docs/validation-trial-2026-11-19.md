# Changeproof validation trial — November 19, 2026 (Pacific)

The existing 12-case fixture set was kept unchanged. Raw timestamps are UTC.
No real project or model-generated code was executed. No mock response is
counted as live model inference. No overall accuracy percentage is reported.

## Controlled behavior checks

Eight built-in cases with explicit contracts were checked in 24 controlled
function invocations. All eight declared contracts held:

| Fixture | Before | After |
| --- | --- | --- |
| Credential logging | Credential absent from captured logs | Credential appears in captured logs |
| Public response | Private field omitted | Private field included |
| Ownership | Bob blocked from Alice's document | Bob receives the body |
| Tenant boundary | Other tenant blocked | Other tenant receives the body |
| Four safe controls | Intended protections hold | Intended protections still hold |

Owner/matching-tenant positive controls were checked as well. The four
insufficient-context cases were not executed or assigned invented privacy
verdicts. These are fixture behavior checks under authored stub contracts,
not independent adjudication of every LLM claim or real-world security.

## Actual live Groq results

Model: openai/gpt-oss-120b. Full-profile production collector/API/provider path.
Only synthetic before/after code was submitted; expected labels were excluded.
Calls were sequential, paced 45 seconds between requests within each phase.

| Case | Result |
| --- | --- |
| R01 credential logging | HTTP 200; schema/references valid; expected category/range proxy matched |
| R02 private response | Transport failure; no usable verdict |
| S01 safe redaction | HTTP 200; valid response with no findings |
| R03 ownership | Connection/provider-unavailable failure; no usable verdict |
| Remaining eight | Not attempted |

Two valid responses, two request failures, eight unattempted cases. One safe
control was reached and no insufficient-context AI cases were reached. These
counts do not establish AI accuracy or a false-positive rate. No failed case was
retried. The harness's cancelled stop state records the runner's deliberate abort;
runner_stop_reason records the underlying failure. Later tool status was
"network approval was cancelled before a decision was returned". Live requests
were stopped rather than bypassing that restriction. No HTTP 429 was observed.

The continuation explicitly excluded both previously attempted cases. No more
than the original 12-case budget was used; only four distinct requests were
attempted. Both phases used the same unchanged fixture-set hash.

## Backend bug reproduced and fixed

The API allowed 45 seconds for model inference but configured a 20-second socket
idle timeout. A delayed local mock reproduced this independently:

| Configuration | Delayed response | Observed result |
| --- | --- | --- |
| Old 20-second socket timeout | 22 seconds | Client failed at about 20.0 seconds |
| Fixed 50-second socket timeout | 22 seconds | Valid response at about 22.0 seconds |

The socket budget now outlasts the configured provider deadline, with a small
reply margin. This proves the backend timeout bug and its controlled fix; it does
not prove that the bug caused every live network failure. The later live failure
remained a connection/approval problem and is not labelled a model miss.

## Local-rule scope

CP002 flags the credential-logging regression. The private-response, ownership
and tenant cases produced no local findings with unsupported coverage. Those
cases exceed the existing local rules; no finding does not mean safe. Most safe
and unknown fixtures also lie outside the local flow rule's supported syntax.

## Reproduction and scope

- `npm run verify:fixtures` checks our committed built-in fixture contracts only.
  It accepts `--out NEW_FILE` and refuses target-project arguments. node:vm is
  not an OS sandbox for untrusted code; this is not a new extension runtime scan.
- Evaluation now accepts explicit `--case-ids ID1,ID2` for selected built-in cases.
  IDs are validated, order/selection are recorded, and unknown/duplicate IDs are
  rejected. Selection changes neither fixture input nor expected answers.
- No automatic inference, retry, model fallback or real-project execution was added.

Verification: 159 tests passed, zero failed, zero skipped, including actual offline
Checkov. Backend build passed. No new extension UI or VSIX was needed for this
backend/evaluation change. The user's screenshot confirms dashboard rendering;
interaction in that window was not independently tested here.

Credentials from the supplied archive were read only in memory. Generated
temporary tokens were used for temporary backends. No env files were changed,
no credentials were printed/committed, and the temporary backends closed.

Source hashes, both live phases and source-free observations are retained in
artifacts/validation-trial-2026-11-19.json. The fixture/hash checks identify the
exact unchanged test set. Model prose is not persisted, so no independent semantic
adjudication of the full reasoning is claimed.
