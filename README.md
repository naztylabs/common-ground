# Common Ground

Shared codebase knowledge for every agent.

Common Ground is an offline, Git-backed knowledge service for coding agents. It gives agents the shared understanding developers build through everyday conversations, so another developer's agent can reuse verified knowledge instead of repeating the investigation.

**Agents discover, write, and maintain the knowledge. Developers approve responsibility boundaries and resolve uncertainty; they should not have to author JSON.** Git distributes the records alongside the code.

## Pillars → Chapters → Facts

- **Pillars** are stable repository responsibilities: CI/CD, workspace tooling, reusable UI, or a Java application.
- **Chapters** index facts for coherent subareas within a pillar: Search and Search Results within Reusable Web Components.
- **Facts** contain a terse assertion, exact evidence, `sourceScope`, and `dependsOn` fact references. They describe the repository, not an agent's activity history.

A pillar has a chapter index, not a giant fact dump. The agent lists chapters, skims their scopes, reads the relevant chapter's fact pages, and fetches evidence as needed. When a developer asks a question, the agent responds in plain language, references useful evidence, and discloses stale or uncertain knowledge.

There is **no fixed fact-count ceiling**. Read responses are paginated to keep context manageable. The beta still loads the registry internally and requires complete chapter reviews; it is not yet a production performance solution for huge knowledge graphs.

## Intended workflow

1. **Initialize:** the agent uses a brief structural scan to propose core pillars and chapters, checks existing ownership, and explains the boundaries. After developer approval, it populates source-backed facts.
2. **Retrieve:** list a pillar's chapters, choose the relevant chapter, and read its facts and evidence. Follow pagination only as needed for the task.
3. **Maintain:** when authorized work invalidates a fact, call `review_plan`, read every fact in each required chapter, and submit one complete review transaction.
4. **Review dependencies:** `Fact A.dependsOn = [Fact B]` means A relies on B. The beta conservatively includes transitively linked fact dependencies and dependents, then groups them into chapter reviews. Update only facts that are actually invalidated; unchanged chapters are reviewed without being rewritten.
5. **Preserve boundaries:** features belong in existing chapters. New chapters require developer approval. New pillars additionally require an uncovered standalone responsibility.
6. **Ask when uncertain:** resolve ambiguity with the developer rather than guessing. Do not opportunistically change unrelated knowledge.
7. **Do nothing when facts remain true:** a changed source file alone does not justify rewriting shared knowledge.

Exact quotes and hashes establish evidence presence and freshness; they do not prove natural-language interpretations. Agents remain responsible for reviewing the facts and asking when unsure.

## Install the beta

Requires Node.js 22+ and npm; source development targets Node 24 through `.nvmrc`. This package has not been published to npm.

```sh
nvm use                 # with nvm; run nvm install first if needed
npm install
npm test
npm pack
npm install -g ./common-ground-knowledge-0.2.0-beta.1.tgz
cground --version
```

No model API key, telemetry, cloud service, or vector database is required. The MCP host launches the local stdio process on demand. The package name is provisional.

## Initialize and populate a repository

```sh
cd /path/to/repository
cground init
```

Initialization preserves existing knowledge and instructions. It writes a heuristic proposal to `.common-ground/local/bootstrap.json`; it does not run an LLM or invent facts. Your coding agent refines the map and presents it in plain language. After explicit approval, the agent can run:

```sh
cground approve .common-ground/local/bootstrap.json --approve
cground seed java-application/overview /path/to/agent-prepared-facts.json --approve
```

Bootstrap and additional-fact admission currently use CLI operations instead of MCP approval tools. An agent with shell access executes them following developer approval; the flag never substitutes for approval. To add approved chapters to an existing pillar, use `cground approve-chapters PILLAR PLAN.json --approve`. To admit additional facts after a full chapter review, use `cground admit PILLAR/CHAPTER FACTS.json --approve`, then review dependent chapters.

The fact input is an array of records such as:

```json
{
  "id": "event-version",
  "statement": "The Java application declares EVENT_VERSION as v1.",
  "sourceScope": ["apps/java/src/Application.java"],
  "dependsOn": [],
  "evidence": [{
    "path": "apps/java/src/Application.java",
    "quote": "public static final String EVENT_VERSION = \"v1\";"
  }]
}
```

