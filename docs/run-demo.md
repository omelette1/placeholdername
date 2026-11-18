# Try Changeproof 0.5.0

Install `artifacts/changeproof-local-0.5.0.vsix` using Extensions → Install from
VSIX, reload VS Code, then run **Changeproof: Run Demo**. No folder selection
or initial commit in your own project is required. The command creates a
synthetic Git baseline in extension storage and opens real CP002 evidence.

This update was built and exercised by automated CLI/adapter and mocked UI
tests in Linux. The packaged VSIX contents were checked. A real VS Code host
and Cursor were not tested for this version; earlier host reports describe
earlier versions and are not new verification.


## Integration on this workstation

The incoming update's 51-test claim was independently reproduced locally after a file-by-file integration. The CLI bundle is rebuilt from merged source before packaging. Reload and Run Demo verification in the user's actual chat window is tracked separately in [integration-0.5.0.md](integration-0.5.0.md); no previous-version or other-window result substitutes for it.

Run Demo still creates only its own synthetic baseline in dedicated extension storage, reviews that exact directory, opens the CP002 finding and shows source → assignments → logging evidence. The extension panel additionally displays aggregate CP002 coverage and per-file/scope detail. No findings does not imply safety. No current project commit or folder change is required.

The detailed earlier demo instructions and 0.4.0 verification history are preserved in [run-demo-v0.4.0.md](run-demo-v0.4.0.md), explicitly as historical results.

## Current UI (0.6.0)

Run Demo now opens **Changeproof Finding Details**, with clickable existing evidence and labeled editor decorations, instead of the older virtual text evidence document. Findings, coverage, limitations and processing errors are separate sidebar groups. Edits mark results stale and require an explicit rerun. See [current usage and verification](finding-ui-0.6.0.md). Earlier integration/verification paragraphs above describe their stated versions, not new evidence for 0.6.0.
