# Assistant delivery evidence — 0.13.0

The new **Check assistant claims…** button is in Changeproof's existing Scan
sidebar. Select the delivered project's root, open the claim view, paste the
assistant's completion message and click **Check claims**. The existing editor
panel is reused. This is independent of local security scans and optional AI
reviews; neither the API nor Groq is needed.

## What each result means

| Result | Meaning |
| --- | --- |
| Matched | The specific supported artifact fact agrees with saved evidence. |
| Contradicted | Saved state directly conflicts with a supported fact, for example an allegedly existing file is missing or an allegedly updated file is unchanged versus HEAD. |
| Unverified | Prose, behavior, execution success, unavailable history or unsupported evidence prevents a verdict. This is not a pass or a confirmed lie. |

There is no overall truthfulness percentage or security score. A file containing
incorrect code still exists; a function containing an empty body still has a
definition. These checks establish neither correct implementation nor intent.

## Supported assertions

One assertion per line, with backticks around paths/names, for example:

```text
File `src/auth.ts` exists.
File `src/old.ts` is absent.
Created file `src/new.ts`.
Updated file `src/auth.ts`.
Deleted file `src/old.ts`.
Function `validateOwner` exists in `src/auth.ts`.
Added function `validateOwner` in `src/auth.ts`.
```

Simple Markdown bullets/bold are accepted. Freeform paragraphs and compound
assertions remain unverified. Quoted/fenced content is not treated as an
assertion. Test/build success statements remain unverified even when the
assistant supplies a convincing report or terminal transcript. No pasted text
is executed. There is no automatic access to Codex's chat history.

File presence/absence works without Git. Addition, change and deletion history
use the current HEAD commit: this is **not** a captured before-agent snapshot.
An assistant's already-committed changes cannot be attributed to that assistant
using this comparison. Missing/unusable history remains unverified. A file that
already existed in HEAD does not establish a claimed creation time. Differences
check bytes and executable bit, not the meaning of a change.

Functions are parsed with TypeScript's syntax parser, limited to a unique
top-level named function with a body or a top-level arrow/function-expression
binding in JS/TS. Methods, imports, re-exports, nested/dynamic bindings and
behavior are unresolved. A missing supported definition remains unverified,
because runtime behavior might be supplied through one of these unsupported
forms. Parse errors also prevent a declaration verdict.

## Boundaries and privacy

- Up to 32 KiB of pasted text, 60 represented nonempty response lines, 20 unique
  claimed files, 1 MiB per content read and 4 MiB total current/HEAD content.
  Omitted lines and unavailable evidence are disclosed.
- Only explicit project-relative paths are inspected. Traversal, symlinks,
  dependency/generated paths and the existing secret-path exclusions are
  rejected. This is not a whole-project file enumeration.
- Text is passed on stdin to Changeproof's bundled local CLI, never as a shell
  command or command-line argument. Recognized secrets are masked in report
  text using existing best-effort redaction; do not paste credentials.
- The original input is held only in the open page/controller's memory. It is
  not written to invocation logs, browser storage or model requests. Closing or
  replacing the page clears that state; this is not a secure memory erasure
  guarantee.
- Unsaved edits and observed file/Git changes mark results stale; save and rerun
  explicitly. Evidence navigation checks saved fingerprints again. Reads are
  not an atomic project snapshot and watchers are conservative.

## Accuracy evidence

`node evaluation/claims-benchmark.mjs` runs 24 authored local examples with
explicit expected statuses. The saved report is
`artifacts/claims-benchmark-0.13.0.json`: 24 matched expectations, comprising
7 matched facts, 5 contradictions and 12 unverified cases. This is a controlled
template regression check, **not** a representative real-world accuracy study
or independent human adjudication. It makes no claim about the security
scanner's precision/recall or the Groq model's accuracy. No target code or model
request is used by this benchmark.

Automated tests cover the real bundled CLI, sidebar-to-panel flow, evidence
navigation, stale detection, draft lifetime, escaping, bounds and conservative
verdicts. Editor API tests do not establish native visual appearance. Cursor
and remote editor hosts remain untested.
