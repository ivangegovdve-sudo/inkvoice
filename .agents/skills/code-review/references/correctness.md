Applies when: always.

# Correctness

Trace the accepted behavior through the real entrypoint. Read each changed
hunk, its enclosing function, its callers, and the changed callees.

Check:

- wrong or inverted conditions, off-by-one indices, stale closures, missing
  awaits, swallowed errors, and falsy checks that lose valid zero or empty
  values;
- behavior deleted or replaced without its guard being re-established;
- server/client boundary violations, browser APIs in server code, and
  server-only values entering client bundles;
- async races between playback, navigation, pregeneration, SSE events, cache
  clearing, upload, and deletion;
- Zustand selector and callback instability, plus persisted migrations that
  fail on older stored shapes;
- Prisma nullability, transaction boundaries, constraint handling, and JSON
  serialization round trips;
- Base UI or dependency upgrades whose exported API, rendered role, portal
  behavior, focus behavior, or event timing changed;
- changed return shapes or preconditions that break a named caller.

For every deletion, state what invariant the removed code provided and find
where the new code provides it. An author-written test is evidence, not proof,
when it encodes the same mistaken behavior as the implementation.
