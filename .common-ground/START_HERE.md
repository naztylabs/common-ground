<!-- common-ground:start -->
# Start Here — Common Ground

Common Ground is an open-source framework for shared repository knowledge. Its notes cache verified repository patterns; code is the source of truth. Follow [AGENTS.md](../AGENTS.md); read [POLICY.md](POLICY.md) before edits.

## First use: complete setup

cground init installs guidance and MCP configuration, then writes a candidate map to .common-ground/local/bootstrap.json. It deliberately leaves knowledge.json absent until the developer approves the map; initialization alone does not make the knowledge workflow ready.

1. Read the bootstrap proposal, repository source and READMEs. Refine responsibility boundaries, chapters and ownership paths; remove generated files and cache directories. Explain the proposed map in plain language. The agent authors the JSON; the developer approves the boundaries.
2. After developer approval, run cground approve .common-ground/local/bootstrap.json --approve from the repository root. This creates .common-ground/knowledge.json with empty chapters. The flag records approval; it does not grant it.
3. Verify facts against source and documentation. Present the facts and evidence, ask "Ready to make the following facts available to the team?", and wait for approval. Then populate approved chapters using cground seed PILLAR/CHAPTER FACTS.json --approve with developer direction. Run task_context start again to begin the normal workflow.

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

Review [knowledge.json](knowledge.json) before committing knowledge changes. The advisory pre-commit hook checks staged knowledge and sources, reminds developers about review, and allows the commit. It does not approve or edit facts. Notifications are on by default; use cground hook mute to suppress them in this checkout and cground hook unmute to restore them. With an existing hook manager, add cground hook check to its pre-commit hook.

Commit knowledge.json, this guide and POLICY.md. Keep local/ ignored. Local task state can be removed after the task and admission review are complete; never remove another active task's files.
<!-- common-ground:end -->
