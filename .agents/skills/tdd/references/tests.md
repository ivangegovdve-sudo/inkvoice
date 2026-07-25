# Good and Bad Tests

## Contents

- Good Tests
- Vitest Conventions
- Bad Tests
- Mocking the ORM and Asserting Query Shape
- Mocking the Internal `fetch` Call Shape
- Standalone Callback-Stability Tests

## Good Tests

**Integration-style**: Test through real interfaces, not mocks of internal parts.

```typescript
import { describe, expect, it } from 'vitest'

// GOOD: Tests observable behavior
describe('checkout', () => {
  it('confirms order with valid cart', async () => {
    const cart = createCart()
    cart.add(product)
    const result = await checkout(cart, paymentMethod)
    expect(result.status).toBe('confirmed')
  })
})
```

Characteristics:

- Tests behavior users/callers care about
- Uses public API only
- Survives internal refactors
- Describes WHAT, not HOW
- One logical assertion per test

## Vitest Conventions

**StrictMode wrapper for hooks.** Always wrap hook tests with `<StrictMode>` — catches ref mutation bugs from double-mount:

```typescript
const { result } = renderHook(() => useMyHook(), {
  wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
})
```

**Assert outcomes, not DOM method calls.** jsdom mocks don't reproduce browser side effects (e.g., `load()` with no `src` fires `onerror`), so verifying DOM method calls gives false confidence. Assert observable outcomes instead:

```typescript
// GOOD: Asserts observable behavior
expect(result.current.isPlaying).toBe(false)

// BAD: Asserts implementation detail that jsdom may not faithfully simulate
expect(audio.removeAttribute).toHaveBeenCalledWith('src')
```

**Skip tests when TypeScript already validates.** Pure type transformations, simple prop-threading, and config objects don't need tests — the compiler catches those mistakes.

## Bad Tests

**Implementation-detail tests**: Coupled to internal structure.

```typescript
import { describe, expect, it, vi } from 'vitest'

// BAD: Tests implementation details
describe('checkout', () => {
  it('calls paymentService.process', async () => {
    const mockPayment = vi.fn()
    await checkout(cart, payment)
    expect(mockPayment).toHaveBeenCalledWith(cart.total)
  })
})
```

Red flags:

- Mocking internal collaborators
- Testing private methods
- Asserting on call counts/order
- Test breaks when refactoring without behavior change
- Test name describes HOW not WHAT
- Verifying through external means instead of interface

```typescript
import { describe, expect, it } from 'vitest'

describe('createUser', () => {
  // BAD: Bypasses interface to verify
  it('saves to database', async () => {
    await createUser({ name: 'Alice' })
    const row = await db.query('SELECT * FROM users WHERE name = ?', ['Alice'])
    expect(row).toBeDefined()
  })

  // GOOD: Verifies through interface
  it('makes user retrievable', async () => {
    const user = await createUser({ name: 'Alice' })
    const retrieved = await getUser(user.id)
    expect(retrieved.name).toBe('Alice')
  })
})
```

## Anti-Pattern: Mocking the ORM and Asserting Query Shape

The most common failure mode for service-layer tests. The service is a thin wrapper around Prisma (or any ORM). The author mocks Prisma, calls the service, and asserts that Prisma was called with a specific query shape.

```typescript
// BAD: tautological
it('returns oldest queued job (FIFO)', async () => {
  mockPrisma.pregenJob.findFirst.mockResolvedValue(someJob)
  await pregenQueueService.getNext()

  expect(mockPrisma.pregenJob.findFirst).toHaveBeenCalledWith({
    where: { status: 'queued' },
    orderBy: { createdAt: 'asc' },
  })
})
```

What this test "verifies": that the service was written the way it was written. The mock returns what you told it to return; the assertion confirms you wrote `orderBy: { createdAt: 'asc' }` in the implementation. If you switched to `orderBy: { id: 'asc' }` it would fail — but FIFO would still work if `id` is autoincrement. The test fails on a refactor that doesn't change behavior, and passes on a real bug (e.g., wrong index, missing migration).

These tests survive only as long as the ORM's query API doesn't change. They'd all break on a Drizzle/Kysely migration even if behavior was preserved. They're coupling the test to the implementation language, not the contract.

**Fix**: move the test to the integration layer. Real DB, real schema, assert behavior:

```typescript
// GOOD: integration test against real SQLite
it('returns oldest queued job (FIFO)', async () => {
  const first = await pregenQueueService.enqueue('book-1', 'narrator', 100)
  await new Promise(r => setTimeout(r, 5)) // separate createdAt timestamps
  await pregenQueueService.enqueue('book-2', 'narrator', 100)

  const next = await pregenQueueService.getNext()

  expect(next?.id).toBe(first.id)
})
```

This passes whether the implementation uses `orderBy: createdAt`, `orderBy: id`, or some future replacement — as long as FIFO holds. See [integration.md](integration.md).

**Common failure variants** to watch for:

- `expect(prisma.x.create).toHaveBeenCalledWith({ data: ... })` — pure shape assertion.
- `expect(prisma.x.findUnique).toHaveBeenCalledWith({ where: { id } })` — verifying the lookup key, which the implementation already documents.
- "returns empty array for unknown book" with `mockPrisma.findMany.mockResolvedValue([])` — the mock returns `[]`, the test asserts `[]`. Tautology.

A useful rule: if your assertion is structurally identical to the mock setup, the test isn't testing anything.

## Anti-Pattern: Mocking the Internal `fetch` Call Shape

Same shape as the ORM anti-pattern but applied to network calls inside a store or hook:

```typescript
// BAD: implementation coupling
it('calls API with correct params', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

  await store.removeBookmark('book-1', 'bm-1')

  expect(fetch).toHaveBeenCalledWith('/api/bookmarks/book-1', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookmarkId: 'bm-1' }),
  })
})
```

If the store switches to a wrapper or a different transport, the test breaks without behavior changing. The optimistic-update + rollback tests already prove the network call happened — that's enough. Don't also assert the URL/method/headers/body shape.

## Anti-Pattern: Standalone Callback-Stability Tests

Hooks returning callbacks need a stability check (so consumer-side `useEffect` deps don't fire infinite loops). That rule is real. But a stability test alone is compliance, not coverage:

```typescript
// SUSPICIOUS: this is the entire test file
describe('useUploadBook', () => {
  it('upload callback is stable across rerenders', () => {
    const { result, rerender } = renderHook(() => useUploadBook())
    const first = result.current.upload
    rerender()
    expect(result.current.upload).toBe(first)
  })
})
```

If this is the only test for the hook, the hook's behavior isn't covered anywhere. Either:

- Add a behavior test in the same file (what does `upload` actually do?), and let the stability check ride alongside it.
- Or, if the behavior is genuinely covered at a higher layer (E2E around a form that uses the hook), delete the file — a stability check with no behavior is documentation, not a test.

The stability test by itself doesn't earn its keep. Pair it or drop it.
