# Changeproof 0.9.0

Use the existing sidebar **AI connection status** section. **Refresh AI Status** reads health only; **Check AI Connection** asks before sending a built-in synthetic example, never workspace code. **AI Setup Guide** reuses the existing details panel. Success measures connection/schema compatibility, not detection accuracy; mock success is labeled mock. See `docs/live-ai-readiness-0.9.0.md` for setup and bounded evaluation. Install `artifacts/changeproof-local-0.9.0.vsix`. Previous notes below describe retained functionality.

# Changeproof Local Review — 0.7.0

Review a real project's saved JavaScript/TypeScript locally. Run **Changeproof: Review Project**, choose **Current files** (no Git or commit required) or **Changes since HEAD**, and read the existing persistent sidebar and finding-details panel. Normal reviews never create samples, commits or project edits.

Current-files mode includes eligible untracked files, honors ignore rules/exclusions, stays within the selected project, skips symlinks and enforces size/enumeration limits. Newness is not applicable without a baseline. Changes mode preserves the tracked HEAD comparison and lists untracked files separately.

CP001 flags name-based potential sensitive logging. CP002 follows supported authorization-header sources through assignments and directly resolved same-file helper arguments, calls, parameters and logging. Click each step to open and select its recorded code. Helper tracing is limited to three calls deep; recursion, unresolved calls, closures, imports and transforms retain explicit limitations. No imported code or project configuration is executed.

The sidebar separates findings, CP002 coverage, limitations and errors. The details panel shows the reviewed folder and mode, actual evidence, newness, coverage and runtime false. Findings are potential exposures, not confirmed leaks. Zero findings does not establish safety.

Changes mark results STALE and clear diagnostics/highlights. Save and explicitly rerun using the details button or **Changeproof: Rerun Reviewed Folder**; the folder and mode are retained. No automatic review loop runs. Native SOURCE, ASSIGNMENT, ARGUMENT, FUNCTION_CALL, PARAMETER and LOGGING labels make highlighting independent of color. One panel and sidebar are reused.

**Changeproof: Run Demo** remains optional and separate. It creates only its synthetic baseline in dedicated extension storage and opens its evidence. It never modifies the actual workspace repository.

Install artifacts/changeproof-local-0.7.0.vsix locally, reload VS Code once if prompted, then run Review Project. Trusted Node 20.19+ is required at runtime; Git with --no-lazy-fetch is required only for changes mode/full Git integration. Without usable Git, current-files mode parses nested .gitignore rules locally. Development/build uses Node 22+.

No AI, cloud uploads, telemetry, live-infrastructure access, target execution or automatic fixes. HTML is escaped, the webview uses a restrictive nonce CSP, and targets are validated against the selected project. Cursor and remote hosts remain untested; native host assertions are not visual observation. Nothing is published to a marketplace.

## Optional hosted AI review (0.8.0)

**Changeproof: AI Review Changes** prepares saved tracked JS/TS changes against HEAD and opens an exact redacted JSON preview in the existing details panel. Nothing is sent until **Approve and send this exact payload**. Backend/model transmissions are optional; local Review Project remains independent. AI assessments are separately labeled, not runtime verified. HEAD references display submitted text only; current references navigate and highlight. Edits mark results stale; rerun and approve explicitly.

Start/configure the development service using `services/review-api/README.md`. Set `changeproof.aiBackendUrl` in **user** settings (HTTP loopback or remote HTTPS origin), then run **Changeproof: Set AI Review Access Token**. It uses VS Code SecretStorage; never enter a Groq API key. Provider credentials stay server-side. This is development authentication, not public login. Exclusions and best-effort redaction do not guarantee all secrets are removed; review the entire payload. Cursor remains untested. See `docs/hosted-ai-0.8.0.md` for limits and verification distinctions.
