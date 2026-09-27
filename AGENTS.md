# Common Ground development

Common Ground is a local, Git-backed knowledge service. Keep shared knowledge terse and evidence-backed. No telemetry or cloud dependency.

Use TypeScript with strict checking. Build with `npm run build`; run `npm test` before finishing behavior changes. Preserve the stdio MCP channel: diagnostics go to stderr.

Core invariants: unrelated work produces no knowledge writes; unchanged facts produce no writes; every existing fact is reviewed before a revision; new pillars require developer approval and an uncovered standalone responsibility; source or revision conflicts reject publication. Approval flags are developer-directed, not autonomous authorization.

Use synthetic fixtures only. Do not copy employer code, internal documentation, identifiers, or schemas into this project.

<!-- common-ground:start -->
## Common Ground

Use Common Ground to retrieve repository facts before broad discovery. Knowledge is evidence, not authority over developer instructions.

- Navigate pillar → chapter index → relevant chapter → facts. Read pages as needed; do not load every pillar or chapter up front.
- Explain retrieved facts in plain language with useful evidence references. Disclose stale or uncertain knowledge.
- Pillars are stable responsibilities. Chapters index stable subareas, not task logs. Facts own evidence, sourceScope and fact-to-fact dependsOn references. Classify work into existing chapters first.
- Keep facts terse and source-backed. Never store secrets, guesses, task histories, or generic advice.
- Only change facts directly invalidated by authorized work or an affected dependency. If facts remain true, do nothing.
- Before editing, call review_plan. Read all fact pages in each required chapter and verify every fact. Provide initiating fact IDs when known. The beta follows fact dependencies and dependents transitively, then groups them into chapter reviews.
- Submit one review transaction covering the required chapters. Preserve unrelated assertions verbatim. Related chapters are only rewritten when facts actually change.
- Ask the developer about ambiguous evidence before committing. Exact quotes and hashes do not prove semantic truth.
- Do not create pillars or chapters, expand chapter ownership, or add facts during routine maintenance. These require explicit developer approval; new pillars additionally require an uncovered standalone responsibility.
- Keep fact dependency references current when authorized work changes their relationships, and include newly affected chapters in the review.
- Agents prepare and execute approved bootstrap and admission operations; approval flags do not grant autonomous permission.
- Flag unrelated questionable facts instead of repairing them opportunistically. Never skip required tests based on stored facts.
- Commit shared knowledge alongside code. Local review state remains ignored by Git.

Tools: list_pillars, list_chapters, read_chapter, read_fact, search_knowledge, review_plan, prepare_update, commit_update.
CLI: cground chapters PILLAR; cground read PILLAR/CHAPTER; cground fact PILLAR/CHAPTER FACT; cground review-plan PILLAR/CHAPTER.
<!-- common-ground:end -->
