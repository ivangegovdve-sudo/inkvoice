# InkVoice

Dev Next.js runs on `http://localhost:49813`.

## Design System

Zero raw HTML in feature code. Use `src/components/ui/` first; extend when close; use a native tag only as a last resort and flag it as a future component.

- `src/components/ui/` — design-system primitives, theme-swappable
- `src/components/` — app components built on `ui/`, tied to InkVoice's domain

Colors use semantic CSS tokens in `globals.css`, never hardcoded Tailwind color classes.

The codebase is partially migrated; each change should move it closer to this target.

## Storybook and MCP

`pnpm storybook:all` starts both Storybooks in the right order: InkVoice on port 7007 composes `@carbonid1/design-system` on port 7006 from the separate `packages` repo. The `inkvoice-storybook` MCP server at `http://localhost:7007/mcp` serves both.

Before using a design-system component, query that MCP with `list-all-documentation`, then `get-documentation` with `storybookId: "design-system"`. Never invent component props.

## Resource Limits

Never disable memory caps, allocator watermarks, or other operating-system or framework safety limits to work around pressure. Removing a limit does not free memory; it lets the process drag the machine into swap and freeze.

Handle pressure inside the app: retry with caches cleared, use smaller batches, or fall back to a slower bounded path such as CPU. Apply the same rule to file descriptors, threads, and every other limit that keeps the system responsive.

## Caching

The TTS disk cache is a user-curated library, not an opportunistic cache.

- Never evict automatically. Remove nothing without explicit user action.
- Enforce the budget only during pregeneration. `POST /api/pregenerate/[bookId]` preflights with 15% padding and returns `409` on shortfall. On-demand playback writes bypass the budget.
- Clearing a book's cache cancels its pregeneration job and emits an SSE `deleted` event.
- Build the TTS cache key as `sha256(text.trim() + "|" + (voice || "narrator"))`. Key by content, not URL, because sentence indices shift.
- Use `Cache-Control: no-store` for TTS HTTP responses and client fetches. The disk cache is the source of truth.

## Code Style

- Use full words in UI text, debug output, and identifiers: `Sentence`, not `Pos`.
- Prefer named type aliases over inline annotations:

  ```ts
  type Props = { title: string; onClick: () => void }
  const Button = ({ title, onClick }: Props) => { ... }
  ```

- When mutable state is unavoidable, prefer `.reduce`, `.slice`, spread, or closures. Group related mutable state in one `const` object rather than separate `let` variables.
- Zustand persist migrations must preserve existing user state. Never discard stored values when adding fields.

### React Referential Stability

- Select individual Zustand values with `useStore((state) => state.value)`. Never destructure the whole store.
- Hooks returning values and callbacks in an object must wrap the return value in `useMemo` to prevent consumer-side infinite loops.
- Test callback stability on hooks that return functions:

  ```ts
  const { result, rerender } = renderHook(() => useMyHook())
  const first = result.current.callback
  rerender()
  expect(result.current.callback).toBe(first)
  ```

## Collaboration

Push back on concrete concerns: name the issue, suggest an alternative, then defer to the user's call. Skip pushback on trivial choices. State concerns directly without hedging.

After a task, offer at most two follow-ups when the changed code reveals a concrete opportunity:

- Refactoring that addresses duplication or a pattern in the code just touched
- A domain-specific product capability enabled by the work

Skip follow-ups when the task is self-contained. In Plan mode, include a short `Opportunities` section only when relevant.

## Code Review

Never use a harness-native code review such as Claude Code's bundled `review` / `security-review` or Codex's `/review`. The repository review is the manual-only `code-review` skill. A person invokes it by name (`/code-review` or `$code-review`); an agent explicitly asked to review loads `.agents/skills/code-review/SKILL.md` and follows it with the supplied arguments.

## Comments

