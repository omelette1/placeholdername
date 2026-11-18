# Changeproof — local change review

An **initial local static-analysis prototype** for reviewing code changes, including AI-generated changes in private repositories. The same command-line engine powers a thin VS Code extension. No GitHub account, repository upload, network calls, telemetry, models or AI assistant integration is used by the tool. AI-powered reasoning is future work; the engine cannot tell whether a change was AI-generated.

The original rule, **CP001: potential sensitive logging**, inspects newly added/changed direct `console.log/info/warn/error/debug/trace` calls in JS/TS, JSX/TSX, CJS/MJS and CTS/MTS. It flags direct arguments named `accessToken`, `refreshToken`, `password`, or `authorization` (case-insensitive), including direct property arguments such as `user.password`. Names alone cannot establish sensitive data flow or a confirmed leak. Comments and string contents are not searched.

**CP002: potential authorization-header logging** now follows supported header reads through declarations and simple `=` assignments within one function. Evidence shows source, intermediate assignments, sink, HEAD newness (true/false/unknown), limitations and `runtime_verification: false`. Unknown transformations/calls produce explicit boundary notes. It does not infer general data flow or workflows. CP001 is retained and folded into CP002 at a shared sink to avoid duplicate warnings. See [exact syntax and reproduction](docs/authorization-flow.md).

## Coverage reporting (0.5.0)

The JSON contract is now **3.0.0**. Processing completion and analysis coverage
are separate: `analysis_complete` means no processing errors, not a security
assurance. Coverage applies only to CP002 in changed tracked JS/TS files.
The panel and JSON distinguish **analyzed**, **partial**, **unsupported**, and
**not_analyzed**. “Analyzed” means within this narrow rule's supported syntax,
not all security behavior. File/scope details identify unsupported functions,
top-level executable statements, and boundaries; skips and untracked files
reduce aggregate coverage. Unchanged/deleted files are not flow-reviewed.

Unknown calls/expressions clear tracked values. Subsequent fresh header reads
can start new paths. For example, a header-to-log path after `await req.json()`
is now found, while the function remains partially analyzed. No path is inferred
through that call. Branches and object mutations remain hard boundaries; helper
functions and cross-function data flow remain unsupported.

## Review a real project (0.7.0)

Open your project in VS Code, run **Changeproof: Review Project**, choose **Current files** or **Changes since HEAD**, then read findings in the existing sidebar/details interface. Current files work without Git or a commit and include eligible untracked JS/TS. Their newness is not applicable, never fabricated as new. Normal reviews create no demo, commit or project edit.

Bounded same-file helper evidence now includes argument → call → parameter → assignment → logging. Traversal is capped and recursion/unresolved/imported helpers retain explicit limitations. No target code or configuration is executed. See [implemented behavior and limits](docs/real-project-0.7.0.md).

CLI: `node packages/engine/src/cli.mjs /path/to/project --mode current` (or `--mode changes`). The current report contract is **4.0.0**; prior sections describing older versions are historical.

## Finding UI (0.6.0)

The sidebar now separates findings from coverage, limitations, skipped/untracked files and processing errors. Clicking a finding opens **Changeproof Finding Details** with existing source → assignment → logging navigation, HEAD newness, coverage, limitations and runtime status. Native code decorations include text labels. Relevant changes mark results **STALE** and clear highlights/diagnostics; rerun explicitly. No new analysis rules or engine behavior were added. See [UI usage and verification](docs/finding-ui-0.6.0.md).

## Try the installed extension

Run **Changeproof: Run Demo** from the Command Palette. That is the only demo command: it creates its own synthetic baseline repository in dedicated extension storage, reviews that exact path, opens the finding and displays a finding-details panel with source → assignment → logging buttons beside it. Your workspace and its Git history stay unchanged. The demo is real static analysis, not pre-recorded results or target execution.

Install/update with `code --install-extension artifacts/changeproof-local-0.7.0.vsix`; if an older extension is still loaded, use **Developer: Reload Window** once after installation. See [demo verification](docs/run-demo.md).

## Run the CLI

Development/packaging requires Node 22+. The CLI and packaged extension runtime require trusted Node 20.19+ and Git on PATH with the `--no-lazy-fetch` safety option (tested with Git 2.55.0). Older Git versions without that option are rejected rather than risking an implicit network fetch.

```sh
cd /Users/owen/Downloads/changeproof
npm ci --ignore-scripts
node packages/engine/src/cli.mjs /absolute/path/to/local/git-project
# Equivalent:
npm run review -- /absolute/path/to/local/git-project
```

Use the direct `node` command for machine JSON; npm adds its own script banner. The CLI accepts any local Git working-tree path and reviews its containing repository; it reads without modifying the target repository. **Do not run target dependencies, hooks, scripts or tests.** The tool only launches read-only Git plumbing. A repository is treated as data; its compiler config and Git content filters are not executed.

Comparison is **HEAD → final saved tracked working tree**, incorporating staged and unstaged changes. Untracked files are listed separately, not analyzed. Git-ignored untracked files are excluded. An empty/unborn repository returns a missing-HEAD error; commit a baseline yourself before reviewing. This repository currently has no commits from the earlier prototype, and reviewing it will accurately report that condition until you create one.

Exit **0** = analysis completed, findings may exist. Exit **2** = usage or analysis errors. There is no merge blocking. JSON includes revision, files, changed ranges, findings, evidence, limitations, errors, skips and `runtime_verification: false`. See [report contract](docs/report-format.md) and [JSON Schema](docs/report.schema.json).

