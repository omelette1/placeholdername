# Patch sample profiles

For ordinary folders to select directly in **Choose folder…**, use
[demo-projects](../demo-projects/README.md) and **Saved project files** mode.

In the sidebar, expand **Try a sample project** and click **Choose a sample
profile…**. The same picker is available through **Patch: Run Demo**.

Patch creates a fresh isolated Git repository in its sample storage, commits
the authored before version, writes the after version as a saved change, and
scans that exact folder. It never executes sample code or changes your actual
project. The sidebar selects the sample folder so you can also review it with
AI or check the accompanying assistant answer.

| Profile | Expected local finding | Purpose |
|---|---|---|
| Authorization header in logs | CP002 | Trace source, assignments and logging |
| Password-shaped value in logs | CP001 | Demonstrate the narrow sensitive-name heuristic |
| Safe logging control | None | A constant diagnostic message |
| TLS verification disabled | CP003 | An explicit Node TLS bypass |
| Dynamic code execution | CP004 | Direct eval syntax |
| Empty implementation claim | None from security rules | The claim auditor observes an empty body and leaves behavior unverified |
| Ownership check removed | None from local rules | General policy needs manual/AI review and cannot be proved by existing local rules |

Each source folder contains `before.ts`, `after.ts`, `claims.txt` and
`expected.json`. These are authored controls, not real-world accuracy data.
Use the picker to prepare a baseline; scanning this source directory directly
would inspect both versions rather than compare them.

The prepared sample contains `app.ts`, plus `claims.txt` and `expected.json`
for reference. The generated repository ignores these two metadata files so
they do not become code-review inputs. Open `claims.txt`, copy its contents,
then use **Check an assistant answer…**. Each answer demonstrates one narrow
match, one contradicted missing-file claim, and two unverified claims. The
empty-function sample adds two empty-body observations.

Empty results mean only that no supported local pattern matched. The
ownership profile intentionally illustrates a limitation. AI outcomes are
not pre-scripted or guaranteed, and AI review requires its own preview and
approval. The samples contain no actual credentials, do not make network
requests, and are never executed by the scanner.
