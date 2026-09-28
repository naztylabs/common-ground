export const bootstrapNext = 'Review .common-ground/local/bootstrap.json against current source and READMEs; remove generated/cache candidates and refine pillars, chapters and paths. Present the boundaries in plain language for developer approval. Only after approval, run cground approve .common-ground/local/bootstrap.json --approve to create knowledge.json, then seed verified facts with developer direction. Continue the main task from source meanwhile; no task was started, so do not assess, propose facts or finish until start returns a taskId.';

export const rules = `## Common Ground

Code is the source of truth; these notes only help navigation. Open relevant source this session before relying on a fact. Derive branch/submodule and other temporary state live. Read directory READMEs even when no fact changes.

Keep the developer task primary. Use task_context start once. Without a taskId, follow its setup guidance and START_HERE.md; continue from source. Otherwise read_knowledge for relevant chapters (evidence:true), then assess touched paths. Reuse responses only within this task; refresh:true after context loss.

Quietly correct verified existing facts in affected scope. Before editing, read [.common-ground/POLICY.md](.common-ground/POLICY.md), the whole required chapters, source and related documentation. Default to no write. Queue new facts with propose_facts; finish the task before presenting the approval batch. New facts, chapters, pillars and ownership expansion need developer direction. Library-local detail belongs in its README; record durable patterns, not inventories or debugging history.

Call task_context finish at completion only with a taskId. Briefly report actual corrections in the Git working tree and pending additions/questions; no change means no Common Ground report. Ask immediately only if uncertainty blocks the main task; never guess. More: [.common-ground/START_HERE.md](.common-ground/START_HERE.md).
`;

