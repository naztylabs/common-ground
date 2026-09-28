# Repository discovery

`cground init` uses bounded static discovery to propose an initial responsibility map. `cground scan` returns the same kind of preview without writing knowledge. Once a repository has an approved registry, `init` refreshes managed guidance and configuration while preserving that registry and skipping discovery.

Discovery never runs project commands, installs dependencies, imports configuration scripts, invokes a model, seeds facts, or records inferred dependencies. Its observations are navigation hints for the calling agent. The agent reviews code and local READMEs, explains the proposed boundaries, and obtains developer approval before adopting the map.

## Built-in signals

| Family | Recognized signals |
|---|---|
| Angular | `@angular/core` dependency, `angular.json` project roots/types, Angular Nx executor/builder names |
| React / Next.js | `react` and `next` dependencies; matching explicit Nx executor names |
| Vue / Nuxt | `vue` and `nuxt` dependencies, `.vue` source paths; matching Nx executor names |
| Svelte / SvelteKit / Astro | `svelte`, `@sveltejs/kit`, `astro` dependencies; `.svelte` and `.astro` paths |
| React Native / Expo | `react-native` or `expo` dependencies, an `expo` object in `app.json`/`app.config.json`, matching Nx executor names |
| Swift / native Apple | `Package.swift`, Xcode `project.pbxproj`, `.swift` source paths; Swift alone does not imply iOS |
| Java / Kotlin / Android | Maven `pom.xml`, Gradle build/settings files, `.java`/`.kt` paths, `AndroidManifest.xml`, Android plugin identifiers; Gradle alone does not imply Java |
| Spring Boot | `org.springframework.boot` in Maven/Gradle manifests |
| Node / TypeScript backends | `package.json`, JS/TS source paths, `express`, `fastify`, `@nestjs/core`, `typescript` dependencies |
| Python | `pyproject.toml`, requirements files, `Pipfile`, `setup.py`, `.py` paths; Django, FastAPI and Flask names in dependency manifests |
| Go / Rust | `go.mod`, `go.work`, `Cargo.toml`, `.go`/`.rs` paths; Cargo workspace tables |
| .NET | Project/solution filenames (`.csproj`, `.fsproj`, `.vbproj`, `.sln`, `.slnx`) and C#/F# source paths |
| Ruby / PHP | `Gemfile`, `composer.json`, Ruby/PHP paths; Rails gem and Laravel requirement declarations |
| Dart / Flutter | `pubspec.yaml`, `.dart` paths, a Flutter key in the manifest |
| Workspaces / monorepos | npm/Yarn workspaces, pnpm workspace files, Nx project/workspace files, Turborepo, Lerna, Angular workspace projects, Go/Cargo/Gradle workspace markers, conventional `apps/`, `packages/`, `libs/`, `services/`, `projects/` roots |
| Shared libraries | Explicit Angular/Nx library declarations and conventional `libs/` or `packages/ui`, `packages/components`, `packages/shared` JS/TS paths |
| CI/CD | GitHub Actions, Azure pipeline filenames and `pipelines/` YAML, GitLab CI, CircleCI, Jenkinsfile |

Package signals come from declared dependencies, development dependencies, peer dependencies, and optional dependencies. Merely mentioning React in a README or lockfile, or depending on `@types/react`, does not identify a React application. Source extensions identify language hints; JSX/TSX alone does not prove React. Text-based checks for non-JSON manifests are heuristics, not full parsers or proof of runtime use.

These built-ins follow recognizable conventions such as [Angular workspace project definitions](https://angular.dev/reference/configs/workspace-config), [Nx explicit project targets](https://nx.dev/docs/reference/project-configuration), [Swift package manifests](https://docs.swift.org/package-manager/PackageDescription/PackageDescription.html), [Expo configuration](https://docs.expo.dev/versions/latest/config/app/), and [Flutter pubspec files](https://docs.flutter.dev/tools/pubspec). They do not require a particular framework version or execute its tooling.

## Responsibilities, not one pillar per technology

Detections include a project root, technology labels, a short list of supporting file paths, and the proposed chapter ID. A Next.js application can list both Next.js and React in one chapter. A React Native application can include React, Swift and Java/Kotlin signals from its `ios/` and `android/` subtrees without creating independent pillars for those implementation layers.

Projects are grouped under broad candidate responsibilities such as web applications, mobile applications, native packages, JVM projects, shared libraries, workspace tooling and CI/CD. Multiple projects in the same family become chapter candidates under one pillar. A repository may need different ownership boundaries, or multiple technology families may belong to one subsystem: the agent must merge or adjust those proposals with the developer. These defaults do not establish semantic independence.

Nested manifests and Angular declarations establish project roots. Explicit Nx executor names can distinguish applications with dependencies shared at the workspace root. Nx inferred tasks and arbitrary build scripts are not evaluated. Manifests, source paths and conventional directory names may be insufficient; ambiguous or missing ownership remains a review question.

## Limits and output

- Scan at most **1,500 directory entries**, breadth-first. Root manifests and shallow sibling projects are examined before deep trees. Very wide directories can still exhaust the budget.
- Read at most **256 KiB per manifest** and accept at most **2 MiB of manifest content**. Oversized, malformed and budget-skipped manifests generate warnings. Source files are identified by path; their contents are left for agent verification.
- Skip symlinks, `.env*`, dependencies, common generated output (including `.vite` dependency caches), virtual environments and native build/dependency directories such as `Pods`, `Carthage`, `DerivedData`, `.build`, `.gradle` and `.dart_tool`. This uses a built-in exclusion list, not a complete `.gitignore` implementation.
- Return at most **50 project candidates**, **30 exact-file ownership hints per chapter**, **6 evidence paths per detection**, **10 warning details**, and **30 unclassified/sample-omitted paths**. Total counts and truncation flags accompany capped sections. A file has at most one proposed owner; sampled exact files must be expanded or reassigned during review.

`scan.truncated` reports filesystem scan truncation. `scan.inspectedEntries`, `scan.inspectedFiles` and `scan.manifestBytesRead` describe the work performed. `projectsTruncated`, `detectedProjectCount`, each detection's `pathsTruncated`/`evidenceCount`, and `warningCount` describe output limits. Inspect these fields before claiming the repository has been covered. A successful scan never proves exhaustive coverage; these discovery limits do not cap stored facts or approved projects.

Invalid JSON is reported without aborting the entire bootstrap. Filename/language signals can still yield a coarse candidate. Dynamic JS/TS configuration, imported dependency catalogs, custom project layouts, linked external roots and unsupported ecosystems need source review or additional built-in detection rules. New framework support currently means editing `src/discovery.ts` and adding synthetic regression fixtures; there is no plugin/provider API yet.

## Extending safely

Repository owners can define an approved pillar/chapter for an unsupported technology today. Automatic discovery is a convenience, not a prerequisite for using the framework. For new built-in discovery rules, preserve bounded reads, explicit uncertainty, approval requirements and non-overlapping ownership. Add positive examples alongside false-positive, mixed-monorepo and malformed-input cases. Never populate factual claims from detection labels alone.
