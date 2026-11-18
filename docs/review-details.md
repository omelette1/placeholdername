# Review error details — 0.3.1

This patch fixes error-reporting usability; it does not change analysis rules or turn failures into clean results.

The incomplete-review notification now names the exact reviewed folder and the returned error code/message. **Show Details** opens the `Changeproof Review Details` Output channel. **Select Folder…** opens a folder picker and reviews only the folder you explicitly select, without changing workspace folders or creating a commit. Cancelling does nothing. The same actions are available as **Changeproof: Show Review Details** and **Changeproof: Select Folder to Review**.

Each local record includes timestamp, invocation ID, VS Code session ID, extension-host PID, current workspace name/file/folders, selected review folder, selection source, spawn executable/argument array/cwd, actual exit code (null if no process exited), process error/signal, engine completion status and returned analysis errors. Started/completed records share an invocation ID. Arguments are an array, not a shell command. No environment variables, document contents, raw stdout/stderr or token values are logged. Paths are local metadata.

Records appear in Output and in `reviews.jsonl` under this extension's VS Code log directory for that window. No records are uploaded. For this investigation, another window or separate successful test run is not accepted as verification: use the actual failing window's next invocation.

Possible outcomes are preserved: a non-Git folder returns `not_git`; a repository with no HEAD returns `missing_head`; missing Git, parsing errors and process failures remain errors. These are examples, not a diagnosis of the current window until its own result is captured.

Installation: `artifacts/changeproof-local-0.3.1.vsix`, installed in the normal user extension directory. Installed engine/adapter files matched the patch. No window was opened or switched during this update. **42 unit/integration tests passed**, including notification folder/reason/actions, actual CLI arguments/exit/errors, no silent folder selection and no review on picker cancellation. These tests are not a substitute for same-window verification.

## Captured invocation in the actual failing window

Verified after the user reloaded and ran Review Local Changes in the window containing this chat. No new window or substitute successful review is used as verification.

- Window log directory: `20261116T024709/window6/exthost`.
- Timestamp: `2026-11-17T10:24:40.642Z` (02:24:40 America/Los_Angeles).
- Extension: installed 0.3.1; extension-host PID `7423`.
- Workspace name: `Downloads`; sole workspace folder and selected review folder: `/Users/owen/Downloads`.
- Invocation ID: `mwkjppb6-eolu81`; selection source: `workspace`.
- Executable passed to execFile: `node`.
- Argument array: `["/Users/owen/.vscode/extensions/changeproof-local.changeproof-local-0.3.1/out/cli.cjs", "/Users/owen/Downloads"]`.
- Working directory: `/Users/owen/.vscode/extensions/changeproof-local.changeproof-local-0.3.1/out`.
- Actual exit code: `2`; process error and signal: null.
- Returned errors: `[{"code":"not_git","file":null,"message":"The path is not a readable Git working tree."}]`.
- `analysis_complete: false`.

Raw started/completed records are preserved in `artifacts/actual-window-review-invocation.json`. The user's IDE context shows the Changeproof Review Details Output channel open in this window.

The analyzer is behaving correctly: Downloads is not a Git worktree, even though it contains Git repositories. The command uses the selected workspace folder, not the repository containing the active editor file. It must not silently choose a nested repository. The usability bug was the generic notification that obscured this distinction; 0.3.1 now names the exact folder and error and exposes the actual invocation details.

To review another folder **in this same window**, run **Changeproof: Select Folder to Review**, or choose **Select Folder…** on the warning, then explicitly select the desired Git repository. This performs a review only after selection; it does not replace workspace folders, create commits or hide errors. Cancelling preserves the current folder. A later **Review Local Changes** invocation still reviews the workspace folder; explicit selection is not silently remembered as a workspace change.

For the existing synthetic sample, select `/var/folders/ss/05rpymqd76799l1khxk8ym2c0000gn/T/changeproof-authorization-sample-hEClCA`. In a macOS folder picker, press Command-Shift-G to enter that path. A successful review after that explicit choice would be a **separate invocation** and must be verified separately; it is not claimed by this record.