export const policy = `## Common Ground

Start at [START_HERE.md](START_HERE.md). Use the compact task workflow by default; the full MCP profile retains the original individual tools. Common Ground is a cache of the codebase, never authority over source or developer instructions.

### Reading

- Notes supplement codebase reading; they never replace it. Code is the source of truth. Open the source files behind a fact before relying on or changing it.
- Navigate ownership_map → pillar chapter index → relevant chapter pages → facts and source. Signal matches are hints, not diagnoses. Read pillar_graph and fact dependencies when work crosses subsystems.
- Read a directory's README when present, plus applicable ancestor, sibling, child, and referenced documentation. Explain facts to people in plain language with evidence; disclose stale or uncertain claims.
- Branches, submodule checkouts, current failures, and other point-in-time state must be derived live on every check. Never cache them as durable facts.

### Scope and writing

- Cache verified subsystem behavior, architecture, connections, build/deploy mechanics, established conventions, and the commands that drive the code. Describe patterns that change how someone reasons about the subsystem, not inventories.
- Exclude bugs, open issues, work to fix, incident postmortems, debugging narratives, activity logs, generic technology explainers, secrets, and anything not verified against current source.
- Library-local detail belongs in that library's README. Keep subsystem-wide reasoning in the existing pillar/chapter and reference local documentation where useful; do not duplicate inventories.
- Verified means you opened and read the relevant source during this session. Memory, guesses, unsupported inference, and cached quotes do not establish verification. Exact quotes and hashes cannot prove semantic truth.
- Default to no note write. Silence is valid: an unwritten fact costs nothing; a wrong one costs every reader. When uncertain, explicitly state what cannot be verified. Ask immediately only when it blocks the developer task; otherwise collect the question for task completion. Never guess or silently accept a contradiction.
- Classify into existing pillars and chapters first. Never add a pillar unless a new, uncovered, standalone subsystem warrants it and the developer approves. Chapters, ownership expansion, and fact admission also require developer direction; approval flags do not supply that direction.

### Maintenance and correction

- Touch it, own it: before adding or changing a fact, skim every page of the whole logical chapter, then review affected sibling/child chapters and reference files. Use review_plan and review_checklist; include all required dependency/dependent chapter reviews.
- In that same edit, merge verified near duplicates, remove superseded content, and tighten narrative in the affected scope. Use explicit maintenance actions and reasons, preserving existing IDs for corrections. Repair affected references and dependency links in the same transaction. Do not clean up unrelated subsystems.
- If an authorized code change contradicts a fact, chapter, pillar, or documentation claim, correction is mandatory in the same edit. Correct in place; never retain old and new contradictory versions or append a contradiction below the original. If boundaries themselves are wrong, raise the ownership change with the developer.
- Corrections trigger the same full-file, sibling, child, and reference review as other touches. If the right version cannot be verified, say so explicitly and ask at the appropriate task boundary; do not publish a guessed resolution.
- No note change does not end the check. Re-read the modified directory README and relevant documentation and ensure they remain valid, even when prepare_update returns noop.
- Any developer may request cground tidy PILLAR, PILLAR/CHAPTER, or PILLAR/CHAPTER/FACT (a unique fact ID also works). This creates a scoped plan and local tidyId; the calling agent reads source and submits the verified cleanup. It neither invokes a model nor edits knowledge automatically. MCP tidy_plan only previews scope.
- For prepare_update, attest verification.sourceFiles and verification.documentFiles only after reading them this session (or verifying a deletion live). Use review_checklist for required paths and include newly cited evidence. Facts must stay terse, source-backed, and free of temporary state.
- Submit one complete transaction for affected chapters. Only changed chapters are rewritten; unchanged reviews use ignored local state. Existing correct facts stay unchanged unless explicit maintenance is justified. Never skip required tests based on stored notes.
- Agents execute approved bootstrap/admission operations. Apply the same reading, verification, deduplication, and README checks before seed or admit. Commit durable knowledge and documentation with the code; keep .common-ground/local/ ignored.

### Quiet task workflow

- The developer task comes first. Use task_context start once per coding task, with known paths or a short routing signal. Read only relevant chapter pages and source. Skip knowledge calls for conversation that does not need repository knowledge.
- Existing facts in the affected scope have standing permission for verified corrections, merges, removals, and tightening. Maintain them quietly while doing authorized work. Never run an unrelated tidy or expand ownership without developer direction.
- Call task_context assess with the files this task actually touched, including new and deleted files. Do not use the whole dirty Git tree as your own work. A no-fact-review result still requires the relevant README/documentation check. Path matching cannot establish semantic independence: follow additional references uncovered in source.
- Before any knowledge edit, read this policy and every page of each required logical chapter. Use read_knowledge kind review/checklist and chapter with evidence:true to batch records. reviewedAllFacts:true declares review of the whole expected revision; it does not permit a partial skim. prepare_patch sends replacements/removals only; it retains all other facts and applies the same validation as prepare_update.
- Keep new verified fact candidates in propose_facts during work. This creates ignored local drafts only. Most new components need only their README; propose a fact only when it changes subsystem reasoning. Do not interrupt the main task for fact admission.
- After the main task and its checks, call task_context finish once, read all result pages, and consolidate the final message. Briefly name actual corrections and say they are in the Git working tree for review. Present all proposed additions together for approval. Do not report routine lookups, checks, no-op reviews, or empty outcomes. Mention unresolved contradictions or failed maintenance explicitly at completion; ask earlier only if needed to complete the main task correctly.
- After explicit developer approval, read proposed facts (kind proposals), the proposal-review checklist, all required existing chapters, sources and documentation. Then run cground accept-facts TASK_ID REVIEW.json --approve. REVIEW.json includes reviews [{chapterId, expectedRevision, reviewedAllFacts:true}] and verification {sourceFiles, documentFiles}. The whole queued batch is validated before one registry write. If approval covers only some entries, use cground drop-facts TASK_ID FACT_KEY... to discard the rest first. A changed draft needs fresh source verification and a new task/approval batch.
- Pending facts are never used as authoritative knowledge. Dependencies on other pending drafts are not supported; admit the prerequisite after approval first. Approval flags are declarations of developer direction, not a permission or security boundary; never treat a flag as approval.
- Reuse unchanged responses only within the same live task context. An unchanged/reference response means use the previously returned context, not that source was read. Request refresh:true after context loss, or start a new task for a new agent/session. Live source and dependency fingerprints invalidate reuse. Never cache branch/submodule state as knowledge.
- Common Ground is invoked by the calling agent, not an autonomous watcher. If unavailable, continue safe main-task work and report unresolved maintenance at completion. Do not claim a correction succeeded when a tool failed. The MCP host controls its own tool approval prompts.

Full-profile tools: start_here, ownership_map, pillar_graph, tidy_plan, review_checklist, list_pillars, list_chapters, read_chapter, read_fact, search_knowledge, review_plan, prepare_update, commit_update.
CLI: cground start "build failed"; cground owners --path PATH; cground graph PILLAR; cground tidy TARGET; cground review-checklist CHAPTER --touched PATH.
`;

