# Local VSIX installation verification

The extension is packaged locally using the official `vsce package` workflow. No publishing command, marketplace upload or publisher account was used. The runtime bundle does not contain the development packager or its dependencies. See [VS Code's packaging guidance](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) and [local VSIX installation guidance](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace).

Artifact: `artifacts/changeproof-local-0.3.0.vsix` (unsigned local package). The source adapter, shared engine/parser, extension README and third-party licenses are included; target repositories, samples, test harness and development dependencies are excluded.

## Packaged-install check — distinct from development source

The actual VSIX was installed with `code --install-extension` into a fresh temporary `--user-data-dir` and `--extensions-dir`. `--list-extensions --show-versions` confirmed `changeproof-local.changeproof-local@0.3.0`. The host test then asserted that the target extension's resolved installation path was inside that clean extensions directory.

A separate, empty development test-driver extension loads the test runner; **Changeproof itself is the installed VSIX extension**, not the source checkout. Its installed bundled CLI analyzes a new synthetic worktree. A successful result record is required after all assertions, not just a successful launch/installation exit status.

Actual outcome: **passed on VS Code 1.142.0 / macOS arm64**. Assertions cover activation, real command-to-CLI execution, CP002 evidence at the unchanged sink, source/two assignment related locations, HEAD newness/runtime status, native source and sink navigation, safe-change clearing, CP001 retention and parse-error clearing. User's existing profile and installed extensions are untouched. The temporary test profile is removed after success.

The recorded artifact SHA-256 and assertions are in `artifacts/packaged-install-verification.json`. A different reproducible package build may have a different archive hash; rerun this check after rebuilding. `artifacts/development-host-verification.json` is a separate **development-host** result and does not substitute for packaged-install verification. Neither test is target runtime verification.

```sh
npm ci --ignore-scripts
npm run package:extension
node extensions/vscode/test/run-host.mjs /absolute/path/to/code artifacts/changeproof-local-0.3.0.vsix
```

To install the delivered artifact for regular local use:

```sh
code --install-extension /absolute/path/to/changeproof/artifacts/changeproof-local-0.3.0.vsix
```

Or use **Extensions: Install from VSIX…**, then open the generated sample repository and run **Changeproof: Review Local Changes**. Node 20.19+ and Git with `--no-lazy-fetch` must be available; `changeproof.nodePath` can point to a trusted Node executable in User Settings. Development/packaging uses Node 22+.

Cursor remains **untested**. Other VS Code versions/platforms, remote hosts, manual mouse interaction and marketplace signing are not verified. Nothing has been published to a marketplace.
