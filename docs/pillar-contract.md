# Pillar contract

A pillar owns a stable responsibility. A feature belongs in its existing owner. Path scopes are literal repository-relative files or directories, not glob expressions. Scopes must not overlap. This is a conservative beta ownership check; semantic independence is a developer decision.

Facts have stable IDs, a statement of at most 320 characters, and one or more exact evidence quotes. Evidence must lie within the pillar's scope. The server rejects missing quotes, symlinks, traversal, duplicate IDs, and excluded paths. A matching quote verifies evidence presence, not entailment.

## Update request

```json
{
  "pillarId": "web-components",
  "expectedRevision": 1,
  "touchedPaths": ["packages/ui/search.ts"],
  "invalidatedFactIds": ["search-minimum"],
  "reviewedFactIds": ["search-minimum"],
  "facts": [{
    "id": "search-minimum",
    "statement": "The search component exports SEARCH_MIN_LENGTH as 3.",
    "evidence": [{"path": "packages/ui/search.ts", "quote": "export const SEARCH_MIN_LENGTH = 3;"}]
  }],
  "reason": "The authorized change raises the minimum search length from 2 to 3."
}
```

`facts` is the complete replacement, not a patch. Every old fact must appear in `reviewedFactIds`, including removed facts. Every modified or removed fact must be identified as invalidated and have changed evidence among `touchedPaths`. New facts are rejected in routine updates; use developer-directed admission. Unchanged facts must remain byte-for-byte structurally equivalent.

If facts are unchanged, the server writes only a disposable local review snapshot and returns `noop: true`. Shared knowledge is untouched. Empty `invalidatedFactIds` is appropriate for that no-op review. Missing or contradictory evidence must be resolved rather than marked reviewed.

Preparation records the registry fingerprint and source snapshot. Commit acquires a single-writer lock, rechecks evidence and source snapshots, checks the entire registry fingerprint, and atomically replaces knowledge.json. A competing revision or source change requires fresh preparation. Git merges remain subject to normal review.

Developer-directed bootstrap (`approve`, then `seed`) and admission (`admit`) are not exposed over MCP. New pillars after bootstrap additionally require `--standalone-reason`. These mechanisms express workflow rules; they cannot prevent a process with filesystem access from editing JSON directly.

No timestamps or activity summaries are stored in pillars. Source baseline hashes are updated only with a meaningful fact revision. Local no-op review snapshots are Git-ignored; another checkout independently reviews drift. `evidence-unchanged` describes evidence freshness, not a guarantee of truth.
