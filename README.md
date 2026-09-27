# Common Ground

Shared codebase knowledge for every agent.

Common Ground is an offline, Git-backed knowledge service for coding agents. Stable **pillars** describe repository responsibilities. Each pillar holds terse **facts** with exact source evidence. Every developer's local MCP server reads the same committed knowledge from their checkout.

**Beta:** deterministic evidence checks establish that a quote exists and source fingerprints match. They do not prove that a natural-language assertion is correct. Agents must review the whole pillar and ask the developer when uncertain.

## Intended workflow: agents maintain the knowledge

Common Ground gives agents the shared understanding that developers build through everyday conversations. When one agent learns a verifiable fact about a repository, another developer's agent should be able to retrieve and use it without repeating the same investigation. Git distributes that knowledge alongside the code.

**Agents discover, write, and maintain pillars and facts. Developers approve responsibility boundaries and resolve uncertainty; they should not have to author JSON or manually maintain the knowledge base.** The records describe the repository, not an agent's activity history.

1. **Initialize:** the agent uses a brief repository scan to propose a small set of core pillars, checks for existing ownership, and explains the proposed boundaries to the developer. After approval, it populates the pillars with terse facts backed by source evidence.
2. **Use:** agents retrieve relevant facts and check their freshness before repeating broad discovery. When a developer asks a question, the agent explains the facts in plain language, references evidence when useful, and discloses stale or uncertain knowledge. JSON is the storage and tool-exchange format.
3. **Maintain:** when authorized work directly invalidates a fact, the agent revalidates the entire affected pillar and makes the smallest evidence-backed correction. It preserves unrelated facts and shares the revision with the corresponding code through the normal Git review process.
4. **Keep boundaries stable:** new features belong in existing pillars. An agent may propose a new pillar only when the responsibility is absent from every existing pillar and is standalone. The developer must explicitly approve its creation.
5. **Ask when uncertain:** the agent presents ambiguous or contradictory evidence to the developer before recording a change. It does not guess, add speculative facts, or repair unrelated knowledge opportunistically.
6. **Do nothing when nothing changed:** if the work invalidates no facts, the agent leaves shared knowledge untouched. A changed file alone does not justify rewriting a pillar.

For example, a reusable search UI component belongs in the existing **Reusable Web Components** pillar, even if a Java application consumes it. Backend search behavior belongs in the **Java Application** pillar. Neither feature automatically becomes a new pillar.

### Current beta workflow

Routine retrieval and fact updates are available through MCP. Initialization provides heuristic pillar candidates; it does not run an LLM or author facts itself. Your coding agent supplies that reasoning and prepares the records.

Pillar approval, initial population, and additional-fact admission currently use the CLI rather than MCP tools. An agent with shell access can run those commands after explicit developer approval; an approval flag never substitutes for that approval. A dedicated agent-facing approval flow is not implemented yet. The commands below document the current beta interface, not a requirement for developers to write JSON themselves.

## Install the beta

Requires Node.js 22 or later and npm. This package has not been published to npm; install a locally built tarball:

```sh
npm install
npm test
npm pack
npm install -g ./common-ground-knowledge-0.1.0-beta.1.tgz
cground --version
```

The package name is provisional. No account, model API key, telemetry, embedding service, gRPC daemon, or cloud sync is required. The MCP host starts a local stdio process on demand.

## Initialize a repository

```sh
cd /path/to/repository
cground init
```

Initialization performs bounded structural discovery and writes a **proposal**, not approved pillars or invented facts. Existing knowledge is preserved. Ask your agent to review `.common-ground/local/bootstrap.json`, refine its responsibility boundaries and path hints, and present the final map in plain language. Once you explicitly approve it, the agent can run:

```sh
cground approve .common-ground/local/bootstrap.json --approve
```

`--approve` records an explicit developer-directed operation. It is not a technical identity or authorization boundary against an agent that already has shell and filesystem access.

The agent prepares short facts with source evidence and presents them for the beta bootstrap review. After your approval, it can populate each approved empty pillar using its generated JSON file:

