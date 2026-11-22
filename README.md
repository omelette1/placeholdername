# Patch 0.20.0

**Review AI-written code. Check the evidence.** Scan saved code for supported security patterns,
check an assistant’s file/function claims, and inspect source quotations behind
AI findings. Patch separates matched source evidence from conclusions that still
need human review.

Start with **Scan project**, **Check an assistant answer**, or **Review code with
AI** in the sidebar. See the [demo guide](docs/demo-guide-0.20.0.md).

Review saved JavaScript/TypeScript and supported infrastructure configuration
in VS Code. Read potential issues, follow their evidence, and see what could
and could not be checked. Local review needs no account, server or LLM.
Optional AI review sends only an explicitly approved, bounded change preview
to your configured backend and model provider.

Optional AI responses now receive **automatic independent local evidence
checks** inside the app. No response copying or extra model call is needed.
The AI summary and finding details show partial CP002 support or unverified
claims, with body observations and cited navigation. See
[automatic AI evidence checks](docs/automatic-ai-evidence-0.15.0.md) for scope.

Every AI finding now includes locally checked, exact-source quote receipts
from current code and (when available) the baseline. Invented or out-of-context
quotes are rejected. A quote confirms only that exact text occurs at the stated
location; its interpretation and security conclusion remain unverified. See
[evidence receipts and accuracy](docs/evidence-receipts-and-accuracy-0.17.0.md).

AI findings can now include a bounded line-replacement proposal. Patch
checks the exact saved text and JavaScript/TypeScript syntax, shows the proposed
replacement, and applies it only when you click **Apply this patch**. It then
reruns the local static checks. This is not a behavior or security proof and
does not execute project tests or scripts.

## Demo profiles

For regular folders you can select directly, use
[samples/demo-projects](samples/demo-projects/README.md). Choose one issue-labeled
folder, select **Saved project files**, and click **Scan project**. No demo picker
or extension update is required for these source samples.


Expand **Try a sample project** and click **Choose a sample profile…**. Seven
isolated authored profiles cover header logging, password-shaped logging, a
safe logging control, TLS bypass, direct eval, an empty implementation claim,
and an ownership-check change outside local rule support. Each includes a
sample assistant answer and expected outcomes. See
[sample profiles](samples/profiles/README.md), [AI implementation](docs/ai-implementation.md)
and [slide sources](docs/presentation-sources.md).

## Sidebar controls

Click the **Patch shield icon** in the left Activity Bar. Choose a project
folder, select Saved project files or Changes since last commit, and click **Scan project**.
The Scan view has folder/mode controls, View scan results and Settings buttons, and
a Review code with AI section with a visible context-size dropdown and preview action.
Folder and mode persist for this workspace; changing options never starts a scan.
No Command Palette is needed for this normal workflow.

## Check an assistant's delivery claims

Choose a project in the sidebar and click **Check an assistant answer…**. Paste a
completion message, then click **Check claims**. This local audit compares
explicit file/function assertions with saved artifacts and, where available,
HEAD. It reports **matched**, **contradicted** or **unverified**, with clickable
saved evidence. It does not automatically read Codex or other assistants' chat.
The pasted response stays in memory and is cleared when the view is closed or
replaced. No model request or command execution is involved.

This is a bounded evidence check, not universal hallucination prevention.
Behavior, security and test-success claims remain unverified; a stub can satisfy
a function-presence check. Version 0.14 adds separate empty/placeholder body
observations and does not turn body presence into a behavioral pass. Unsupported prose is shown as unverified rather than
silently passed. See [supported assertions and validation](docs/claim-audit-0.13.0.md).
See [implementation evidence and remaining limits](docs/implementation-evidence-0.14.0.md).

## Review dashboard

Completed reviews now open **Patch Review** automatically in the existing
window: summary cards, searchable Code/Configuration filters, selectable findings
and an evidence trail with editor navigation. The sidebar remains a secondary
outline. Reopen the dashboard using **Patch: Open Review Dashboard** or its
layout toolbar button. One tab is reused for dashboard, finding and AI views.

## Use the extension

1. Install `artifacts/patch-local-0.20.0.vsix` using **Extensions: Install
   from VSIX…**. Reload the **existing** window once after updating.
2. Open the project folder you want to inspect. Save your files.
3. Click the **Patch shield icon** on the left, then select your project
   folder in the **Scan** view.
4. Choose **Saved project files** or **Changes since last commit** and click **Scan project**.
5. Use the automatically opened dashboard, select a finding, then click an
   evidence step in the reusable details panel to navigate and highlight it.

