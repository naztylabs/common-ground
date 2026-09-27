# Architecture and beta boundaries

- `src/model.ts`: strict record and update schemas.
- `src/store.ts`: safe path handling, bounded scope snapshots, evidence validation, registry transactions, local review proposals.
- `src/init.ts`: bounded discovery, managed instruction blocks, comment-preserving VS Code configuration.
- `src/server.ts`: five MCP tools and bounded keyword retrieval.
- `src/cli.ts`: operator commands and stdio entry point.

`.common-ground/knowledge.json` is one atomic, Git-tracked registry containing pillar definitions and facts. This trades granular Git merging for simple complete transactions in the beta. `.common-ground/local/` contains unshared proposals, review snapshots, and a writer lock. The source schema is also published as JSON Schema under `schemas/`.

Discovery inspects at most 1,500 filesystem entries, excludes common generated folders and .env names, reads filenames rather than entire source contents, and proposes up to 30 path hints per detected category. It reports incomplete discovery and does not establish exhaustive coverage. It recognizes illustrative Azure/GitHub pipeline, Nx/npm, UI, and Java patterns; a developer or coding agent must refine the proposal for other architectures.

Scope validation is limited to 10,000 entries and 2 MB per file. Broad scopes containing binary assets may be unsuitable. Pillars have no fixed fact-count ceiling. Search is deterministic keyword matching with at most 20 returned facts, not vector retrieval. Full-pillar reads and reviews still process every fact; pagination and incremental validation for very large pillars remain future work. No database is required for this beta.

Hashes include local uncommitted source. Changed files, additions, or deletions mark a populated pillar for review; source edits that preserve facts require only a local review. No cross-pillar dependency graph, semantic AST verification, automatic command capture, remote sync, background watcher, or vector index is implemented. Freshness is checked on retrieval. Contract changes across pillars require agents to identify and review each affected pillar; automatic propagation is future work.

Filesystem snapshots are optimistic checks, not an OS-level snapshot of a concurrently edited worktree. The final check narrows but cannot eliminate source-write races. Registry writes are serialized and atomically renamed on the same filesystem. If a process crashes holding the lock, inspect active processes before deleting `.common-ground/local/write.lock`.

Avoid secrets in facts and evidence. .env paths are excluded, but the beta does not include a comprehensive secret scanner. Nothing is sent to a remote service by Common Ground; an agent host may independently transmit retrieved tool results to its model provider.

Potential next milestones: incremental indexing, dependency-aware invalidation, AST/schema-backed verifiers, better scope overlap analysis, native Windows test coverage, and host-specific VS Code acceptance automation.
