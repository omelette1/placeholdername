# Patch intro slide sources

## Code adoption, 2025–2026

Google's April 22, 2026 Cloud Next remarks report that AI generates 75% of
Google's new code and engineers approve it. The same statement compares this
with 50% in the previous fall, interpreted as fall 2025.

Source: https://blog.google/innovation-and-ai/infrastructure-and-cloud/google-cloud/cloud-next-2026-sundar-pichai/

These company-specific shares are not estimates for all software worldwide.
The slide uses the same statement for both points rather than mixing survey
populations or treating a forecast as an observed result.

## Security benchmark

Veracode's 2025 GenAI Code Security Report reports known security flaws in 45%
of generation tasks in its targeted test. It tests over 100 models on 80 tasks
across four languages and four vulnerability classes without security-specific
prompting, using its SAST tool to assess results.

Source: https://www.veracode.com/wp-content/uploads/2025_GenAI_Code_Security_Report_Final.pdf

This is a benchmark result, not production vulnerability prevalence, a result
for every current model, or Patch's measured accuracy. The task classes and
languages do not imply equivalent coverage in Patch.

## Recording order

Use the adoption/security slide before the demo and the implementation slide
after it. Full source URLs and interpretation notes are also in the deck's
speaker notes. Show the profiles as authored demonstrations and label any
mock AI output as synthetic. Patch's regression tests do not establish
real-world model precision or recall.
