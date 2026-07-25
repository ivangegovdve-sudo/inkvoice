Applies when: always.

# Repository conventions

Read `AGENTS.md` completely and flag only exact, attributable violations.

Deliberately check:

- full words in identifiers and UI text;
- named type aliases over substantial inline annotations;
- semantic design tokens rather than hardcoded Tailwind colors;
- Zustand selectors, memoized hook return objects, and stable callbacks;
- colocated unit directories, matching main filenames, no barrel exports, and
  one exported helper per helper directory;
- route-specific components under the route's `components/` grouping and
  shared components only after a second consumer exists;
- comments that explain a durable why instead of narrating the diff, naming a
  ticket, or describing temporary state;
- Tailwind-only styling and no new standalone style files;
- the resource-limit and cache invariants in `AGENTS.md`;
- manual-only skill parity between Claude frontmatter and Codex
  `agents/openai.yaml`.

Quote the violated rule in the finding. Repository text wins over this list.
