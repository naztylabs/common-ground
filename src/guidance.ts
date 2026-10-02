export const bootstrapNext = {action:'review-map-and-facts',approvalRequired:true,
  command:'cground bootstrap PLAN.json --dry-run',schema:'cground schema bootstrap',
  guide:'.common-ground/START_HERE.md'};

export const rules = `## Common Ground

Code is the source of truth; these notes only help navigation.

For repository questions, use cground lookup with a path or short query for facts and source locations. Lookup is stateless; default freshness is not checked. Open source and directory READMEs before relying on claims. Use --verify when live freshness matters. Derive temporary state live.

Keep the developer task primary. After edits, cground assess --touched checks only this task's actual paths, including additions/deletions. No matching source change means no fact review or task bookkeeping; still review relevant local documentation. Source drift means check the affected claims, not automatic revision. Follow additional semantic connections found in source.

If corrections are needed, request assess --review. Before editing, read [.common-ground/POLICY.md](.common-ground/POLICY.md), every required chapter page and the listed sources/docs. prepare-patch works without taskId; complete review and conflict checks remain mandatory. Summarize actual corrections as before → after, why, source links and recommendation.

Task contexts are optional for aggregated reporting and deferred additions. Start one when needed; propose_facts queues drafts, finish after the main task, then ask "Ready to make the following facts available to the team?" New facts, chapters, pillars and ownership expansion need developer direction. If started, finish the task once; reuse cached responses only within it and refresh:true after context loss.

Default to no write. Keep durable patterns, not debugging history; library-local detail belongs in its README. Resolve disputed behavior with the developer. No change means no Common Ground report. More: [.common-ground/START_HERE.md](.common-ground/START_HERE.md).
`;

export const policy = `## Common Ground

Code is the source of truth. Notes cache durable repository knowledge; matching quotes and hashes establish mechanical consistency, not semantic truth.

### Reading and writing invariants

- Open relevant source and directory, ancestor, sibling, child and referenced documentation this session. Derive temporary state live. Do not record bugs, debugging history, activity logs, secrets or guesses.
- Default to no write. Unrelated work and unchanged facts produce no shared knowledge changes. Library-local detail belongs in its README. Each fact holds one coherent, source-backed claim of at most 2,000 characters.
- Review every existing fact in each required logical chapter before revision. Follow dependency and dependent links, request the review checklist, and verify all required source and documentation. A verification declaration does not prove an agent read or understood a file.
- Correct verified contradictions in the affected scope quietly, preserving IDs. Merge duplicates and remove superseded claims with explicit reasons and repaired references. Never clean up unrelated responsibilities. Ask if uncertainty blocks the task; otherwise collect it for completion.
- New facts, chapters, pillars and ownership expansion require developer direction. A new pillar also needs an uncovered standalone responsibility. Approval flags declare approval of the exact content; they never grant autonomous permission. Boundary approval does not approve facts.
- Chapter paths define non-overlapping ownership. Fact source scopes stay inside ownership; supporting evidence may cite other repository files and is tracked for freshness. Exact evidence, safe paths and valid dependencies remain mandatory.
- Publish a complete reviewed transaction. Source or registry conflicts reject publication. Unchanged reviews use ignored local receipts; only changed chapters are rewritten. Never bypass required tests based on notes.

### Quiet task workflow

Use stateless lookup for relevant facts and source paths; default freshness is not checked. After edits, assess actual task-touched paths (including additions and deletions). A matching unchanged source requires no fact review; changed source requires checking affected claims, not automatic revision. Review local/ancestor documentation relevant to the edit and follow semantic connections found in source. Empty touched paths require no review. Use assess --review when a correction needs complete chapters and verification paths. Neither command creates task state or requires finish.

Before correcting notes, read this policy and every page of all required chapters. prepare_patch attests reviewedAllFacts:true and the expected revision, then retains unchanged facts. Use prepare_patch without taskId and commit_update for verified corrections. Task contexts remain optional for aggregate reporting and deferred additions. Source or revision conflicts require fresh review.

For new facts, start a task when needed and queue them with propose_facts; pending drafts are never authoritative. Finish the developer task and checks, then finish any task context you started. Reuse cached task responses only within that task; refresh:true after context loss. Summarize actual corrections as before → after, why, source links and keep/reverify recommendation. Present additions together and ask "Ready to make the following facts available to the team?" Wait for explicit approval, read proposal-review and required chapters/source, then accept-facts with complete reviews and verification. Drop rejected entries first. Changed drafts need fresh verification and approval. Never require developer JSON review. With no changes or pending questions, give no Common Ground report.

Use tidy only for developer-requested cleanup. It returns a local tidyId; the calling agent reads source and submits verified corrections. Common Ground runs no model or autonomous watcher. If unavailable, continue safe task work and report unresolved maintenance; never claim a failed write succeeded. Host tool approval settings remain authoritative.

See START_HERE.md for commands and state-specific setup. Keep knowledge.json and managed guidance tracked; local/ is disposable and ignored. Never remove another active task's files.
`;

