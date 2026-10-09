# npm and GitHub Releases distribution

Common Ground publishes `@nazty_labs/common-ground` to npm and the same package archive to [GitHub Releases](https://github.com/naztylabs/common-ground/releases). Tag-triggered GitHub Actions checks the package before publishing through npm trusted publishing (OIDC).

Consumers still need Node.js 22+ and npm. The archive contains compiled JavaScript and schemas, but not bundled dependencies. npm downloads those dependencies from the configured registry at installation time. Normal runtime operation is local.

## 0.5.3

- Raise the MCP SDK dependency minimum to 1.32.1 and refresh its lockfile entry, excluding older versions affected by recent SDK security advisories. Common Ground continues to expose a local stdio server; it does not use the affected HTTP/OAuth client, bearer-authentication or experimental-task features.
- Add synthetic tests for both MCP profiles with network operations denied, with and without string code generation. They check retrieval, live source search, validation of untrusted request data and absence of knowledge/task writes. Release verification runs these checks against the installed archive as well.
- Document the Socket alert assessment and its limits in [Security boundaries and dependency alerts](security.md). Git review, advisory hooks, schemas, knowledge transactions and approval requirements remain supported. No registry migration or guidance refresh is required; restart the MCP server after upgrading.

## 0.5.2

This patch was a simple naming update, CODEOWNER file change, and npm publish demo.

## 0.5.1

This patch addresses feedback from initial setup, build/release lookup and technical format queries:

- Short query tokens such as CI require token boundaries, and technical versions such as `1.4` stay intact. Lookup and search downweight repository-wide terms, prioritize distinctive concepts and rank direct evidence-path matches first.
- Lookup leads weak coverage with “No direct answer found” and separate, bounded chapter/ownership hints from the registry. Compact results show each statement, source list, relevance and freshness once; `--verbose` restores matching diagnostics. Hints remain unverified even with `--verify`; default lookup performs no filesystem scan or knowledge write.
- A separate `source-search` command and MCP operation provide bounded searches of explicit source paths. Results are labeled live source evidence, with file/line excerpts and scan limits. Weak lookup coverage suggests this fallback without executing it or storing new facts.
- Initial setup distinguishes draft requests from explicit delegation to save/publish the source-verified initial map. Existing delegation needs no second approval question. Preflight receipts explicitly state they do not prove human content review; source and registry conflict checks remain mandatory.
- Initialization reports completed, skipped, failed and pending steps. Hook permission failures are advisory; other failures return `INIT_INCOMPLETE` with the underlying error and retry instructions. `init --skip-hook` / MCP `skipHook:true` skips installation. Retries preserve existing knowledge and edited bootstrap drafts.
- Discovery separates raw signals, responsibility suggestions and rationale. Complete homogeneous subtrees can use directory boundaries; mixed, excluded or truncated trees retain narrower hints. Incomplete ownership is prominent, and delivery prompts cover versions, release triggers, artifacts and publication without inferring facts.
- A format-architecture review prompt requires several distinct implementation-role filenames and a format specification. It asks about verified relationships, repeated navigation needs and existing ownership before any entry is proposed.
- START_HERE provides a self-contained bootstrap path and links to detailed maintenance policy, reducing repeated guidance.
- README introduces the framework and a short agent-led quickstart; the linked, packaged SETUP.md holds detailed commands, workflows, configuration and troubleshooting.

Upgrade with the 0.5.1 archive, run `cground refresh-guidance`, and restart the MCP server. Schema-v2 registries remain compatible. Lookup's default response is now compact: consumers needing per-result matching diagnostics must request `verbose:true` or `--verbose`, and navigation kind/freshness live on the shared navigation object. Lookup ranking and discovery candidate paths intentionally change. `check` still establishes mechanical consistency, not exhaustive topic coverage. Synthetic regression tests cover the feedback scenarios through CLI and both MCP profiles.

## 0.5.0-beta-2

- Lookup explains evidence, source-scope, ownership and query matches, with matched/unmatched terms and explicit lexical coverage limits.
- CLI errors distinguish missing/unreadable input, malformed JSON, invalid option values, unknown commands, invalid registries and source/registry conflicts. Recovery guidance and affected fields match the failure.
- Healthy doctor and guidance checks return `next: null`; successful bootstrap suggests lookup with optional task contexts.
- Guidance refresh reports changed and unchanged files, including idempotent reruns.

## 0.5.0-beta-1

- Doctor detects outdated managed guidance; `refresh-guidance` updates instructions without changing knowledge, MCP configuration or hooks.
- Fully reviewed citation-only corrections work without source edits or a tidy request, retaining reason, revision, evidence and publication safeguards.
- `--json` errors have a stable envelope on stderr with code, message, affected fields and recovery guidance.
- Fact schemas and help distinguish owned source scope from cross-chapter supporting evidence.
- Discovery excludes more dependency and editor/agent configuration directories, reports skipped paths, and accepts explicit `scan --exclude PATH1,PATH2` boundaries.
- Schema output defaults to the CLI payload schema. Use `schema OPERATION --both` (MCP `both:true`) for the additional operation schema.

## 0.5.0-beta.0

- Stateless lookup returns a few relevant facts and source paths; optional verification checks selected facts and dependencies. Source-aware assessment distinguishes unchanged source from claims needing review, with complete review packages on request.
- Standalone corrections accept prepare-patch without a task context while retaining full review and publication safeguards. Existing task contexts remain available for deferred additions and aggregate reporting.

- CLI schemas, JSON examples and stdin input make setup discoverable without inspecting implementation code.
- Bootstrap and multi-chapter seeding support no-write preflight, source-file counts and atomic publication guarded by a content token and developer approval.
- Supporting evidence can cross chapter ownership while remaining tracked for freshness. Source hashing streams large files independently of quotation size limits.
- Mutation receipts are compact by default; use `--verbose` for full objects. Validation shows failing rows by default; use `--all-results` for passing rows. MCP equivalents are `verbose:true` and `allResults:true`.
- Discovery recognizes C/C++ projects, skips more vendored trees and prioritizes conventional first-party directories. Setup guidance is shorter and state-specific.

Schema-v2 registries remain supported. Integrations that consume full mutation objects or passing validation rows must opt in to the corresponding options. Run `cground init` after upgrading to refresh managed guidance.

## 0.4.1-beta.0

- `cground review` presents meaningful pillar, chapter, and fact changes against Git HEAD, with staged and structured-output options. When changes exist, the CLI recommends reviewing through a coding agent to verify source and explain what to keep or approve.
- Task completion gives compact before/after corrections, reasons, source links, and keep/reverify recommendations. Verified corrections are applied before the summary; additions and ownership changes still require developer approval.
- Init and hook messages direct developers to agent-led review instead of editing the shared JSON.

## 0.4.0-beta.0

- A complete Markdown reference lives in ignored `.common-ground/local/knowledge.md`, created on init and refreshed by validate, tidy, and shared knowledge updates only when content changes.

- `cground validate` checks all knowledge by default, or a selected pillar, chapter, or fact. It preserves shared knowledge, refreshes the local Markdown view, and returns nonzero for invalid, stale, or unpopulated knowledge.
- `cground tidy all` creates a review scope covering the entire registry without changing facts.

- Fact statements allow up to 2,000 characters for conditions, behavior, and consequences, retaining exact evidence requirements. Schema v2 records remain compatible with this version; older clients with the 320-character limit cannot read longer statements.
- Initialization installs advisory pre-commit checks by default when no existing hook manager owns the entry point. `cground hook mute` and `unmute` control notifications locally without blocking commits or changing facts.
- Init output is a short summary and review link; `--json` preserves the full response for integrations.
- Agents explicitly present proposed facts and evidence for team-sharing approval; corrections are summarized in chat with before/after, reasons and source links.

## One-time setup

1. Commit and push `.github/workflows/release.yml`, the packaging script, and the related project changes before tagging.
2. Ensure GitHub Actions is enabled for the repository. Repository or organization policy must allow the workflow's `contents: write` permission so it can create a release and upload assets.
3. Create the package on npm with an initial manual release if it does not exist yet. Run the release checks first, then publish the generated archive with `npm publish ./release/nazty_labs-common-ground-0.5.3.tgz --access public`. Authenticate with your npm account and 2FA. The next automated release must use a new version.
4. In the npm package settings, add a GitHub Actions trusted publisher: GitHub owner `naztylabs`, repository `common-ground`, workflow filename `release.yml`, and no environment name. Enable direct `npm publish` permission. The npm organization is `nazty_labs`; the GitHub owner is `naztylabs`.
5. Allow the workflow’s `id-token: write` permission. No npm token secret is needed. GitHub release uploads use the built-in `GITHUB_TOKEN`. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

The workflow runs on a GitHub-hosted Ubuntu runner, uses `.nvmrc`, and triggers only for pushed tags beginning with `v`. The tag must exactly equal `v` followed by the version in `package.json`. The versioned commit must contain the workflow.

## Build and inspect locally

From the repository root:

```sh
nvm use
npm ci
npm run release:pack
```

This runs tests and the synthetic demo, regenerates the compiled runtime and JSON schemas, and writes these files for the current version:

```text
release/nazty_labs-common-ground-0.5.3.tgz
release/nazty_labs-common-ground-0.5.3.tgz.sha256
```

Inspect the archive with `tar -tzf release/nazty_labs-common-ground-0.5.3.tgz`. The package includes `dist/`, `schemas/`, documentation, its manifest and license. Repository knowledge, local state, tests, source fixtures, and `node_modules/` are excluded. Local packaging does not publish remotely.

## Publish the current version

After committing all intended changes, create and push the matching tag:

```sh
git tag -a v0.5.3 -m "Common Ground 0.5.3"
git push origin v0.5.3
```

Pushing the tag publishes the release automatically after the checks pass. Follow the **GitHub release** run in the repository's Actions tab. The workflow verifies the installed CLI version, publishes the tested archive to npm, then uploads the archive and checksum and generates release notes. Stable versions use npm’s `latest` tag; prerelease versions use `next`. Versions containing a prerelease suffix, such as `-beta.1`, are marked as prereleases and are not marked Latest.

For a subsequent beta, start with a clean working tree and run:

```sh
npm version prerelease --preid=beta --no-git-tag-version
```

This updates `package.json` and `package-lock.json`. The CLI and MCP server read the package version automatically. Update version-specific installation examples, inspect and commit the changes, then tag and push that new version. Do not reuse an already published version or move its tag.

If npm publishing succeeds but GitHub release creation fails, finish the GitHub release manually using that run’s version; rerunning cannot republish the same npm version.

If validation or packaging fails before release creation, fix the problem and publish a new version, or rerun a failed job if the cause was transient. Release creation intentionally fails when the release already exists; it does not overwrite published assets. If a failed upload leaves a draft, inspect and finish that draft in GitHub instead of expecting a rerun to replace it.

## Install a release

Download the `.tgz` asset using a browser. GitHub's **Source code (zip)** and **Source code (tar.gz)** downloads are source snapshots, not the built npm package. From the download directory:

```sh
npm install -g ./nazty_labs-common-ground-0.5.3.tgz
cground --version
```

Optionally download the corresponding `.sha256` asset and check it on Linux before installing:

```sh
sha256sum --check nazty_labs-common-ground-0.5.3.tgz.sha256
```

With GitHub CLI installed and, for a private repository, authenticated:

```sh
gh release download v0.5.3 --repo naztylabs/common-ground \
  --pattern 'nazty_labs-common-ground-0.5.3.tgz*'
```

Downloading first and installing the local file also avoids npm version differences in permissions for remote tarball URLs. Public release assets can be downloaded without a GitHub account; private repository assets require access.

## References

- [npm pack](https://docs.npmjs.com/cli/v11/commands/npm-pack)
- [npm install](https://docs.npmjs.com/cli/v11/commands/npm-install)
- [GitHub CLI release creation](https://cli.github.com/manual/gh_release_create)
- [GitHub Actions token permissions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication)

Beta 0.3.0 also exposes every CLI workflow through the discoverable `cground` MCP tool in both profiles. Scoped check/validate report affected IDs and offer developer-requested cleanup. The check JSON format now matches validate instead of returning a chapter-status array; automation should read `valid`, `summary`, and `affected`. Cleanup acceptance issues a review plan, not completed fact changes.

## 0.4.0-beta.0 developer-experience audit

Every command now supports `--help`/`-h`, including task and hook subcommands, without executing it. CLI and MCP use shared operation handlers; check and validate are aliases. Terminal checks are concise; scripts retain JSON and `--json` disables interaction. Unknown/unsupported flags and extra/missing arguments now fail explicitly. Use `cground export` to regenerate the local reference. No new runtime dependency was added. See [the audit](audit-0.4.0.md) for findings, retained tradeoffs, and startup measurements.
