# Changeproof Local Review — 0.18.0

Review saved JS/TS and supported infrastructure configuration in this VS Code
window. Click the **Changeproof shield icon** in the left Activity Bar. The
**Scan** view has a project-folder selector, review-mode dropdown, **Scan project**,
**Open results** and **Settings** buttons. **Optional AI** includes its context-size
dropdown, backend check/setup and preview action. Folder/mode choices persist
for the workspace; options never trigger an automatic scan.

**Check assistant claims…** compares supported completion-message assertions
with local saved file/function evidence. Named functions also receive separate
body observations: empty bodies, bare returns, explicit placeholder throws,
literal returns or other body content. A declaration match is not a behavior
pass. Implementation, tests/build success and general security claims remain
unverified without independent behavioral/execution evidence. No chat history
is read automatically and no pasted command or target code is executed.

A completed review now automatically opens a dashboard with summary
cards, searchable findings and evidence controls. Reopen it with
**Changeproof: Open Review Dashboard**; one tab is reused. Choose **Current files** or **Changes since HEAD** in the sidebar, click
**Scan project**,
and click findings to inspect and navigate their recorded evidence.

Current files works without Git or a commit and includes eligible untracked
files. Changes mode compares tracked saved JS/TS with HEAD. The reusable details
panel and labeled code highlights show supported sources, assignments, helper
calls, parameters, logging and configuration locations. Results become **STALE**
after edits; save and explicitly rerun using the refresh button. Saved snapshots
are also checked during navigation/highlighting without relying on watcher timing.

CP001–CP004 are bounded static checks, not confirmed leaks or malicious code.
Optional trusted Checkov 3.4.5 checks ten policies across Terraform, Kubernetes,
Dockerfiles and GitHub Actions in Current files mode. Its status is separate
from CP002 coverage. Missing tools and unsupported input are explicit.

**AI Review Changes** is optional. It requires a local/HTTPS review backend,
SecretStorage development token and tracked changes against HEAD. It previews
the exact redacted bounded payload before approval. The Groq key stays on the
backend. No automatic uploads or silent fixes, target execution or
live-infrastructure access. No findings does not establish safety; review
coverage and limitations.

After an approved AI response, the app automatically checks its cited snapshots
locally and compares eligible logging claims with CP002. The AI summary/details
show partial static support or unverified claims and function-body observations.
Click findings directly in the summary and follow cited evidence. No manual
response copying, extra model call or target-code execution is involved. General
access-control claims, summaries and test success remain unverified.

Each AI finding also carries exact-source quote receipts. The extension matches
the quote to the approved saved snapshot and clickable source range; fabricated
or out-of-context quotes are rejected. This verifies quotation only, not the
meaning or security correctness of the finding.

Suggested AI edits are bounded line replacements checked against the exact
saved text and JavaScript/TypeScript syntax. Review the before/after preview and
click **Apply this patch** to apply and save; Changeproof then reruns local
static checks. It does not execute project tests or claim the patch is correct.

Install `changeproof-local-0.18.0.vsix`, reload the existing window once, and
review your project. Trusted Node 20.19+ is required; configure user-level
`changeproof.nodePath` / `changeproof.checkovPath` if needed. Normal reviews do
not open additional editor windows or create demos. **Run Demo** remains a
separate optional command. Cursor/remote hosts remain untested.

See the repository README for current setup and supported behavior; the
historical milestone reports document their own verification scope.
