---
name: testing
description: >-
  Value-gated automated testing guidance for InkVoice. Use when a change
  motivates unit, integration, Storybook, web E2E, or Electron coverage; when
  the user asks for tests, test-first work, or red-green-refactor; or when
  fixing, debugging, or updating a failing test. Do not load merely because
  code is changing: no new automated test is valid when runtime evidence,
  TypeScript, or existing coverage already proves the risk.
---

# Testing

Add a test when a stable behavior or material regression risk earns permanent
maintenance. Choose the smallest layer that proves the behavior through a
public interface.

## Apply the value gate

Before adding or expanding a test, name:

1. the user- or caller-visible behavior it protects;
2. why TypeScript, an existing test, or direct runtime evidence is
   insufficient; and
3. why the failure is likely or costly enough to keep exercising.

Skip new coverage for mechanical edits, generated output, pure configuration,
simple prop threading, type-only changes, or wiring better proved through the
real runtime. Do not mirror changed lines with tests.

Strong candidates include non-trivial branching, persistent-state migrations,
cache invariants, EPUB transformations with meaningful edge cases, boundary
validation, reproducible regressions, and packaging behavior that can be
exercised deterministically.

## Choose the layer

- **Storybook `*.stories.tsx`:** component rendering, interaction,
  accessibility, and visual states. Stories are meaningful examples first and
  test hosts second. Attach behavior to an existing story when its props
  already represent the state; add a story only for a genuinely new visual
  scenario. Run `pnpm test:run:storybook`.
- **Vitest `*.test.{ts,tsx}`:** pure logic, transformations, hooks, store
  behavior, and services whose boundaries can be isolated honestly. Run
  `pnpm test:run` or a focused `pnpm exec vitest run --project=unit <path>`.
- **Vitest `*.integration.test.{ts,tsx}`:** Prisma, SQLite, filesystem, or
  another real local boundary. Prefer the guarded test database over mocking
  Prisma. Run `pnpm test:integration`. Read
  [references/integration.md](references/integration.md) before creating or
  restructuring integration coverage.
- **Web Playwright `tests/e2e/*.spec.ts`:** selective cross-page flows,
  browser-native behavior, and multi-step journeys whose value is in the
  sequence. Read [references/e2e.md](references/e2e.md) before adding or
  changing web E2E coverage. Run `pnpm e2e`.
- **Electron Playwright `tests/electron/*.spec.ts`:** application launch,
  bundled-server startup, packaged resources, and desktop-shell behavior. Run
  only for Electron or packaging changes, after `pnpm electron:build`, with
  `pnpm e2e:electron`.
- **Runtime evidence:** use `agent-browser`, direct API calls, logs, or a
  packaged-app launch for presentation, focus, audio, server wiring, and other
  behavior a test double would only imitate.

## Test public behavior

Exercise the interface a real caller uses and assert the observable result. A
refactor that preserves behavior should preserve the test.

- Mock only system boundaries such as external APIs, time, randomness, audio
  generation, or an unavailable filesystem.
- Do not mock InkVoice collaborators merely to assert their call shapes.
- Assert returned values, durable round trips, rendered behavior, requests at
  a public boundary, or user-visible outcomes.
- Prefer semantic selectors and accessible names over DOM structure, CSS
  classes, or Base UI implementation details.
- Keep one behavior per test, while avoiding ceremonial tests that repeat the
  same setup and risk.

## Use red-green selectively

Use red-green for a reproducible bug or non-trivial logic when the failing test
proves the risk before the repair:

1. add one behavior-level test and observe the intended failure;
2. implement the smallest coherent repair and observe green;
3. repeat only for another independently motivated behavior;
4. refactor while green and rerun the affected layer.

Do not write every imagined test before implementation, and do not force a red
phase for a trivial edit or a failure observable only in a real browser,
packaged application, or external runtime.

## Diagnose failures with evidence

Reproduce the focused command, identify the behavior driven by the test, and
decide whether the implementation, expectation, or environment is wrong. Do
not update an assertion merely because it is red. Preserve the test when the
behavior remains intended; rewrite or remove it only when the accepted
contract changed or the test was coupled to an implementation detail.

In the handoff, state the motivation for each added or materially expanded
test, any red-green evidence used, and the exact commands that passed.
