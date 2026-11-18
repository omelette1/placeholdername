# 0.5.0 update

Adds explicit CP002 coverage summary and file/scope details, warns about
unsupported top-level code, and resumes after unknown calls/expressions only
with cleared state. No cross-boundary evidence is invented. No AI, runtime
testing, uploads, telemetry, or automatic changes were added.

Source ZIP excludes dependencies, virtual environments, Git metadata, and old
verification artifacts. Run `npm ci --ignore-scripts`, `npm run build:extension`,
and `npm test` to reproduce automated checks. Package with
`npm run package:extension`. Install the bundled 0.5.0 VSIX and run the demo.

The original legacy demo remains historical and is not used by the extension.

Verification: 51 automated tests passed, covering coverage schemas, safe restart
after an unrelated await, invalidation across unknown calls, unsupported
top-level and helper code, and extension panel wording using a mocked VS Code
API. The bundled CLI was rebuilt and tested through the extension adapter.
No new real-editor or Cursor host verification was performed here.
