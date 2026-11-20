# Evidence receipts and accuracy — 0.17.0

## What changed

AI contract 1.2.0 requires each finding to provide exact quotes from the
submitted source. It must quote at least one current after-change excerpt and
also quote non-empty before-change context when that context is cited. Quotes
are bounded to two per finding and 1,000 characters each. Each quote carries
its file, revision identity and inclusive line range and must be covered by the
finding's validated references.

The local verifier independently matches each quote against the actual saved
file or Git baseline after validating the submitted snapshot hashes. Invented,
altered, stale, uncited or out-of-range quotes fail closed. The finding page
shows the matched text and can navigate to the corresponding current source
reference.

**A quote receipt proves only that the exact text occurs at the stated location
in the checked snapshot.** It does not prove that the model's interpretation
follows from that text, that its policy assumptions are correct, or that a
finding is exploitable. AI narrative, security impact and patches remain
unverified unless independently established. The extension does not execute
project code or tests. Missing findings do not establish safety.

## Current controlled results

Run `npm run evaluate:rules` for the deterministic CP001–CP004 benchmark:

| Set | TP | FN | FP | TN | Accuracy | Precision | Recall | Specificity |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 24 authored rule examples | 12 | 0 | 0 | 12 | 1.0000 | 1.0000 | 1.0000 | 1.0000 |

Run `node evaluation/claims-benchmark.mjs` for the local claim-auditor's
24 authored templates: 24/24 expected outcomes (7 narrow matches, 5
contradictions, 12 unverified). Unverified is an intended safe outcome for
unsupported prose, behavior and execution claims; it is not counted as truth.

These are regression checks on deliberately authored examples, **not estimates
of real-world accuracy**. They do not measure accuracy of the AI model, the
meaning of quote-to-claim relationships, the overall product or patch
correctness. Do not present either 100% fixture score as a production accuracy
claim.

The latest recorded live AI trial remains partial: two valid regression
responses matched the category/reference-range scoring proxy before provider
failures and throttling stopped the run. There was no scored safe-control
response. No live model call was made for this release. Real-world LLM
detection accuracy remains **unmeasured**; collecting a representative,
independently adjudicated test set is required to estimate it.
