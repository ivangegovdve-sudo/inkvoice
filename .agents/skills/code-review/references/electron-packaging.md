Applies when: the diff touches `electron/`, `electron-builder.yml`,
`scripts/build-*`, `scripts/after-pack.js`, `scripts/download-node.sh`,
Electron dependencies or scripts, bundled resource paths, child-process
startup, or desktop Playwright tests.

# Electron packaging

Load `.agents/skills/electron/SKILL.md` and treat the current build scripts and
builder configuration as the executable contract.

Trace both development and packaged paths:

- main/preload compilation leaves `electron` external and matches the runtime
  module format;
- ASAR and `extraResources` paths match where code resolves them;
- pnpm symlinks and transitive dependencies are copied into a portable bundle
  without host-machine absolute links;
- native modules run under the intended bundled runtime;
- Node, Python, Next.js, Prisma assets, voices, and migrations are present for
  a clean machine rather than accidentally borrowed from the checkout;
- environment variables point child servers at the application-support data
  directory without exposing development paths;
- readiness waits for the correct services and does not load a hardcoded
  development port in production;
- failures surface useful logs and terminate sibling processes;
- quit, restart, reinstall, and failed startup do not leave orphaned
  processes;
- macOS architecture, executable permissions, and packaged filenames remain
  consistent across scripts and tests.

TypeScript and a successful web build do not prove packaging. For a material
packaging change, require a packaged launch or Electron smoke evidence when
the environment permits it.
