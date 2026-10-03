# Quiet maintenance and context use

The developer asks for an ordinary coding task. Their agent uses Common Ground as needed, corrects verified existing facts within the affected scope, and mentions meaningful knowledge changes once at completion. There is no autonomous model, watcher, or command capture inside Common Ground. An MCP host still controls its permission prompts.

Before bootstrap approval, `task_context start` (or `cground task start`) returns `state: "bootstrap-required"`, the proposal path and a compact next-action object, with no `taskId` and no local task writes. Continue from source, verify boundaries and facts, establish content approval or explicit delegation to publish the initial map within scope, and use `cground bootstrap PLAN.json --dry-run` followed by approval-directed `--approve --preflight TOKEN` for one atomic initial transaction. The separate `cground approve .common-ground/local/bootstrap.json --approve` workflow approves only boundaries; `seed-batch` can populate the approved empty chapters after fact approval. Start again afterward. Do not assess, propose facts or finish without a task ID. If neither registry nor proposal exists, the state is `not-initialized` and the next step is `cground init`. Invalid registries remain errors.

## Default: stateless lookup and proportional assessment

Use `cground lookup --path PATH` or a short query. Up to five fact statements and source locations are returned, with no source hashing or local writes by default. Freshness is explicitly `not-checked`; `--verify` checks only selected facts and their upstream evidence/source scopes. Verification compares stored source baselines and does not reuse local whole-chapter review receipts. Each compact result contains its fact ID, statement, source paths, relevance and freshness. `--verbose` adds `matchReason`, `matchedPaths`, `matchedTerms`, `unmatchedTerms`, and `queryCoverage` (matched/total terms, or null for path-only lookup). `relevance` distinguishes `ownership-only`, `partial-query`, `weak-match`, and `matched`; these are lexical/path categories, not confidence scores or semantic guarantees. Weak coverage leads with “No direct answer found,” then navigation hints and partial matches. A separate `source-search` suggestion remains unexecuted until the agent chooses to search explicit source paths; its results are labeled live source evidence. See [the source-search guide](../SETUP.md#search-live-source-when-knowledge-is-thin). Matching quotes and hashes still do not establish semantic truth.

After editing, use `cground assess --touched PATH1,PATH2` for the task's actual changed paths. Empty paths mean no work; unowned or unchanged source means no fact review. The response includes only focused local/ancestor documentation, without recursively following unrelated documentation links. Source changes return candidate claims to inspect. Missing or unreadable tracked sources require attention, never silent success.

If a claim needs correction, `assess --review` returns complete affected/linked chapters, revisions, facts with evidence and source/documentation paths in one paginated package. It also supports verified maintenance when the source is unchanged but an existing claim is wrong. The package identifies each initiating review-scope and its required chapters; prepare unrelated scopes separately. Follow every page and verify source before calling `prepare-patch` without a taskId. Preparation still requires complete reviews; publication still rejects source, documentation and registry conflicts. Report the correction directly; no task start or finish is needed.

CLI and both MCP profiles expose `lookup` and `assess` through the cground operation catalog. Existing task workflows remain compatible. Ordinary reads without a task skip cache-context construction; task reads deduplicate source hashes within each request while recomputing them on later requests.

## Optional task context

1. When deferred additions or aggregate correction reporting are useful, call `task_context` with `action: "start"` and known `paths` or a short `signal`. Keep the returned `taskId` for this task. Do not create a task for every chat message.
2. Read relevant knowledge with `read_knowledge`. A returned owner already identifies a chapter; an additional pillar-index round trip is optional. Use `kind: "chapter", target: "web-components/search", evidence: true` for complete fact batches, and open their actual source in this session. Ordinary navigation need not read unrelated chapters.
3. Do the coding work. Call `task_context` with `action: "assess"` and the actual paths this task touched. Include new/deleted files. Do not claim another developer's dirty files. This returns affected chapters and source/documentation paths, or `no-fact-review` with documentation paths. Follow all pages. Path/scope matching cannot detect undeclared semantic connections; follow references found in source.
4. Before a knowledge edit, read `.common-ground/POLICY.md`, every fact page in each required chapter, and source/README/reference files. `kind: "review"` accepts a chapter or qualified fact ID; `kind: "checklist"` discovers required file paths. Maintenance actions can expand the required scope to other facts in the maintained chapter. The validator reports omitted chapters.
5. Use `prepare_patch` and `commit_update` for verified corrections. The old full `prepare` CLI and `prepare_update` full-profile tool also work, but only task-associated patches participate in the automatic task completion report.
6. Queue any worthwhile additions with `propose_facts`. Do not add an inventory entry just because a new component exists. Local library details belong in the library README.
7. Finish the main task and its checks. Call `task_context` with `action: "finish"`, follow its pages, and consolidate the final response. `notification: "none"` means no Common Ground message is needed. `summary` names committed corrections; `approval-required` includes pending new facts; `attention` includes stale drafts, an uncommitted review, or a correction changed since publication. An unrelated uncertainty is flagged, not turned into unsolicited cleanup.

Example completion: “Applied one CI/CD correction: retry limit 2 → 3, verified in ci/build.yml. Recommend keeping it. One new fact is pending approval.” Use real source links and the verified reason for the actual repository. Corrections do not need a second authorization; additions still ask “Ready to make the following facts available to the team?” Never tell the developer to read or hand-edit knowledge.json.

`finish` returns only changed facts with before/after fields, the submitted reason, evidence paths, a recommendation, and whether the current record/evidence needs another review. Repeated changes within a task collapse into a net change; reverting to the original fact produces no correction notification. Local receipts from older versions lack this detail and are explicitly flagged for review. This is a presentation aid: exact quotes, freshness and review declarations do not prove semantic truth.

Use `cground review [TARGET]` or the MCP `review` operation to compare current knowledge with Git HEAD, including changes made outside this task. `--staged`/`staged:true` selects the Git index. It reports pillar/chapter boundary changes and fact changes; it omits unchanged records, source hashes, revisions and dependency fingerprints. All additions/deletions are explicit, including initial setup. Follow every page. Exact changed evidence quotes are opt-in with `--evidence`/`evidence:true`; otherwise the summary reports changed evidence and its paths. This command never marks anything reviewed, approves it, or writes files. The agent must establish the reason and recommendation from source, not infer them from a diff. Uncertainty blocks approval, not the main task unless relevant.

## Compact correction request

This example applies to the synthetic demo after changing `SEARCH_MIN_LENGTH` to 3. Replace the sample UUID with the real task ID and verify current revisions and all files before submitting it. Read the unchanged Results chapter in full too.

```json
{
  "taskId": "00000000-0000-4000-8000-000000000000",
  "chapterId": "web-components/search",
  "factIds": ["search-minimum"],
  "touchedPaths": ["packages/ui/search.ts"],
  "verification": {
    "sourceFiles": ["packages/ui/search.ts", "packages/ui/results.ts"],
    "documentFiles": ["AGENTS.md", "packages/ui/README.md"]
  },
  "reviews": [
    {
      "chapterId": "web-components/search",
      "expectedRevision": 1,
      "reviewedAllFacts": true,
      "reason": "The authorized change raises the verified minimum from 2 to 3.",
      "replacements": [{
        "id": "search-minimum",
        "statement": "The search component exports SEARCH_MIN_LENGTH as 3.",
        "evidence": [{"path": "packages/ui/search.ts", "quote": "export const SEARCH_MIN_LENGTH = 3;"}],
        "sourceScope": ["packages/ui/search.ts"],
        "dependsOn": []
      }]
    },
    {
      "chapterId": "web-components/results",
      "expectedRevision": 1,
      "reviewedAllFacts": true,
      "reason": "Read all facts and source; Results still uses the shared threshold."
    }
  ]
}
```

Unchanged records are reconstructed server-side. `reviewedAllFacts: true` attests the whole expected revision; it is neither proof of reading nor permission to skip reading. Use `removeFactIds` for deletions. Citation-only repairs may use empty touchedPaths without a tidyId: only evidence may change; the fact ID, statement, sourceScope and dependsOn must remain unchanged. Supply a verified reason, read every required chapter, attest source/documentation verification and the expected revisions. Publication rechecks source and registry conflicts. Use review-plan and review-checklist for the selected chapter; do not invent touched paths.

Other explicit maintenance without directly changed evidence needs a reasoned `maintenance` action (`correct`, `merge`, `remove`, or `tighten`) and relevant touched paths, or a developer-requested `tidyId`. See [the record contract](pillar-contract.md) and published `patch.schema.json`.

## Deferred additions

`propose_facts` takes `taskId`, `chapterId`, and a `facts` array with the existing fact schema. It validates evidence and ownership, and stores drafts under ignored `.common-ground/local/`. Re-proposing the same ID replaces its local draft; it never overwrites a shared fact. Dependencies must already exist in shared knowledge. Stage additions after known corrections to avoid invalidating drafts with those corrections.

After finish and explicit developer approval:

- Read all pages of `read_knowledge` with `kind: "proposals"` and the task ID.
- Read all `kind: "proposal-review"` pages for required whole chapters, revisions, sources and documents. Open these files now. If existing facts need correction, resolve that first and reverify/re-propose stale additions in a new task.
- Have the agent create `REVIEW.json` with `reviews: [{"chapterId": "pillar/chapter", "expectedRevision": 1, "reviewedAllFacts": true}]` for every required chapter, and `verification: {"sourceFiles": [...], "documentFiles": [...]}`.
- Run `cground accept-facts TASK_ID REVIEW.json --approve`. This validates the entire batch and writes one atomic registry replacement. Only chapters receiving additions increment revisions. It rejects unfinished tasks, uncommitted maintenance, missing reviews, stale drafts and invalid evidence/dependencies.

If only some additions are approved, first discard rejected drafts with `cground drop-facts TASK_ID PILLAR/CHAPTER/FACT...`. A flag records developer direction; it cannot prove authorization against an agent with filesystem access. Legacy developer-directed `seed` and `admit` remain available for operator/bootstrap use, but agents must follow this deferred workflow during normal coding tasks.

## Context controls and limitations

- The default MCP profile has six tools. `--profile full` retains the original thirteen plus cground for compatibility; all CLI workflows are available through MCP.
- Generated `AGENTS.md` recommends stateless lookup/assessment and carries essential instructions and links to the detailed policy, loaded before edits.
- Chapter evidence pages have a 12,000-character soft record budget and a 20-record maximum. At least one complete record is returned even if unusually large; evidence and dependencies are never silently cut off. There is no stored fact-count limit.
- With a task ID, repeated unchanged reads/assessments return a short `unchanged` reference. Reuse it only if the original response is still in the agent's context. Use `refresh: true` to resend after context loss, and a new task for a new agent/session. Source and dependency changes invalidate relevant reuse; documentation changes invalidate checklist/assessment reuse. No live branch/submodule state is cached.
- Source verification, mandatory correction, full affected-chapter reviews and README checks remain required. Byte reductions do not measure semantic quality or total billed tokens. The engine still parses the full registry and hashes source; huge chapters/dense dependencies remain expensive.
- `finish` records the task boundary; later code work needs a new task. Stale drafts require re-proposal and a new finish/approval batch. Abandoned local tasks and proposals can be removed after confirming no agent or review still needs them. Do not delete the writer lock while a writer is active.
- A prepared correction that fails to commit remains visible as attention at finish. If publication succeeds but a later local bookkeeping write fails, inspect the Git diff before retrying or discarding the local receipt; do not claim nothing happened. Common Ground cannot automatically report corrections made through unrelated operator commands or direct file edits.

Run `npm run measure:context` to reproduce comparisons of serialized UTF-8 bytes. This measures current full/compact tool definitions, generated entry guidance against the pre-workflow baseline, one corrected record in a synthetic 300-fact chapter, and repeated retrieval. Actual tokenizer, host caching and billing behavior vary.