- Default to no comments. Add one when the why is non-obvious: a hidden constraint, subtle invariant, specific workaround, surprising behavior, negative-space contract, optimization rationale, or production operational note.
- Do not explain what code does. First rename identifiers so the code carries the meaning; comment only when renaming would make the code worse or fragment it into tiny single-use helpers.
- Exported hooks, helpers, and components may have short JSDoc covering inputs, outputs, and caller-visible behavioral caveats that types do not express.
- Do not reference the current task, fix, issue, or callers. That context belongs in commit or pull-request descriptions and rots as the code evolves.
- Do not narrate the diff. A comment must make sense to a reader with no diff context.
- Keep comments short. Prefer one line; use more only for a behavioral contract or several non-obvious reasons.
- When changing code, update or delete adjacent comments. Delete a comment if you cannot confirm it remains accurate.

## Filesystem Architecture

### Placement

- `src/components/` — design-system primitives and components used by two or more routes
- Route-specific components — `app/{feature}/components/`, even when they appear generic
- Hooks — `lib/hooks/{hookName}/{hookName}.ts`
- Helpers — colocate under the consumer's `helpers/{helperName}/{helperName}.ts`
- Services — `lib/services/{name}/{name}.service.ts`
- `lib/helpers/` — only for rare, truly cross-cutting utilities with many consumers

Colocate by default. Lift to shared scope only when a second consumer emerges.

### Directory-Name Convention

Every unit directory has a main file matching its name. Prefix siblings with the unit name.

```text
foo/
├── foo.ts
├── foo.types.ts
├── foo.consts.ts
├── foo.test.ts
├── components/
├── hooks/
└── helpers/
```

This keeps `**/foo*` searches scoped to the whole unit.

### Escalation

Keep definitions inline until they meet these thresholds:

| Extract to                     | When                                                        |
| ------------------------------ | ----------------------------------------------------------- |
| `.types.ts`                    | Type block exceeds about 20 lines or is cross-file          |
| `.consts.ts`                   | Three or more related constants, or prose/fixture data      |
| `.test.ts` / `.test.tsx`       | Logic worth testing exists                                  |
| `components/`, `hooks/` subdir | Subunit exceeds about 30 lines or is reused within the unit |
| `helpers/`                     | Helper has its own tests or sub-helpers                     |

Split a file when data is mixed with control flow, a second consumer emerges, or concerns are genuinely interleaved. File length alone is not a reason to split; a coherent 500-line file is better than ten files that must be read together.

### Conventions

- No barrel exports. Import from actual paths.
- Use named exports except for Next.js pages.
- One exported function per helper directory. Do not group sibling helpers.
- Do not create `.helpers.ts` files; helpers are directories.
- Use Tailwind only; do not add separate style files.

## Workflow

### Verification by Layer

- UI: load `agent-browser`, then exercise the behavior with the pinned `pnpm exec agent-browser` CLI before calling it done.
- Backend or API: exercise the behavior with `curl` and inspect the live logs.
- Timing-sensitive bugs involving races, workers, or background state: preserve the live reproduction recipe for the eventual commit message.

### Log Hygiene

Keep development logs at app-level information only. Fix actionable warnings at the root. Suppress non-actionable library noise with the narrowest category or module filter and document why. Never suppress real errors. Clean up log noise as part of the current task.

- Python warnings: use `warnings.filterwarnings("ignore", ...)` narrowly.
- Python logging: set `logging.getLogger("library").setLevel(logging.ERROR)` at the library initialization point, not module top level.
- Node: use `console.warn` for expected operational events and `console.error` for failures.

### Planning

- Keep plans concise and dense.
- Name the applicable skills in the plan.
- End with unresolved questions.
- For UI or UX work, load `design-system` first and `ui-ux-pro-max` as the accessibility and usability lens.
- For non-UI work, state why no UI or UX review is needed.
- When tests are warranted, load `testing` and name the behavior, motivation, and smallest layer that proves it.
- When no new test passes the `testing` value gate, state why and name the existing or runtime evidence instead.

### Verification Commands

Run the deterministic, non-mutating baseline before completion:

```bash
pnpm ts && pnpm exec eslint . && pnpm test:run
```

Use the `testing` skill to add Storybook, integration, web E2E, or Electron build and smoke checks when the change's risk requires them.

## Git

Work directly on `main` unless the user explicitly asks for a branch. Never commit or push without an explicit request. When asked to commit, use one commit per coherent piece of work.
