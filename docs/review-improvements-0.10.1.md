# Focused source review — 0.10.1

The uploaded source was compared byte-for-byte with every tracked file in
GitHub commit 3791a03d3745f6147438e9dd639987ffe44d060a. No tracked differences
were found. Local env files, uploaded dependencies, Git metadata and generated
packages were not used as source inputs. Existing 0.10.0 functionality and
macOS compatibility changes are retained.

## Changes

- Evidence navigation now verifies the saved input fingerprint before and after
  asynchronous document opening/reveal. Highlighting also verifies every
  selected evidence file. Same-length edits invalidate evidence even before
  watcher delivery. Stale state clears diagnostics and decorations; it never
  starts a review automatically.
- Navigation is bound to the current selection token across asynchronous calls,
  including reselection of the same finding. A superseded AI navigation cannot
  mark a newer selection stale. These checks cover local and AI evidence.
- AI redaction now handles quoted object keys, snake-case credential names,
  escaped delimiters and multiline literal values while preserving UTF-16
  line/column offsets. This remains best effort, not a guarantee that all
  secrets or personal data are removed. Existing exact preview/approval is kept.
- Added Review Project / Rerun toolbar and sidebar actions. The toolbar count
  says findings and identifies CP002 coverage instead of implying that every
  warning is a proven exposure.
- Replaced contradictory release-by-release root/extension README instructions
  with one current install, use and optional-backend flow. Prior detailed
  milestone documents and Git history are preserved.

No new detection claims, cloud uploads, live provider requests, deployment,
automatic fixes or target code execution are introduced. No VS Code windows
are launched as part of this change. Report schema remains 5.0.0; AI contract
remains 1.0.0. Only tool/package version advances to 0.10.1.

## Verification

Results are recorded in artifacts/review-0.10.1-verification.json after the
implementation checks complete. Automated editor API checks use a mock VS Code
API with the real bundled collector/CLI and a local HTTP mock model provider;
they are not a native installed-editor or visual check. Existing real Groq
results remain partial and unchanged. Cursor is untested.

## Install this update

Install artifacts/changeproof-local-0.10.1.vsix using Extensions: Install from
VSIX…, reload the existing window once, and select Review Project → Current
files. Keep existing user settings, Checkov installation and local env files.
The normal source patch does not include credentials, dependencies or Git metadata.
