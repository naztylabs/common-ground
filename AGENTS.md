# Common Ground development

Common Ground is an open-source framework for shared, Git-backed repository knowledge. Describe the project as a framework developers can adopt and extend; the CLI and local MCP server are its interfaces. Keep shared knowledge terse and evidence-backed. No telemetry or cloud dependency.

Use TypeScript with strict checking. Build with `npm run build`; run `npm test` before finishing behavior changes. Preserve the stdio MCP channel: diagnostics go to stderr.

Core invariants: unrelated work produces no knowledge writes; unchanged facts produce no writes; every existing fact is reviewed before a revision; new pillars require developer approval and an uncovered standalone responsibility; source or revision conflicts reject publication. Approval flags are developer-directed, not autonomous authorization.

Use synthetic fixtures only. Do not copy employer code, internal documentation, identifiers, or schemas into this project.

<!-- common-ground:start -->
## Common Ground

Code is the source of truth; these notes only help navigation.

For repository questions, use cground lookup with a path or short query for facts and source locations. Lookup is stateless; default freshness is not checked. Open source and directory READMEs before relying on claims. Use --verify when live freshness matters. Derive temporary state live.

Keep the developer task primary. After edits, cground assess --touched checks only this task's actual paths, including additions/deletions. No matching source change means no fact review or task bookkeeping; still review relevant local documentation. Source drift means check the affected claims, not automatic revision. Follow additional semantic connections found in source.

If corrections are needed, request assess --review. Before editing, read [.common-ground/POLICY.md](.common-ground/POLICY.md), every required chapter page and the listed sources/docs. prepare-patch works without taskId; complete review and conflict checks remain mandatory. Summarize actual corrections as before → after, why, source links and recommendation.

Task contexts are optional for aggregated reporting and deferred additions. Start one when needed; propose_facts queues drafts, finish after the main task, then ask "Ready to make the following facts available to the team?" New facts, chapters, pillars and ownership expansion need developer direction. If started, finish the task once; reuse cached responses only within it and refresh:true after context loss.

Default to no write. Keep durable patterns, not debugging history; library-local detail belongs in its README. Resolve disputed behavior with the developer. No change means no Common Ground report. Setup: [.common-ground/START_HERE.md](.common-ground/START_HERE.md).
<!-- common-ground:end -->
