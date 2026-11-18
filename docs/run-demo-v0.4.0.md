# Run Demo — 0.4.0

Run **Changeproof: Run Demo** from the Command Palette. No folder selection, sample path entry, setup commit or log inspection is needed. After installing an update, accept VS Code's reload prompt once if the old extension is still loaded.

The command:

1. Allocates a new `authorization-*` repository under this extension's dedicated `globalStorage/demos` directory.
2. Commits the bundled synthetic safe baseline only inside that new repository, then writes the changed version as an unstaged edit.
3. Invokes the shared CLI with that exact demo directory, independent of the current workspace and active file.
4. Opens the CP002 finding at `app.ts:5`, selects its logging expression, and displays a read-only evidence document beside the source.

Visible evidence contains the reviewed absolute path and:

```text
Source: app.ts:3 — authorization-header read
  → declaration raw at app.ts:3
  → declaration payload at app.ts:4
  → console.log at app.ts:5
New relative to HEAD: true
Runtime verification: false
```

Findings and evidence are computed by the real static engine, not seeded or simulated. The log line is unchanged from the baseline; the header read introduces the potential path. Limitations are shown in the evidence document. This is not runtime verification or proof of a confirmed leak.

## Project isolation

The demo never initializes, stages, commits or changes files in an existing workspace repository. It never switches workspace folders. Storage within an open workspace is rejected before any write; symlink aliases are resolved for this check. Every demo invocation allocates a fresh repository, avoiding overwriting earlier demos or user files. Only the bundled synthetic `app.ts` is committed. Inherited Git overrides, global/system configuration, templates, hooks, fsmonitor and commit signing are disabled. The sample code is never executed. Evidence is a virtual read-only text document, not a project file.

Demo directories persist in dedicated extension storage so open findings remain usable. Repeating the command creates a new synthetic sample. No automatic cleanup of user projects is performed.

## Verification actually performed — 2026-11-18

- `npm run package:extension`: built `artifacts/changeproof-local-0.4.0.vsix`.
- `npm test`: **44 passing tests**, including demo baseline creation, exact-path CLI review, repeated runs, refusal to write within a workspace and byte-for-byte preservation of a project with committed, unstaged and untracked work.
- Installed the VSIX into a clean VS Code 1.142.0 profile and invoked **Changeproof: Run Demo** using the registered command.
- Asserted that the installed command completed with exit 0 and no returned errors, reviewed the exact generated directory, opened the CP002 source selection and displayed the read-only evidence alongside it automatically.
- Compared the host test workspace's files, Git index, refs and commits before/after; all matched. Workspace folder selection also matched. The active workspace even contained a deliberately malformed TypeScript file: Run Demo did not review it.
- Confirmed a `demo_opened` record with no demo error. Evidence included reviewed path, source, both assignments, logging location, newness and runtime false.
- Installed that same tested artifact in the normal user VS Code profile and compared its engine, adapter and demo module with source.

Detailed installed-host assertions and the artifact SHA-256 are in `artifacts/packaged-install-verification.json`. This is packaged-extension verification, not a claim that the user has already run the command in their current window. Cursor remains untested. Nothing was published to a marketplace.
