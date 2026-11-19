# Hackathon feature scope — 0.10.0

## One local setup/use sequence

1. In the existing checkout, keep the Groq key in `services/review-api/.env`.
   Run `npm ci --ignore-scripts` then `npm run setup:local`. This fills/matches
   development tokens in the server and evaluation env files without printing
   credentials; all other values, including the existing Groq key, are preserved.
2. Install the optional pinned scanner outside reviewed projects:
   `python3 -m venv "$HOME/.local/share/changeproof/checkov"` then
   `"$HOME/.local/share/changeproof/checkov/bin/python" -m pip install checkov==3.4.5`.
   This is a deliberate developer installation, never an action during review.
3. Install `artifacts/changeproof-local-0.10.0.vsix`. Reload the existing editor
   once. Set the user-level `changeproof.checkovPath` to the absolute executable
   in that environment. Keep the existing backend access token in SecretStorage,
   or set it once using Changeproof: Set AI Review Access Token.
4. Open a project and use **Review Project → Current files** for code and
   configuration findings. For the static showcase use `samples/showcase`;
   never run/build/deploy its intentionally unsafe fixtures. Start the existing
   backend with `npm run start:review-api` for optional AI review of Git changes.

No deployment or public-account infrastructure is needed for the local showcase.
The local backend uses Groq only after approval; local checks need no Groq key.

## Local code checks

CP001 and CP002 are preserved. CP003 flags explicit Node TLS disablement via
`process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` or inline `rejectUnauthorized:
false` on direct imported/required Node HTTPS Agent/request/get calls. CP004
flags direct unshadowed built-in `eval` or Function calls/constructors. Comments,
strings, unrelated APIs and recognized shadowed bindings are not searched as
code. These are syntax observations, not proofs of attacker input, exploitation
or malicious intent. Aliases/computed options and general configuration remain
unsupported. HEAD matching uses pattern counts; Current files newness is null.

## Infrastructure configuration checks

The CLI invokes a user-trusted **Checkov 3.4.5** installation. Policy provenance
remains Checkov, not Changeproof-authored security analysis. Supported input is
Terraform, Kubernetes YAML, Dockerfiles and GitHub Actions workflows. YAML that
is not a recognized Kubernetes resource is not established as covered.

The curated policy set is CKV_AWS_1/20/24/25, CKV_K8S_16/17, CKV_DOCKER_3,
CKV2_GHA_1 and CKV_GHA_1/2: administrative IAM policy documents, public ACLs,
SSH/RDP ingress, privileged/host-PID pods, container user declaration, write-all
workflow permissions, unsafe workflow commands and potential shell injection.
Actual resource support is defined by the pinned policy implementation; these
checks are not a general cloud-account, cluster, image or deployed-state audit.

Current files includes eligible tracked/untracked config, honors Git and nested
ignore rules and existing exclusions, and bounds input to 100 files/4 MiB total
and 1 MiB each. Symlinks/submodules/nested repos are not traversed. No provider,
Terraform, container or cluster commands execute. Normal review creates only
an isolated temporary snapshot, which is removed afterward; it does not create
or commit a demo repository. Changes mode explicitly leaves infrastructure
unassessed: no baseline or newness is fabricated.

The scanner runs with a whitelisted environment, isolated home/current directory,
explicit empty configuration, selected frameworks/policies, uploads and external
module/data downloads disabled, no project custom checks and an early Python
audit guard. Network, target subprocesses and outside-snapshot writes are blocked; only a
fixed trusted Git version/uname metadata probes are allowed and counted. Parallel workers and
update checks are disabled. Reads
are restricted to snapshot/tool/runtime and a small system-data allowlist. Blocked
operations reduce coverage. This is defense in depth around a trusted pinned
Python CLI, not an OS sandbox for arbitrary malicious executables or Python
native extensions. Installing dependencies is a separate networked developer step.

Only validated known policy IDs, snapshot-relative locations and bounded ranges
are retained. Raw scanner snippets, resource values, messages and suppression
text never enter UI reports or logs. Native suppressions are counted separately.
Unknown output, blocked operations, parse errors and missing/version-mismatched
tools produce explicit partial/not-assessed states. Code checks continue working.
Infrastructure status is separate from the existing narrow CP002 coverage.
CLI exit status and analysis_complete describe the code-processing path; examine
infrastructure.status/errors separately. A missing optional tool must never be
interpreted as a successful configuration assessment.

Report schema 5.0.0 adds infrastructure assessment and CP003/CP004/Checkov evidence.
Schema 4.0.0 remains in report-v4.schema.json. AI request/response contract remains
1.0.0; the optional profile is explicit HTTP metadata, not an unannounced body edit.

## AI demo profile

The user-level `changeproof.aiProfile` defaults to `demo`; `full` remains available.
Demo limits: 3 files, 8 chunks, 80 lines/chunk, 9000 code bytes, 3 findings and 3000
completion tokens. Additional pruning targets an approximate 7500 total-token
budget including the serialized system prompt and response schema. The heuristic
is UTF-8 bytes / 3, not a model tokenizer or quota guarantee. Reasoning tokens
can consume output budget and a provider can still throttle or truncate output.

Exact post-pruning JSON, omissions, profile header and approximate budget are
shown before approval. Snapshot rechecks use that same profile; no approved
payload is silently replaced. The backend validates profile limits and caps
findings/output consistently. Requests without a profile retain full behavior,
including existing synthetic smoke/evaluation commands. No automatic retries,
model fallback or paid upgrades occur. Local request quotas are independent of
provider token/rate quotas. Live credentials must remain server-side.

## Scope and verification

General access-control proofs, cross-file flow, cloud APIs, live infrastructure,
automatic fixes, publishing and public deployment remain outside this milestone.
See the milestone verification artifact for checks actually performed. Older
Mac/native-editor records do not verify this build.
