# Verification report — 2026-11-16

Real local executions, not seeded findings. Application history remains empty until a user confirms the rule and runs a comparison. Automated confirmations were made only in disposable test databases.

| Check | Observed result |
| --- | --- |
| Baseline collaborator read after removal | 403, expected 403; pass |
| Changed collaborator read after removal | 200, expected 403, private content equality true; intentional failure detected |
| Collaborator before removal | 200 with matching content in both |
| Owner after removal | 200 with matching content in both |
| Repaired policy in temporary copy | 403 after removal; owner access remains 200 |

Validation commands: `python -m pytest tests/test_milestone.py -q` (4 passing tests); `npm run build` (TypeScript and Vite successful); `npm run test:e2e` (1 passing Chromium workflow). Tests cover confirmation gating, Host/Origin restrictions, persistence across client restart, reruns, redacted evidence, execution error without saved finding, and a repair in a temporary policy copy. Playwright covers confirmation through comparison, intentional failure display, rerun and reload. Screenshot: `apps/dashboard/test-results/review.png` (automated test execution).

One dependency warning: Starlette's TestClient reports its httpx adapter deprecated in favor of httpx2. Tests currently pass; migration remains dependency maintenance work.

Limitations: fixed scenario, HTTP demo target, loopback processes rather than hardened containers, no multi-user authentication, no external version ingestion, no general privacy/correctness/performance scanning. A source-based cause is explicitly a hypothesis. Passing checks do not prove application-wide security. Automated repair verification is demonstrated by the test's temporary policy copy; the product repair flow is manual edit and rerun.

Existing sibling projects were preserved. No hosting, external integrations, AI calls or automatic patches were added.
