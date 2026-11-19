# Live verification — 2026-11-19 UTC

Provider/model: **Groq / openai/gpt-oss-120b**. Source checkout and unchanged fixture baseline: 9e4891c8ebf080886725d4c135769339b332567a. No additional VS Code windows, workspace/private source uploads, target execution, automatic fixes, deployment or publication. No backup copies.

The supplied root GROQ_KEY was moved into the ignored backend configuration as GROQ_API_KEY. Matching development tokens were generated without displaying them. Provider key remains backend-only; the CLI env holds only the development token/URL. All env files have owner-only permissions and remain excluded from Git.

## Actual live outcomes

The initial HTTP smoke check failed with provider_configuration. One direct provider diagnostic using the same synthetic example returned parseable JSON, without persisting provider contents; it did not reproduce the error. A separately recorded complete HTTP smoke check then **passed** schema and reference validation on the **same model** at 2026-11-19T07:10:03.121Z. Its single-example category/range signal was observed; this is not an accuracy measurement. The original rejection remains recorded and its exact cause is unknown. No implementation changes or automatic retry logic were used.

The evaluation was launched **once**, sequentially, with a **12-request cap** and no retries/fallback. It stopped on the first provider throttle after **5 attempts**:

| Fixture | Observed result |
| --- | --- |
| R01 authorization-header logging | Request/provider failure; not a detection miss |
| R02 private response data | Valid response; expected category/range proxy matched |
| R03 owner check | Valid response; expected category/range proxy matched |
| R04 tenant check | Request/provider failure; not a detection miss |
| S01 safe redaction | Provider throttled; no valid assessment |
| Remaining 7 cases | Not attempted after throttle |

Thus two of the four regression fixtures have valid responses, both matching the rubric proxy. **No safe-control or insufficient-context outcomes were measured.** No accuracy percentage or production-security claim is warranted. The two provider failures are separate from misses. The existing harness did not retain their underlying provider error bodies/codes, so no specific cause is invented. The fixture expectations and prompt were not modified.

Total outbound provider attempts: **8** (initial smoke, one diagnostic, confirmed smoke, five evaluation cases). No additional calls were made after the evaluation throttle. No source text, model prose, prompts or credentials are in these reports.

All **114 regression tests passed** with external inference blocked in ordinary tests. Product source and the existing 0.9.0 VSIX are unchanged; this delivery adds only actual verification records/documentation. The backend is stopped after verification; local configuration is retained. To use it later, run npm run start:review-api. Do not automatically rerun evaluation when throttled; inspect your provider limits before explicitly choosing another run.

Reports: [complete verification](../artifacts/live-verification-20261119T071102Z.json) and [raw evaluation summary](../artifacts/live-evaluation-20261119T071051Z.json). Earlier not-run records remain intact as historical results.
