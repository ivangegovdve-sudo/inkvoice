# When to Mock

Mock at **system boundaries** only:

- External APIs (payment, email, AI model SDKs)
- Time/randomness
- Network (`fetch` / HTTP clients)

Don't mock:

- Your own classes/modules
- Internal collaborators
- The ORM (use a real test DB — see below)
- Anything you control

## The ORM is Not a Boundary You Should Mock

Prisma (or any ORM) sits between your service and the database. It's tempting to call it a "boundary" and mock it. Don't. The ORM's query DSL is your service's implementation, not its contract. Mocking Prisma and asserting its call shape produces tests that:

- Pass forever, regardless of behavior changes
- Break on every refactor, regardless of behavior changes
- Don't catch FK violations, schema drift, JSON roundtrip bugs, unique constraint races, or any other class of real bug

Use a real test SQLite (or whatever the production DB is) for service tests that wrap the ORM. The setup cost is roughly equal to writing a Prisma mock — but the tests actually verify behavior. See [integration.md](integration.md).

The actual system boundary is the database itself. In dev/test, the cheapest way to honor that boundary is a per-process file-backed SQLite with migrations applied. Not a mock.

## The Filesystem is Sometimes a Boundary

Mocking `fs` is reasonable for unit-testing pure logic that happens to read a file (e.g., parsing). For a service whose entire job is shuffling files around — voice uploads, cache eviction, atomic writes — the filesystem is the implementation, and `fs.mkdtemp()` is cheaper than a fake. Real fs in tests catches path-resolution bugs, permission issues, and race conditions a fake would paper over.

## AI Models / Audio Generation

Don't try to test the model or the audio. Test the policy around it:

- **Prompt construction**: pure function, unit test (`given inputs X, prompt contains Y`)
- **Response parsing**: pure function, unit test (`given fixture response, returns Z`)
- **Retry/error policy**: mock at the SDK boundary (mock `fetch` or the SDK client), assert `on 429, retries N times with backoff`
- **Cache-key derivation**: pure, unit test

What's untestable cheaply: voice quality, transcription accuracy, model latency, real audio output. Don't try.

## Designing for Mockability

At system boundaries, design interfaces that are easy to mock:

**1. Use dependency injection**

Pass external dependencies in rather than creating them internally:

```typescript
// Easy to mock
const processPayment = (order, paymentClient) => {
  return paymentClient.charge(order.total)
}

// Hard to mock
const processPayment = order => {
  const client = new StripeClient(process.env.STRIPE_KEY)
  return client.charge(order.total)
}
```

**2. Prefer SDK-style interfaces over generic fetchers**

Create specific functions for each external operation instead of one generic function with conditional logic:

```typescript
// GOOD: Each function is independently mockable
const api = {
  getUser: id => fetch(`/users/${id}`),
  getOrders: userId => fetch(`/users/${userId}/orders`),
  createOrder: data => fetch('/orders', { method: 'POST', body: data }),
}

// BAD: Mocking requires conditional logic inside the mock
const api = {
  fetch: (endpoint, options) => fetch(endpoint, options),
}
```

The SDK approach means:

- Each mock returns one specific shape
- No conditional logic in test setup
- Easier to see which endpoints a test exercises
- Type safety per endpoint
