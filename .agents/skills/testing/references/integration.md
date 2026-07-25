# Integration Tests

## Contents

- When to Use
- Decision Rule
- Setup Pattern
- Test Style
- What Not to Integration-Test
- Cleanup Strategy
- Performance Expectations

## When to Use

Integration tests exist for one reason: **services that wrap a real system boundary** — usually an ORM (Prisma), but also the filesystem, an in-process queue, or any subsystem whose real behavior matters more than the abstract policy you'd assert against a mock.

A good signal: you're tempted to write `expect(prisma.x.findFirst).toHaveBeenCalledWith({ where: ... })`. Stop. That assertion verifies the mock you set up returns the value you told it to return. It catches no real bug — schema drift, FK violations, JSON roundtrip issues, unique constraint races all sail past. Move the test to integration.

A bad signal: the service is pure logic, has no I/O, just transforms data. That's a unit test. Don't pay the integration setup cost for something a `it('handles X')` against the function would cover.

## Decision Rule

| The service is mostly...                 | Test layer                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| Pure transformation / policy / branching | Unit (`*.test.ts`)                                                           |
| Orchestration around an ORM/DB           | Integration (`*.integration.test.ts`)                                        |
| Orchestration around the filesystem      | Integration                                                                  |
| Calling an external HTTP API             | Unit, mock at the `fetch` boundary                                           |
| Generating audio / calling an AI model   | Unit for prompt construction + response parsing; never test the model output |

## Setup Pattern (Prisma + SQLite)

The setup is roughly the same effort as wiring up a `vi.mock('../db/db.service')` + writing a fake. The difference is what you get back: a real schema, real constraints, real Prisma errors.

**1. Separate vitest config** so unit and integration runs stay independently invokable:

```ts
// vitest.integration.config.ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    name: 'integration',
    include: ['**/*.integration.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['./tests/integration/setup.ts'],
    fileParallelism: false,
  },
})
```

**2. Exclude integration files from the unit project** so `pnpm test:run` stays fast:

```ts
// in vitest.config.ts unit project
test: {
  name: 'unit',
  include: ['**/*.test.{ts,tsx}'],
  exclude: ['**/*.integration.test.{ts,tsx}', '**/node_modules/**'],
  ...
}
```

**3. Use the committed setup as the source of truth.**

Read
[tests/integration/setup.ts](../../../../tests/integration/setup.ts) before
adding or restructuring integration coverage. It owns the complete,
dependency-ordered table list and must change alongside `prisma/schema.prisma`
when a table is added or removed.

Why these choices:

- **Per-process DB file**: parallel workers can't share SQLite cleanly; per-process keeps tests isolated without coordinating.
- **`fileParallelism: false`**: SQLite + multiple files writing concurrently is a known footgun. The per-test-file truncation is fast (<1ms per table), so serial execution barely costs anything.
- **Transactional cleanup**: delete every table in dependency order within one Prisma transaction so a test never observes partially cleared state.
- **Setting env vars at module top**: `setupFiles` runs before test-file imports, so the env is in place before any service imports `db.service`.
- **Dynamic `await import` in `beforeEach`/`afterAll`**: avoids importing `db.service` at the top of `setup.ts` before env vars are set.

**4. Add the script and gitignore:**

```json
"test:integration": "vitest run -c vitest.integration.config.ts"
```

```
# .gitignore
tests/integration/.tmp/
```

## Test Style

The same rules as unit tests, but you can lean on the database to verify roundtrips and constraints — things mocks couldn't do.

```ts
// services/progress/progress.service.integration.test.ts
import { describe, expect, it } from 'vitest'
import { seedBook } from '../../../../tests/integration/helpers/seedBook/seedBook'
import { progressService } from './progress.service'

describe('progressService (integration)', () => {
  it('roundtrips arrays and objects through JSON serialization', async () => {
    await seedBook()
    await progressService.upsert('book-1', {
      chapter: 1,
      paragraph: 3,
      paragraphsPerChapter: [10, 20, 30],
      wordsPerChapter: [100, 200, 300],
      lastReadAt: 3000,
      chapterPositions: { 0: 5, 1: 3 },
    })

    const result = await progressService.get('book-1')

    expect(result).toEqual({
      chapter: 1,
      paragraph: 3,
      paragraphsPerChapter: [10, 20, 30],
      wordsPerChapter: [100, 200, 300],
      lastReadAt: 3000,
      chapterPositions: { 0: 5, 1: 3 },
    })
  })
})
```

What the real DB gives you that a mock can't:

- **JSON roundtrip**: serialize on write, parse on read — bugs in either direction surface here.
- **FK behavior**: cascading deletes, nullable references, enforcement.
- **Unique constraints**: a duplicate-key insert really throws; a mock with `.mockResolvedValueOnce` doesn't replicate constraint timing.
- **Schema drift**: a column rename in `schema.prisma` without a migration breaks the test immediately.

## What NOT to Integration-Test

- **Pure helpers**: A function that takes input and returns output, with no I/O, doesn't need a DB. `findActiveWord(time, timestamps)` is a unit test.
- **Error-type discrimination**: Tests that verify "if Prisma throws P2002, rethrow; if P2025, swallow" are testing branching on an error code. Use a mock — triggering a real P2002 would require contriving a constraint violation, which adds noise without insight.
- **Race conditions that require interleaving operations**: Simulating "row deleted between findFirst and delete" needs a spy to inject between calls. The cleaner alternative: extract the swallow-on-P2025 logic into a helper and unit-test the helper directly. Then the integration test verifies normal paths and the helper test verifies the race policy.
- **Anything already covered by a helper test.** If `swallowRecordNotFound` has its own unit test for P2025 behavior, the service that composes it doesn't also need integration coverage of that branch — the composition is the point of the helper.

## Cleanup Strategy: When to Delete the Mocked Unit Test

After moving a service test to integration, decide what to do with the original:

- **All kept tests moved to integration**: delete the unit test file. Don't leave an empty shell.
- **Some tests stayed (e.g., error-type discrimination)**: keep the unit file with only those tests. Document why in a one-line comment if it's not obvious.
- **The unit file became a thin wrapper around a fake**: that's a smell — either the fake is doing real work (move to integration) or the fake is decoration (delete the test).

## Performance Expectations

- Per-test cost: 50–200ms typical (SQLite is fast; the bulk is Prisma client startup amortized across the suite)
- Per-suite cost: a few dozen integration tests in 5–10s
- Compared to E2E: 100× faster, no browser, no infrastructure
- Compared to mocked unit: 5–10× slower, but catches real bugs

If integration tests get slow (>30s for the suite), the usual cause is per-test re-instantiation of Prisma. Reuse the singleton from `db.service` — that's why the setup goes through `db.service`'s exported `prisma` rather than constructing a new client.
