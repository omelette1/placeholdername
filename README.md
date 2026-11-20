# Changeproof 0.13.0

Review saved JavaScript/TypeScript and supported infrastructure configuration
in VS Code. Read potential issues, follow their evidence, and see what could
and could not be checked. Local review needs no account, server or LLM.
Optional AI review sends only an explicitly approved, bounded change preview
to your configured backend and model provider.

## Sidebar controls

Click the **Changeproof shield icon** in the left Activity Bar. Choose a project
folder, select Current files or Changes since HEAD, and click **Scan project**.
The Scan view has folder/mode controls, Open results and Settings buttons, and
an Optional AI section with a visible context-size dropdown and preview action.
Folder and mode persist for this workspace; changing options never starts a scan.
No Command Palette is needed for this normal workflow.

## Check an assistant's delivery claims

Choose a project in the sidebar and click **Check assistant claims…**. Paste a
completion message, then click **Check claims**. This local audit compares
explicit file/function assertions with saved artifacts and, where available,
HEAD. It reports **matched**, **contradicted** or **unverified**, with clickable
saved evidence. It does not automatically read Codex or other assistants' chat.
The pasted response stays in memory and is cleared when the view is closed or
replaced. No model request or command execution is involved.

This is a bounded evidence check, not universal hallucination prevention.
Behavior, security and test-success claims remain unverified; a stub can satisfy
a function-presence check. Unsupported prose is shown as unverified rather than
silently passed. See [supported assertions and validation](docs/claim-audit-0.13.0.md).

## Review dashboard

Completed reviews now open **Changeproof Review** automatically in the existing
window: summary cards, searchable Code/Configuration filters, selectable findings
and an evidence trail with editor navigation. The sidebar remains a secondary
outline. Reopen the dashboard using **Changeproof: Open Review Dashboard** or its
layout toolbar button. One tab is reused for dashboard, finding and AI views.

## Use the extension

1. Install `artifacts/changeproof-local-0.13.0.vsix` using **Extensions: Install
   from VSIX…**. Reload the **existing** window once after updating.
2. Open the project folder you want to inspect. Save your files.
3. Click the **Changeproof shield icon** on the left, then select your project
   folder in the **Scan** view.
4. Choose **Current files** or **Changes since HEAD** and click **Scan project**.
5. Use the automatically opened dashboard, select a finding, then click an
   evidence step in the reusable details panel to navigate and highlight it.

**Current files** reviews eligible saved tracked/untracked JS/TS and supported
configuration. It works without Git or an initial commit. Newness is not
applicable because there is no baseline. **Changes since HEAD** reviews saved
tracked JS/TS against HEAD; it lists untracked files without analyzing them.
Infrastructure comparison against HEAD is unsupported: use Current files.

Normal reviews reuse the same window and never create samples or commits.
**Run Demo** is separate and optional. Changes invalidate results; save and
click **Rerun reviewed folder** or the refresh toolbar button. There are no
automatic review loops. A delayed watcher event cannot authorize stale evidence:
navigation/highlighting also check the saved snapshot directly.

## What it checks

| Check | Supported behavior |
| --- | --- |
| CP001 | Direct console arguments with sensitive-looking names; name-based hypothesis only. |
| CP002 | Authorization-header reads through simple assignments and directly resolved same-file helper calls, at most three calls deep. Evidence includes arguments, calls, parameters and logging. |
| CP003 | Explicit Node TLS verification disablement using supported environment assignments or inline HTTPS options. |
| CP004 | Direct, unshadowed built-in `eval` / `Function` calls; input exploitability is unknown. |
| Infrastructure | Ten curated Checkov policies for Terraform, Kubernetes YAML, Dockerfiles and GitHub Actions; current saved configuration only. |
| Optional AI | Bounded before/after tracked JS/TS changes: possible logging/response exposure and weakened access checks, with validated reference ranges and stated assumptions. |

Coverage applies specifically to the bounded CP002 analysis, not every security
property. Infrastructure and AI have separate status/limitations. No findings
is not proof of safety. No target application, package script, configuration
plugin or live cloud infrastructure is executed or accessed.

