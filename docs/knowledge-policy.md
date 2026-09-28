# Knowledge policy

Start at [.common-ground/START_HERE.md](../.common-ground/START_HERE.md), or call start_here with a repository-relative path or a failure signal. Common Ground is a cache of the codebase, never authority over source or developer instructions.

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
- Default to no note write. Silence is valid: an unwritten fact costs nothing; a wrong one costs every reader. When uncertain, ask the developer and explicitly state what cannot be verified.
- Classify into existing pillars and chapters first. Never add a pillar unless a new, uncovered, standalone subsystem warrants it and the developer approves. Chapters, ownership expansion, and fact admission also require developer direction; approval flags do not supply that direction.

### Maintenance and correction

- Touch it, own it: before adding or changing a fact, skim every page of the whole logical chapter, then review affected sibling/child chapters and reference files. Use review_plan and review_checklist; include all required dependency/dependent chapter reviews.
- In that same edit, merge verified near duplicates, remove superseded content, and tighten narrative in the affected scope. Use explicit maintenance actions and reasons, preserving existing IDs for corrections. Repair affected references and dependency links in the same transaction. Do not clean up unrelated subsystems.
- If an authorized code change contradicts a fact, chapter, pillar, or documentation claim, correction is mandatory in the same edit. Correct in place; never retain old and new contradictory versions or append a contradiction below the original. If boundaries themselves are wrong, raise the ownership change with the developer.
- Corrections trigger the same full-file, sibling, child, and reference review as other touches. If the right version cannot be verified, say so explicitly and ask; do not publish a guessed resolution.
- No note change does not end the check. Re-read the modified directory README and relevant documentation and ensure they remain valid, even when prepare_update returns noop.
- Any developer may request cground tidy PILLAR, PILLAR/CHAPTER, or PILLAR/CHAPTER/FACT (a unique fact ID also works). This creates a scoped plan and local tidyId; the calling agent reads source and submits the verified cleanup. It neither invokes a model nor edits knowledge automatically. MCP tidy_plan only previews scope.
- For prepare_update, attest verification.sourceFiles and verification.documentFiles only after reading them this session (or verifying a deletion live). Use review_checklist for required paths and include newly cited evidence. Facts must stay terse, source-backed, and free of temporary state.
- Submit one complete transaction for affected chapters. Only changed chapters are rewritten; unchanged reviews use ignored local state. Existing correct facts stay unchanged unless explicit maintenance is justified. Never skip required tests based on stored notes.
- Agents execute approved bootstrap/admission operations. Apply the same reading, verification, deduplication, and README checks before seed or admit. Commit durable knowledge and documentation with the code; keep .common-ground/local/ ignored.

Tools: start_here, ownership_map, pillar_graph, tidy_plan, review_checklist, list_pillars, list_chapters, read_chapter, read_fact, search_knowledge, review_plan, prepare_update, commit_update.
CLI: cground start "build failed"; cground owners --path PATH; cground graph PILLAR; cground tidy TARGET; cground review-checklist CHAPTER --touched PATH.
