# Architecture — milestone 1

Changeproof compares only two bundled document-sharing implementations. It is an original local prototype, not a general scanner. The workflow is code change → user-confirmed expectation → measured evidence.

React/TypeScript/Vite dashboard talks through a same-origin proxy to FastAPI. SQLite stores the confirmed fixed rule, reusable test definition, immutable run snapshots, source hashes and redacted HTTP evidence. No results exist before a real run.

The runner starts baseline and changed FastAPI targets as separate loopback subprocesses, each with its own temporary SQLite database and random synthetic bearer credentials. It executes the identical sequence: owner creates a private document, adds a collaborator, collaborator retrieves it, owner removes collaborator, collaborator retries, owner retrieves it. Both positive controls and revocation are checked. Targets and temporary state are destroyed after each run. This is process/state isolation, not a hardened sandbox. No user code, URLs or repositories are accepted.

The only implementation difference is collaborator deletion: baseline deletes the grant; changed retains it. Source diff and hashes are captured with the run. Observed facts are HTTP statuses and response-content checks. The deleted SQL statement is a suspected cause, not independently proven causality. Repair verification currently means editing the bundled changed policy and rerunning the saved test.

The synchronous local runner is serialized; SQLite persistence supports restarting the API. API binds loopback, validates Host/Origin, and accepts no credentials from the browser. Tokens remain in child environment and runner memory; logs contain only allowlisted evidence. This is a trusted local development tool, not multi-user production infrastructure.

Future: hardened sandboxing, user-selected version pairs, repair workflows, correctness and performance checks. No AI, patches, external repositories, integrations, billing or aggregate security score.
