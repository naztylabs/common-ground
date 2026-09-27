# Demo the local beta

Build and pack Common Ground, then install the tarball globally using npm. It has not been published to the registry.

Copy `examples/demo-monorepo` to a separate demo directory. From the copy:

```sh
cground init
cground approve demo-data/plan.json --approve
cground seed ci-cd demo-data/ci-cd.json --approve
cground seed workspace-tooling demo-data/workspace-tooling.json --approve
cground seed web-components demo-data/web-components.json --approve
cground seed java-application demo-data/java-application.json --approve
cground check
cground search search
```

The supplied plan is reviewed synthetic fixture data; on a real repository review the discovered proposal with its owner. Initialize Git if needed, and commit source, instructions, MCP config, and `.common-ground/knowledge.json`. Local proposals remain ignored.

Open this directory in VS Code. Start Common Ground with MCP: List Servers. Ask Copilot to list the pillars and describe the reusable search contract with its evidence.

Change `SEARCH_MIN_LENGTH = 2` to `SEARCH_MIN_LENGTH = 3` in `packages/ui/search.ts`. `cground check` should report drift for the UI pillar only. Prepare the provided full-pillar revision:

```sh
cground prepare demo-data/search-update.json
cground commit PASTE_RETURNED_PROPOSAL_ID
cground check
```

Review the Git diff: the UI fact, its baseline, and its revision changed. No new pillar appeared. A second developer receiving the commit can read the same facts from their own local MCP server.

Also demonstrate restraint: edit only a source comment, review the pillar with unchanged facts, and observe that shared knowledge is untouched. Automated tests cover this scenario and source/conflict rejection.
