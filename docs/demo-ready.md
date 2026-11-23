# Patch demo: verified offline route

This is a **repeatable prototype demonstration**, not a claim that Patch catches every vulnerability.

## Before recording

From the repository's feature branch:

```sh
npm ci
npm run package:extension
npm run verify:demo
```

The last command runs the **same bundled scanner** delivered in the VSIX against seven authored, saved-file samples. It fails if an expected rule or safe control changes. It does not install software in the reviewed project, execute sample project code, call an AI model, or contact OSV or Trivy.

Install `artifacts/patch-local-0.20.0.vsix` in VS Code through **Extensions: Install from VSIX…**, then reload the window. Open the **Patch shield** sidebar and select a demo folder. Choose **Saved project files** mode (not Changes since HEAD).

## A concise recording sequence

1. **Show what Patch is.** The extension reviews saved code and highlights supported issues, with a separate optional AI assessment. Do not describe it as guaranteeing security.
2. **Show a real local finding.** Choose `samples/demo-projects/01-authorization-header-in-logs`, then **Scan project**. Open **CP002**, follow the authorization-header source, assignments, and logging location in the editor. Mention that this is a same-file *static* flow, not a runtime exploit proof.
3. **Show a safe control.** Choose `samples/demo-projects/03-safe-logging-control`, scan and show **Findings (0)** and coverage. Emphasize that zero findings means no supported pattern matched, not an all-clear.
4. **Show a second independent rule.** Scan `04-tls-check-disabled` to show CP003, or `05-risky-eval` to show CP004.
5. **Show AI claim checking without a live service.** Choose `06-empty-function`, open **Check an assistant answer…**, and paste:
   ```text
   Function `validateOwner` exists in `app.ts`.
   Implemented function `validateOwner` in `app.ts`.
   All tests passed.
   ```
   Show that presence is checkable while an empty body and test-success claims remain unverified.
6. **Show background monitoring.** Opt in using **Enable background monitoring**, then edit and save a file in a disposable sample folder (not production source). Status-bar notifications and diagnostics update after a short debounce. Background scanning happens only while VS Code is open. Disable afterward.
7. **If desired, show dependency advisories.** Explain the separate **Enable OSV advisory lookup** control; opting in shares only npm package names and versions with OSV. A demo with a known affected version requires an actual supported npm lockfile and working network. Do **not** fabricate advisory matches.
8. **Only show container CVEs if your machine is prepared.** Requires a locally cached Docker image, trusted Trivy binary and cached vulnerability database. Unavailable tools/images are explicitly *not assessed*, not safe. This is optional and does not block the core demo.

## External AI review (optional)

AI review is a separate workflow: connect the configured backend, preview the exact code payload, and **approve before sending**. The result is an assessment, not a verified exploit. Exact cited-source checks and partial local corroboration are independent of the model's conclusion. If a live provider is unavailable or rate-limited, demonstrate the local **Test evidence guard** instead; do not claim the live model was invoked.

## Interpret test results accurately

- `npm run verify:demo`: confirms seven synthetic sample outcomes with the packaged CLI.
- `npm test`: broader automated suite; should pass before claiming engineering readiness.
- GitHub CI `quick-smoke`: syntax, focused rules, VSIX contents, deterministic CLI and authored demo cases.
- GitHub CI `native-vsix`: attempts a clean VS Code install and extension-host checks. Failures may be product or CI environment failures; inspect logs.
- A successful archive build **does not** establish real-world accuracy or a verified end-to-end native UI run.

This route makes the core video independent of network model availability, external vulnerability databases, Docker, Trivy, or Checkov.