```sh
cground seed java-application /path/to/reviewed-facts.json --approve
```

A fact looks like:

```json
{
  "id": "event-version",
  "statement": "The Java application declares EVENT_VERSION as v1.",
  "evidence": [{
    "path": "apps/java/src/Application.java",
    "quote": "public static final String EVENT_VERSION = \"v1\";"
  }]
}
```

Commit `.common-ground/knowledge.json`, the managed instruction files, `.vscode/mcp.json`, and `.gitignore` with the project. Never commit `.common-ground/local/`.

## VS Code Copilot

`init` preserves existing guidance while adding a managed block to root `AGENTS.md`, a link from `.github/copilot-instructions.md`, and a `commonGround` stdio server in `.vscode/mcp.json`. Existing JSONC comments and other MCP entries are retained.

1. Ensure `cground` is on VS Code's PATH (restart VS Code after installation if needed).
2. Open the repository in VS Code and use **MCP: List Servers** to start Common Ground. Complete the host's normal trust prompts if shown.
3. Use Copilot agent chat and check that the five Common Ground tools are available.
4. Ask the agent to list pillars and read the relevant one before broad repository discovery.

This integration targets agent chat, not inline completion. Host policies can disable MCP. On SSH/dev containers, install the package in that environment. An initial VS Code GUI demo remains a manual acceptance check; automated tests exercise the actual MCP stdio protocol.

Any compatible MCP client can launch `cground serve --root /absolute/repository/path`. Generic client configuration usually uses a `mcpServers` object; VS Code uses `servers`.

## Routine maintenance

- Classify work into an existing pillar. Features do not become pillars.
- If work changes no facts, change no shared knowledge.
- A changed supporting file triggers review, not automatic rewriting.
- Update only facts directly invalidated by authorized work. Review every fact before updating any fact.
- Resolve ambiguity with the developer. Preserve unrelated facts verbatim.
- A new pillar requires an uncovered standalone responsibility and developer approval. Routine MCP tools cannot create pillars or expand scopes.

The MCP tools are `list_pillars`, `read_pillar`, `search_knowledge`, `prepare_update`, and `commit_update`. The CLI offers the equivalent operations:

```sh
cground list
cground search "event version"
cground read java-application
cground check
cground doctor
cground prepare /path/to/reviewed-update.json
cground commit PROPOSAL_ID
```

See [the update contract](docs/pillar-contract.md) for request format and guarantees. Developer-approved additional facts can be admitted with `cground admit ID FACTS.json --approve` only after reviewing the whole pillar. Admission is currently absent from MCP tools; an agent with shell access can execute this developer-approved step.

## Synthetic demo

`examples/demo-monorepo` contains illustrative Azure pipeline, Nx/npm, reusable UI, and Java contracts. It is a knowledge demo, not a runnable full application stack; do not run its npm install/build commands expecting a complete Nx application.

```sh
npm run build
node scripts/demo.mjs
```

The script copies the fixture into a temporary directory, approves four predefined pillars, seeds their facts, changes one UI constant, and updates only the existing UI pillar. It prints the demo location for inspection. See [manual demo instructions](docs/demo.md) for installing the tarball in a separate repository.

## Onboarding this repository

This repository uses Common Ground itself. Ask your agent to list the pillars and explain the relevant facts with supporting evidence. For direct inspection, read `.common-ground/knowledge.json` or run `cground list --root .`. Its approved pillars cover the knowledge engine, repository setup, agent interface, and beta validation. The source of truth is always current code and verified evidence, not a remembered task history.

## Development

```sh
npm install
npm test
npm run demo
```

TypeScript source is in `src/`; Node's test runner covers restraint, evidence validation, no-op updates, conflicts, config preservation, and real stdio MCP communication. The package uses the MCP TypeScript v1 SDK. See [architecture and limits](docs/architecture.md).

MIT licensed. All fixtures are synthetic; no employer code or internal project knowledge is included.

## Contributors

- **OpenAI Codex** — AI-assisted architecture, implementation, tests, and documentation, guided and reviewed by Tyler Nazifi.
