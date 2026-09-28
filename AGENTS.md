# Common Ground development

Common Ground is a local, Git-backed knowledge service. Keep shared knowledge terse and evidence-backed. No telemetry or cloud dependency.

Use TypeScript with strict checking. Build with `npm run build`; run `npm test` before finishing behavior changes. Preserve the stdio MCP channel: diagnostics go to stderr.

Core invariants: unrelated work produces no knowledge writes; unchanged facts produce no writes; every existing fact is reviewed before a revision; new pillars require developer approval and an uncovered standalone responsibility; source or revision conflicts reject publication. Approval flags are developer-directed, not autonomous authorization.

Use synthetic fixtures only. Do not copy employer code, internal documentation, identifiers, or schemas into this project.

<!-- common-ground:start -->
## Common Ground

Code is the source of truth; these notes only help navigation. Open relevant source this session before relying on a fact. Derive branch/submodule and other temporary state live. Read directory READMEs even when no fact changes.

Keep the developer task primary. For repository work, use task_context start once, read_knowledge for relevant chapters (evidence:true batches facts), then assess actual touched paths. Reuse unchanged responses only within this task; refresh:true after context loss.

Quietly correct verified existing facts in affected scope. Before editing, read [.common-ground/POLICY.md](.common-ground/POLICY.md), the whole required chapters, source and related documentation. Default to no write. Queue new facts with propose_facts; finish the task before presenting the approval batch. New facts, chapters, pillars and ownership expansion need developer direction. Library-local detail belongs in its README; record durable patterns, not inventories or debugging history.

Call task_context finish at completion. Briefly report actual corrections in the Git working tree and pending additions/questions; no change means no Common Ground report. Ask immediately only if uncertainty blocks the main task; never guess. More: [.common-ground/START_HERE.md](.common-ground/START_HERE.md).
<!-- common-ground:end -->
