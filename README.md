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

1. **Initialize:** the agent proposes stable responsibility boundaries and chapters, then populates source-backed facts after developer approval. Initialization creates a short `AGENTS.md` entry, a Start Here guide, and the detailed `.common-ground/POLICY.md` policy.
2. **Find and read only what is relevant:** call `task_context start` once per coding task with known paths or a short signal. A path can take the agent directly to the owning chapter. Use `read_knowledge` to browse indexes or read chapter pages with `evidence: true`, then open the source this session. Signal matches are hints, not diagnoses.
3. **Do the developer's task:** maintain existing facts quietly within the affected scope. Call `task_context assess` with files this task actually touched, including new/deleted files. If none affect recorded facts, skip fact review but still check the relevant README. Follow additional connections found in source.
4. **Correct verified contradictions in place:** read the complete affected chapters, dependencies/dependents, source, and related documentation. `prepare_patch` sends only changed facts and declares review of each complete chapter revision; `commit_update` rechecks the transaction and writes the corrections to the working tree. No unrelated cleanup or automatic commits.
5. **Defer additions:** queue worthwhile new facts with `propose_facts`. These drafts are ignored local state, never shared knowledge. A new component usually needs its local README, not another subsystem fact. New facts, chapters, pillars and ownership expansion require developer direction.
6. **Finish once:** after the main task and its checks, `task_context finish` produces a brief correction summary and a single batch of proposed additions. The agent reports actual changes, for example: “I corrected Common Ground's search-threshold fact; it is in your Git working tree for review.” With nothing changed or pending, no Common Ground report is needed. Uncertainty is raised immediately only if it blocks the main task; otherwise it is collected for completion. Never guess.
7. **Admit after approval:** the agent reads all proposed facts, required chapters and current source/documentation, then runs `cground accept-facts TASK_ID REVIEW.json --approve`. The batch is validated before one shared write. The developer approves plain-language facts; the agent authors the JSON.

Durable knowledge covers subsystem behavior, architecture, connections, build/deploy mechanics, established conventions, and commands verified in source. It excludes bugs, open issues, work to fix, postmortems, debugging narratives, generic technology explainers, unverified claims, and temporary checkout state.

Any developer can request `cground tidy PILLAR` or `cground tidy PILLAR/CHAPTER/FACT` (a unique fact ID also works). The command creates a plan and local `tidyId`; the calling agent reads source and submits the cleanup. Common Ground remains model-independent and makes no semantic edits automatically. Compact MCP `read_knowledge` with `kind: "tidy"` previews scope without issuing authorization. See [the complete knowledge policy](docs/knowledge-policy.md).

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

Bootstrap and additional-fact admission currently use CLI operations instead of MCP approval tools. An agent with shell access executes them following developer approval; the flag never substitutes for approval. To add approved chapters to an existing pillar, use `cground approve-chapters PILLAR PLAN.json --approve`. For task-time additions, use the deferred proposal/finish/accept workflow above. The older `cground admit PILLAR/CHAPTER FACTS.json --approve` remains a developer-directed operator command; its source-reading and dependent review requirements still apply.

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

Commit `.common-ground/knowledge.json`, `.common-ground/START_HERE.md`, `.common-ground/POLICY.md`, the managed instruction files, `.vscode/mcp.json`, and `.gitignore`. `init` creates or updates a marked ignore block for `.common-ground/local/`; existing entries are preserved. Already-tracked files must be explicitly untracked.

## Upgrade a pillar-only beta repository

Schema v2 adds chapters. After installing this version:

```sh
cground migrate --approve
cground init
```

Migration preserves every old pillar's facts, scope, source hashes, and revision in an `overview` chapter. It invents no dependencies. A local backup is kept, and repeating migration is a no-op. The initializer refreshes agent instructions to use the new tools. Old pending update proposals must be recreated. See [the record contract](docs/pillar-contract.md).

Existing schema-v2 repositories keep their records. Run `cground init` after upgrading to refresh guidance. New update requests require `verification.sourceFiles` and `verification.documentFiles`; recreate old pending proposals. The default MCP surface is now compact. Existing integrations can select `cground serve --profile full` to retain the thirteen original tools.

## Agent tools and CLI

The default profile exposes five tools:

| MCP tool | Purpose | CLI |
|---|---|---|
| `task_context` | Start, assess touched paths, finish with meaningful changes only | `cground task start`, `task assess TASK --touched PATHS`, `task finish TASK` |
| `read_knowledge` | Bounded indexes, facts/evidence, ownership, graph, review checklists, and drafts | `cground read-knowledge REQUEST.json` |
| `prepare_patch` | Verify complete reviews; transmit only replacements/removals | `cground prepare-patch PATCH.json` |
| `commit_update` | Recheck and write the prepared corrections to the working tree | `cground commit PROPOSAL_ID` |
| `propose_facts` | Stage additions locally for end-of-task approval | `cground propose-facts TASK CHAPTER FACTS.json` |

`read_knowledge` accepts `kind`, an optional `target` pillar/chapter/fact ID, `taskId`, and pagination options. `kind: "chapter", evidence: true` returns full facts in batches. Use `kind: "review"` for dependency scope and `kind: "checklist"` for evidence and documentation paths. All page cursors must be followed for a complete review.

The original CLI navigation commands (`start`, `owners`, `graph`, `list`, `chapters`, `read`, `fact`, `search`, `review-plan`, `review-checklist`, `tidy`, `prepare`) remain available. `serve --profile full` exposes the original thirteen MCP tools for existing integrations. All commands accept `--root PATH`.

Publication rejects source changes, conflicting knowledge revisions, unrelated edits, malformed facts, and incomplete dependency reviews. Unchanged reviews write only local validation state. See [the compact workflow and request formats](docs/quiet-workflow.md) and [the record contract](docs/pillar-contract.md).

## Keeping context and interruptions small

- Five default tool definitions, a short always-loaded instruction block, and detailed policy loaded before edits.
- Direct path routing; paginated reads instead of whole-pillar dumps. Chapter evidence batches avoid one call per fact. Pages default to 10 records, at most 20, with a 12,000-character soft budget for full-fact batches. A single oversized record is returned intact to preserve evidence and dependencies.
- Task-local reuse returns a short `unchanged` reference for identical context. Live source/dependency changes invalidate it; use `refresh: true` after context loss. This never substitutes for source reading.
- Compact JSON tool responses and patch requests that omit unchanged facts. No count limit on stored facts.
- New facts wait in local drafts; routine checks and no-op outcomes do not need narration.

Run `npm run measure:context` for reproducible byte measurements of tool definitions, instructions, a correction in a 300-fact chapter, and repeated retrieval. These are context-size proxies, **not model-specific token counts or billing guarantees**. Full chapter review still costs context when a knowledge edit is justified. Large chapters and dense dependencies remain expensive; choose coherent chapter boundaries during approved setup.

Common Ground does not run an LLM or a background watcher. The calling agent follows these instructions, and the MCP host controls tool permission prompts. A host may require approval for local writes; Common Ground does not bypass those settings.

## VS Code Copilot

`init` writes the Start Here guide and detailed policy and merges a managed `AGENTS.md` section, a Copilot instruction link, and `.vscode/mcp.json`, preserving existing guidance and JSONC comments.

1. Ensure `cground` is on VS Code's PATH; restart VS Code after installing if needed.
2. Open the repository and use **MCP: List Servers** to start Common Ground, completing normal host trust prompts.
3. In Copilot agent chat, check that the five default tools are available.
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
