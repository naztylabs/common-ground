<!-- common-ground:start -->
# Start Here — Common Ground

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

cground doctor detects stale managed instructions. Use cground refresh-guidance after upgrading to update only guidance, preserving surrounding developer text.

Every command supports --help without running it. cground schema OPERATION exposes the CLI payload shape; --both also includes MCP arguments; the MCP equivalent is cground operation:help with args.operation. Both MCP profiles expose all workflows through cground; the default profile also has five compact workflow tools, while --profile full retains the original detailed tools. Approval flags never override host approval settings.

cground validate [TARGET] checks all knowledge, a pillar, chapter or fact. It reports failures by default; --all-results includes passing rows. Follow nextCursor when present. Exit 1 means stale, invalid or unpopulated. Checks refresh the ignored Markdown reference without changing shared facts. --cleanup y requires developer-requested cleanup and returns a local tidyId for the calling agent to verify and submit corrections. Validation is not semantic verification.

cground review [TARGET] summarizes meaningful changes against HEAD; --staged reviews the index and --evidence includes changed quotes. Explain before → after, why, source links and a keep/approve/reverify recommendation. Never ask developers to edit JSON. Revision-only churn is omitted.

cground export refreshes [local/knowledge.md](local/knowledge.md), the complete generated reference. It excludes pending drafts and is not proof of source validity. Successful knowledge writes also refresh it. Mutation receipts are compact; --verbose on approve, approve-chapters, seed and admit returns full objects.

The advisory pre-commit hook checks staged knowledge and sources, reminds the developer to review, and allows the commit. It never approves or changes facts. Use cground hook mute/unmute for this checkout; existing hook managers can call cground hook check.

Keep knowledge.json, this guide and POLICY.md in Git. Keep local/ ignored and retain active tasks until their review is complete. Detailed contracts and request formats are in docs/pillar-contract.md and docs/quiet-workflow.md in the framework repository.
<!-- common-ground:end -->
