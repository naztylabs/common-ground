# Pillar, chapter, and fact contract

A pillar owns a stable repository responsibility. A chapter owns a coherent subarea within it. Facts belong to chapters and have stable IDs within their chapter. A chapter key is `pillar-id/chapter-id`.

Chapter definitions include a title, scope, exclusions, literal repository-relative file/directory paths defining an authoring boundary. Facts carry their own `sourceScope`, evidence, and `dependsOn` references in `pillar/chapter/fact` form. Scopes must not overlap; fact dependencies must reference an existing fact and cannot refer to themselves. Fact dependencies may cross chapters and pillars. Cycles terminate safely during traversal. New pillars and chapters require developer approval; new pillars also require an uncovered standalone responsibility.

Facts have no count ceiling. A fact statement is limited to 2,000 characters and requires exact source evidence. Its source scope stays within its chapter's authoring boundary, but supporting evidence may cite other repository files. Every evidence file is tracked for freshness independently of ownership and source scope; evidence does not confer ownership. Trailing directory slashes normalize away; traversal, absolute paths and symlinks remain rejected. Matching quotes and hashes establish evidence presence and freshness, not semantic truth.

## Navigate without loading the whole knowledge base

For everyday reads use stateless `cground lookup`; default freshness is not checked, and `--verify` checks selected facts and dependencies. Use `cground assess --touched` after changes, then `--review` only when correction needs complete chapters and verification paths. Task contexts are optional for deferred additions and aggregate reporting. Use `read_knowledge` to retrieve bounded indexes, chapters and full evidence batches. Its kinds map to the detailed operations below. To use these original MCP tool names, select `--profile full`; CLI commands remain unchanged.

Start with the full-profile `start_here` or `.common-ground/START_HERE.md`. `ownership_map` routes registered paths and keyword signals to candidate pillars/chapters. Paths have literal ownership semantics; signal text matches boundary, fact, and evidence tokens and is only a hint. `pillar_graph` groups cross-pillar fact dependencies into directed edges, with example fact references and freshness. It does not infer missing dependencies. All these indexes are paginated.

1. `list_pillars` gives responsibility boundaries and chapter counts.
2. `list_chapters` gives a pillar's chapter index: titles, scopes, revisions, and fact counts. It does not return facts.
3. `read_chapter` gives one chapter's fact summaries in pages (default 10, maximum 20). Follow `nextCursor` to read more. Cursors reject content changes between pages.
4. `read_fact` fetches the evidence for a particular fact. `search_knowledge` offers bounded keyword search, optionally scoped to a chapter.

These response limits do not limit stored facts or chapter counts. Source fingerprints are not dumped into agent read responses.

## Compact patches and task-time admission

`prepare_patch` accepts optional `taskId`, `chapterId`, optional initiating `factIds`, `touchedPaths`, `verification`, optional `tidyId`, and complete chapter review declarations. Each review carries `chapterId`, `expectedRevision`, `reviewedAllFacts: true`, `reason`, optional `maintenance`, `replacements` containing only changed existing full fact records, and `removeFactIds`. Without taskId, preparation creates only the review proposal and requires no task start/finish; corrections are reported directly. With taskId, task completion aggregates committed corrections. The server reconstructs unchanged facts and the complete reviewed ID set before invoking the validator described below. A stale revision, unknown/duplicate edit ID, missing chapter, or incomplete source/documentation declaration rejects the request. Whole-chapter reading remains mandatory.

Use `propose_facts` for new records during a task; these are local drafts excluded from retrieval. After `task_context finish` and explicit developer approval, `cground accept-facts TASK_ID REVIEW.json --approve` validates a batch. REVIEW.json has `reviews: [{chapterId, expectedRevision, reviewedAllFacts: true}]` and `verification: {sourceFiles, documentFiles}`. Read `read_knowledge` kinds `proposals` and `proposal-review` for the complete drafts and required files/chapters. Admission reviews whole owning chapters and linked chapters and rejects changed draft evidence/dependencies/chapters. Correct stale existing facts before staging additions. Discard rejected entries with `cground drop-facts TASK_ID FACT_KEY...`; an altered draft requires fresh review and approval. See [the quiet workflow](quiet-workflow.md).

## Dependency-aware review and update

`Fact A.dependsOn = [Fact B]` means A relies on B. A changed B may invalidate A. Before editing any fact, call `review_plan` for the affected chapter. Pass optional `factIds` to identify initiating facts. Without them, all facts in the initiating chapter are considered. The beta follows fact dependencies and reverse dependents transitively, then requires full review of the chapters containing those facts. It does not traverse unrelated facts merely because they share a chapter. Dense fact graphs can still require broad review. Unknown or ambiguous impact requires developer input.

