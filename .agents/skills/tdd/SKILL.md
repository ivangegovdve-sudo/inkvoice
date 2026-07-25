---
name: tdd
description: Test-driven development with red-green-refactor loop and selective E2E coverage. Use when user wants to build features or fix bugs using TDD, mentions "red-green-refactor", wants integration tests, E2E tests, or asks for test-first development. Also use when adding Playwright specs or deciding whether a feature needs E2E coverage. Equally important — use when fixing a failing test, debugging test failures, updating tests after code changes, or investigating why a spec broke. The skill contains anti-patterns and selector guidelines that prevent common mistakes when modifying existing tests.
---

# Test-Driven Development

## Philosophy

**Core principle**: Tests should verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't.

**Good tests** are integration-style: they exercise real code paths through public APIs. They describe _what_ the system does, not _how_ it does it. A good test reads like a specification - "user can checkout with valid cart" tells you exactly what capability exists. These tests survive refactors because they don't care about internal structure.

**Bad tests** are coupled to implementation. They mock internal collaborators, test private methods, or verify through external means (like querying a database directly instead of using the interface). The warning sign: your test breaks when you refactor, but behavior hasn't changed. If you rename an internal function and tests fail, those tests were testing implementation, not behavior.

See [references/tests.md](references/tests.md) for examples and [references/mocking.md](references/mocking.md) for mocking guidelines.

**Four layers of testing.** Storybook stories (`*.stories.tsx`) test React components — rendering, interaction, and visual variants. Vitest unit tests (`*.test.ts`) test pure logic — helpers, transformations, hooks via `renderHook`, and policy decisions that don't need real I/O. Vitest integration tests (`*.integration.test.ts`) test services that wrap a real database, filesystem, or other system boundary — real Prisma against real SQLite, real `fs.mkdtemp`, real ORM behavior. E2E tests (Playwright) selectively verify user-facing flows that cross pages or depend on browser-native behavior. See [the decision funnel](references/e2e.md) for E2E and [integration.md](references/integration.md) for the integration layer.

**The integration layer matters most for ORM-wrapping services.** A service that calls Prisma is mostly orchestration — its real behavior emerges only against a real schema. Mocking the ORM and asserting the query shape (`expect(prisma.x.findFirst).toHaveBeenCalledWith({ where: ... })`) is a tautology: the mock returns what you told it to, and the assertion verifies you wrote what you wrote. These tests pass forever, survive every refactor, and catch nothing. Write integration tests against a real DB instead — they're roughly the same setup cost (minus the mock boilerplate), and they catch schema drift, FK violations, JSON roundtrip bugs, and policy across real schema constraints in a way mocked tests physically cannot.

**Component tests go in Storybook, not Vitest.** If you're testing something that renders JSX and lives in `src/components/`, write a `*.stories.tsx` with story-level `.test()` methods. Vitest is for code that doesn't render — pure functions, hooks (via `renderHook`), services.

**Storybook story rules:**

- **Stories are visual states first, test hosts second.** Every story must make sense in the Storybook sidebar as a meaningful example of the component — even if you strip away all `.test()` calls.
- **Attach tests to existing stories** when the behavior can be verified against props that already exist for visual reasons. Don't create a new story just to test something.
- **Create a new story only when the test needs unique props** that no existing story provides. Name it for what it _shows_ (e.g., `CustomAriaLabel`), never prefix with "Test:" or name it for what it _asserts_.
- **One story can carry multiple `.test()` calls.** A `Default` story might test that the tooltip is hidden initially, shows on hover, and hides on leave — all three on the same story.
- **Every story gets a single-line JSDoc** above the export describing the scenario it represents — the _why_, not just the _what_. For domain components, describe the product context (e.g., `/** Bookmark drawer open with no bookmarks saved. */`). For design-system primitives, describe the use case (e.g., `/** Small size used inline within tooltip overlays. */`).

## References

Load these as needed during implementation:

