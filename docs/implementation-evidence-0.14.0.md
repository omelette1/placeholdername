# Implementation evidence — 0.14.0

The claim audit now inspects the body of each uniquely resolved, supported
named function. It keeps **presence**, **body observations** and **behavioral
verification** separate. No new target-code execution, model calls, uploads or
test/build runner was added.

## Use

Install `artifacts/changeproof-local-0.14.0.vsix`, reload the existing window
once, then use the Changeproof sidebar's **Check assistant claims…** button.
Paste the completion message and click **Check claims**. The page now shows its
supported forms before the first audit. For example:

```text
Function `validateOwner` exists in `src/auth.ts`.
Implemented function `validateOwner` in `src/auth.ts`.
All tests passed.
```

The first line can match a declaration, accompanied by separate body evidence.
The second remains unverified even when body content is found: no behavioral
contract has been checked. The third remains unverified without independent
execution evidence. Source code pasted instead of claims now gets guidance to
use Scan project, rather than a silent wall of unsupported rows.

## Observations and limits

| Body pattern | Displayed evidence | Meaning |
| --- | --- | --- |
| Empty, comment-only, directive-only or empty-statement body | Empty function body; attention flag | Possible intentional no-op or unfinished implementation. |
| Bare `return` as the only meaningful statement | Returns without a value; attention flag | No return value is produced by that syntax; intended contract is unknown. |
| Sole `throw Error(...)` / `throw new Error(...)` / TypeError-shaped call with literal TODO/not-implemented/placeholder wording | Explicit placeholder-shaped throw; attention flag | A source pattern, not proof of runtime bindings or reachability. |
| Literal-only return | Returns a literal value; observation only | Can be legitimate; not a confirmed stub or a correctness pass. |
| Return of identifier `undefined` | Identifier-shaped return; observation only | Binding and intended contract unresolved. |
| Other body content | Body content observed; behavior unverified | No selected whole-body pattern matched; hidden stubs and incorrect implementations can remain. |

Leading string directives and empty statements are ignored for whole-body
classification. Calls and other executable syntax are not silently discarded.
Conditional placeholder throws are not treated as whole-function stubs. Comments
alone cannot prove that a function is incomplete. No source literals are copied
into the body observations.

These checks retain the 0.13 bounds: JS/TS only, unique top-level definitions or
supported top-level arrow/function-expression bindings, no imported/nested/method
resolution, bounded files/bytes, no execution, and conservative stale handling.
The original claim statuses remain matched/contradicted/unverified. The additional
attention count is per claim, so repeated references may count a function twice.
It is not a vulnerability count, false-positive rate or accuracy score.

The local claim report schema is 1.1.0 with `implementation` per resolved
function claim and `implementation_warnings` per report. The extension accepts
1.0.0 for compatibility; missing legacy body evidence is not invented. Static
security report schema 5.0.0 and AI response contracts are unchanged.

## What remains necessary for broader claims

An assertion such as “rejects requests belonging to another user” needs an
explicit expected behavior and independent positive/negative checks against
that behavior. A fresh, separately captured test/build run can support an
execution claim but cannot prove every requirement or the absence of security
bugs. Agent-generated tests can repeat the same mistaken assumptions. These
capabilities require a separately designed opt-in execution boundary and are
not provided by this update. Removing the remaining disclaimer would overstate
the evidence.

Controlled regression tests exercise empty bodies, legitimate constants,
conditional throws, parse errors, hidden delegates, test-success text, UI
guidance and navigation. They are not a real-world accuracy measurement. See
`artifacts/implementation-evidence-0.14.0-verification.json` for the actual run.