Read every fact page for each required chapter. Submit one update request with:

- `chapterId`: the chapter that initiated the review.
- `factIds`: optional initiating fact IDs matching the review plan.
- `touchedPaths`: repository paths touched by the authorized task. May be empty only with a developer-requested `tidyId`.
- `reviews`: one entry for every required chapter, with `chapterId`, `expectedRevision`, `reviewedFactIds`, `invalidatedFactIds`, the complete replacement `facts`, and a `reason`.
- `verification`: `sourceFiles` and `documentFiles` that the agent actually opened in this session (or verified as deleted). Get required paths from `review_checklist`, using the chapter IDs and touched paths, and include new evidence sources.
- `tidyId`: optional local receipt from a developer-requested `cground tidy TARGET`.
- `reviews[].maintenance`: optional explicit actions on existing facts, each with `factId`, `action` (`correct`, `merge`, `remove`, or `tighten`), and a source-backed `reason`. `merge` also requires the surviving `replacement` fact key.

Every old fact must appear in `reviewedFactIds`, including removed facts. Correct facts stay structurally identical unless explicit maintenance is justified. New facts require separate developer-approved admission. Modified or removed facts must be identified as invalidated. Ordinary updates require changed evidence in a touched path or a changed upstream dependency. Explicit maintenance permits source-verified corrections, merges, removals, and tightening without source drift, within the affected scope or a developer-requested tidy scope. It cannot silently expand into unrelated chapters. Corrections preserve IDs; merges remove the duplicate and require a surviving replacement. All dependent references must be repaired in the same transaction.

A maintenance action triggers full dependency review of that chapter, including dependencies of its other facts. If a narrowed `factIds` plan omitted these, rerun `review_plan` for the full chapter and include all required reviews.

A related chapter whose facts remain true has an empty invalidation list and unchanged facts. It is reviewed but not rewritten. If all facts remain true, preparation returns `noop: true` and updates only disposable local review snapshots.

Preparation validates the entire candidate for every chapter, captures all relevant source snapshots, and fingerprints the registry. Commit also checks snapshots of attested source and documentation files, including files that were missing during review. A new required README invalidates an incomplete request. Commit repeats validation under a writer lock and atomically publishes all changed chapters in one registry replacement. Any changed source or registry invalidates the proposal. Only changed chapters increment revisions and update their source baselines and dependency fact fingerprints.

Unchanged reviewed chapters receive local review snapshots, not shared timestamp churn. Other checkouts independently assess their freshness. `evidence-unchanged` is not a semantic guarantee. An ambiguous fact or dependency impact must be resolved with the developer.

See `examples/demo-monorepo/demo-data/search-update.json` for a complete two-chapter request: search changes, while the result-list fact remains unchanged.

## Session verification and documentation

Notes supplement code reading. Verification requires the agent to open source now; remembered statements or matching cached quotes are insufficient. The software checks declarations and hashes, not whether an external agent read or understood a file. It cannot establish semantic truth or automatically identify every point-in-time claim.

`review_checklist` discovers source evidence, ancestor/local documentation, child documentation, sibling directory READMEs, and local Markdown document links. It skips generated/vendor paths and never follows symlinks or remote URLs. Discovery is bounded to 10,000 entries per scoped scan and 1,000 documents, with a 2 MB file limit; exceeding limits fails explicitly. Root-level changes include root documentation and immediate child READMEs rather than crawling every subsystem. Follow additional code references and non-Markdown documentation references manually and include those verified files in the request. A checklist is not proof of exhaustive semantic impact.

The checklist also accepts no chapter IDs plus touched paths, so README review can proceed when no cached fact is affected. Documentation verification remains mandatory for no-op transactions. A logical chapter is the note to skim in full; sharing one physical JSON registry does not require loading every unrelated pillar into context.

## Read-only validation

`cground validate [TARGET]` defaults to `all` and accepts the same pillar, chapter and fact selectors as tidy. It checks schema and reference integrity globally, then checks exact evidence, source scope hashes and upstream dependency freshness for the selected facts. Fact validation does not expand to unrelated sibling facts or reverse dependents. Matching local review receipts can acknowledge unchanged assertions after source drift, but evidence quotes must still exist. By default no shared records or review receipts are written; CLI and MCP checks refresh the ignored Markdown export. Stale results list affected pillars, chapters and facts. Accepting cleanup with --cleanup y (CLI) or cleanup:true (MCP) creates a scoped local tidyId, and the calling agent must then perform the complete source review and submit corrections.

