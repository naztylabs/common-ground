# Architecture and beta boundaries

- `src/model.ts`: strict schema v2 pillar, chapter, fact, and multi-chapter review records; schema v1 migration input.
- `src/store.ts`: safe paths, evidence and ownership checks, dependency traversal, freshness, migration, and atomic review transactions.
- `src/init.ts`: bounded discovery and managed repository instructions/MCP configuration.
- `src/server.ts`: eight stdio MCP tools, paginated navigation, evidence retrieval, and Unicode-aware keyword search.
- `src/cli.ts`: agent/operator CLI and MCP entry point.

`.common-ground/knowledge.json` is a Git-tracked registry. Pillars contain chapter definitions; chapters index facts and define authoring boundaries. Facts own exact evidence, source scopes, and directed fact-to-fact dependencies. One atomic file permits all affected chapter revisions to publish together. `.common-ground/local/` contains ignored proposals, review snapshots, a migration backup, and a writer lock.

Storage has no fixed fact-count ceiling. Pillar and chapter indexes and chapter fact reads are paginated (10 by default, up to 20 per response). Evidence is retrieved one fact at a time. Keyword search returns at most 20 summaries. Pagination rejects changed index/fact content. A full chapter review must traverse all its fact pages.

The current storage engine still parses the full registry internally, and source hashing is synchronous work per tool request. The beta has no database index, background watcher, vector search, or incremental validator. Response pagination limits agent context, not internal compute. Very large knowledge stores need performance evaluation and likely indexed/per-chapter storage before a production claim.

Dependency reviews start from selected fact IDs (or all facts in a chapter), traverse fact dependencies and reverse dependents transitively, and group the result into chapter reviews. Every linked chapter must be reviewed, but only invalidated facts and chapters are rewritten. A dense graph can still produce expensive reviews. Cross-pillar relationships are supported; missing undeclared dependencies cannot be inferred reliably. Shared chapter membership alone does not propagate dependency impact.

Discovery examines at most 1,500 filesystem entries and proposes up to 30 path hints per category. It recognizes illustrative Azure/GitHub pipeline, Nx/npm, UI, and Java patterns and starts each candidate with an overview chapter. Developers approve an agent-refined map; discovery does not prove exhaustive coverage. Scope validation is limited to 10,000 entries and 2 MB per file. These filesystem limits remain separate from uncapped fact storage.

Semantic entailment, approval UI, automatic command capture, remote sync, scope migration, and native Windows testing remain out of scope. `doctor` currently checks expected file presence and registry validity; it is not a complete MCP-host diagnostic.

Snapshots are optimistic checks, not OS-level filesystem snapshots. Source changes can occur after the final check. Registry writes are serialized and atomically renamed on one filesystem. If a process crashes holding a lock, confirm no writer remains before deleting `.common-ground/local/write.lock`.

Avoid secrets in records. .env paths are excluded; comprehensive secret scanning is not implemented. Common Ground sends nothing to a remote service, but an agent host may transmit retrieved results to its model provider.
