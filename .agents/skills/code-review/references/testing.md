Applies when: the diff changes tests, changes behavior with meaningful
regression risk, fixes a bug, adds a state migration or boundary, or alters
Vitest, Storybook, Playwright, fixtures, or test scripts.

# Tests

Load `.agents/skills/testing/SKILL.md` and apply its value gate before calling
coverage missing.

Check:

- changed tests assert accepted public behavior rather than the implementation
  chosen in the same diff;
- a bug fix's regression test would fail for the original defect when that
  defect is deterministic and testable at a maintained layer;
- component behavior lives in meaningful Storybook states, pure logic in
  Vitest, real database/filesystem behavior in integration tests, and only
  cross-page or browser-native journeys in E2E;
- mocks stop at real system boundaries and do not reproduce the implementation
  under test;
- selectors use roles, labels, and stable product identity rather than
  Tailwind classes or Base UI internals;
- asynchronous assertions wait on state or events instead of fixed sleeps;
- fixtures represent distinct EPUB, cache, database, or persisted-state shapes
  and contain no personal or licensed user data;
- test commands are deterministic and non-mutating;
- dependency upgrades account for changed roles, attributes, focus, portals,
  and event timing in every test layer.

Report a missing test only with the behavior it protects and why existing
evidence is insufficient.
