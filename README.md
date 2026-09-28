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

1. **Initialize:** the agent proposes stable responsibility boundaries and chapters, then populates source-backed facts after developer approval. Initialization creates a durable `.common-ground/START_HERE.md` guide.
2. **Find the owner:** use `cground start "build failed"` or `cground owners --path path/from/the/error`. Registered paths identify ownership; signal matches are keyword hints, not diagnoses. Read directory READMEs and inspect scopes before choosing.
3. **Retrieve and verify:** navigate pillar → chapter → fact. Notes supplement code reading; code is the source of truth. A verified fact requires opening its source in this session, not remembering or inferring it. Branches, submodule checkouts, and other point-in-time state must be checked live every time.
4. **Review connections:** `cground graph PILLAR` derives cross-pillar relationships from `Fact A.dependsOn = [Fact B]`, meaning A relies on B. Missing edges are unrecorded relationships, not evidence of independence. `review_plan` traces dependencies and dependents for updates.
5. **Own the touch:** skim every fact page in the affected chapter and review relevant sibling, child, and reference files. Use `review_checklist` to find source and documentation to read. Correct contradictions in the same edit, merge verified near duplicates, remove superseded content, and tighten narrative. Corrections preserve IDs and repair references atomically.
6. **Preserve boundaries:** prefer existing chapters. New pillars require a new, uncovered, standalone subsystem and explicit approval; chapters, ownership expansion, and fact admission also need developer direction. Library-local detail belongs in its README.
7. **Default to no write:** document patterns that change how someone reasons about a subsystem, not inventories. When no note update is justified, still verify the modified directory README. Ask when unsure and state what cannot be verified; never keep contradictory versions together.

Durable knowledge covers subsystem behavior, architecture, connections, build/deploy mechanics, established conventions, and commands verified in source. It excludes bugs, open issues, work to fix, postmortems, debugging narratives, generic technology explainers, unverified claims, and temporary checkout state.

Any developer can request `cground tidy PILLAR` or `cground tidy PILLAR/CHAPTER/FACT` (a unique fact ID also works). The command creates a plan and local `tidyId`; the calling agent reads source and submits the cleanup. Common Ground remains model-independent and makes no semantic edits automatically. MCP `tidy_plan` previews scope without issuing authorization. See [the complete knowledge policy](docs/knowledge-policy.md).

Exact quotes, review declarations, and hashes do not prove natural-language truth or that an external agent actually read a file. The software checks declared coverage, current evidence, dependency references, scope, and concurrent changes; agents remain responsible for verification and resolving uncertainty.

## Install the beta

Requires Node.js 22+ and npm; source development targets Node 24 through `.nvmrc`. Distribution uses GitHub Releases; this package has not been published to npmjs.com.

Once a version is released, download its `common-ground-knowledge-VERSION.tgz` asset from [GitHub Releases](https://github.com/naztylabs/common-ground/releases), then install the downloaded file. For example, for `0.2.0-beta.1`:

```sh
npm install -g ./common-ground-knowledge-0.2.0-beta.1.tgz
cground --version
```

Choose the `.tgz` release asset, not GitHub's automatically generated source archives. npm installs the runtime dependencies during installation, so registry access is still required. GitHub hosts Common Ground itself; Node.js remains its runtime.

To build an archive from a clone:

```sh
nvm use                 # with nvm; run nvm install first if needed
npm ci
npm run release:pack
npm install -g ./release/common-ground-knowledge-0.2.0-beta.1.tgz
cground --version
```

No model API key, telemetry, cloud service, or vector database is required. The MCP host launches the local stdio process on demand. The package name is provisional.

## Publish a GitHub release

`npm run release:pack` tests the project, runs the synthetic demo, builds the package and schemas, and writes a `.tgz` archive plus a SHA-256 checksum to the ignored `release/` directory. It does not upload anything.

After committing the release workflow and changes, push a tag that matches `package.json`. For the current version:

```sh
git tag -a v0.2.0-beta.1 -m "Common Ground 0.2.0-beta.1"
git push origin v0.2.0-beta.1
```

The GitHub Actions workflow validates the tag, runs the same packaging checks, tests an isolated archive installation, and creates a release with both assets. Beta versions become prereleases. It uses GitHub's built-in token and needs no npm account or npm publishing token. See [release setup, versioning, and troubleshooting](docs/releases.md).

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

Commit `.common-ground/knowledge.json`, `.common-ground/START_HERE.md`, the managed instruction files, `.vscode/mcp.json`, and `.gitignore`. `init` creates or updates a marked ignore block for `.common-ground/local/`; existing entries are preserved. Already-tracked files must be explicitly untracked.

## Upgrade a pillar-only beta repository

Schema v2 adds chapters. After installing this version:

```sh
cground migrate --approve
cground init
```

Migration preserves every old pillar's facts, scope, source hashes, and revision in an `overview` chapter. It invents no dependencies. A local backup is kept, and repeating migration is a no-op. The initializer refreshes agent instructions to use the new tools. Old pending update proposals must be recreated. See [the record contract](docs/pillar-contract.md).

Existing schema-v2 repositories keep their records. Run `cground init` after upgrading to refresh guidance. New update requests require `verification.sourceFiles` and `verification.documentFiles`; recreate old pending proposals.

## Agent tools and CLI

| MCP tool | Purpose | CLI |
|---|---|---|
| `start_here` | Entry guide and ownership candidates | `cground start "build failed"` |
| `ownership_map` | Path or signal → owning pillar/chapter | `cground owners --path PATH` |
| `pillar_graph` | Derived cross-pillar dependency graph | `cground graph PILLAR` |
| `tidy_plan` | Read-only cleanup preview | `cground tidy TARGET` also issues a local request |
| `review_checklist` | Source and documentation to verify | `cground review-checklist CHAPTER --touched PATH` |
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

`init` writes the Start Here guide and merges a managed `AGENTS.md` section, a Copilot instruction link, and `.vscode/mcp.json`, preserving existing guidance and JSONC comments.

1. Ensure `cground` is on VS Code's PATH; restart VS Code after installing if needed.
2. Open the repository and use **MCP: List Servers** to start Common Ground, completing normal host trust prompts.
3. In Copilot agent chat, check that the thirteen tools are available.
4. Ask the agent where to start with a build failure, then navigate its suggested pillar and chapters and verify the facts in source.

For other MCP clients, launch `cground serve --root /absolute/repository/path`. Remote SSH or dev-container sessions need the package installed in that environment. This targets agent chat, not inline completion. Automated tests cover the real stdio protocol; manual VS Code GUI acceptance remains a separate check.

## Demo and onboarding

```sh
npm run demo
```

The synthetic monorepo includes Azure pipeline, Nx/npm, UI, and Java contracts, with a verified CI → workspace tooling dependency. Its UI pillar indexes Search and Search Results chapters; the result-validation fact depends on the search-threshold fact. The demo changes Search, reviews both, and publishes only the invalidated chapter. These fixtures are not a runnable full application stack. See [manual demo steps](docs/demo.md).

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
