export const bootstrapNext = {action:'review-map-and-facts',approvalRequired:true,
  command:'cground bootstrap PLAN.json --dry-run',schema:'cground schema bootstrap',
  guide:'.common-ground/START_HERE.md',authorization:'Draft by default. Explicit developer delegation to save/publish the initial map may authorize publication within scope; flags and tokens do not supply permission.'};

export const rules = `## Common Ground

Code is the source of truth; these notes only help navigation.

For repository questions, use cground lookup with a path or short query for facts and source locations. Lookup is stateless; default freshness is not checked. Open source and directory READMEs before relying on claims. Use --verify when live freshness matters. Derive temporary state live.

Keep the developer task primary. After edits, cground assess --touched checks only this task's actual paths, including additions/deletions. No matching source change means no fact review or task bookkeeping; still review relevant local documentation. Source drift means check the affected claims, not automatic revision. Follow additional semantic connections found in source.

If corrections are needed, request assess --review. Before editing, read [.common-ground/POLICY.md](.common-ground/POLICY.md), every required chapter page and the listed sources/docs. prepare-patch works without taskId; complete review and conflict checks remain mandatory. Summarize actual corrections as before → after, why, source links and recommendation.

Task contexts are optional for aggregated reporting and deferred additions. Start one when needed; propose_facts queues drafts, finish after the main task, then ask "Ready to make the following facts available to the team?" New facts, chapters, pillars and ownership expansion need developer direction. If started, finish the task once; reuse cached responses only within it and refresh:true after context loss.

Default to no write. Keep durable patterns, not debugging history; library-local detail belongs in its README. Resolve disputed behavior with the developer. No change means no Common Ground report. Setup: [.common-ground/START_HERE.md](.common-ground/START_HERE.md).
`;

export const policy = `## Common Ground

Code is the source of truth. Notes cache durable repository knowledge; matching quotes and hashes establish mechanical consistency, not semantic truth.

### Reading and writing invariants

- Open relevant source and directory, ancestor, sibling, child and referenced documentation this session. Derive temporary state live. Do not record bugs, debugging history, activity logs, secrets or guesses.
- Default to no write. Unrelated work and unchanged facts produce no shared knowledge changes. Library-local detail belongs in its README. Each fact holds one coherent, source-backed claim of at most 2,000 characters.
- Review every existing fact in each required logical chapter before revision. Follow dependency and dependent links, request the review checklist, and verify all required source and documentation. A verification declaration does not prove an agent read or understood a file.
- Correct verified contradictions in the affected scope quietly, preserving IDs. Merge duplicates and remove superseded claims with explicit reasons and repaired references. Never clean up unrelated responsibilities. Ask if uncertainty blocks the task; otherwise collect it for completion.
- New facts, chapters, pillars and ownership expansion require developer direction. A new pillar also needs an uncovered standalone responsibility. Approval flags declare developer direction; they never grant autonomous permission or prove human review. Boundary approval does not approve facts. For initial setup, explicit delegation to save/publish may cover verified boundaries and facts within the requested scope; see START_HERE.md. Routine additions still follow the deferred approval workflow below.
- Chapter paths define non-overlapping ownership. Fact source scopes stay inside ownership; supporting evidence may cite other repository files and is tracked for freshness. Exact evidence, safe paths and valid dependencies remain mandatory.
- Publish a complete reviewed transaction. Source or registry conflicts reject publication. Unchanged reviews use ignored local receipts; only changed chapters are rewritten. Never bypass required tests based on notes.

### Quiet task workflow

Use stateless lookup for relevant facts and source paths; default freshness is not checked. After edits, assess actual task-touched paths (including additions and deletions). A matching unchanged source requires no fact review; changed source requires checking affected claims, not automatic revision. Review local/ancestor documentation relevant to the edit and follow semantic connections found in source. Empty touched paths require no review. Use assess --review when a correction needs complete chapters and verification paths. Neither command creates task state or requires finish.

Before correcting notes, read this policy and every page of all required chapters. prepare_patch attests reviewedAllFacts:true and the expected revision, then retains unchanged facts. Use prepare_patch without taskId and commit_update for verified corrections. Task contexts remain optional for aggregate reporting and deferred additions. Source or revision conflicts require fresh review. Citation-only repairs may use empty touchedPaths without a tidyId: only evidence may change; the fact ID, statement, sourceScope and dependsOn must remain unchanged. Supply a verified reason, read every required chapter, attest source/documentation verification and the expected revisions. Publication rechecks source and registry conflicts. Use review-plan and review-checklist for the selected chapter; do not invent touched paths.

For new facts, start a task when needed and queue them with propose_facts; pending drafts are never authoritative. Finish the developer task and checks, then finish any task context you started. Reuse cached task responses only within that task; refresh:true after context loss. Summarize actual corrections as before → after, why, source links and keep/reverify recommendation. Present additions together and ask "Ready to make the following facts available to the team?" Wait for explicit approval, read proposal-review and required chapters/source, then accept-facts with complete reviews and verification. Drop rejected entries first. Changed drafts need fresh verification and approval. Never require developer JSON review. With no changes or pending questions, give no Common Ground report.

Use tidy only for developer-requested cleanup. It returns a local tidyId; the calling agent reads source and submits verified corrections. Common Ground runs no model or autonomous watcher. If unavailable, continue safe task work and report unresolved maintenance; never claim a failed write succeeded. Host tool approval settings remain authoritative.

See START_HERE.md for commands and state-specific setup. Keep knowledge.json and managed guidance tracked; local/ is disposable and ignored. Never remove another active task's files.
`;

