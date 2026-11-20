# Sidebar controls — 0.12.0

## Normal workflow

1. Click the Changeproof shield icon in the left Activity Bar.
2. In Scan, select a workspace project or Choose folder… for another local folder.
3. Choose Current files or Changes since HEAD.
4. Click Scan project. The existing review dashboard opens in the same window.

Folder selection and review mode remain visible and are remembered in this
workspace's extension state. Choosing a folder or changing an option never
starts a scan. The Results outline is in the same dedicated view container,
collapsed by default; Open results reopens the reusable editor dashboard.
Settings opens the extension's filtered settings UI. Commands remain available
for compatibility but the normal workflow does not require the Command Palette.

## Optional AI

Expand Optional AI to choose Small (up to 9 KB combined before/after code) or
Larger (up to 100 KB). This writes only the user-level aiProfile setting; workspace
executable/provider overrides are still ignored. Preview AI review targets the
folder selected in Scan, prepares the existing exact transmission preview and
requires its explicit approval before sending code. The local review mode is
preserved even though AI review itself requires tracked changes against HEAD.

Check backend reads health only. It does not run an inference or send workspace
code. AI setup and Set backend access token reuse existing UI/SecretStorage
commands; the Groq key stays server-side. There are no automatic health polls,
backend starts, scans, transmissions or retries. Local scanning still works
with the backend stopped.

## Implementation and boundaries

The Activity Bar container contains a WebviewView for Scan and the retained
findings TreeView. Standard VS Code theme variables, native folder pickers,
labelled buttons/dropdowns, a nonce CSP and escaped metadata are used. The
Activity Bar SVG is an original simple shield/check icon.

Webview messages carry a per-render token, actions are allowlisted, mode/profile
values are enums, and project choices resolve registered folder indices rather
than accepting message-supplied paths. Scan and AI work share the existing busy
guards. User settings, credentials and target code are not rewritten by Scan.
State refreshes update UI only and do not invoke reviews or provider requests.
No detection rules or schemas change from 0.11.0.

## Design references

The interaction pattern follows official Activity Bar/view-container guidance
and the common security-extension sidebar entry point, without copying another
extension's code, assets, branding or analysis features:

- https://code.visualstudio.com/api/extension-guides/tree-view
- https://code.visualstudio.com/api/ux-guidelines/sidebars
- https://code.visualstudio.com/api/ux-guidelines/webviews
- https://github.com/snyk/user-docs/blob/main/developer-tools/snyk-ide-plugins-and-extensions/visual-studio-code-extension/run-an-analysis-with-visual-studio-code-extension.md

## Verification

Completed checks are recorded in artifacts/sidebar-controls-0.12.0-verification.json.
Editor API checks exercise the actual activation, sidebar provider, bundled local
scanner and actual AI preview collector. These are not native installed-editor
or visual observations. Client control-script checks use a minimal DOM/bridge
harness. No live Groq requests are made; earlier partial accuracy evaluation
remains unchanged. Cursor and remote hosts remain untested.

## Install

Install artifacts/changeproof-local-0.12.0.vsix and reload the current window once.
Then click the Changeproof shield icon. Existing credentials, Checkov/user settings
and code remain in place. No publication or additional editor windows are needed.
