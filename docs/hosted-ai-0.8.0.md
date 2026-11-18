# Hosted AI review 0.8.0

Architecture: deterministic engine/report schema 4.0.0 remains unchanged. A separate shared AI contract (1.0.0) validates bounded redacted code contexts and model assessments. The context collector uses existing safe reads/exclusions/Git safety flags, reads saved tracked JS/TS against HEAD, and extracts bounded enclosing-function or local changed-line windows. Raw text never leaves the collector's memory except after redaction and explicit preview approval. No whole-repository submission or target execution.

A new Node/Fastify `services/review-api` authenticates development clients, enforces request/time/concurrency/quota/output limits, and invokes a replaceable Groq adapter. No tools, target execution, retries or patches. The API stores no code/prompts/responses/credentials on disk and disables request logging. In-memory quotas reset on restart and are neither distributed billing nor public-user identity.

The extension reuses the existing tree and details webview, keeping deterministic and AI results in distinct groups. It renders an escaped, restrictive-CSP exact request preview before approval; credentials use SecretStorage and only user-global backend URL configuration is honored. After approval the collector rechecks HEAD/index/content snapshots; changed inputs require a new explicit preview. AI results are labeled assessments, not runtime verified, and become stale on relevant edits. Only validated after/current references navigate; HEAD references display their submitted redacted context without opening the working tree.

Implementation/verification details will be completed after final checks. No deployment, publication or Git push is part of this milestone.

## Supported context and evidence

Tracked saved .js/.jsx/.ts/.tsx/.mjs/.cjs/.mts/.cts files in the selected project subtree are compared against HEAD, combining staged and unstaged content. Untracked files are omitted in AI mode; local Current files still includes eligible untracked files without Git. Git-ignored files (including tracked paths now matching ignore rules), secret paths, dependencies, build outputs, symlinks, submodules, conflicts, binary/non-UTF8/oversized files are excluded. Each read uses the existing 1 MiB bounded no-symlink snapshot reader. An AST chooses the smallest containing function per changed range up to 120 lines; otherwise a bounded local window is used with explicit omissions. Large changes may be truncated. Top-level code is context, not a claim of deterministic analysis coverage. Omitted paths/reasons and truncation are visible in the exact payload preview. No arbitrary import resolution or full-project understanding.

Before identity is the Git blob ID; after identity is SHA-256 of saved file content. Snapshot checks also compare HEAD, index and changed-path lists. File edits, unsaved buffers, changes during inference and replaced reviews invalidate navigation or mark results stale; the user explicitly reruns and approves a new preview. Reads/checks are not an atomic filesystem transaction, so concurrent edits are conservatively handled but cannot be frozen. Only after references navigate, with repository/symlink/range/snapshot validation; HEAD references are rendered as redacted submitted text. AI highlighting is labeled REFERENCE and does not imply a deterministic source-to-sink proof.

AI responses contain potential impact, concise evidence-based reasoning, assumptions, missing context, verification/correction suggestions and references. No fixes are applied. Missing context and empty findings never establish security. Prompt injection cannot grant tools: code is an untrusted user-message payload, separate from fixed server instructions, and no tool API exists. Model instructions/grounding cannot guarantee correct reasoning or policy inference.

## One setup/use sequence

1. `npm ci`, fill `services/review-api/.env` from its example, then `npm run start:review-api` (or set REVIEW_PROVIDER=mock for an explicitly synthetic response without inference).
2. Install `artifacts/changeproof-local-0.8.0.vsix` using **Extensions: Install from VSIX**, then reload the existing VS Code window once.
3. In user settings set `changeproof.aiBackendUrl` (default loopback is ready). Run **Changeproof: Set AI Review Access Token**, matching the server token. Workspace configuration cannot override either credential or backend URL.
4. Open a Git project with saved tracked JS/TS changes and a HEAD baseline; run **Changeproof: AI Review Changes** or its sidebar action. Inspect all transmitted JSON and omissions, then explicitly approve. Read AI assessments separately from deterministic findings in the same sidebar/details panel. Click current references to navigate. Cancel from progress to abort an in-flight request.

No GitHub login, upload automation, infrastructure access, deployment, publishing or Git push is added. The legacy Python API/runner are preserved and unused by this feature.

## Final verification

- All **99 automated tests passed**. Backend and extension builds passed; compiled backend startup and /health passed using the mock provider.
- Full extension-to-HTTP-service flow passed with scripted mock fixtures. Disclosure, ownership, safe-change and insufficient-context cases test response handling/grounding, not model detection accuracy.
- **Installed VSIX** passed native VS Code **1.142.0** checks: actual SecretStorage, zero pre-approval transmissions, real loopback mock service, shared sidebar/panel, and current-reference navigation. Local deterministic modes and optional Run Demo remain working. Development-host testing was not separately rerun for this release.
- No GROQ_API_KEY or service .env was present. **Live Groq inference unverified; no live request attempted.** No manual visual/mouse/screen-reader observation; Cursor untested.
- Two native harness attempts did not produce passing records before the final successful run; details and resolved automated failures are recorded in artifacts/hosted-ai-0.8.0-verification.json.
- VSIX SHA-256: `44946f71d18f119fcc67a893c4effd5fd3e00a77853649cdc1edaff9798ece58`. No commits, push, deployment, marketplace publishing or local backup copies. Legacy Python workflows and deterministic schema 4 are unchanged; the engine version field is 0.8.0.
