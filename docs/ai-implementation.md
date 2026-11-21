# Patch's AI implementation

Patch uses a pretrained model through an API. It does not train a custom LLM.

1. The VS Code extension collects bounded excerpts of saved, tracked JS/TS
   changes against Git HEAD. It redacts recognizable secret patterns and shows
   the exact payload for explicit approval. Redaction is incomplete by design;
   users must inspect what they send.
2. A local authenticated review API sends the approved context to Groq's chat
   completions endpoint. The default configured model is
   `openai/gpt-oss-120b`; operators can select another compatible text model.
3. A fixed system prompt treats source code as untrusted data and requests a
   strict JSON assessment. Findings concern potential sensitive-data exposure
   and weakened access checks. Each finding requires source references and
   exact quotations, with assumptions and missing context. The model can
   propose bounded edits but cannot use tools or execute the target project.
4. Response validation checks the schema, request identity, file/revision
   references, line ranges and quotations. Invalid output is rejected.
5. The local verifier independently checks the Git baseline and saved-file
   hashes, re-matches quote receipts, and attempts supported CP002 static
   corroboration. Quote existence does not establish the model's security
   interpretation. General access-control policy remains unverified.
6. The user reviews the explanation and evidence. Applying a patch needs an
   explicit click plus saved-text and syntax checks; local static checks then
   rerun. Patch does not execute project tests or claim runtime verification.

The local scanner and assistant-claim auditor work without a model or backend.
A mock provider and the built-in evidence guard use explicitly labeled
synthetic data. Neither measures live AI accuracy.

Suggested narration:

> Patch uses a pretrained model to review approved code changes. The model
> proposes security findings with exact source quotations. Patch then checks
> those quotations against the saved code and runs its supported local rules.
> I can inspect the evidence while the model's interpretation stays unverified.

Implementation: `packages/ai/src/context.mjs`, `prompt.mjs`, `contract.mjs`,
`local-verification.mjs`; `services/review-api/src/providers.mjs`; and
`extensions/vscode/src/ai-client.cjs`.