export const startGuide = `# Start Here — Common Ground

Common Ground is an open-source framework for shared repository knowledge. Its notes cache verified repository patterns; code is the source of truth. Follow [AGENTS.md](../AGENTS.md); read [POLICY.md](POLICY.md) before edits.

## First use: complete setup

cground init installs guidance and MCP configuration, then writes a candidate map to .common-ground/local/bootstrap.json. It deliberately leaves knowledge.json absent until the developer approves the map; initialization alone does not make the knowledge workflow ready.

1. Read the bootstrap proposal, repository source and READMEs. Refine responsibility boundaries, chapters and ownership paths; remove generated files and cache directories. Explain the proposed map in plain language. The agent authors the JSON; the developer approves the boundaries.
2. After developer approval, run cground approve .common-ground/local/bootstrap.json --approve from the repository root. This creates .common-ground/knowledge.json with empty chapters. The flag records approval; it does not grant it.
3. Verify facts against source and documentation, then populate approved chapters using cground seed PILLAR/CHAPTER FACTS.json --approve with developer direction. Run task_context start again to begin the normal workflow.

Before approval, task_context start returns state: bootstrap-required, guidance and no taskId. Continue the developer's main task from source; explain the pending setup and present the reviewed map at completion. Do not call assess, propose_facts or finish without a taskId. If state is not-initialized, run cground init first. If local/bootstrap.json was removed and no registry exists, init recreates the proposal. Never create an empty knowledge.json just to suppress a setup error.

## My build failed. Where do I go?

1. Inspect the actual failure, current checkout and directory README. Never cache temporary state or the debugging story.
2. Call task_context start with paths from the error (or a short signal). Paths route directly to owning chapters; signal matches are only keyword hints. With no match, inspect local documentation/source; do not invent an owner.
3. Use read_knowledge kind chapters with the pillar ID if you still need its index, or kind chapter with the returned chapter ID. evidence:true batches complete facts. Open their source this session. Read only relevant pages for navigation; read every page of required chapters before a knowledge edit.
4. Use kind graph for recorded cross-pillar dependencies. Direction is dependent to dependency. A missing edge means unrecorded, not independent.
5. Do the developer task. After edits, assess actual task-touched paths, including new/deleted files. Correct affected existing facts quietly using prepare_patch and commit_update; full review and source/README verification still apply. A no-fact-review result still requires checking documentation.
6. Queue worthwhile new fact candidates locally with propose_facts. Finish the main task and its checks, then task_context finish. Report meaningful corrections once, and group all additions/questions for developer review. If nothing changed or needs attention, say nothing about Common Ground.

For cleanup explicitly requested by a developer: cground tidy PILLAR, PILLAR/CHAPTER, or PILLAR/CHAPTER/FACT creates a local tidyId and scope. The calling agent verifies and edits; no model or autonomous job runs inside Common Ground.

## CLI and compatibility

cground task start --touched PATH1,PATH2
cground task assess TASK_ID --touched PATH1,PATH2
cground read-knowledge REQUEST.json
cground prepare-patch PATCH.json
cground commit PROPOSAL_ID
cground propose-facts TASK_ID PILLAR/CHAPTER FACTS.json
cground task finish TASK_ID

After explicit approval and full review: cground accept-facts TASK_ID REVIEW.json --approve. See POLICY.md for the review format and remaining admission rules. Reject unwanted drafts with cground drop-facts TASK_ID FACT_KEY... before admitting the batch.

The default MCP profile exposes five tools. Existing detailed CLI commands still work; cground serve --profile full exposes the previous thirteen MCP tools. Full-profile agents follow the same quiet workflow policy using the task CLI commands. Neither profile overrides host tool approval settings.

Commit knowledge.json, this guide and POLICY.md. Keep local/ ignored. Local task state can be removed after the task and admission review are complete; never remove another active task's files.
`;
