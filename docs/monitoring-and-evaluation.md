# Security monitoring and evaluation (feature branch)

## Opt-in scanning

- Enable **Continuous security monitoring** in the Patch sidebar. This watches saved source and supported configuration changes, debounces events, and scans each open local workspace folder on startup and every 30 minutes while VS Code remains open. This is an *extension-host monitor*, not an operating-system daemon and not active when VS Code is closed.
- Enable **OSV advisory lookup** separately. When enabled, saved npm `package-lock.json` / `npm-shrinkwrap.json` v2/v3 versions are queried through the OSV querybatch HTTPS API. The request contains only npm dependency **names and versions**. Never sends source code, paths, lockfiles or credentials to OSV. It does share the dependency list with the remote service; keep it off for sensitive projects.
- Dependency queries and all other scans do not run project scripts, package managers, installations, application code, arbitrary commands or cloud deployments. Scans are limited to supported files and environment; errors yield partial/not-assessed, not a clean bill of health.
- Only **Saved project files** includes dependency scanning; **Changes since HEAD** does not fabricate a dependency baseline. The monitor always uses saved-file mode.
- Monitor activity is visible in the status bar and diagnostics. It notifies on newly found **dependency** advisories only, without repetitive notifications for unchanged findings. It does not automatically fix or update packages.

## New high-impact patterns

- CP005: credential-shaped variable/property assigned a nontrivial string literal, without including the literal in findings. False positives are expected (fixtures, pseudosecrets, etc.); not an entropy-based secret-scanning guarantee.
- CP006: dynamic argument to a directly imported Node child_process `exec` / `execSync`. No claim that the argument is attacker-controlled or that injection is reachable.
- DEP001: package/version matches OSV. It is an advisory match, *not* exploitability/reachability proof. OSV outages and unsupported package-manager formats remain unassessed.
- Existing CP001–CP004 and infrastructure checks retain their prior limitations.

## Evaluation data and honest limitations

`npm run evaluate:rules` runs authored regression controls. `node evaluation/independent-sample-benchmark.mjs` adds external-public-advisory scenarios for authorization (Clerk GHSA-w24r-5266-9c3c, Apostrophe GHSA-6h5j-32cf-4253) and labeled logging/secret-handling/command-execution controls. The external **labels** are published and independently described, but our snippets are *adapted*, not exact vulnerable/fixed project snapshots. These cannot establish real-world precision or recall; the benchmark explicitly reports zero independently adjudicated project snapshots and distinguishes unsupported categories.

A full independent evaluation should fetch pinned original vulnerable/fixed commits, record immutable hashes and source licenses, add blind reviewer judgments, and measure per-class TP/FP/TN/FN, abstention, incomplete coverage and runtime confirmation without executing untrusted targets in the extension.

## CI and packaging

The GitHub Actions workflow installs with `npm ci --ignore-scripts`, runs deterministic tests and evaluations, builds the API and extension, produces a VSIX, validates archive entries and exercises its bundled CLI on an isolated fixture. It uploads the VSIX artifact. Real installed native VS Code user interactions, cross-platform checks, OSV live availability and live model accuracy are **not** established by this CI smoke test. The editor-host mock tests remain distinct from native end-to-end tests.

No security guarantee follows from a zero-finding result. Use the scoped coverage and errors rather than a pass/fail security certificate.