export const startGuide = `# Start Here — Common Ground

Common Ground is an open-source framework for shared, Git-backed repository knowledge. The CLI and local MCP server are its interfaces. Follow AGENTS.md and read [POLICY.md](POLICY.md) before knowledge edits.

## First use: complete setup

Run cground init. It installs guidance/configuration and writes a candidate map to .common-ground/local/bootstrap.json without creating knowledge.json. Read source and READMEs, refine boundaries and verify facts. Discovery labels are hints, not facts.

Use cground schema bootstrap for the input schema and cground bootstrap --help --example for a synthetic payload. Submit pillars plus batches of chapterId/facts to cground bootstrap PLAN.json --dry-run. Preflight checks the whole transaction and reports source-file counts without writes. Present boundaries and facts in plain language; distinguish their approvals and ask "Ready to make the following facts available to the team?" Only after developer approval, apply the same payload with --approve --preflight TOKEN. Source or payload changes require a new dry run and review. The receipt records the approved content token; it is not proof of identity or semantic truth.

The separate workflow remains available: cground approve .common-ground/local/bootstrap.json --approve approves boundaries only. Facts still require approval. cground seed-batch BATCH.json --dry-run checks multiple approved empty chapters together; apply with --approve --preflight TOKEN. Single-chapter cground seed PILLAR/CHAPTER FACTS.json --approve also works. JSON input commands accept --stdin instead of a filename, or - as the filename. cground schema seed shows the facts-array shape.

A bootstrap-required or not-initialized response has no taskId. Continue the main task from source; do not assess, propose facts or finish until task_context start returns a taskId. Never fabricate an empty registry to suppress setup. After approved setup, use lookup; start a task only when deferred additions or aggregate reporting need one. Run init to recreate a missing proposal or refresh managed guidance; existing registries are preserved.

## My build failed. Where do I go?

1. Inspect the failure, current checkout and directory README. Use cground lookup --path PATH or a short query. It returns a few facts and source paths without task state; --verify checks selected facts and upstream evidence. Default freshness is not checked.
2. Do the developer task. Run cground assess --touched PATH1,PATH2 using only its actual changed paths. It compares source fingerprints for matching facts. No-fact-review needs only relevant documentation/source review; source-review-required lists claims to verify. Source drift does not prove a claim false.
3. If a claim needs correction, rerun assess with --review for paginated complete chapters, evidence and verification paths. Read every required page and source/document before preparing. cground prepare-patch PATCH.json accepts no taskId for a standalone correction; cground commit PROPOSAL_ID rechecks conflicts. Summarize the actual correction directly. No start/finish ceremony is required.
4. For deferred additions or aggregate correction reporting, the original task_context workflow remains available. Start once when needed, queue new facts locally, finish after the main task and tests, and present one approval batch. Complete whole-chapter review and explicit admission approval still apply.


## Commands and review

Every command supports --help without running it. cground schema OPERATION exposes its input shape; the MCP equivalent is cground operation:help with args.operation. Both MCP profiles expose all workflows through cground; the default profile also has five compact workflow tools, while --profile full retains the original detailed tools. Approval flags never override host approval settings.

cground validate [TARGET] checks all knowledge, a pillar, chapter or fact. It reports failures by default; --all-results includes passing rows. Follow nextCursor when present. Exit 1 means stale, invalid or unpopulated. Checks refresh the ignored Markdown reference without changing shared facts. --cleanup y requires developer-requested cleanup and returns a local tidyId for the calling agent to verify and submit corrections. Validation is not semantic verification.

cground review [TARGET] summarizes meaningful changes against HEAD; --staged reviews the index and --evidence includes changed quotes. Explain before → after, why, source links and a keep/approve/reverify recommendation. Never ask developers to edit JSON. Revision-only churn is omitted.

cground export refreshes [local/knowledge.md](local/knowledge.md), the complete generated reference. It excludes pending drafts and is not proof of source validity. Successful knowledge writes also refresh it. Mutation receipts are compact; --verbose on approve, approve-chapters, seed and admit returns full objects.

The advisory pre-commit hook checks staged knowledge and sources, reminds the developer to review, and allows the commit. It never approves or changes facts. Use cground hook mute/unmute for this checkout; existing hook managers can call cground hook check.

Keep knowledge.json, this guide and POLICY.md in Git. Keep local/ ignored and retain active tasks until their review is complete. Detailed contracts and request formats are in docs/pillar-contract.md and docs/quiet-workflow.md in the framework repository.
`;
