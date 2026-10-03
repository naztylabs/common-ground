# Common Ground setup and usage

This guide covers installation, agent setup, initial knowledge publication, everyday usage, and the CLI/MCP reference. For an introduction to the framework, start with the [README](README.md).

- [Install and initialize](#get-started)
- [Initial map and publication](#cli-reference-for-agents)
- [Everyday lookup and maintenance](#everyday-lookup-and-maintenance)
- [Search live source when knowledge is thin](#search-live-source-when-knowledge-is-thin)
- [Command help and output formats](#help-wherever-you-need-it)
- [Validation and cleanup](#check-and-clean-up-knowledge)
- [Review knowledge changes](#review-with-your-agent-not-the-json-file)
- [Git integration and setup recovery](#share-knowledge-keep-generated-views-local)
- [Connect an agent through MCP](#connect-an-agent)
- [Extend the framework](#adopt-and-extend)
- [Development and upgrades](#develop-and-upgrade)

## Get started

Requires Node.js 22+ and npm. Download the `.tgz` package from [GitHub Releases](https://github.com/naztylabs/common-ground/releases), then install it:

```sh
npm install -g ./nazty_labs-common-ground-0.5.1.tgz
```

The package is distributed through GitHub Releases, not npmjs.com. Choose the `.tgz` asset, not GitHub's source archive. npm still needs registry access to install runtime dependencies.

Open your project with your coding agent and tell it:

> Use the Common Ground CLI to initialize this repository with `cground init`. Inspect the source, propose a responsibility map and initial facts for my approval, and handle setup and ongoing knowledge maintenance.

Your agent runs `init` to create repository guidance, MCP configuration, an advisory Git hook, and a local Markdown reference. It handles discovery, verification, and setup, explaining the proposed map and facts in plain language. After your approval, it populates `.common-ground/knowledge.json`. To delegate initial publication, explicitly ask it to “initialize and save the source-verified responsibility map and initial facts autonomously.” That request authorizes publication within its scope; a request just to initialize or generate a map produces a draft. Continue giving your agent normal development tasks; it uses Common Ground as needed.

## CLI reference for agents

The commands below are a reference for agents and developers extending or troubleshooting the framework. Developers can ask their agent to perform these workflows in plain language.

For a complete initial transaction, your agent can prepare a JSON payload with `pillars` and `batches: [{chapterId, facts}]`, then run:

```sh
cground bootstrap setup.json --dry-run
# With content approval or explicit delegation to publish the initial map:
cground bootstrap setup.json --approve --preflight TOKEN
```

The dry run validates the whole map and all fact batches without creating a registry, reports source-file counts, and returns `TOKEN`. Initial publication requires content approval or explicit developer delegation to save/publish the initial boundaries and facts. An existing delegation does not need a second approval question. Receipts declare direction and bind content; they do not attest human review. Changes to the payload, source or registry reject publication. `seed-batch` provides the same preflight/apply workflow for already approved empty chapters. JSON commands accept `--stdin` instead of their filename (or `-` as the filename). Boundary-only `approve` and single-chapter `seed` remain available; approving boundaries does not approve facts.

For ongoing checks, the agent can use:

```sh
cground review                # Ask your agent to explain knowledge changes
cground check                 # Check all recorded knowledge
cground check cicd            # Check one pillar (use your actual ID)
cground tidy all              # Give your agent a complete cleanup plan
cground export                # Refresh the local Markdown reference
cground doctor               # Check repository setup
```

In an MCP-capable agent, you can say: “Check the facts in the CI/CD pillar and freshen them if needed.” The agent finds the pillar, checks its facts, reads source, and submits verified corrections. Common Ground does not run a model internally.

## Everyday lookup and maintenance

```sh
cground lookup --path src/runtime.ts       # A few stored facts and source locations
cground lookup "runtime mode" --verify     # Also check selected facts and dependencies
cground assess --touched src/runtime.ts    # Assess only this task's changed paths
cground assess --touched src/runtime.ts --review  # Complete package if a correction is needed
```

Lookup and search preserve technical versions such as `1.4` as whole tokens: `1.40` and `1.4.0` are different versions. Short terms such as CI also require token boundaries, including path segments, underscores and camel-case boundaries. Longer words retain partial matching. Repository-wide terms carry less weight, so distinctive concepts rank higher. Direct evidence-path matches take priority. Use `lookup --path` for any literal file or directory; paths containing `/` also work as queries.

Each lookup result contains its fact ID, statement, source paths, relevance and freshness once. Shared caveats appear once for the response. Use `--verbose` (MCP `verbose:true`) for matching reasons, matched/unmatched terms, lexical coverage and navigation counts. Weak coverage leads with **“No direct answer found”**, followed by the best navigation hints and partial stored matches. Coverage is lexical: a match never proves that a fact answers the question.

A separate `navigation` object suggests up to three chapters and five stored ownership/source paths per chapter. These are unverified navigation hints, including when no fact matches. Lookup does not scan for new files, and `--verify` does not verify navigation hints. With weak coverage, `sourceSearch.status: "not-run"` offers a separate source-search operation using matching facts' evidence and chapter paths where available.

Lookup and assessment create no task state and require no start/finish sequence. Lookup defaults to at most five facts and explicitly reports freshness as `not-checked`; open source before relying on a claim. `--verify` checks selected facts and upstream sources, not entire unrelated chapters or semantic truth.

Assessment returns `no-fact-review` for unrelated or fingerprint-identical source, with focused local/ancestor documentation paths. Changed source returns `source-review-required`: verify the affected claims before deciding whether knowledge needs revision. `--review` expands the relevant chapters into a bounded package containing all facts, evidence, revisions and source/documentation paths. Follow every page before revising knowledge. Path matching cannot detect every semantic connection.

`prepare-patch` accepts a standalone correction without `taskId`; whole-chapter review and source/revision conflict checks remain enforced. Task contexts remain available for aggregate reporting and deferred additions. Start one when additions need `propose_facts`, finish after the developer task, and obtain approval before admission.

## Search live source when knowledge is thin

An agent can follow weak lookup coverage with targeted searches of source files or directories. Choose paths from the returned hints or repository inspection; the examples below use hypothetical source paths:

```sh
cground lookup "format 1.4 hierarchy" --verbose
cground source-search "version 1.4" --path src/header.ts
cground source-search "chunk node write" --path src/writer.ts
cground source-search "hierarchy serialize" --path src,docs/format.md
```

The MCP equivalent is `{"operation":"source-search","args":{"query":"version 1.4","paths":["src/header.ts"]}}`. Both MCP profiles support it. The operation requires explicit repository-relative paths, works without an initialized registry, and returns `kind: "live-source-evidence"` with file paths, line numbers and short excerpts. These are current lexical source hits; the agent must read the surrounding implementation before making a claim. They are never stored facts, and the operation writes no knowledge or task state.

Search reads UTF-8 text within the selected paths, skips symlinks, dependencies, generated output and hidden configuration (except `.github`), and never runs project commands. Read excluded configuration files directly when relevant. It scans at most 2,000 entries and 200 files, with limits of 1 MiB per file and 4 MiB total, and returns up to five hits with 300-character excerpt windows. Queries accept up to 32 technical terms and 500 characters. Scan limits, skipped-file counts and result truncation are reported; an empty or truncated result does not prove absence. Terms common across scanned files are downweighted, while exact version tokens remain distinct.

Discovery may also suggest reviewing format architecture when several independent implementation filenames and a format specification are present. Verify how those pieces relate, whether the navigation would help repeated tasks, and whether it fits existing ownership before proposing an entry. One unsuccessful lookup does not authorize new knowledge or a new pillar.

## Help wherever you need it

```sh
cground --help
cground check --help
cground help tidy
cground hook --help
cground task assess -h
cground schema seed            # Exact input schema and facts-array payload
cground bootstrap --help --example
cground --version
```

Every command supports `--help` and `-h`, with its arguments, options, and an example. Help never executes the command or requires an initialized repository. Options accept both `--root PATH` and `--root=PATH`. Unknown flags, unsupported options, and missing or extra arguments fail with a usage hint.

Use `--root PATH` to select another repository. In terminals, checks return a concise summary. Validation returns failing rows by default; `--all-results` includes passing rows, with a global summary in either mode. `approve`, `approve-chapters`, `seed` and `admit` return compact receipts; `--verbose` returns full objects. Pipes preserve structured JSON; `--json` requests it explicitly and disables interactive prompts. `init` keeps its short agent handoff and Markdown link; `review` prints readable text by default. Use `--json` for structured output from either command. Diagnostics go to stderr, and MCP stdout stays reserved for the protocol.

`cground schema OPERATION` returns the CLI payload schema by default; `--both` also includes MCP arguments. With `--json`, failures return one JSON error object on stderr with `code`, `message`, `fields` and `recovery`, and exit nonzero. Successful results remain on stdout.

Exit codes are `0` for success and `1` for a failed command or knowledge needing attention. Pre-commit hook checks remain advisory and never block a commit.

## Check and clean up knowledge

`check` and `validate` are equivalent. They check structure, exact evidence, source changes, and recorded dependencies. Targets can be `all`, a pillar, `pillar/chapter`, `pillar/chapter/fact`, or a unique fact ID. Omitted targets mean `all`.

When knowledge is stale, the result lists affected pillars, chapters, and facts and asks **“Start automatic cleanup?”** An interactive terminal offers `[y/N]`. For scripts or agents:

```sh
cground check cicd --cleanup n --json
cground validate all --cleanup y --json
```

Acceptance creates a scoped cleanup plan and `tidyId`. Your agent still has to read all required chapters, source, and documentation, then submit verified corrections and check again. A plan is not a completed repair: the command continues to exit `1` while knowledge needs attention. Unpopulated chapters need approved setup. Matching evidence or hashes cannot prove a natural-language claim is true.

`tidy TARGET` can also request cleanup when source has not changed, such as merging duplicates or tightening existing facts. Both CLI and MCP enforce complete reviews and reject conflicting source or knowledge changes. Unchanged facts are not rewritten. New facts and ownership expansion require developer approval.

## Review with your agent, not the JSON file

The developer reviews a short explanation in chat. The agent reads and verifies source, then presents **what changed, why, evidence links, and whether to keep or approve it**. Verified corrections are applied to the working tree and summarized afterward. During ordinary development, new facts, chapters, pillars and ownership expansion still need explicit approval of the plain-language proposal. Initial setup may instead use the explicit publication delegation described above. Developers do not need to open or edit `knowledge.json`.

`task_context finish` supplies compact before/after details and recommendations for that task. Unchanged facts and fingerprint/revision noise are excluded. An evidence-only change is identified even when the statement stays the same. Any uncertainty or later drift is flagged for another review; mechanical validation alone is not proof of truth.

```sh
cground review                     # Meaningful changes against Git HEAD
cground review cicd                 # Only this pillar's changes
cground review --staged             # The knowledge in the proposed commit
cground review --evidence           # Include exact changed quotes
cground review --json               # Structured delta for an agent
```

The equivalent MCP call is `{"operation":"review","args":{"target":"cicd"}}`. Review is read-only, paginated, and covers pillars, chapters and facts. It cannot know why an arbitrary Git change was made or whether it was approved; the agent must verify and explain that. Full source/chapter review is still required before publishing corrections. Initial pillar/chapter proposals are summarized from the agent's proposed map before approval.

## Share knowledge, keep generated views local

Commit `.common-ground/knowledge.json` and the generated repository guidance/configuration with your code. It is one shared JSON registry, organized as pillars → chapters → facts. Each fact has a stable ID, a statement of up to 2,000 characters, exact evidence, source scope, and dependency references. Keep one durable claim per fact; the limit is room for context, not a target.

`.common-ground/local/knowledge.md` is a complete, human-readable view of the stored registry, including evidence, dependencies, revisions, and fingerprints. `init`, checks, tidy, explicit export, and successful knowledge writes refresh it when content changes. The local directory is Git-ignored and also holds disposable task and review state. Draft facts never appear in the shared reference.

`init --skip-hook` (MCP `skipHook:true`) completes setup without accessing the hook. Hook permission errors also allow the rest of setup to finish, with `setup.status: "complete-with-warnings"`. The setup report identifies completed, skipped, failed and pending steps. Other failures return `INIT_INCOMPLETE` with the same detail and the underlying error. The MCP `cground` tool includes this structured failure under `diagnostic`, alongside its error message. Reruns preserve existing knowledge and edited bootstrap drafts; use `scan` for fresh discovery signals and `hook install` when Git metadata is writable.

The default Git hook checks staged knowledge against staged source and reminds you to review before sharing. It never changes facts. Existing hooks and hook managers are preserved; `init` explains how to add `cground hook check` to their entry point.

```sh
cground hook mute             # Suppress reminders in this checkout
cground hook unmute           # Restore reminders
```

## Connect an agent

For VS Code Copilot, `init` merges `.vscode/mcp.json` and a Copilot instruction link while preserving existing guidance and JSONC comments. Ensure `cground` is on VS Code's PATH, start Common Ground through **MCP: List Servers**, and complete the host's trust prompts. Restart an existing server after upgrading.

Other MCP clients can launch:

```sh
cground serve --root /absolute/path/to/repository
```

Remote SSH and dev-container sessions need the package installed in that environment. This targets agents with tool access, not inline completion or chats without tools. Automated tests cover stdio; VS Code GUI acceptance remains a separate check.

The default profile has six tools:

| Tool | Purpose |
| --- | --- |
| `task_context` | Optional aggregate reporting and deferred fact additions |
| `read_knowledge` | Navigate indexes, facts, evidence, dependencies, and review checklists |
| `prepare_patch` | Prepare changes after complete chapter and source review |
| `commit_update` | Apply a prepared correction to the Git working tree |
| `propose_facts` | Queue verified additions locally for developer approval |
| `cground` | Discover and execute every CLI workflow through structured MCP inputs |

Call `cground` with `{"operation":"help"}` for a paginated catalog, or `{"operation":"help","args":{"operation":"validate"}}` for that operation's exact input schema. For developer-requested cleanup:

```json
{"operation":"validate","args":{"target":"cicd","cleanup":true}}
```

Setup, migration, admission, navigation, cleanup, hooks, diagnostics, export, and task workflows are available without a shell. Approval operations require `approved:true` under actual developer direction. Initial setup permits explicit delegation to publish verified boundaries and facts within scope; ordinary additions still require content approval. Flags declare direction; they do not grant permission. Host tool approval settings still apply.

`serve --profile full` preserves the thirteen original tools plus `cground` for existing integrations. Both profiles use the same framework operations. See [the task workflow](docs/quiet-workflow.md) for request formats and [the record contract](docs/pillar-contract.md) for review and publication rules.

## Adopt and extend

Shape pillars and chapters around your repository. Add team-specific guidance outside the managed instruction blocks. Build integrations with the CLI, MCP, and [published JSON schemas](schemas). Custom discovery rules, validators, fields, or storage currently require TypeScript changes; there is no plugin loader or stable public SDK.

The implementation uses three direct runtime dependencies: the MCP SDK, Zod, and a JSONC parser. Storage is local JSON with bounded discovery and paginated reads. There is no background watcher or service. The engine still loads the registry and hashes source internally; pagination reduces transferred context, not all computation. Huge registries and dense dependency graphs need performance evaluation before production claims.

## Develop and upgrade

```sh
nvm use                     # Node 24 for source development
npm ci
npm test
npm run demo                # Synthetic repository only
npm run release:pack        # Tested archive + checksum in release/
npm install -g ./release/nazty_labs-common-ground-0.5.1.tgz
```

After upgrading, run `cground doctor` and `cground refresh-guidance` for stale instructions, then restart the MCP server. Use `cground init` when full setup needs repair. `refresh-guidance` lists `changedFiles` and `unchangedFiles`; a healthy doctor or completed refresh returns `next: null`. Existing schema-v2 records are preserved. For a schema-v1 pillar-only registry, first review and run `cground migrate --approve`. Read the [release guide](docs/releases.md) for publishing and migration details.

More: [architecture and limits](docs/architecture.md), [complete knowledge policy](docs/knowledge-policy.md), [synthetic demo](docs/demo.md), [discovery](docs/discovery.md), [0.4.0 audit](docs/audit-0.4.0.md). Run `npm run measure:context` for reproducible context-size comparisons; these are byte measurements, not billing guarantees.

Common Ground is MIT licensed.
