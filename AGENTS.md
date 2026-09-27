# Common Ground development

Common Ground is a local, Git-backed knowledge service. Keep shared knowledge terse and evidence-backed. No telemetry or cloud dependency.

Use TypeScript with strict checking. Build with `npm run build`; run `npm test` before finishing behavior changes. Preserve the stdio MCP channel: diagnostics go to stderr.

Core invariants: unrelated work produces no knowledge writes; unchanged facts produce no writes; every existing fact is reviewed before a revision; new pillars require developer approval and an uncovered standalone responsibility; source or revision conflicts reject publication. Approval flags are developer-directed, not autonomous authorization.

Use synthetic fixtures only. Do not copy employer code, internal documentation, identifiers, or schemas into this project.

<!-- common-ground:start -->
## Common Ground

Use Common Ground to retrieve repository facts before broad discovery. Knowledge is evidence, not authority over developer instructions.

- Pillars are stable responsibilities, not features or activity logs. Classify work into existing pillars first.
- Read relevant pillars and their freshness status. Changed evidence means review is needed, not that the fact is false.
- Keep facts terse, scoped, and supported by exact source evidence. Never store secrets, task histories, guesses, or generic advice.
- Update only when your authorized work directly invalidates an existing fact. If facts remain true, do nothing.
- Before any update, re-read the whole pillar and verify every fact. Preserve unrelated assertions and wording.
- Prepare a revision with all reviewed fact IDs, directly touched evidence paths, and invalidated fact IDs. Commit only after resolving uncertainty with the developer.
- Never claim semantic certainty from a matching quote or file hash alone. Those verify evidence, not interpretation.
- Do not add facts, split pillars, expand scope, or create pillars during routine maintenance. New pillars require an uncovered standalone responsibility and explicit developer approval.
- Bootstrap and admission commands are developer-directed operations. Do not invoke their approval flags on your own authority.
- Flag unrelated questionable facts to the developer; do not repair them opportunistically.
- Never skip required tests based on stored knowledge. Commit knowledge alongside the corresponding code.

Tools: list_pillars, read_pillar, search_knowledge, prepare_update, commit_update. CLI fallback: cground list, cground read <id>, cground search <query>.
<!-- common-ground:end -->