CLI and MCP operation results show failing rows by default; use `--all-results` or `allResults:true` for passing rows too. The global summary and exit status cover the whole selection even when result rows are paginated. Invalid evidence, unresolved drift, unpopulated chapters and an empty registry yield exit 1. A successful result establishes mechanical consistency, not semantic truth; code and documentation review remain necessary. Cursors reject changes to the registry or validation results.

## Developer-requested cleanup

`cground tidy all`, `cground tidy PILLAR`, `cground tidy PILLAR/CHAPTER`, or `cground tidy PILLAR/CHAPTER/FACT` generates a plan and local receipt without changing shared records. An unqualified fact ID works only when unambiguous. The reserved target `all` includes every chapter, including disconnected pillars. An empty registry returns no receipt. Fact cleanup expands to its whole chapter and linked chapters; pillar cleanup includes all its chapters and their dependencies/dependents. Follow pagination to see the complete plan. Duplicate hints are lexical suggestions requiring source review, never automatic deletions.

The agent performs the work, then submits a complete verified transaction with the `tidyId` and explicit maintenance reasons. The receipt is bound to the registry revision and scope; any shared change requires a new tidy request. MCP `tidy_plan` previews the plan without issuing a receipt; the cground MCP tidy operation issues the same scoped receipt as the CLI. CLI receipts and approval flags record workflow intent, not identity or proof of human authorization against an agent with filesystem access.

## Developer-directed operations

Agents author the records and can execute approved CLI operations. `approve`, `approve-chapters`, `seed`, `admit`, `accept-facts`, `bootstrap`, `seed-batch`, and `migrate` require explicit developer direction and are also exposed as cground MCP operations with approved:true. An approval flag is a workflow convention, not an identity boundary against a process with filesystem access.

`admit` validates the full resulting chapter and all its evidence. Dependent chapters detect changed dependency fact fingerprints; use `review_plan` afterward. Fact dependency changes caused by authorized work can be included in a reviewed transaction; the required reviews cover both the old and new dependency graphs. Moving chapter ownership or moving existing facts between chapters does not yet have a dedicated operator command.

## Bootstrap preflight

`cground schema bootstrap` and `cground bootstrap --help --example` expose the combined initial payload: `pillars` plus `batches: [{chapterId, facts}]`. Use `--dry-run` without approval for structural, quote, dependency and source checks. It performs no filesystem writes and returns a content-bound preflight token and tracked file counts per chapter. After explicit approval of both boundaries and facts, apply with `--approve --preflight TOKEN`. The registry must still be absent, and every proposed chapter must have a nonempty fact batch. Use boundary-only approve when facts are not ready. The whole batch is published in one atomic replacement under the writer lock, with source and registry rechecks. This is an optimistic filesystem check, not an OS snapshot or proof of semantic verification.

For approved empty chapters, `seed-batch` accepts only `batches` and uses the same preflight/apply protocol. Cross-batch dependencies are validated against the full candidate. Nonempty chapters reject seeding. Failed preflights or conflicting publication leave shared knowledge unchanged. Receipts identify approved content; approval flags remain declarations, not identity checks. Existing boundary-only approval and single-chapter seed/admit commands remain supported.

Source scope expansion still rejects scans exceeding 10,000 entries. Source hashing streams regular files without the quotation size cap; evidence extraction retains its 2,000,000-byte limit. Supporting evidence outside ownership participates in validation, task assessment, dependency freshness and review checklists.

CLI JSON payloads support `--stdin` or `-`. `cground schema OPERATION` returns the MCP argument schema and identifies the CLI payload shape (seed/admit/propose-facts take a facts array). Mutation operations approve/approve-chapters/seed/admit return counts, changed IDs, validation scope and output path; `--verbose` or MCP `verbose:true` returns the original full object.

## Schema v1 migration

Run `cground migrate --approve`, then `cground init` to update the managed instructions. Each old pillar becomes a pillar with one `overview` chapter. Facts, source hashes, scope, and revision are preserved; each fact derives its source scope from its evidence paths, and fact dependencies start empty. No dependency relationships are invented. A backup goes to `.common-ground/local/pre-v2-migration.json`. Migration is atomic and idempotent; it does not migrate pending local update proposals.
