# GitHub Releases distribution

Common Ground is packaged with npm and distributed as an asset on [GitHub Releases](https://github.com/naztylabs/common-ground/releases). `npm publish` targets a package registry; it does not upload release assets. This workflow uses `npm pack` and GitHub CLI instead. GitHub Packages is a separate registry and is not needed here.

Consumers still need Node.js 22+ and npm. The archive contains compiled JavaScript and schemas, but not bundled dependencies. npm downloads those dependencies from the configured registry at installation time. Normal runtime operation is local.

## 0.3.0-beta.1

- Fact statements allow up to 2,000 characters for conditions, behavior, and consequences, retaining exact evidence requirements. Schema v2 records remain compatible with this version; older clients with the 320-character limit cannot read longer statements.
- Initialization installs advisory pre-commit checks by default when no existing hook manager owns the entry point. `cground hook mute` and `unmute` control notifications locally without blocking commits or changing facts.
- Init output is a short summary and review link; `--json` preserves the full response for integrations.
- Agents explicitly present proposed facts and evidence for team-sharing approval; corrections are linked for review before commit.

## One-time setup

1. Commit and push `.github/workflows/release.yml`, the packaging script, and the related project changes before tagging.
2. Ensure GitHub Actions is enabled for the repository. Repository or organization policy must allow the workflow's `contents: write` permission so it can create a release and upload assets.
3. No extra repository secret is required. The release step receives the built-in `GITHUB_TOKEN`; it never calls `npm publish`.

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
release/common-ground-knowledge-0.3.0-beta.1.tgz
release/common-ground-knowledge-0.3.0-beta.1.tgz.sha256
```

Inspect the archive with `tar -tzf release/common-ground-knowledge-0.3.0-beta.1.tgz`. The package includes `dist/`, `schemas/`, documentation, its manifest and license. Repository knowledge, local state, tests, source fixtures, and `node_modules/` are excluded. Local packaging does not publish remotely.

## Publish the current version

After committing all intended changes, create and push the matching tag:

```sh
git tag -a v0.3.0-beta.1 -m "Common Ground 0.3.0-beta.1"
git push origin v0.3.0-beta.1
```

Pushing the tag publishes the release automatically after the checks pass. Follow the **GitHub release** run in the repository's Actions tab. The workflow verifies the installed CLI version, then uploads the archive and checksum and generates release notes. Versions containing a prerelease suffix, such as `-beta.1`, are marked as prereleases and are not marked Latest.

For a subsequent beta, start with a clean working tree and run:

```sh
npm version prerelease --preid=beta --no-git-tag-version
```

This updates `package.json` and `package-lock.json`. The CLI and MCP server read the package version automatically. Update version-specific installation examples, inspect and commit the changes, then tag and push that new version. Do not reuse an already published version or move its tag.

If validation or packaging fails before release creation, fix the problem and publish a new version, or rerun a failed job if the cause was transient. Release creation intentionally fails when the release already exists; it does not overwrite published assets. If a failed upload leaves a draft, inspect and finish that draft in GitHub instead of expecting a rerun to replace it.

## Install a release

Download the `.tgz` asset using a browser. GitHub's **Source code (zip)** and **Source code (tar.gz)** downloads are source snapshots, not the built npm package. From the download directory:

```sh
npm install -g ./common-ground-knowledge-0.3.0-beta.1.tgz
cground --version
```

Optionally download the corresponding `.sha256` asset and check it on Linux before installing:

```sh
sha256sum --check common-ground-knowledge-0.3.0-beta.1.tgz.sha256
```

With GitHub CLI installed and, for a private repository, authenticated:

```sh
gh release download v0.3.0-beta.1 --repo naztylabs/common-ground \
  --pattern 'common-ground-knowledge-0.3.0-beta.1.tgz*'
```

Downloading first and installing the local file also avoids npm version differences in permissions for remote tarball URLs. Public release assets can be downloaded without a GitHub account; private repository assets require access.

## References

- [npm pack](https://docs.npmjs.com/cli/v11/commands/npm-pack)
- [npm install](https://docs.npmjs.com/cli/v11/commands/npm-install)
- [GitHub CLI release creation](https://cli.github.com/manual/gh_release_create)
- [GitHub Actions token permissions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication)
