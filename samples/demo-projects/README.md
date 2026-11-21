# Ready-to-scan sample folders

These are ordinary folders. Each contains one `app.ts` with the authored
after-change example, ready for the local scanner to read as text.

1. In Patch, click **Choose folder…**.
2. Select one folder below, not the whole `demo-projects` parent.
3. Select **Saved project files · start here**.
4. Click **Scan project**.

| Folder | Issue or control | Expected local result |
|---|---|---|
| `01-authorization-header-in-logs` | Authorization-header-shaped value flows into console logging | CP002 source/assignment/logging evidence |
| `02-password-in-logs` | A direct console call receives a value named password | CP001 sensitive-name observation |
| `03-safe-logging-control` | Constant diagnostic logging | No supported local finding |
| `04-tls-check-disabled` | An explicit Node TLS verification bypass | CP003 syntax finding |
| `05-risky-eval` | Direct eval of an input parameter | CP004 syntax finding |
| `06-empty-function` | An empty function body | Use the answer checker; security rules do not establish implementation correctness |
| `07-ownership-check-removed-manual-review` | A missing ownership condition under an authored policy assumption | Manual/AI policy review; no supported local rule for this claim |

To demonstrate the empty-function checker, paste:

```text
Function `validateOwner` exists in `app.ts`.
Implemented function `validateOwner` in `app.ts`.
All tests passed.
```

The presence claim can match, the body observation reports an empty function,
and implementation/test claims stay unverified. More answer examples and
authored expectations live in the corresponding folders under
[profiles](../profiles/README.md).

Use **Saved project files**, not Changes since last commit, for these folders.
They contain a single snapshot and do not create their own Git baseline. The
optional sample picker still provides before/after comparisons in a separate
generated repository.

All cases are synthetic, contain no actual credentials, and are never executed
by the scanner. Findings are scoped observations, not proof of an exploitable
leak. No findings does not establish safety, particularly for the unsupported
ownership-policy example.
