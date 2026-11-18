# Real-project review — 0.7.0

## Normal workflow

1. Open your project in VS Code.
2. Run **Changeproof: Review Project**.
3. Choose **Current files** or **Changes since HEAD**.
4. Read the existing persistent Changeproof sidebar and click findings for details.
5. Click evidence steps to select source, assignments, arguments, helper calls, parameters and logging in the editor.

The same window, sidebar and details panel are reused. A normal review does not create a demo, initialize Git, make a commit, run target code or change files. Run Demo is a separate optional command. File edits make results stale; **Rerun Reviewed Folder** and the details rerun button retain the selected folder and mode without another prompt. No automatic reviews start after edits.

## Input modes

**Current files** analyzes eligible existing saved JS/TS files under the exact selected directory. It works without Git or HEAD. Inside a usable Git worktree, tracked files and Git-visible untracked files are considered using safe Git plumbing, respecting .gitignore and repository excludes; intentionally tracked files remain tracked even if a later ignore pattern matches them. Outside Git, nested .gitignore rules (including negations) are parsed locally. Tracking status is unavailable outside Git. Ignore-rule files that cannot be safely read stop that subtree rather than risk scanning ignored material.

Current files have no baseline: compared_revision is null, findings/path newly_introduced is null, path comparison is not_applicable_current_files, and the UI says newness is not applicable. Eligible untracked files are explicitly marked included or skipped. Current files are not fabricated as added lines; changed_line_ranges is empty. Inspected records include an opaque stat-metadata snapshot captured with the read; the UI compares it with current metadata to distinguish delayed notifications from actual later changes. A file that changes while being read is rejected.

**Changes since HEAD** compares tracked saved working-tree content against HEAD, including staged and unstaged changes. It requires a Git worktree and initial commit. Untracked files are listed but not analyzed in this mode. Git metadata may come from the containing repository, but file inspection and navigation are restricted to the selected project directory, including when it is a repository subdirectory. No baseline commit is ever created by a normal review.

Both modes preserve existing exclusions, the 1 MiB per-file limit, binary/non-UTF-8 skips, explicit parsing/processing errors and coverage. Current mode admits at most 2,000 JS/TS files and 100,000 enumeration entries; hitting a bound reports an error and incomplete coverage. Symlink files/directories are skipped rather than followed. Nested repositories are not traversed. Reads are not atomic against concurrent filesystem changes. Ignored/excluded paths remain outside the stated eligible-file coverage, not implicitly safe.

## Bounded helper tracing

CP001 remains direct sensitive-name logging. CP002 now follows a supported authorization-header value through directly resolved same-file helpers:

```ts
function output(value) {
  const copied = value;
  console.log(copied);
}
function route(req) {
  const raw = req.headers.authorization;
  output(raw);
}
```

Evidence records the header source, raw assignment, argument expression, call site, parameter declaration, copied assignment and console call. No literal values or source snippets are emitted. CP001 observations at the same sink are folded into CP002 as before.

Supported helper targets are direct identifier calls to unambiguous same-file function declarations or const-bound function expressions/arrows. Helpers have simple positional identifier parameters; block bodies and a directly logging expression-bodied arrow are supported. Lexical shadowing, duplicate bindings and assignments to a helper name prevent direct resolution. No caller closure environment is imported. Local safe-value reassignment kills a path; copies retain their source until an unresolved boundary.

Limits: three helper-call edges, 256 helper invocations/paths per file, 200 function definitions per file and 64 steps per path. Recursion, unsupported arguments, unresolved helpers and budget exhaustion produce located limitations and reduced coverage. Unknown calls/expressions clear tracked values. Later independent sources can start a new path. Branches and property mutation remain hard boundaries. Unsupported code is not presented as complete coverage.

**Unsupported:** imported/relative-module helpers, package and tsconfig resolution, dynamic/member dispatch, logger aliases, captured values, object taint, arbitrary transformations, returned-value propagation and general workflows. Import statements are parsed as data; no target module, compiler plugin, dependency or script is loaded/executed. Relative-import support was deliberately not attempted without a reliable resolver. Cross-file evidence is not invented.

## Contract and presentation

Schema **4.0.0** adds review_mode, optional Git repository metadata, input limitations, current-file records and ordered CP002 trace steps. The earlier schema 3.0.0 is retained in report-v3.schema.json. Processing completion remains separate from narrow CP002 coverage. Analyzed coverage and zero findings do not establish security. The CLI defaults to changes for backward compatibility:

```sh
node packages/engine/src/cli.mjs /path/to/project --mode current
node packages/engine/src/cli.mjs /path/to/project --mode changes
```

The UI preserves HTML escaping, restrictive CSP, repository-validated navigation, source/assignment/logging decorations and stale-state checks. New argument/call/parameter steps use the same navigation registry and restrained labeled decorations. No network, telemetry, uploads, infrastructure access, automatic fixes or merge blocking is added.

## Verification status

Implementation is completed before final automated/build/package verification. No VS Code windows are launched during development. Final outcomes, limitations and the exact artifact hash are recorded in artifacts/real-project-0.7.0-verification.json. Automated checks, a final installed-extension host check, and any user-window/visual observation must be reported separately. Cursor remains untested.

## Dependency audit limitation

The final audit reports four high-severity entries in the pre-existing development-only VSIX packaging chain (`@vscode/vsce` → tinyglobby/fdir → picomatch). The registry still reports picomatch 4.0.7 as latest, within the advisory range. No forced downgrade or unrelated package migration was applied. These packages are not included in the bundled analysis runtime; `npm audit --omit=dev` reports zero vulnerabilities. This is not proof of security. Raw results are saved in the two real-project-0.7.0 audit artifacts.

## Final verification outcome

All 80 automated tests passed; extension build and VSIX packaging passed. The packaged 0.7.0 extension passed a real VS Code 1.142.0 clean-profile host run, including current-files review of a non-Git workspace, helper evidence navigation, explicit reruns, stale results, empty/error states and optional Run Demo. This uses the installed target extension, separately from mocked UI tests. Initial final-check failures and the fixed filesystem-event stale race are recorded in the verification artifact. No manual visual observation was performed; Cursor remains untested.

The identical VSIX was installed in the normal local VS Code profile; installed source/bundle bytes match and user settings were unchanged. Existing project Git metadata matches the pre-work snapshot. Reload the existing window once to activate 0.7.0, then run **Changeproof: Review Project**, choose **Current files** or **Changes since HEAD**, and select a finding in the persistent sidebar. Current files needs neither Git nor a commit; Changes since HEAD needs both. Coverage counts describe processed scopes/contexts and are not security percentages.
