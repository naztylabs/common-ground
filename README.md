# Common Ground

**Give your coding agents a shared map of your codebase.**

Common Ground is an open-source framework for shared, Git-backed repository knowledge. Your agents record what your code does, where responsibilities live, and which sources support each claim. The next agent can pick up that context and get to work.

Ask about your release process. Start a feature in an unfamiliar package. Trace a change across subsystems. Common Ground helps agents find relevant knowledge and source locations, then check the code before acting.

**Local files. Shared through Git. No model API key, telemetry, cloud service, or vector database.**

## Get started with your agent

Install Common Ground once in the environment where your agent runs. Requires Node.js 22+ and npm.

```sh
npm install -g @nazty_labs/common-ground
```

You can also install the versioned `.tgz` archive from [GitHub Releases](https://github.com/naztylabs/common-ground/releases); see the [release guide](docs/releases.md).

Open your repository with a coding agent that has terminal or MCP tool access, and tell it:

> Use Common Ground to initialize this repository. Inspect the source and READMEs, create a responsibility map and source-backed initial facts, and save them autonomously. Summarize what you saved and any coverage gaps.

Your agent handles setup, source inspection, verification, and the initial map. That prompt explicitly delegates saving it; ask for a draft instead if you want to review the content first.

Then give your agent a normal development task:

> Add this feature using the existing project patterns. Verify any Common Ground facts affected by your changes.

You direct the work. Your agent uses the CLI or local MCP server to look up knowledge and maintain relevant facts as the code changes.

**[Read the setup and usage guide →](SETUP.md)** for detailed commands, MCP configuration, approval rules, and troubleshooting.

## Knowledge your team can inspect

Common Ground organizes repository knowledge into three levels:

| Level | What it captures | Example |
| --- | --- | --- |
| Pillar | A distinct responsibility | Build and delivery |
| Chapter | An area within that responsibility | Release pipeline |
| Fact | One durable claim backed by exact source evidence | Publication runs only after the release job succeeds |

The map lives in `.common-ground/knowledge.json`. Commit it alongside your code so teammates and their agents share the same reference. A generated local Markdown view makes it easy to read.

- **Start with useful context.** Agents retrieve a few relevant facts and source paths without loading the entire map.
- **Keep claims connected to code.** Source fingerprints identify drift; agents verify affected claims before correcting them. Unrelated work and unchanged facts produce no knowledge writes.
- **Keep developers in control.** You can delegate initial publication explicitly. New knowledge and responsibility expansion during everyday work come back for approval.
- **Review meaningful changes.** Agents explain what changed, why, and which sources support it. Conflicting source or knowledge revisions reject publication.

Code remains the source of truth. A map can be incomplete, and mechanical checks cannot prove a natural-language claim is true. Agents still read source and use normal build and test checks.

## Adopt it. Extend it.

Common Ground runs locally through a CLI and a stdio MCP server. It includes setup for VS Code Copilot and can connect to other agents with shell or MCP tool access. Shape the responsibility map around your repository and extend the TypeScript implementation for your team's needs.

- [Setup and usage](SETUP.md) — installation, commands, workflows, and upgrades
- [Architecture](docs/architecture.md) — how the framework works and its limits
- [Synthetic demo](docs/demo.md) — a complete example repository workflow
- [Discovery](docs/discovery.md) — how candidate responsibilities are found
- [Release guide](docs/releases.md) — changes, packaging, and migration
- [Security boundaries](docs/security.md) — dependency alerts, exposure and validation

## License and credit

Common Ground is [MIT licensed](LICENSE). Commercial use is welcome.

If you incorporate Common Ground into your product, please acknowledge Common Ground and its contributors in an accessible credits, About, or documentation page, with a link to the project. This acknowledgment is voluntary and does not add conditions to the MIT license. The license's copyright and permission notice requirements still apply.

Use the following credit template:

> This product uses [Common Ground](https://github.com/naztylabs/common-ground), an open-source framework for shared, Git-backed repository knowledge, developed by the Common Ground contributors. Common Ground is licensed under the MIT License.

Include the full [MIT license and copyright notice](LICENSE) with copies or substantial portions of Common Ground; the credit template does not replace them.