Default exclusions: `.git`, dependencies, common build/cache directories, `.env*`, common private-key files, `.npmrc`, `.netrc`, and names beginning `credentials`, `secrets`, `id_rsa`, or `id_ed25519`. Binary/non-UTF-8 files, symlinks, submodules and files above 1 MiB are skipped explicitly. Unsupported languages are not analyzed. Output contains paths, identifier metadata and safe name categories, not source snippets or literal secret values. No exclusion list can recognize every secret filename.

## Run the VS Code extension

Build the bundled shared CLI first:

```sh
npm run build:extension
code --new-window --extensionDevelopmentPath="$PWD/extensions/vscode" /absolute/path/to/local/git-project
```

Or open `extensions/vscode` in VS Code and press **F5** using the included “Debug Changeproof Local” launch configuration (after building from the root). In the Extension Development Host, open your local project, save buffers, then run **Changeproof: Review Local Changes** from the Command Palette. For multi-root workspaces, select the folder. See findings, skipped files, untracked files and errors in **Explorer → Changeproof Local Review**. Findings also appear as warning diagnostics in Problems; clicking a finding opens its file and line. No findings is distinct from incomplete analysis.

Node must be available to the extension host. If needed, set **User Settings** `changeproof.nodePath` to the absolute path of a trusted Node executable, for example the output of `command -v node`. Workspace-controlled executable settings are deliberately ignored. Do not point it at target project code. Remote VS Code workspaces run the engine where the workspace extension host runs; remote scenarios are untested.

For a persistent **local VSIX installation** (nothing is published):

```sh
npm run package:extension
code --install-extension "$PWD/artifacts/changeproof-local-0.7.0.vsix"
```

You can also select **Extensions: Install from VSIX…**. The artifact includes the bundled shared CLI and licenses, not target source, test fixtures, packager dependencies or a service. See [packaged-install verification](docs/packaged-install.md), reported separately from development-host testing.

Alternatively, copy the built extension to a new user-extension directory:

```sh
# macOS/Linux; do not overwrite an existing installation without reviewing it.
mkdir -p "$HOME/.vscode/extensions/changeproof-local.changeproof-local-0.7.0"
cp extensions/vscode/package.json "$HOME/.vscode/extensions/changeproof-local.changeproof-local-0.7.0/"
cp -R extensions/vscode/src extensions/vscode/out "$HOME/.vscode/extensions/changeproof-local.changeproof-local-0.7.0/"
```

Restart VS Code or run **Developer: Reload Window**. Windows users can copy those same files to `%USERPROFILE%\.vscode\extensions\changeproof-local.changeproof-local-0.7.0`. The bundled extension requires only trusted system Node and Git, not the target project's packages. The local VSIX is unsigned and has not been published to a marketplace.

**Compatibility:** VS Code and Cursor have separate verification status in [verification](docs/local-verification.md). Cursor compatibility is an aim, not a claim; Cursor is **untested**. The extension uses standard command, TreeView, diagnostics, workspace and navigation APIs; it assumes no coding assistant is installed.

## Verification

```sh
npm run build:extension
npm test
# Optional real VS Code host test (isolated synthetic repo and user profile):
node extensions/vscode/test/run-host.mjs /absolute/path/to/code
# Separate clean-profile packaged-install test:
node extensions/vscode/test/run-host.mjs /absolute/path/to/code artifacts/changeproof-local-0.7.0.vsix
# macOS installation present on this workstation:
node extensions/vscode/test/run-host.mjs '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'
```

These tests run only our tool and controlled fixtures, not a target project's runtime code. Fixtures cover staged, unstaged, mixed, untracked, no-change, binary, missing HEAD, exclusions, read-only behavior, harmless syntax, potential sensitive logging and extension-to-bundled-CLI communication. Runtime verification of reviewed code remains false even though the tool's own implementation is tested.

## Scope and next step

No automatic edits, patches, runtime tests, uploads, telemetry, hosted dashboard, accounts or merge blocking are part of this workflow. No general access-control analysis is implemented. CP002 supports only the exact function-local assignment syntax documented above; indirect loggers, cross-function flow, computed transformations, branch/loop reasoning and arbitrary calls are not resolved. CP001 remains name-based and is not proof of sensitive data flow. Names can produce false positives and false negatives; no findings is not proof of safety. Save files before review and avoid concurrent edits: reads are not an atomic repository snapshot. Reports/diagnostics are snapshots; rerun after edits.

The next smallest milestone is resolving both arms of one simple `if/else` with explicit path uncertainty, retaining the same function-local and privacy boundaries. AI reasoning and runtime checks remain later work.

[Local architecture](docs/local-architecture.md) · [Report format](docs/report-format.md) · [Verification](docs/local-verification.md)

The previous dashboard, FastAPI runner, document-sharing demo, and Python/Playwright tests remain untouched as historical work. They are **not** invoked by this CLI or extension. Their old setup is preserved in [legacy demo instructions](docs/legacy-demo.md); its historical design and related-work notes remain in `docs/architecture.md`, `docs/related-work.md`, and `docs/verification.md`. This direction reuses the project identity and evidence/limitations discipline, not the old runtime scanner. Automated security testing and code comparison are established ideas; no novelty is claimed.
# placeholdername
