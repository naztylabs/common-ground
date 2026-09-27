# Pillar, chapter, and fact contract

A pillar owns a stable repository responsibility. A chapter owns a coherent subarea within it. Facts belong to chapters and have stable IDs within their chapter. A chapter key is `pillar-id/chapter-id`.

Chapter definitions include a title, scope, exclusions, literal repository-relative file/directory paths defining an authoring boundary. Facts carry their own `sourceScope`, evidence, and `dependsOn` references in `pillar/chapter/fact` form. Scopes must not overlap; fact dependencies must reference an existing fact and cannot refer to themselves. Fact dependencies may cross chapters and pillars. Cycles terminate safely during traversal. New pillars and chapters require developer approval; new pillars also require an uncovered standalone responsibility.

Facts have no count ceiling. A fact statement is limited to 320 characters and requires exact source evidence within its own source scope and its chapter's authoring boundary. Matching quotes and hashes establish evidence presence and freshness, not semantic truth.

## Navigate without loading the whole knowledge base

1. `list_pillars` gives responsibility boundaries and chapter counts.
2. `list_chapters` gives a pillar's chapter index: titles, scopes, revisions, and fact counts. It does not return facts.
3. `read_chapter` gives one chapter's fact summaries in pages (default 10, maximum 20). Follow `nextCursor` to read more. Cursors reject content changes between pages.
4. `read_fact` fetches the evidence for a particular fact. `search_knowledge` offers bounded keyword search, optionally scoped to a chapter.

These response limits do not limit stored facts or chapter counts. Source fingerprints are not dumped into agent read responses.

## Dependency-aware review and update

`Fact A.dependsOn = [Fact B]` means A relies on B. A changed B may invalidate A. Before editing any fact, call `review_plan` for the affected chapter. Pass optional `factIds` to identify initiating facts. Without them, all facts in the initiating chapter are considered. The beta follows fact dependencies and reverse dependents transitively, then requires full review of the chapters containing those facts. It does not traverse unrelated facts merely because they share a chapter. Dense fact graphs can still require broad review. Unknown or ambiguous impact requires developer input.

Read every fact page for each required chapter. Submit one update request with:

- `chapterId`: the chapter that initiated the review.
- `factIds`: optional initiating fact IDs matching the review plan.
- `touchedPaths`: source paths changed by the authorized task.
- `reviews`: one entry for every required chapter, with `chapterId`, `expectedRevision`, `reviewedFactIds`, `invalidatedFactIds`, the complete replacement `facts`, and a `reason`.

Every old fact must appear in `reviewedFactIds`, including removed facts. Unchanged facts remain structurally identical. New facts require separate developer-approved admission. Modified or removed facts must be identified as invalidated. Their evidence must have changed in a touched path, or a changed upstream dependency must have changed source in a touched path.

A related chapter whose facts remain true has an empty invalidation list and unchanged facts. It is reviewed but not rewritten. If all facts remain true, preparation returns `noop: true` and updates only disposable local review snapshots.

Preparation validates the entire candidate for every chapter, captures all relevant source snapshots, and fingerprints the registry. Commit repeats validation under a writer lock and atomically publishes all changed chapters in one registry replacement. Any changed source or registry invalidates the proposal. Only changed chapters increment revisions and update their source baselines and dependency fact fingerprints.

Unchanged reviewed chapters receive local review snapshots, not shared timestamp churn. Other checkouts independently assess their freshness. `evidence-unchanged` is not a semantic guarantee. An ambiguous fact or dependency impact must be resolved with the developer.

See `examples/demo-monorepo/demo-data/search-update.json` for a complete two-chapter request: search changes, while the result-list fact remains unchanged.

## Developer-directed operations

Agents author the records and can execute approved CLI operations. `approve`, `approve-chapters`, `seed`, `admit`, and `migrate` require explicit developer direction and are not MCP tools. An approval flag is a workflow convention, not an identity boundary against a process with filesystem access.

`admit` validates the full resulting chapter and all its evidence. Dependent chapters detect changed dependency fact fingerprints; use `review_plan` afterward. Fact dependency changes caused by authorized work can be included in a reviewed transaction; the required reviews cover both the old and new dependency graphs. Moving chapter ownership or moving existing facts between chapters does not yet have a dedicated operator command.

## Schema v1 migration

Run `cground migrate --approve`, then `cground init` to update the managed instructions. Each old pillar becomes a pillar with one `overview` chapter. Facts, source hashes, scope, and revision are preserved; each fact derives its source scope from its evidence paths, and fact dependencies start empty. No dependency relationships are invented. A backup goes to `.common-ground/local/pre-v2-migration.json`. Migration is atomic and idempotent; it does not migrate pending local update proposals.
