# Current report format: 4.0.0

The 0.7.0 contract adds `review_mode` (current/changes), `git_repository`, `input_limitations`, current-file status and ordered bounded same-file CP002 trace evidence. `repository` remains the exact reviewed project/navigation boundary. In current mode `compared_revision` is null, `comparison` is current_files, all newness is null/not applicable and `changed_line_ranges` is empty. Untracked files carry their inclusion status. Every trace step has a kind, label and location; argument, function_call and parameter steps connect resolved helpers. Prior schemas are retained for history.

See [the implemented contract and limits](real-project-0.7.0.md). The remainder below describes the preceding schema 3.0.0 and shared fields; it is historical where it differs from 4.0.0.

# Report format 3.0.0

Machine-readable stdout conforms to [report.schema.json](report.schema.json), including error reports. `--help` is human-readable. Findings do not set a failing exit status: exit 0 means analysis completed, not that code is safe. Exit 2 means usage error or an incomplete/error analysis. Stderr and subprocess messages containing arbitrary source are never forwarded.

- `compared_revision`: resolved HEAD commit object ID, or null when unavailable. `comparison` is HEAD to final tracked working tree, not HEAD to index plus a second independent scan. A staged edit undone in the worktree has no net change. A staged removal is treated as a tracked deletion; a leftover untracked copy is listed separately.
- `files_inspected`: supported text files read, with added/modified/deleted/unchanged status and zero-context changed ranges. Files excluded before inspection appear in `skipped_files`. A renamed file is represented as a deletion plus an addition, not rename detection.
- Coordinates are 1-based. Counts can be zero, indicating an insertion/deletion anchor. Findings span the console call expression in the current file; columns use UTF-16 code units, as do TypeScript and VS Code.
- `findings`: CP001 name-based **potential sensitive logging**, or CP002 **potential authorization-header logging** with source → assignments → logging evidence. Every finding includes `newly_introduced` (true/false/null) and `runtime_verification: false`. CP002 path evidence and newness semantics are documented in [authorization flow](authorization-flow.md). Same-sink CP001 observations are folded into CP002 rather than duplicated. Literal values and code excerpts remain excluded.
- `analysis_limitations`: located CP002 boundary notes for `HEAD` or `working_tree`, including unresolved calls/transformations and unsupported syntax. These are analysis boundaries, not findings. They may occur alongside a completed engine execution and must not be treated as resolved data-flow paths.
- `analysis_errors`: generic error codes and safe messages, with optional relative file path. Parse failures never produce a clean result for that file. Errors may coexist with findings from other files.
- `skipped_files`: exclusions, binary/non-UTF-8, oversize, symlink, submodule, unsupported language, merge conflict, read/diff/parse failures. A skipped file is not a tested-safe file.
- `untracked_files`: Git-visible untracked paths, exclusion status and reason. They are never inspected. Files ignored by Git are not enumerated, in addition to tool exclusions.
- `analysis_complete`: false if any analysis error occurred. True means processing finished without errors; it does not indicate how much code the analyzer understood. See separate coverage statuses, skips and limitations.
- `runtime_verification`: always false. `limitations` describe restricted static scope.

Paths and repository location are local metadata, not anonymized. Avoid publishing reports if paths themselves contain private information. Review evidence is not saved automatically; redirect stdout to a location of your choice outside the target repository.

Version 2.0.0 replaces the 1.0.0 contract: new rule/evidence variants, per-finding newness/runtime status and located analysis limitations. That contract is historical: the integrated 0.5.0 extension consumes 3.0.0 explicitly. The earlier schemas remain in `report-v1.schema.json` and `report-v2.schema.json`.


## Schema 3.0.0
Reports include `coverage` summary and per-file `coverage.scopes`. Each scope
has a location, kind, status, and supported step count (not a percentage).
Summary statuses: analyzed, partial, unsupported, not_analyzed. Counts cover
CP002 on changed tracked files only. Processing errors remain separate.
