# Review dashboard — 0.11.0

## Visible workflow

A completed local review now opens **Changeproof Review** automatically in the
same VS Code window, initially in the main editor area. Clicking evidence places
the dashboard in the second editor column and code in the first, reusing those
columns rather than repeatedly splitting them. There is no need to discover and expand the sidebar first.
The dashboard shows the selected folder/mode, processing status, code/config
finding counts, bounded CP002 coverage and independent infrastructure status.
The first finding's explanation and evidence trail are visible immediately.

The findings list has All / Code / Configuration filters and local text search.
Selecting a finding updates the same panel. Evidence buttons navigate to and
highlight existing validated editor locations. The dashboard does not read or
embed additional source values; it displays the same static evidence metadata.
Filters/search persist across selections within a review and reset for a new
review. At most 500 findings and 60 skipped-file entries are rendered in this
view; the sidebar retains the full report. Counts always describe the full report.

Choose folder and explicit Rerun actions are visible. Optional AI Review opens
the existing approved-preview workflow in the same panel; clicking it does not
approve a transmission. Open Review Dashboard is also in the Command Palette,
sidebar actions and toolbar. No new native editor window or review loop is added.

## Status and boundaries

Stale snapshots have a prominent banner and disabled evidence controls. Empty,
partial, missing-tool and error states remain distinct from successful analysis.
A review with zero findings is never shown as proof of safety. Coverage is not
a risk score. Infrastructure means supported saved configuration, not a deployed
account scan. All prior snapshot, path, redaction and explicit AI consent checks
are preserved. Schema 5.0.0 and AI contract 1.0.0 are unchanged.

Webview messages carry a per-render dashboard token and current review identity.
Finding selection uses validated numeric indices; review actions are allowlisted.
No target paths or commands from messages are executed. All displayed source
metadata is HTML-escaped under the existing nonce CSP; resources remain local.
The layout uses VS Code theme variables and adapts to narrow panel widths.

## Verification

See artifacts/dashboard-0.11.0-verification.json for completed checks. The actual
webview client script is executed in a minimal DOM/VS Code bridge harness, covering
filter/search, persistence and selection/evidence/rerun messages. Editor API tests
cover auto-opening, reuse, escaped content and stale/empty/error states. Chromium
launch was blocked by the environment's socket restriction, so visual rendering
and responsive appearance were not observed. These are not native installed
VS Code host checks or an observation of the user's window. No live Groq inference is
performed; previous partial live results remain unchanged. Cursor is untested.

## Install

Install artifacts/changeproof-local-0.11.0.vsix, reload the existing window once,
and run Review Project / Select Folder to Review → Current files. The dashboard
opens on completion. Existing credentials, executable settings and Checkov
installation remain in place. No backend is needed for local review.
