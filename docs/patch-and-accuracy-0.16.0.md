# Patch proposals and accuracy evidence — 0.16.0

## Proposed edits

AI response contract 1.1.0 permits up to four exact, inclusive line replacements
in one file per finding. Each edit must target a submitted current-file chunk, match its
revision identifier, be covered by the finding's current-file references, and
include the exact submitted text. Overlapping edits, unsupported paths,
out-of-context edits and malformed replacements are rejected.

After the AI response, the local verifier checks that the saved lines still
match, rejects replacements recognized as credential-like, applies the edits
in memory and parses the candidate JavaScript/TypeScript. It also reports
supported static findings that remain after the proposed changes. Secret
redaction can make the model's expected text differ from the actual source; in
that case the patch is blocked rather than reconstructed or guessed.

The details page shows the exact old and replacement text. Nothing changes
until the user clicks **Apply this patch**. At apply time, Changeproof recollects
and compares the approved snapshot, rejects dirty or changed files, checks the
exact saved lines again, applies one VS Code workspace edit, saves it, and
reruns the deterministic local review. Failed preconditions leave files
unchanged. This is a convenience workflow, not a correctness guarantee:
parsing and static checks do not prove intended policy, runtime behavior,
successful tests or security. The app does not execute project code, tests,
scripts or AI-generated code.

The text suggestion remains available when no exact edit can safely be
proposed or applied. A human can inspect the finding, edit manually, or ignore
the suggestion.

## Deterministic rule benchmark

Run:

```sh
npm run evaluate:rules
```

The benchmark runs the production syntax analyzer on 24 small, labeled
JavaScript/TypeScript examples: six each for CP001–CP004, split between three
authored positive patterns and three negative controls per rule. The current
regression result is:

| Set | TP | FN | FP | TN | Accuracy | Precision | Recall | Specificity |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 24 authored syntax examples | 12 | 0 | 0 | 12 | 1.0000 | 1.0000 | 1.0000 | 1.0000 |

This is the benchmark's score, **not real-world rule accuracy**. The expected
labels are authored examples rather than independent adjudication, and the set
does not represent production code, project-wide behavior, or unmodeled syntax.
It is a measurable regression guard, not a security certification.

## AI evaluation metrics and limits

`npm run evaluate:ai -- --validate` validates the twelve committed AI fixtures
locally and sends no model requests. An explicitly approved live run reports a
binary confusion matrix, accuracy, precision, recall and specificity only for
valid responses to regression and safe-control fixtures. It reports scored
coverage alongside those numbers. Provider failures, throttling, schema or
reference failures, unattempted cases and insufficient-context fixtures do not
silently count as hits or misses. The regression score remains a category and
reference-range proxy, not a human judgment of model reasoning or security.

The latest recorded live trial is still partial: only two regression responses
were scoreable before two provider failures and throttling stopped the run.
Both matched the proxy, but no safe-control response was measured. It cannot
establish model accuracy, precision across safe code, or real-world detection
rates. No new live provider calls were made for this release. Expand the labeled
set and collect independently reviewed results before claiming general
precision or recall.

`npm run verify:fixtures` separately exercises the eight built-in behavioral
contracts using synthetic inputs. These are authored expected-behavior checks,
not arbitrary project execution and not an independent LLM accuracy score.
