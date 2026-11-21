# Verify AI output — 0.18.0

Open the Changeproof shield in VS Code. The **Verify AI output** section is
visible above Optional AI and needs no backend.

- **Check assistant claims…** opens the existing local claim auditor. Paste
  Copilot's completion message or another assistant answer. Explicit supported
  file/function assertions receive saved-state evidence; missing facts may be
  contradicted. Implementation claims receive body observations and remain
  unverified. Test/build success, security conclusions and arbitrary prose
  remain unverified. It does not execute commands from the answer.
- **Test evidence guard** opens a page with **Run local guard checks**. It runs
  seven authored examples against the installed production response validator:
  exact before/after text; fabricated text; a blank line; out-of-range text;
  a wrong revision; a missing baseline quote; and a missing current quote.
  No project files, backend or model are used. A pass checks this validator on
  those examples only. It is not a model hallucination-rate benchmark, a
  saved-project snapshot check or proof that quoted text supports a claim.
- **Open last AI evidence** opens the current session's AI review, including a
  failed/rejected review. Its folder is displayed in the editor.

Optional AI now describes three steps: check backend, preview code, inspect
evidence. Leave Small selected to start. Checking backend is a health request,
not a model call. Previewing locally prepares the exact payload; only explicit
approval sends it to the configured backend/provider. Access-token settings
are under their own disclosure.

AI result pages display quotation/snapshot status separately from security
interpretation. Invalid evidence responses are discarded with a REJECTED
banner. Local checker failures are shown as unavailable, not rejected claims
or proof of fabrication. A completed review offers **Recheck saved evidence**
without another model request. Changed saved files or unsaved buffers invalidate
the old evidence; refresh and approve a new review instead. Patches cannot be
applied while evidence is unavailable, stale or being checked.

Whitespace-only quotations now fail validation, even if they exactly match a
blank or whitespace-only source line. Real but irrelevant quotations and wrong
interpretations can still pass. There is no guarantee of preventing all AI
hallucinations, and missing findings do not establish safety.

Install the packaged 0.18.0 VSIX using **Extensions: Install from VSIX…**, then
reload the existing window. Terminal tests remain available for development;
the UI guard demonstration never shells out to npm or runs project tests.