- **[references/tests.md](references/tests.md)** — Good vs bad test examples
- **[references/mocking.md](references/mocking.md)** — When and how to mock at system boundaries
- **[references/deep-modules.md](references/deep-modules.md)** — Deep vs shallow module design
- **[references/interface-design.md](references/interface-design.md)** — Interface patterns for testability
- **[references/refactoring.md](references/refactoring.md)** — Post-TDD refactor candidates
- **[references/e2e.md](references/e2e.md)** — Decision framework for E2E test coverage
- **[references/integration.md](references/integration.md)** — When and how to set up integration tests against a real DB / filesystem

## Anti-Pattern: Horizontal Slices

**DO NOT write all tests first, then all implementation.** This is "horizontal slicing" - treating RED as "write all tests" and GREEN as "write all code."

This produces **crap tests**:

- Tests written in bulk test _imagined_ behavior, not _actual_ behavior
- You end up testing the _shape_ of things (data structures, function signatures) rather than user-facing behavior
- Tests become insensitive to real changes - they pass when behavior breaks, fail when behavior is fine
- You outrun your headlights, committing to test structure before understanding the implementation

**Correct approach**: Vertical slices via tracer bullets. One test → one implementation → repeat. Each test responds to what you learned from the previous cycle. Because you just wrote the code, you know exactly what behavior matters and how to verify it.

```
WRONG (horizontal):
  RED:   test1, test2, test3, test4, test5
  GREEN: impl1, impl2, impl3, impl4, impl5

RIGHT (vertical):
  RED→GREEN: test1→impl1
  RED→GREEN: test2→impl2
  RED→GREEN: test3→impl3
  ...
```

## Workflow

### 1. Planning

Before writing any code:

- [ ] Confirm with user what interface changes are needed
- [ ] Confirm with user which behaviors to test (prioritize)
- [ ] Identify opportunities for [deep modules](references/deep-modules.md) (small interface, deep implementation)
- [ ] Design interfaces for [testability](references/interface-design.md)
- [ ] List the behaviors to test (not implementation steps)
- [ ] Choose the test layer for each behavior: Storybook for components, Vitest unit for pure logic, Vitest integration for ORM/filesystem-wrapping services, E2E for cross-page flows
- [ ] Identify E2E candidates — read existing `tests/e2e/*.spec.ts` and run through the [decision funnel](references/e2e.md). Note which behaviors (if any) warrant E2E and whether they extend an existing spec or need a new one
- [ ] Get user approval on the plan

Ask: "What should the public interface look like? Which behaviors are most important to test?"

**You can't test everything.** Confirm with the user exactly which behaviors matter most. Focus testing effort on critical paths and complex logic, not every possible edge case.

### 2. Tracer Bullet

Write ONE test that confirms ONE thing about the system:

```
RED:   Write test for first behavior → test fails
GREEN: Write minimal code to pass → test passes
```

This is your tracer bullet - proves the path works end-to-end.

### 3. Incremental Loop

For each remaining behavior:

```
RED:   Write next test → fails
GREEN: Minimal code to pass → passes
```

Rules:

- One test at a time
- Only enough code to pass current test
- Don't anticipate future tests
- Keep tests focused on observable behavior

### 4. Refactor

After all tests pass, look for [refactor candidates](references/refactoring.md):

- [ ] Extract duplication
- [ ] Deepen modules (move complexity behind simple interfaces)
- [ ] Apply SOLID principles where natural
- [ ] Consider what new code reveals about existing code
- [ ] Run tests after each refactor step

**Never refactor while RED.** Get to GREEN first.

### 5. E2E

Write the E2E tests identified during planning. This isn't a reassessment — the decision was made in step 1 via the [decision funnel](references/e2e.md). If planning concluded no E2E was needed, skip this step.

E2E tests live outside the red-green-refactor loop because they're too slow for that feedback cycle. But they're planned work, not an afterthought.

### Debugging Failures

When an E2E test fails, don't guess from the error message. See the "Debugging Failed E2E Tests" section in [references/e2e.md](references/e2e.md).

## Checklist Per Cycle

```
[ ] Test describes behavior, not implementation
[ ] Test uses public interface only
[ ] Test would survive internal refactor
[ ] Code is minimal for this test
[ ] No speculative features added
```