Commit `.common-ground/knowledge.json`, the managed instruction files, `.vscode/mcp.json`, and `.gitignore`. `init` creates or updates a marked ignore block for `.common-ground/local/`; existing entries are preserved. Already-tracked files must be explicitly untracked.

## Upgrade a pillar-only beta repository

Schema v2 adds chapters. After installing this version:

```sh
cground migrate --approve
cground init
```

Migration preserves every old pillar's facts, scope, source hashes, and revision in an `overview` chapter. It invents no dependencies. A local backup is kept, and repeating migration is a no-op. The initializer refreshes agent instructions to use the new tools. Old pending update proposals must be recreated. See [the record contract](docs/pillar-contract.md).

## Agent tools and CLI

| MCP tool | Purpose | CLI |
|---|---|---|
| `list_pillars` | Responsibility index; no facts | `cground list` |
| `list_chapters` | Chapter index for one pillar; no facts | `cground chapters PILLAR` |
| `read_chapter` | Selected chapter and fact page | `cground read PILLAR/CHAPTER` |
| `read_fact` | One fact with exact evidence | `cground fact PILLAR/CHAPTER FACT` |
| `search_knowledge` | Bounded Unicode-aware keyword search | `cground search QUERY` |
| `review_plan` | Required dependency/dependent chapter reviews | `cground review-plan PILLAR/CHAPTER --facts ID1,ID2` |
| `prepare_update` | Validate a complete review transaction | `cground prepare UPDATE.json` |
| `commit_update` | Atomically publish changed chapters | `cground commit PROPOSAL_ID` |

Indexes and chapter reads default to 10 entries per page, maximum 20. Pass `--cursor TOKEN` for the next page or `--limit N` to choose a page size. `read_fact` supplies evidence separately. Search supports `--chapter PILLAR/CHAPTER`. All commands accept `--root PATH`.

Publication rejects source changes, conflicting knowledge revisions, unrelated edits, malformed facts, and incomplete dependency reviews. Unchanged reviews write only local validation state. See [a complete two-chapter update](examples/demo-monorepo/demo-data/search-update.json).

## VS Code Copilot

`init` merges a managed `AGENTS.md` section, a Copilot instruction link, and `.vscode/mcp.json`, preserving existing guidance and JSONC comments.

1. Ensure `cground` is on VS Code's PATH; restart VS Code after installing if needed.
2. Open the repository and use **MCP: List Servers** to start Common Ground, completing normal host trust prompts.
3. In Copilot agent chat, check that the eight tools are available.
4. Ask the agent to list a pillar's chapters, choose the relevant one, and explain its facts.

For other MCP clients, launch `cground serve --root /absolute/repository/path`. Remote SSH or dev-container sessions need the package installed in that environment. This targets agent chat, not inline completion. Automated tests cover the real stdio protocol; manual VS Code GUI acceptance remains a separate check.

## Demo and onboarding

```sh
npm run demo
```

The synthetic monorepo includes Azure pipeline, Nx/npm, UI, and Java contracts. Its UI pillar indexes Search and Search Results chapters; the result-validation fact depends on the search-threshold fact. The demo changes Search, reviews both, and publishes only the invalidated chapter. These fixtures are not a runnable full application stack. See [manual demo steps](docs/demo.md).

Common Ground uses its own registry. Ask your agent to list its pillars and chapters, then explain the relevant facts with evidence. Current source remains authoritative.

## Development and limits

```sh
nvm use
npm install
npm test
npm run schema
```

TypeScript is in `src/`; tests cover pagination, migration, dependency reviews, no-op behavior, uncapped facts, invalid admissions, conflicts, preservation of configuration, and real MCP communication. Source discovery and fingerprinting remain bounded; the registry is still one file, and dense dependency graphs can require broad reviews. See [architecture and remaining gaps](docs/architecture.md).

MIT licensed. All demo fixtures are synthetic; no employer code or internal project knowledge is included.

## Contributors

- **OpenAI Codex** — AI-assisted architecture, implementation, tests, and documentation, guided and reviewed by the project developer.
