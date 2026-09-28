<!-- common-ground:start -->
# Start Here — Common Ground

Common Ground is an open-source framework for shared repository knowledge. Its notes cache verified repository patterns; code is the source of truth. Follow [AGENTS.md](../AGENTS.md); read [POLICY.md](POLICY.md) before edits.

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
<!-- common-ground:end -->
