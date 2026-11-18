# 0.5.0 integration — 2026-11-18

The source was taken from `/Users/owen/Downloads/changeproof.zip`, extracted into a separate staging directory and compared file by file before application. There was no Git commit history available for a three-way merge; source differences were inspected directly. No whole-directory replacement or automatic commit was performed.

## Preservation and conflict handling

- Existing changed files were backed up under `/Users/owen/Downloads/changeproof-integration-backups/20261118-013613` before application.
- The existing `.git` directory's 18 files remained byte-identical, as did 60 pre-existing files outside the scoped update. Local settings, unrelated legacy files and earlier verification artifacts were retained. Normal VS Code user settings were unchanged by installation.
- No source-code conflict was found. Documentation conflicts were resolved: detailed demo history was saved as `run-demo-v0.4.0.md`; the prior schema was saved as `report-v2.schema.json`; contradictory older stopping-rule and schema-version prose was reconciled with 0.5.0.
- The provided VSIX is retained at `artifacts/incoming/changeproof-local-0.5.0-reviewed.vsix`. Its generated CLI bundle was not adopted into the live source tree. The installed VSIX was rebuilt locally from the integrated source.
- Dependency inputs differ only in package versions; the dependency graph is unchanged.

## Builds, tests and installation

`npm run build:extension`, `npm test` and `npm run package:extension` all passed. **51 automated tests passed locally**, independently reproducing the supplied test count. No failures remain from those checks. The generated 0.5.0 VSIX contains the rebuilt engine and merged adapter, and its installed files were checked against local source. No marketplace publication occurred.

The original update's report of no new real-editor verification is preserved as its provenance. The following verification happened during this integration and has narrower, explicitly stated evidence.

## Actual chat-window invocation

The user reloaded the same VS Code window, ran Run Demo, and confirmed that the finding and evidence opened successfully. That window's `20261116T024709/window6` log records installed version 0.5.0, host PID 41443, and:

- Selected directory: `.../User/globalStorage/changeproof-local.changeproof-local/demos/authorization-lJQ65j`.
- Actual installed CLI received that exact directory; exit code 0, no returned errors, processing complete true.
- A `demo_opened` event records CP002 at line 5 and evidence visible, runtime verification false.

A separate Review Local Changes invocation still correctly rejected the non-Git Downloads workspace; this was not treated as the demo result.

## Coverage checked separately

The screenshot did not establish coverage-label visibility. A separate read-only check used the installed 0.5.0 CLI on the exact demo directory from the user's invocation:

- Schema 3.0.0; processing complete true, no errors.
- Coverage `analyzed`, one analyzed function, zero partial/unsupported scopes and zero unassessed files.
- app.ts function spans lines 2–6 and has three supported steps.
- One CP002 finding; runtime verification false.

The installed extension was also exercised with a mocked VS Code API and the real installed CLI against that same directory. Its panel model produced `Coverage: analyzed (CP002, changed files)` and `Coverage: app.ts — analyzed`, and its view message included coverage. The target repository was unchanged by these checks.

These are **data and panel-model checks**, not independent observation of visual rendering in the user's window. The coverage rows belong to Explorer → Changeproof Local Review; they are not present in the source/evidence editors. Actual visual label visibility remains unconfirmed. No separate successful editor window was substituted for the user's invocation.

Evidence: `artifacts/integration-0.5.0.json` and `artifacts/integration-0.5.0-coverage.json`. Cursor was not tested. No new product features were added during integration.
