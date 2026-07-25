Applies when: the diff touches cache services or routes, pregeneration, books,
voices, Prisma or database code, Zustand persistence, filesystem deletion,
environment paths, or data migrations.

# Cache and persistent-data safety

InkVoice's TTS disk cache is a user-curated library. Read the Caching and
Resource Limits sections of `AGENTS.md` before judging.

Check:

- no automatic eviction, cleanup, age-based deletion, or error recovery can
  remove cached audio;
- cache removal requires explicit user action and book-cache clearing cancels
  pregeneration before emitting the `deleted` event;
- the budget applies only to pregeneration, includes the documented padding,
  and cannot block on-demand playback writes;
- cache keys remain content-and-voice based and normalized exactly once;
- TTS responses and client fetches remain `no-store`;
- path construction cannot escape the configured books, voices, cache, or
  database roots through names, uploads, archive entries, or traversal;
- book, voice, cache, and database deletion target only the requested record or
  directory and handle partial failure without widening the scope;
- Prisma changes preserve existing rows and constraints;
- Zustand persist migrations transform older state instead of resetting it;
- resource-pressure handling stays bounded and never disables safety limits.

A secret, private issue body, personal absolute path, destructive migration,
silent persistent-state reset, or non-user-authorized cache deletion is a
presumptive blocker.
