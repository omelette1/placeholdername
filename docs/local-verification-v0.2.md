# Local foundation verification — 2026-11-17

This report describes tests actually run against synthetic local fixtures. It is not a security assessment of a user repository. Reviewed code was not executed; all engine reports retain `runtime_verification: false`.

## Engine and adapter

- `npm run build:extension`: successful; the bundled CLI contains the shared engine and parser, with no target-project runtime dependencies.
- `npm test`: 21 passing Node tests. Covered staged, unstaged, mixed, no net change, untracked, staged deletion with leftover untracked copy, absent HEAD, non-Git directory, tracked additions/deletions, binary files, exclusions, oversize and symlink skips, malformed syntax, JS/TS/JSX/TSX variants, comments/strings, duplicate/pre-existing logging, multiline changed arguments, label-only changes, and structured-output JSON Schema validation.
- Repository byte snapshots before/after review matched, including the Git index and object storage in staged/unstaged/mixed fixtures.
- Synthetic command sentinels confirmed that fsmonitor, clean filters, textconv/external diff commands and a promisor remote were not invoked. A missing local blob produced an error without lazy fetching.
- Extension adapter tests launched the actual bundled CLI, received a real CP001 finding and location, handled structured non-Git errors, rejected invalid schemas/escaped locations, and reported a missing Node executable as failure.

## Editor compatibility

| Editor | Actual verification | Status |
| --- | --- | --- |
| VS Code 1.142.0, macOS arm64 | Isolated real Extension Development Host: extension discovery/activation; command invocation through the bundled CLI; warning diagnostic at the added line; native file/line navigation; no-change diagnostic clearing; parse-error handling | Tested for this basic workflow |
| Cursor | No Cursor host was run | **Untested**; compatibility goal only |
| Other VS Code versions, Windows/Linux editor hosts, Remote/SSH/Containers | Not exercised | Untested |

The host harness requires an explicit successful assertion record; merely launching VS Code or receiving exit 0 is not counted as success. The test uses a separate synthetic worktree, extension directory and user profile with telemetry/updates disabled. It does not install into or modify the user's VS Code profile. Native navigation was exercised programmatically; manual mouse interaction, accessibility review, multi-root folder selection, and persistent local-directory installation were not tested in the editor host.

Reproduce from the repository root:

```sh
npm ci --ignore-scripts
npm run build:extension
npm test
node extensions/vscode/test/run-host.mjs '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'
```

Toolchain used: Node 26.5.0, Git 2.55.0. Setup downloads packages; the installed CLI/extension analysis path has no network calls, telemetry, source upload, AI calls or runtime checks. Dependency audit of the new root package was clean at installation after using patched dependency versions; this says nothing about target repository security.

## Remaining boundaries

One static name-based rule only. No inferred sensitive data flow, logger aliases, nested expression analysis, binding resolution, general access-control checks, AI reasoning, repairs or runtime verification. Untracked files are listed but not analyzed. Git-ignored untracked paths are not enumerated. Snapshots are not atomic against concurrent edits. Reports include path metadata. Files skipped for any reason have not been cleared by analysis. Passing tests or finding no matches is not proof that an application is secure.

Old demo files and tests were retained; the legacy Python/browser suite was not rerun because the active workflow does not invoke or alter it. No changes were staged or committed on the user's behalf.

Next smallest milestone: explicit opt-in static review of Git-visible untracked JS/TS files with the same exclusions, redaction and schema, clearly marked as having no HEAD baseline.
