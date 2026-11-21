# Patch — demo guide

Patch is a VS Code proofreader for AI-written code and delivery claims. It
looks for supported security patterns, compares explicit assistant assertions
with saved files, and ties AI review findings to source evidence. It is not a
general correctness or confidential-data-loss guarantee.

## Install and open

Install `artifacts/patch-local-0.19.0.vsix` with **Extensions: Install from
VSIX…**, then reload the existing window. Open the **Patch** shield in the
Activity Bar. This updates the same extension ID as Changeproof, preserving
existing user settings and the stored backend access token.

## Main workflow

1. **Choose your project.** Pick the folder containing the code to inspect.
2. **Choose scan scope.** Start with **Saved project files**. This works without
   Git and includes eligible new files. Use **Changes since last commit** to
   compare tracked JS/TS with HEAD. Save editor changes first.
3. **Scan project.** Local review needs no AI account or backend. Read potential
   findings, open a recorded evidence step, and inspect coverage when needed.
4. **Check an assistant answer.** Paste a completion message. Supported explicit
   file/function assertions can match or contradict saved-state evidence.
   Implementation claims also receive selected empty/placeholder-body
   observations. Tests, runtime behavior and general security claims remain
   unverified.
5. **Review code with AI** is optional. Check the connection, inspect the exact
   code preview, then explicitly approve transmission. Results show quotation
   matches separately from the model's unverified interpretation. Recheck
   saved evidence locally without another model request.

## Suggested recording sequence

- Introduce Patch: “A proofreader for AI-written code, with evidence you can
  inspect.”
- Use **Patch: Run Demo** to create the built-in synthetic authorization-header
  logging example. Show the source → assignment → logging evidence trail and
  editor navigation. The demo is separate from normal project scans.
- Choose that demo folder in the sidebar and open **Check an assistant
  answer…**. These authored statements demonstrate three different outcomes:

  ```text
  Function `reviewRequest` exists in `app.ts`.
  File `missing.ts` exists.
  All tests passed.
  ```

  The first can match the demo's saved file; the second is contradicted;
  the execution claim stays unverified. This is an authored example, not
  measured model accuracy.
- Expand **Try the evidence checks**, open **Test evidence guard**, and run the
  local synthetic examples. Explain that this demonstrates source-validation
  behavior; it does not measure a model's hallucination rate.
- Show AI review only if the backend is configured and a real request succeeds.
  Mock responses remain labeled as synthetic. A provider failure is not a
  successful review.

## Presentation changes in 0.19.0

The interface now uses the Patch name and task-oriented scan/answer/review
labels. Routine scope explanations use neutral styling and expandable details.
Stale snapshots, invalid evidence and unavailable checks retain visible
attention states. Matched evidence never relabels an AI interpretation as
verified. Review logic, transmission approval and patch-application gates are
unchanged.
