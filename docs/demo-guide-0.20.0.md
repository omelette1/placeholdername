# Patch recording guide, 0.20.0

Use the opening slide before the screencast and the AI-implementation slide
after it. The slide figures have different scopes; see
[presentation sources](presentation-sources.md). They do not measure Patch.

1. Expand **Try a sample project** in the sidebar and choose **Authorization
   header in logs**. Patch prepares and selects a separate synthetic project.
   Follow the recorded source, assignments and logging locations in the editor.
2. Open that sample's `claims.txt` from the selected folder path. Paste its
   contents into **Check an assistant answer…** and show the different match,
   contradiction and unverified outcomes. The checker does not execute the
   pasted test-success claim.
3. Choose **Safe logging control** to show a case with no supported findings.
   It is an authored control, not proof that a whole application is safe.
4. Choose **Empty implementation claim** if you want to demonstrate the body
   observations. Its function exists, but its implementation remains unverified.
5. If demonstrating live AI, first run a successful approved review on your
   configured backend. The **Ownership check removed** profile gives an
   example that local security rules do not resolve. The model's output is
   not scripted and may request policy context.

There are also **Password-shaped value in logs**, **TLS verification disabled**
and **Dynamic code execution** profiles. Show only the ones that fit the
video's time limit. The source samples, their before/after code, assistant
answers and expected outcomes live in [samples/profiles](../samples/profiles/README.md).

In the closing explanation, identify the model/provider, approved inputs,
structured outputs and local checking. See [AI implementation](ai-implementation.md)
for accurate wording and code references. No custom model training is involved.
