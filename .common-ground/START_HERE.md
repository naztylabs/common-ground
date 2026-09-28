<!-- common-ground:start -->
# Start Here — Common Ground

Code is the source of truth. This durable knowledge base is a cache of verified repository patterns, not a replacement for source reading. Follow the Common Ground rules in [AGENTS.md](../AGENTS.md).

## My build failed. Where do I go?

1. Read the actual failure and derive the current branch, submodule checkout, and command state live. Do not store the failure or debugging story as a fact.
2. Read the README in the relevant directory and applicable ancestor guidance.
3. Run cground start "build failed" (MCP: start_here with signal), or cground owners --path path/from/the/error (ownership_map with path). A path maps to its registered owner. Symptom text only produces keyword candidates; inspect scopes and source instead of treating a match as a diagnosis.
4. Call list_chapters for the owning pillar. Read the relevant chapter pages and read_fact evidence, then open the cited source files in this session. If ownership is missing or ambiguous, inspect local READMEs and ask; do not invent a new pillar.
5. Use cground graph PILLAR (pillar_graph) when CI, workspace tooling, and application builds connect. Arrows mean “depends on.” This view is derived from fact references; missing edges mean a relationship has not been recorded, not that it does not exist.
6. Follow the verified repository command or contract to investigate. Store only durable patterns that change how someone reasons about the subsystem, after the normal admission review.

## After changing code

Call review_plan, then review_checklist with the required chapter IDs and touched paths. Read all fact pages and source, directory READMEs, relevant sibling/child documentation, and referenced files. Correct contradictions, merge verified near duplicates, remove superseded content, and tighten narrative in the same edit. Correct existing records in place and update affected references atomically. If no note changes are justified, still check the README before moving on.

To request focused cleanup, a developer can ask their agent to run cground tidy PILLAR or cground tidy PILLAR/CHAPTER/FACT. The command issues a plan and local tidyId. The calling agent performs verification and submits prepare_update; Common Ground does not make semantic edits itself. Uncertain evidence requires a question, not a guess.

## What belongs here?

Subsystem behavior, architecture, connections, build/deploy mechanics, established conventions, and commands verified in current source. Library-local detail stays in its own README. Bugs, open issues, to-do lists, incident postmortems, debugging narratives, unverified claims, generic explainers, and point-in-time checkout state do not belong here.

The authoritative shared records are in knowledge.json. Ownership and dependency views are computed from those records, so no separate map needs manual synchronization. Commit this guide and the records; leave local/ ignored.
<!-- common-ground:end -->
