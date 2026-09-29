# 0.4.0 beta audit

The audit covered CLI parsing and help, CLI/MCP parity, onboarding, dependencies and startup, knowledge storage and review transactions, source and documentation discovery, pre-commit checks, Markdown export, tests, packaging, and developer documentation. The changes focus on reducing duplicated execution paths and making existing capabilities easier to use.

## Findings and changes

| Finding | Change |
| --- | --- |
| `init --help` could initialize a repository; most commands lacked contextual help | Handle help before loading or running operations. Every command gets usage, options, and examples, including nested hook/task commands. Regression tests check every command against an empty directory. |
| Options were removed from a global argument array regardless of which command used them | Use Node's built-in `util.parseArgs`, validate options per command, and reject incorrect arity and values before execution. Support `-h`, `-V`, `--name=value`, and `--` consistently. |
| CLI and MCP duplicated domain dispatch and validation | CLI arguments now adapt to the same structured operation handlers used by MCP. A two-way parity test checks the complete command catalog. |
| The operations module imported the MCP server, which imported operations | Extract retrieval into a transport-independent module; only `serve` loads the MCP runtime. Server exports remain compatible. |
| Help/version loaded Zod, the knowledge engine, and MCP | Keep early command handling independent of those modules. Test a help/version installation containing only the entry point, command metadata, and package version reader. |
| Check/validate schemas repeated the same behavior | Make both names reference the same operation definition. |
| Check output was verbose for terminal users | Return a concise terminal summary; preserve JSON for pipes and `--json`, with diagnostics on stderr and no prompts in pipelines. |
| Markdown export existed through MCP but had no direct CLI command | Add `cground export`, using the existing operation. |
| Muted pre-commit reminders still exported and hashed the index | Return after reading the notification preference when muted; there is no check result to consume or persist. |
| Getting started required scanning implementation and operator details | Shorten the README around install → init → review → check, then link the detailed workflow and contracts. |

## What stays, and why

- **One shared JSON registry:** already a small, understandable persistence model. No database, watcher, queue service, cloud dependency, or plugin runtime was added.
- **Atomic writes, writer lock, revision/source checks, whole-chapter review, and approval declarations:** these protect shared knowledge from partial writes, stale evidence, unreviewed edits, and accidental growth. Removing them would weaken the framework's core behavior.
- **Task-local receipts, drafts, and bounded context reuse:** these support deferred approval, accurate completion reports, and smaller repeated reads. They remain Git-ignored. No new cache layer was introduced.
- **Staged Git export:** more work than checking the working tree, but needed to catch a stale staged change even when unstaged files already contain a fix. The existing filter and symlink protections stay. This can be expensive in a large repository.
- **Both MCP profiles and existing CLI names:** preserving integrations is more useful than deleting aliases simply to reduce command count. The everyday commands appear first in help; all advanced commands remain discoverable.
- **MCP SDK, Zod, and JSONC parser:** each has a concrete role in protocol compatibility, shared schemas, and preserving user configuration. No new runtime dependency was added. The lockfile contains 95 production packages including transitive dependencies; three direct dependencies does not mean three installed packages.

## Measurements and checks

Nine local runs of each help command, immediately before upgrading the installed package, measured median startup of **188.0 ms for installed 0.3.0-beta.1** and **30.5 ms for the new CLI**. These are warm local wall-clock measurements, not cross-machine or cold-start guarantees. They measure help startup, not validation throughput.

Validation covers all-command help with no repository writes, strict arguments, CLI/MCP parity, actual stdio MCP calls, approval gates, synthetic source/dependency changes, source/revision conflicts, staged versus unstaged hook behavior, deterministic export, schema generation, demo and package installation. The behavior suite contains 142 passing tests, including checks of both MCP profiles. Release packaging also runs the synthetic demo and regenerates schemas.

This is a maintainability and developer-experience audit, not a claim of exhaustive security verification or production-scale performance. Native Windows and VS Code GUI acceptance remain unverified. Very large registries still require profiling; the core parses the registry and hashes source per request. Exact evidence and hashes establish mechanical consistency, not the truth of natural-language claims.

## CLI conventions consulted

- [npm help](https://docs.npmjs.com/cli/v11/commands/npm-help/): discover command documentation from the terminal.
- [Commander](https://github.com/tj/commander.js#automated-help): contextual help, explicit argument syntax, and rejection of unknown options. Common Ground uses Node's parser rather than adding a CLI dependency.
- [Prettier CLI](https://prettier.io/docs/cli#--check): concise check summaries, affected-item lists, and documented exit behavior.
- [Node util.parseArgs](https://nodejs.org/api/util.html#utilparseargsconfig): standard strict parsing and positional argument support.