export const startGuide = `# Start Here — Common Ground

Common Ground is a framework for shared, Git-backed repository knowledge. Its interfaces are the CLI and local MCP server. Code is the source of truth.

## Initial setup: draft, verify, publish

1. Run cground init. It creates guidance, MCP configuration and a local candidate map without creating knowledge.json. Use --skip-hook if Git metadata is protected; hook permission failures are advisory and setup continues. The setup report lists completed, skipped, failed and pending steps. Retry safely after fixing a failure; existing registries and bootstrap drafts are preserved. Install the reminder later with cground hook install.
2. Read source and directory READMEs. Refine .common-ground/local/bootstrap.json into responsibility boundaries and verified facts. detections are raw technology/path signals; responsibilityHints and directory paths are suggestions. Inspect ownershipIncomplete, pathsTruncated, scan.truncated and unclassified samples. Expand or split incomplete boundaries. Follow coveragePrompts for release triggers, versioning, artifacts and publication where detected. Validity and unchanged evidence do not establish complete coverage.
3. Use cground schema bootstrap and cground bootstrap --help --example. Prepare pillars plus batches of chapterId/facts, then run cground bootstrap PLAN.json --dry-run. This validates the whole transaction without writes and returns source-file counts and a preflight token. JSON commands also accept --stdin.
4. Establish publication direction from the developer's request. “Initialize” or “generate a map” means draft by default. “Initialize and save/publish the map autonomously” explicitly delegates publication of verified initial boundaries and facts within that scope. Honor an existing delegation without asking again. Otherwise present the exact boundaries and facts in plain language and ask “Ready to make the following facts available to the team?” Wait for approval before publication. A draft-only request never authorizes publication; boundary-only approval never approves facts.
5. With publication direction, apply the same payload using --approve --preflight TOKEN, run cground check, and summarize what was saved with source links and remaining coverage gaps. Source or payload changes require a fresh dry run and verification; confirm they remain within any delegated scope, or obtain new content approval. Flags declare direction and tokens detect changes; neither proves human review, identity, semantic truth or completeness. Host tool approval settings still apply.

The bootstrap path above is self-contained for an empty registry. Before revising existing knowledge, read [POLICY.md](POLICY.md) and every required chapter/source page. For separate setup stages, cground approve creates boundaries only; seed-batch --dry-run and seed-batch --approve --preflight TOKEN populate approved empty chapters with authorized facts. Use command help for exact inputs.

A bootstrap-required or not-initialized response has no taskId. Continue the developer task from source. Never fabricate an empty registry or call task assess/propose/finish without a returned taskId. After setup, use lookup; task contexts are optional for deferred additions or aggregate reporting.

## My build failed. Where do I go?

Follow AGENTS.md for lookup and task-touched assessment. Lookup navigation contains separately labeled ownership/source hints, not facts; freshness is not checked by default. Read source when matches only partly cover a question. --verify checks selected facts and dependencies, not topic completeness or navigation hints.

For corrections, assess --review supplies complete chapters and verification paths. Read POLICY.md and every required page before prepare-patch and commit. For deferred additions and task reporting, POLICY.md describes the task_context workflow.

## Setup and review commands

- cground doctor checks setup; cground refresh-guidance updates managed instructions while preserving surrounding text. A healthy check returns next: null.
- cground check [TARGET] validates structure, exact evidence and freshness. --all-results includes passing rows; follow nextCursor. --cleanup y creates a developer-requested cleanup plan, not a completed repair.
- cground review [TARGET] summarizes changes against HEAD. --staged selects the index; --evidence includes changed quotations. Explain before → after, why, sources and a keep/approve/reverify recommendation.
- cground export refreshes [local/knowledge.md](local/knowledge.md), the ignored reference excluding drafts. Successful knowledge writes refresh it too.
- cground hook mute/unmute controls advisory reminders. Existing hook managers can call cground hook check.

Every command has --help. cground schema OPERATION gives CLI payloads; --both adds MCP arguments. Both MCP profiles expose these workflows through cground. Keep knowledge.json and managed guidance tracked; local/ is ignored. See POLICY.md for maintenance invariants and the framework's docs/pillar-contract.md and docs/quiet-workflow.md for full contracts.
`;