## Local prerequisites and build

Development/build: Node 22+. Packaged runtime: trusted Node 20.19+.
Changes/AI review requires Git supporting `--no-lazy-fetch`; current-files
review falls back to local ignore parsing without usable Git. Executable paths
come from user settings, never target workspace settings.

```sh
npm ci --ignore-scripts
npm run package:extension
```

Install the resulting VSIX as above. If Node is unavailable to the extension
host, set the user-level `changeproof.nodePath` to its trusted absolute path.
No Marketplace publication is required.

For optional infrastructure checks, install **Checkov 3.4.5** outside projects
being reviewed, then set user-level `changeproof.checkovPath` to that executable.
It never installs itself during a review. Missing or incompatible Checkov is
shown as **not assessed**; code checks remain available.

```sh
python3 -m venv "$HOME/.local/share/changeproof/checkov"
"$HOME/.local/share/changeproof/checkov/bin/python" -m pip install checkov==3.4.5
```

CLI (machine JSON on stdout):

```sh
node packages/engine/src/cli.mjs /absolute/path/to/project --mode current
# Optional explicit trusted scanner:
node packages/engine/src/cli.mjs /absolute/path/to/project --mode current --checkov /absolute/path/to/checkov
# Requires Git HEAD:
node packages/engine/src/cli.mjs /absolute/path/to/project --mode changes
```

Report schema is **5.0.0**. Exit 0 / `analysis_complete` describe completion of
the code-processing path, not clean security or complete infrastructure
coverage. Inspect `infrastructure.status` / `infrastructure.errors` separately.

## Optional AI setup

If your backend, Groq key and VS Code access token are already configured,
keep them. Start the backend from this checkout with `npm run start:review-api`.
Local Review Project works with the backend stopped.

For a fresh setup:

1. Run `npm run setup:local`. This creates/matches development access tokens in
   ignored server/evaluation env files and preserves an existing Groq key.
2. Put `GROQ_API_KEY` only in `services/review-api/.env`. Start the backend with
   `npm run start:review-api` (loopback port 4318 by default).
3. Run **Changeproof: Set AI Review Access Token** with the server's
   `REVIEW_ACCESS_TOKEN`, not its Groq key. It is stored in VS Code SecretStorage.
4. Run **AI Review Changes**, inspect the exact redacted payload, profile and
   destination, then explicitly approve transmission if appropriate.

The default **demo** profile bounds context and generation to reduce provider
usage; throttling is still possible. There are no automatic retries or model
fallbacks. Redaction supports recognized tokens and credential literals,
including quoted object keys and escaped/multiline values, but is best effort.
Inspect the entire preview; names and paths can disclose information too.
Keep `.env` files out of project archives and Git. The local API uses development
authentication; it is not a public multiuser service.

## Verification and limits

```sh
npm run build:extension
npm test
npm run build:review-api
npm run evaluate:ai -- --validate
```

[Sidebar controls and verification](docs/sidebar-controls-0.12.0.md) describe the
new entry point and preserved consent boundaries.

To include the real optional scanner tests, set `CHANGEPROOF_TEST_CHECKOV` to the
trusted Checkov executable when running `npm test`. Tests use controlled fixtures
and mock AI; they do not establish model detection accuracy. Actual live Groq
evaluation is **partial** after throttling, documented in
[the existing live report](docs/live-verification-2026-11-19.md).

No general access-control proof, cross-file data flow, arbitrary framework
support, deployed-infrastructure scan, automatic fix or runtime exploit test
is implemented. Cursor and remote editor hosts remain untested. Editor API tests
are not visual observation. Infrastructure isolation wraps a trusted pinned
Python tool; it is not an OS sandbox for arbitrary executables.

[Dashboard behavior and verification](docs/review-dashboard-0.11.0.md) ·
[Detailed policies, bounds and AI profiles](docs/feature-scope-0.10.0.md) ·
[Report schema](docs/report.schema.json) ·
[AI service](services/review-api/README.md)

The old React dashboard/FastAPI runner is preserved as historical work and is
not used by the current extension. See [legacy setup](docs/legacy-demo.md).
