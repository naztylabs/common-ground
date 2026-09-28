# Architecture and beta boundaries

- `src/model.ts`: strict schema v2 pillar, chapter, fact, and multi-chapter review records; schema v1 migration input.
- `src/store.ts`: safe paths, evidence and ownership checks, dependency traversal, freshness, migration, and atomic review transactions.
- `src/workflow.ts`: task-local context reuse, compact patches, deferred fact proposals, and reviewed batch admission.
- `src/init.ts`: bounded discovery and managed repository instructions/MCP configuration.
- `src/server.ts`: five default stdio MCP tools (thirteen in the compatibility profile), paginated navigation, evidence retrieval, and Unicode-aware keyword search.
- `src/navigation.ts`: derived ownership routing, pillar graph, Start Here responses, and read-only tidy plans.
- `src/review-files.ts`: bounded discovery of local, sibling, child, and referenced review documentation.
- `src/guidance.ts`: short entry instructions, detailed policy and managed Start Here guide.
- `src/paging.ts`: shared pagination and cursor validation.
- `src/cli.ts`: agent/operator CLI and MCP entry point.

`.common-ground/knowledge.json` is a Git-tracked registry. Pillars contain chapter definitions; chapters index facts and define authoring boundaries. Facts own exact evidence, source scopes, and directed fact-to-fact dependencies. One atomic file permits all affected chapter revisions to publish together. `.common-ground/local/` contains ignored proposals, review snapshots, a migration backup, tidy request receipts, task receipts/context fingerprints, queued fact drafts, and a writer lock. `.common-ground/START_HERE.md` and `.common-ground/POLICY.md` are tracked guidance. Ownership maps and pillar graphs are derived from the registry rather than duplicated in a second data model.

Storage has no fixed fact-count ceiling. Pillar and chapter indexes and chapter fact reads are paginated (10 by default, up to 20 per response). The compact profile can batch complete facts with evidence, using a 12,000-character soft page budget (a single oversized record stays intact). The full profile also supports individual fact reads. Keyword search returns at most 20 summaries. Pagination rejects changed index/fact content. A full chapter review must traverse all its fact pages.

The current storage engine still parses the full registry internally, and source hashing is synchronous work per tool request. The beta has no database index, background watcher, vector search, or incremental validator. Response pagination limits agent context, not internal compute. Very large knowledge stores need performance evaluation and likely indexed/per-chapter storage before a production claim.

Dependency reviews start from selected fact IDs (or all facts in a chapter), traverse fact dependencies and reverse dependents transitively, and group the result into chapter reviews. Every linked chapter must be reviewed, but only changed facts and chapters are rewritten. Explicit maintenance can correct an existing false claim, merge duplicates, remove superseded content, or tighten narrative without requiring source drift. Routine maintenance is confined to affected chapters; developer-requested tidy receipts authorize a bounded cleanup scope. A dense graph can still produce expensive reviews. Cross-pillar relationships are supported; missing undeclared dependencies cannot be inferred reliably. Shared chapter membership alone does not propagate dependency impact.

Discovery examines at most 1,500 filesystem entries and proposes up to 30 path hints per category. It recognizes illustrative Azure/GitHub pipeline, Nx/npm, UI, and Java patterns and starts each candidate with an overview chapter. Developers approve an agent-refined map; discovery does not prove exhaustive coverage. Scope validation is limited to 10,000 entries and 2 MB per file. These filesystem limits remain separate from uncapped fact storage.

Semantic entailment, approval UI, automatic command capture, remote sync, scope migration, and native Windows testing remain out of scope. `doctor` currently checks expected file presence and registry validity; it is not a complete MCP-host diagnostic.

Snapshots are optimistic checks, not OS-level filesystem snapshots. Source changes can occur after the final check. Registry writes are serialized and atomically renamed on one filesystem. If a process crashes holding a lock, confirm no writer remains before deleting `.common-ground/local/write.lock`.

Avoid secrets in records. .env paths are excluded; comprehensive secret scanning is not implemented. Common Ground sends nothing to a remote service, but an agent host may transmit retrieved results to its model provider.

Update requests now require session verification declarations for evidence source and discovered documentation, including no-op reviews. Commit rejects subsequent source/documentation drift. These declarations are not proof of external agent reading, and semantic correction remains the agent's responsibility. Point-in-time state, unverified claims, and debugging narratives are forbidden by policy, not by a semantic classifier. Legacy seed/admit operations still enforce exact evidence and developer direction; their session-reading and cleanup rules are agent responsibilities.

Documentation discovery scans at most 10,000 scoped entries and follows at most 1,000 local documents. Root-level changes do not recursively scan the entire monorepo. The checklist follows Markdown document links, not every programming-language import or documentation reference syntax; agents must follow other relevant references themselves.

Compact patches declare `reviewedAllFacts: true` against a chapter revision and reconstruct unchanged records server-side before invoking the existing validator. They do not weaken whole-chapter review. Task receipts track only committed corrections from that task; pending failed transactions produce an attention result at finish. A crash after a shared write but before its local receipt is saved can require manual reconciliation. Task state remains local and disposable after review, not shared history.

New fact proposals are local and excluded from authoritative retrieval. They snapshot their chapter, source scopes and admitted upstream dependencies. Finished tasks can be admitted through the explicit approval CLI only, with a complete linked-chapter review and source/documentation declarations. Stale drafts require fresh verification and a new proposal batch. The batch writes atomically across chapters. Dependencies on other pending drafts are not supported. Legacy seed/admit commands remain available for developer-directed bootstrap/operator work, so finish/approval checks are a workflow boundary, not a sandbox against filesystem access.

Response reuse is task-scoped and recomputes live fingerprints; it does not cache Git branch/submodule state, prove source reading, or survive context loss semantically. The caller must refresh or start a new task after losing earlier responses. Internal full-registry parsing and source hashing remain; byte savings measure transferred context, not all CPU, latency, or billed tokens. See `npm run measure:context` and the regression fixtures in `test/workflow.test.mjs`.
