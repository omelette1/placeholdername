# Local foundation verification — 0.3.0 / 2026-11-17

These are real executions against synthetic local fixtures, not findings about a user repository. Reviewed target code was never executed; `runtime_verification` remains false.

- `npm run package:extension`: shared CLI bundle and local VSIX built successfully. The archive includes only extension code, its bundled engine/parser, README and third-party licenses. Nothing was published.
- `npm test`: **40 passing tests** covering the original CLI behavior plus CP002, structured evidence, schema 2.0.0 and extension communication.
- New positive coverage: direct/bracket/get authorization-header sources; JS/TS function forms; declarations and `=` aliases; assignment/source/sink locations; source-only introduction at an unchanged log; deletion of a safe overwrite; duplicate sink matching; var redeclaration semantics; CP001/CP002 deduplication.
- New negative/boundary coverage: safe headers/values, comments/strings, reassignment to public values, safe changes and label-only edits, no closure/cross-function inference, unknown calls/transformations, control flow, destructuring, property writes, await, console shadowing, baseline uncertainty and function-identity changes. Limits are recorded instead of invented complete paths.
- Original tests still cover staged/unstaged/mixed/no-change cases, untracked/deleted files, missing HEAD, non-Git paths, binary/secret/dependency/symlink/oversize skips, read-only repository snapshots and synthetic Git-command sentinels. Missing objects do not invoke a promisor remote.
- Bundled adapter tests transport real CP002 evidence and reject escaped source paths. JSON Schema tests validate finding and error reports.

## Distinct editor checks

| Mode | Actual verification | Result |
| --- | --- | --- |
| Development host | VS Code 1.142.0, macOS arm64, source extension plus bundled CLI | Passed |
| Packaged installation | Same VS Code, local VSIX installed in fresh temporary user profile/extensions directory; target loaded from installed path, not development source | Passed; see [separate report](packaged-install.md) |
| Cursor | No Cursor host run | **Untested** |
| Other editor versions/platforms, remote workspaces | Not exercised | Untested |

Both editor checks assert activation, actual command/CLI execution, CP002 warning at an unchanged sink, source/assignment related locations, HEAD newness and runtime status in diagnostics, native sink/source navigation, clearing on a safe/no-change result, CP001 preservation and parse-error handling. Successful test records are required; launching a window or exit 0 alone does not count. Manual mouse interaction and multi-root selection are not claimed as tested.

Reproduce:

```sh
npm ci --ignore-scripts
npm run package:extension
npm test
node extensions/vscode/test/run-host.mjs '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'
node extensions/vscode/test/run-host.mjs '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code' artifacts/changeproof-local-0.3.0.vsix
```

Toolchain: Node 26.5.0, Git 2.55.0. Development/package installation uses network package downloads; the installed analysis path has no network calls, models, uploads or telemetry. The packager's minimatch dependency is overridden to a patched version; packaging dependencies are excluded from the VSIX. The new dependency installation reported zero audit vulnerabilities. This is not evidence of target-application security.

## Recorded synthetic example

`artifacts/sample-report.json` is an **actual recorded static analysis of the synthetic authorization sample**, not a seeded product result or runtime test. Source is at app.ts:3, assignment steps at lines 3/4, console logging at line 5, `newly_introduced: true`, `runtime_verification: false`. Regenerate using the [sample instructions](authorization-flow.md#reproduce-one-real-finding); the temp repository path will differ.

No general data flow, cross-function/workflow analysis, automatic fixes, merge blocking, AI calls or runtime checks are implemented. Unknown syntax means limited coverage, not safety. Source/identifier names and paths are metadata. Passing tests or finding no matches does not prove application security.

The original demo and unrelated files remain intact; the old Python/browser demo suite was not rerun. No existing repository changes were staged or committed. Only newly created synthetic fixtures receive a baseline commit. Prior 0.2 verification is preserved in `local-verification-v0.2.md`.