**Saved project files** (current-files mode) reviews eligible saved tracked/untracked JS/TS and supported
configuration. It works without Git or an initial commit. Newness is not
applicable because there is no baseline. **Changes since last commit** (HEAD) reviews saved
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
| Container image CVEs (opt-in) | Trivy high/critical CVEs for tagged or digested images available locally in Docker, using a previously cached vulnerability DB. Does not verify deployments or automatically fetch images. |
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

## Container image vulnerability checks (opt-in)

Patch now offers a separate, **disabled-by-default** check for known vulnerabilities in packages inside locally available Docker images. This complements Checkov configuration checks; it does not replace them. The feature scans image references in saved Dockerfiles and Kubernetes-style YAML in **Saved project files** mode only. It handles explicit tags and image digests; unsupported, templated or mutable references are marked skipped, not safe.

1. Install a trusted [Trivy](https://trivy.dev/) executable **outside the reviewed project**. Have Docker running, with the referenced images already pulled or built locally. Populate Trivy's vulnerability database separately when online; the Patch scan will not download one.
2. In VS Code **User settings** (not project settings), enable \`changeproof.scanContainerImages\`. Optionally set \`changeproof.trivyPath\` to the trusted executable's absolute path.
3. Open Patch, choose **Saved project files**, and run **Scan project**. Review the *Container images* section and high/critical CVEs in the same findings dashboard. The source location identifies the image reference, and the details identify the image, package, installed version, and any listed fixed version.

The CLI equivalent is:

\`\`\`sh
node packages/engine/src/cli.mjs /absolute/path/to/project --mode current --scan-images --trivy /absolute/path/to/trivy
\`\`\`

The Trivy invocation restricts image sources to local Docker and requests offline scanning, no database/check updates, and no telemetry. It is a **trusted external executable**, not an OS-level sandbox. At most eight distinct images and 120 high/critical findings are reported per scan. Missing images, a missing or incompatible vulnerability DB, missing Trivy, scanner failures, unsupported references, or changing source snapshots produce visible incomplete/not-assessed results instead of "clean". Database freshness is not verified; cached reports can miss recent CVEs.

This check **does not detect new memory-safety vulnerabilities**, prove that an image is running, prove exploitability or that a deployment is exposed, or inspect an unknown remote image without it being present locally. In particular, detecting the NGINX CVEs in a particular image requires actual package inventory and vulnerability DB coverage; mentioning NGINX in source alone is insufficient. No target project script is run.

## Optional AI setup

If your backend, Groq key and VS Code access token are already configured,
keep them. Start the backend from this checkout with `npm run start:review-api`.
Local Review Project works with the backend stopped.

For a fresh setup:

1. Run `npm run setup:local`. This creates/matches development access tokens in
   ignored server/evaluation env files and preserves an existing Groq key.
2. Put `GROQ_API_KEY` only in `services/review-api/.env`. Start the backend with
   `npm run start:review-api` (loopback port 4318 by default).
3. Run **Patch: Set AI Review Access Token** with the server's
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
npm run evaluate:rules
npm run verify:fixtures
```

`evaluate:rules` reports per-rule confusion metrics for 24 labeled, authored
synthetic syntax examples. Those are regression-test scores, not real-world
precision or recall. Live AI evaluation also reports proxy metrics only over
valid regression/safe-control responses, together with scored-case coverage;
failed, throttled, unattempted and insufficient-context cases are not silently
counted as correct or incorrect. See [evidence receipts and accuracy](docs/evidence-receipts-and-accuracy-0.17.0.md) and [patch checks](docs/patch-and-accuracy-0.16.0.md).

[Sidebar controls and verification](docs/sidebar-controls-0.12.0.md) describe the
new entry point and preserved consent boundaries.

To include the real optional scanner tests, set `CHANGEPROOF_TEST_CHECKOV` to the
trusted Checkov executable when running `npm test`. Tests use controlled fixtures
and mock AI; they do not establish model detection accuracy. Actual live Groq
evaluation is **partial** after throttling, documented in
[the existing live report](docs/live-verification-2026-11-19.md).

No general access-control proof, cross-file data flow, arbitrary framework
support, deployed-infrastructure scan, silent automatic fix or runtime exploit
test is implemented. Suggested patches require an explicit apply click and are
not correctness proofs. Cursor and remote editor hosts remain untested. Editor
API tests are not visual observation. Infrastructure isolation wraps a trusted
pinned Python tool; it is not an OS sandbox for arbitrary executables.

[Dashboard behavior and verification](docs/review-dashboard-0.11.0.md) ·
[Detailed policies, bounds and AI profiles](docs/feature-scope-0.10.0.md) ·
[Report schema](docs/report.schema.json) ·
[AI service](services/review-api/README.md)

The old React dashboard/FastAPI runner is preserved as historical work and is
not used by the current extension. See [legacy setup](docs/legacy-demo.md).
