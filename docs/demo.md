# Demo the chapter beta

Build and pack the source, then install the resulting `common-ground-knowledge-0.2.0-beta.1.tgz` using npm. Copy `examples/demo-monorepo` to a separate directory and run:

```sh
cground init
cground approve demo-data/plan.json --approve
cground seed workspace-tooling/overview demo-data/workspace-tooling.json --approve
cground seed ci-cd/overview demo-data/ci-cd.json --approve
cground seed web-components/search demo-data/web-components.json --approve
cground seed web-components/results demo-data/web-results.json --approve
cground seed java-application/overview demo-data/java-application.json --approve
cground start "build failed"
cground owners --path pipelines/build.yml
cground graph ci-cd
cground chapters web-components
cground read web-components/search
cground fact web-components/search search-minimum
cground review-plan web-components/search --facts search-minimum
```

The supplied plan is synthetic reviewed fixture data. Real initialization requires an agent to explain and refine the proposed ownership map with the developer.

Open the directory in VS Code and start Common Ground with MCP: List Servers. Ask Copilot to route a build failure to its owner and inspect the recorded CI → workspace dependency, then select Search and explain its facts. Check that five default tools are available. The original CLI commands below remain supported. Commit source, shared registry, Start Here guide, detailed policy, instructions, and MCP configuration; local metadata remains ignored. No Java build dependency is invented: the fixture does not establish a complete Nx/Java application stack.

Change `SEARCH_MIN_LENGTH = 2` to `SEARCH_MIN_LENGTH = 3` in `packages/ui/search.ts`. The Results validation fact depends on the Search threshold fact, so both chapters must be reviewed:

```sh
cground review-plan web-components/search --facts search-minimum
cground review-checklist web-components/search web-components/results --touched packages/ui/search.ts
cground prepare demo-data/search-update.json
cground commit PASTE_RETURNED_PROPOSAL_ID
cground check
```

Before preparing, open the source files, `AGENTS.md`, and `packages/ui/README.md` listed in the request's verification fields. Those fields declare actual reading, not an instruction to skip it. Confirm that the README remains valid even though it needs no edit.

The request corrects the Search fact and includes an unchanged full review of Results. Publication increments Search's revision only. Results still uses the shared constant, so its existing assertion remains true. The local review record acknowledges the dependency check without rewriting valid shared knowledge.

For an automated version, run `npm run demo` from the Common Ground source directory. It copies the fixture to a temporary directory and prints its location. These fixtures illustrate contracts; they are not a complete runnable Nx/Java application stack.

The automated demo also uses a task-scoped compact patch, checks that an unchanged page is reused, and verifies that finish reports only the corrected search fact. For a walkthrough of deferred additions and approval, see [the quiet task workflow](quiet-workflow.md). Run `npm run measure:context` to compare serialized context sizes.
