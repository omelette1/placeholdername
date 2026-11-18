> Current exact-window result is now captured: see [review-details.md](review-details.md#captured-invocation-in-the-actual-failing-window) and `artifacts/actual-window-review-invocation.json`. The user's chat window selected `/Users/owen/Downloads`, and its installed CLI returned exit 2 / `not_git`.

> Correction: this earlier report used a separate test window. It does **not** verify the failing chat window. Its workspace diagnosis was an inference, not a captured result from that invocation. For the current investigation, only 0.3.1 records from this window's next command will count. See `review-details.md`.

# Manual trial: incomplete review — 2026-11-17

The reported command activated Changeproof in the normal VS Code profile (`logs/20261116T024709/window6/exthost/exthost.log`, 02:03:46), not the separate trial profile, whose extension-host log contained no Changeproof activation. The normal window's Git log recorded “not a git repository” at 02:03:43. The open Downloads folder is not a Git worktree; the Changeproof source repository itself also has no HEAD commit.

Reproduction with the installed extension (VS Code 1.142.0, Changeproof 0.3.0):

- Workspace `/Users/owen/Downloads`: `analysis_complete: false`, `not_git`, no findings.
- Workspace `/Users/owen/Downloads/changeproof`: `analysis_complete: false`, `missing_head`, no findings.
- Existing synthetic authorization sample: `analysis_complete: true`, no errors, one CP002 at app.ts:5 with three related source/assignment locations, newly introduced true, runtime verification false.

These checks invoked the actual Review Local Changes command from an installed extension through an isolated test driver, and inspected the installed adapter's structured review output under that host. The normal-profile and trial-profile installed engine/adapter/extension files were byte-identical. The test did not execute any target code, modify source repositories, commit a new baseline, suppress warnings or change product code. Results: `artifacts/manual-workspace-verification.json`.

Resolution is to review the synthetic Git repository, not Downloads or the unborn Changeproof source repository. `artifacts/Changeproof Authorization Sample.code-workspace` explicitly selects the existing sample as its sole workspace folder and was opened in a separate normal-profile window. No existing window or user settings were replaced.

In that window, check Explorer says **Changeproof Authorization Sample**, open `app.ts`, and run **Changeproof: Review Local Changes**. Expect one CP002 at line 5. Hover its warning or open Problems and its related locations to inspect source line 3 → raw declaration line 3 → payload declaration line 4 → logging line 5. New relative to HEAD is true; runtime verified is false.
