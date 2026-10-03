<!-- common-ground:start -->
# Start Here — Common Ground

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
<!-- common-ground:end -->
