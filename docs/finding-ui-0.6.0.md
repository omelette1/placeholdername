# Finding UI — 0.6.0

This milestone presents existing schema 3.0.0 evidence. CP001/CP002 detection, coverage logic, HEAD comparison and privacy boundaries are unchanged. The engine's version string is updated; its analysis implementation is preserved.

## Try it

After installation, accept VS Code's reload prompt once if an older version is loaded. Press Command-Shift-P and run **Changeproof: Run Demo**. The extension creates its own synthetic baseline in dedicated extension storage and opens the logging expression plus **Changeproof Finding Details**. It does not switch workspace folders or modify your actual project.

In Explorer → **Changeproof Local Review**, expand:

- **Review** for the exact folder, demo/workspace identity and processing/stale state.
- **Findings (N)** for potential exposures only. Clicking a finding opens its details panel.
- **Coverage**, **Limitations**, **Setup / processing errors**, and **Skipped / untracked** for their own categories.

The details panel shows the engine's explanation, rule, logging location, HEAD comparison/newness, aggregate and file/scope coverage, limitations and runtime-verification status. CP002 has Source → Assignment → Logging buttons. Click a step to open its exact file and select its recorded range. CP001 remains name-based syntax evidence; no header-source path is invented for it.

Selecting a finding adds restrained native decorations with SOURCE, ASSIGNMENT and LOGGING text labels. Changing selection, closing details, replacing the review or changing workspace folders clears the prior highlighting.

Edit a reviewed file to see **STALE**. Diagnostics/highlights clear and step navigation is disabled. Save the file, then explicitly use **Rerun this review explicitly** in the details panel or **Changeproof: Rerun Reviewed Folder**. Select a finding from the new review. No automatic rerun occurs. The ordinary Review Local Changes command still targets the selected workspace; Rerun Reviewed Folder explicitly retains the prior review target, including a demo.

## Safety

All code-derived strings are HTML-escaped; the webview uses a nonce-restricted script/style CSP, `default-src 'none'`, no local resource roots and no command URI links. Messages contain only a current review/selection identifier and a step index. A message cannot supply a file path. The host resolves the step from the engine evidence, validates repository containment, rejects symlinks and validates positions against the actual document before opening it. Prior review IDs and prior selection messages are rejected.

No new rules, infrastructure checks, AI calls, uploads, telemetry, target execution or automatic edits were added. Native filesystem observation is used only for stale-state tracking. Existing tracked-file metadata distinguishes delayed pre-review notifications from actual post-review edits. No content hashing or recursive project scan is added by the UI.

## Verification and limits

Automated Node tests cover sidebar grouping; empty/loading/partial/error states; actual installed-CLI adapters; HTML/CSP and unusual filenames/identifier text; source/assignment/log selection; invalid and out-of-range targets; symlink changes; selection/review replacement; old message rejection; editor/filesystem stale events; explicit reruns; and delayed filesystem notifications.

The separate packaged-install test uses a clean VS Code profile and installs the actual VSIX. It forwards native VS Code factories while capturing their returned objects, verifies native tree commands and details-webview creation, navigates to actual editor ranges, observes stale state after a native editor edit, reruns explicitly and preserves Run Demo. It compares the test workspace's files and Git state before/after demo execution.

These native API/host assertions are **not visual observation**. No manual mouse-click, rendered-layout, decoration-color, screen-reader or webview-paint verification is claimed. Webview message wiring is tested with mocked messages; installed-host navigation invokes the same registered handler. Cursor remains untested.

Watchers are conservative: changes elsewhere in a reviewed repository can require a rerun. Reads are not atomic. Linked-worktree metadata outside the root, remote environments and all OS/filesystem edge cases are not fully tested. Snapshot locations are intentionally unusable once stale; no attempt is made to remap them automatically. Passing checks and zero findings never establish project-wide security.

Commands:

```sh
npm run package:extension
npm test
node extensions/vscode/test/run-host.mjs '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code' artifacts/changeproof-local-0.6.0.vsix
```

The artifact is local and unsigned; nothing is published to a marketplace. Final counts and the installed-host outcome are recorded in `artifacts/ui-0.6.0-verification.json` and `artifacts/packaged-install-verification.json`.

## Final results

- Build and VSIX packaging passed; **64 automated tests passed**.
- Separate installed-VSIX host assertions passed on **VS Code 1.142.0 / macOS arm64**, including native panel creation, sidebar groups, navigation selections, stale dirty edits, explicit rerun, empty/error states and Run Demo.
- The host run exposed two native-event differences that were corrected and regression-tested: delayed pre-review filesystem notifications and separate dirty-state events with no contentChanges.
- Detection implementation hashes match 0.5.0 after accounting for the version-string-only update. Existing rules and report schema are unchanged.
- **No visual observation is claimed. Cursor remains untested.** The normal-profile installed-file and settings checks are in the final verification artifact.
