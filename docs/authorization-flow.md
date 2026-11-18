# CP002 — bounded authorization-header flow

CP002 is deterministic syntax/data-flow analysis, not AI reasoning, a confirmed leak or general workflow understanding. It analyzes one function at a time, using only saved source text; it never executes the target.

## Supported syntax

- JS/TS and their existing JSX/TSX/module variants. Function declarations, function expressions, block-bodied arrows, and class/object methods with simple identifier parameters. Async functions can resume at an independent header read after an unresolved `await` clears tracked values; generators and expression-bodied arrows are not resolved.
- Direct reads from a function parameter: `req.headers.authorization`, `req.headers["authorization"]`, `req["headers"]["authorization"]`, or `req.headers.get("authorization")`. The parameter can have any identifier name. A parameter named exactly `headers` also supports `headers.authorization`, `headers["authorization"]` and `headers.get("authorization")`. Literal bracket/get header names are recognized case-insensitively; dot `authorization` is exact. Receiver types and actual header contents are not established.
- `const raw = SOURCE`, `let raw; raw = SOURCE`, `const copy = raw`, and `copy = raw`. `var` declarations are also accepted in the straight-line body. Parentheses and TypeScript `as`, type assertion, non-null and `satisfies` wrappers do not transform values.
- Direct `console.log/info/warn/error/debug/trace` calls with direct source/identifier arguments. Return/throw end a function's analyzed sequence; a directly returned console call can be a sink. Multiple arguments/paths at one sink are grouped in one finding.
- Reassignment replaces the old binding. `raw = "public"` kills its flow; a prior `copy = raw` retains its own recorded source. Assigning an unrelated identifier clears flow rather than assuming it is sensitive. No literal contents are emitted.

The source is a **header-shaped read** under the parameter/header API assumption, not proof that the object is an HTTP request. The engine assumes standard console behavior, and skips CP002 for locally shadowed console bindings. No type checking, import/plugin loading, object alias analysis, call summaries, closures or cross-function propagation occurs.

## Boundaries are evidence too

At an unsupported statement/expression, CP002 records a located `analysis_limitations` note and clears tracked values. Unknown calls/expressions permit later independent sources; branches, object mutations and other hard boundaries stop the remaining function analysis. Earlier complete paths remain valid observations. Notes identify `HEAD` or `working_tree` coordinates. Examples:

- `const masked = redact(raw)` → `unresolved_call`; it does **not** infer that logging `masked` exposes authorization or that redaction succeeds.
- Templates, concatenation, casts with runtime calls, nested object logging, computed keys, compound assignments, property mutation and destructuring are unresolved.
- Branches, loops, try/catch and nested blocks are hard boundaries. Await/yield and arbitrary unknown calls clear tracked values; later independent header reads may start fresh paths. No earlier alias is carried across the unknown call.
- Nested functions are analyzed independently; captures and caller arguments are not imported. Module-level code is outside CP002. CP001 still performs its existing name-based inspection.

`analysis_complete` reports processing completion without errors. Separate `coverage` summary and per-file/scope statuses report analyzed, partial, unsupported or not_analyzed CP002 coverage; neither completion nor analyzed coverage is a security guarantee. The editor displays limitation notes and their count even if no finding is produced.

## HEAD comparison

CP002 compares source/sink signature counts inside function identities: lexical function names/ordinals, source parameter index/header category, console method and argument index. It ignores line shifts, alias names, label literals and assignment-chain reshaping. It reserves unchanged paths before matching touched/added copies. A source-only change can introduce a path even when the console line is unchanged.

- `newly_introduced: true`: supported current path has no matched HEAD signature.
- `false`: path is matched in HEAD; it is shown only when source, an intermediate assignment or sink was touched. Unrelated safe edits do not surface unchanged paths.
- `null`: unsupported baseline syntax or possible function relocation/rename makes comparison inconclusive. Path evidence is still shown, but newness is unknown.

This is a bounded structural comparison, not semantic equivalence or proof of exploitability. Duplicate names, anonymous-function ordering, function reorganization and alias semantics remain limitations. Newness must not be interpreted as proven runtime exposure.

Each CP002 finding includes located source, ordered assignments with identifier metadata, logging location/method/argument index, per-path and aggregate newness, limitations and `runtime_verification: false`. Coordinates are 1-based UTF-16; argument indexes are 0-based. CP001 at the same sink is folded into `related_rules: ["CP001"]`, with its safe name categories retained, instead of creating a second warning. Other CP001 findings remain name-based; reassignment to a public literal does not turn CP001 into data-flow analysis.

Identifier names and paths are metadata; no source snippets, header values, transformation literals or other runtime values are included. The report format is now **3.0.0** (tool/extension 0.5.0); the old schema is retained as `report-v1.schema.json`.

## Reproduce one real finding

From the Changeproof root, after `npm ci --ignore-scripts`:

```sh
sample_repo="$(node samples/authorization-flow/create-repo.mjs)"
node packages/engine/src/cli.mjs "$sample_repo"
```

The helper creates a **new synthetic repository** in the system temp directory, commits only its bundled baseline, and writes the changed file as an unstaged edit. It never executes that file or alters an existing repository. This is an actual Git comparison, not a recorded result. The expected CP002 path is `app.ts:3` (header source) → `raw` at line 3 → `payload` at line 4 → `console.log` at line 5, with `newly_introduced: true` and `runtime_verification: false`. The logging line is unchanged from HEAD.

Install the local VSIX, open the printed sample path, and run **Changeproof: Review Local Changes**. The warning is at line 5; its hover/tooltip shows the path and its related Problems locations open the source and assignments. Do not run the sample as an application.


## 0.5.0 coverage and continuation
Unknown expression/call boundaries invalidate all tracked values; analysis may
resume at a later independent header source. It does not carry an earlier value
through an unknown call. Branches and non-identifier assignments remain hard
boundaries. Function and top-level coverage is explicit in report schema 3.0.0.
Top-level flow is not analyzed, and is no longer silently omitted.
