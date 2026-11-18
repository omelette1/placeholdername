# Changeproof

A local, desktop-first access-regression review tool. Start with **code change → expected behavior → observed evidence**. Only the bundled synthetic document-sharing target is executable.

## Setup

Requires Python 3.11+ and Node 20.19+ (or 22.12+).

```sh
cd /Users/owen/Downloads/changeproof
python3 -m venv .venv
.venv/bin/pip install -r requirements.lock.txt
cd apps/dashboard
npm ci
```

In one terminal, from the repository root:

```sh
.venv/bin/python -m uvicorn services.api.main:app --host 127.0.0.1 --port 8000
```

In a second terminal:

```sh
cd apps/dashboard
npm run dev
```

Open http://127.0.0.1:5173. Confirm the rule, save it, then run the comparison. Baseline should pass all six steps; changed should fail the removed-collaborator read (200 with matching private content instead of 403). Owner access must pass in both. These are **expected outcomes, not pre-recorded results**. The UI starts empty and only displays actual saved executions. The user confirms the rule in the UI; automated checks confirm it only in disposable test databases.

Runs persist in `changeproof.sqlite3`; optional `CHANGEPROOF_DB` selects an alternate SQLite path. Historical runs retain their rule, diff, source hashes, test definition, and redacted evidence. Select an older run to inspect its source snapshot. Rerun executes the saved fixed test against current bundled source. To verify a repair manually, change `changed.py` to revoke the grant and rerun; historical failures remain available. No automatic patching occurs.

## Verification

```sh
# repository root
.venv/bin/python -m pytest tests/test_milestone.py -q
cd apps/dashboard
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser tests start their own API and Vite servers on 8000/5173; stop manual servers first. They use `/tmp/changeproof-browser-tests.sqlite3`, separate from application history. The suite asserts both the baseline pass and deliberate changed failure, owner controls, evidence redaction, persistence, confirmation gating, local-origin restriction, and execution-error handling. A failing target check is expected; the verification suite passes when it correctly detects that failure. Browser screenshot is generated at `apps/dashboard/test-results/review.png`.

## Scope and limitations

This is a trusted local prototype. Target isolation uses separate subprocesses and temporary SQLite databases, not containers or a hardened sandbox. Synthetic bearer credentials stay server-side; evidence stores status, actor label, path, expected status and content equality only. Private document bodies, auth headers and target logs are not persisted. Local API access is unauthenticated and intended only for this workstation. No arbitrary code uploads, external target URLs or repositories are accepted.

No AI calls, GitHub integration, billing, security score, automatic patches or broad scanning. The demo target exposes an HTTP API, not a separate document-editor UI. Failure to start a target produces an error rather than a fabricated finding. A matching deleted SQL line supports a suspected cause; behavioral evidence alone does not establish causality. Passing checks are not proof that the whole application is secure.

See [architecture](docs/architecture.md), [related work](docs/related-work.md), and [verification report](docs/verification.md).
