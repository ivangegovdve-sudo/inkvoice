# E2E Tests

## Contents

- When This Gets Used
- Decision Funnel
- Spec Structure
- Running E2E Tests
- Debugging Failed E2E Tests
- Common Helpers
- Patterns
- Anti-Patterns

## When This Gets Used

Use this reference when the testing value gate identifies a possible browser-level behavior. Apply the decision funnel before implementation when the risk is already known, or while diagnosing a regression when the required runtime layer becomes clear.

Most features do NOT need E2E. The funnel filters aggressively — this is intentional. Every E2E test is a maintenance commitment: slower to run, harder to debug, more fragile than a unit test. Only write one when the confidence gap between "unit tests pass" and "this actually works" is real.

## Decision Funnel

Work through these steps in order. Stop at the first "no."

### 1. Is this E2E-shaped?

The feature qualifies if it involves at least one of:

- **Cross-page state**: User action on page A affects what they see on page B (e.g., selecting a voice in settings → book page reflects it)
- **Browser-native behavior**: Relies on real browser APIs that jsdom doesn't faithfully simulate — audio playback, IntersectionObserver, CSS transitions, focus management, `beforeunload`
- **Multi-step user flows**: The value is in the _sequence_, not any single step. "Play → navigate away → prefetch stops" can't be captured in a unit test because the lifecycle spans route changes
- **Keyboard shortcuts affecting cross-component UI**: A keypress triggers state changes visible in a different part of the page (e.g., Shift+B opens a drawer that shows data from the player bar)

If none apply → unit tests are sufficient, stop here.

### 2. Already covered?

**Read `tests/e2e/*.spec.ts` before deciding.** Check whether the behavior is already exercised by an existing test, even indirectly. A test that navigates to a book and clicks play already verifies the book page loads, the player bar renders, and TTS kicks off — even if that wasn't its primary purpose.

If fully covered → stop. If partially covered → consider extending. If not covered → continue.

### 3. Extend or new spec?

Default to **extending** an existing spec. A new spec file costs setup overhead, a new CI test group, and a new thing to maintain. Extending costs one `test()` block.

**Extend when:**

- Same page as existing spec
- Same preconditions (same mocks, same navigation)
- Related behavior (bookmarks drawer + bookmark shortcut = same spec)
- Existing spec stays focused (not a grab-bag of unrelated tests)

**New spec when:**

- Different page or different starting point
- Completely unrelated feature
- Existing spec already has 5+ tests and adding more would obscure its purpose

### 4. Is it practical?

Three filters, all must pass:

**Mock budget**: Can we mock what we need using existing helpers such as `mockTTS`, `mockVoiceManagement`, or `navigateToBook`? If the feature needs ≤ 1 new `page.route()` mock, that's fine. If it needs 3+ new mocks or requires mocking complex state, the test scope is probably too wide — break it down or rely on unit tests.

**Determinism**: No timing dependencies. Replace `waitForTimeout` with `waitForSelector`, `expect.poll()`, or `expect().toBeVisible()`. If the behavior inherently depends on timing (animation completion, debounce settling), it's a poor E2E candidate.

**Speed**: Individual test should complete in under 10 seconds. The full E2E suite should stay under 60 seconds. If a test is slow, it probably has unnecessary navigation or setup — use helpers to shortcut.

If any filter fails → reconsider. Partial unit coverage may be the better tradeoff.

### 5. Write it

Only at this point. One test per user journey. Keep it focused.

## Spec Structure

Every spec file has two levels of documentation in product language (what the user experiences, not what the test clicks):

**`test.describe` block comment** — describes the product capability this spec covers. Helps decide whether a new test belongs here or in a separate spec.

```typescript
/**
 * Bookmarking lets readers save and return to specific paragraphs.
 * Bookmarks persist per book and are accessible through a slide-out drawer.
 */
test.describe('bookmarks', () => {
```

**`test()` single-line JSDoc** — describes the specific user scenario. The test name carries most of the meaning; the comment adds the "why it matters" or clarifies what isn't obvious from the name.

```typescript
  /** Removing a bookmark from the drawer hides it and offers an undo action. */
  test('removing bookmark from drawer shows undo toast', async ({ page }) => {
```

## Running E2E Tests

### Web E2E (primary)

- Location: `tests/e2e/`
- Run: `pnpm e2e` (headless) or `pnpm e2e:ui` (interactive)
- Config: `playwright.config.ts`
- Only Chromium — keep it fast
- Tests the web UI against Next.js dev server with mocked APIs

### Electron Smoke Tests

- Location: `tests/electron/`
- Run: `pnpm e2e:electron`
- Config: `playwright.electron.config.ts`
- Prerequisite: packaged app must exist (`pnpm electron:build`). Skips gracefully if not found.
- Tests the real production flow: app launch, loading screen, server startup, UI loads, basic navigation
- Run only when Electron-related code changes (`electron/`, `electron-builder.yml`, `scripts/build-*`) — not on every feature
- These do NOT replace web E2E. Web E2E tests the UI layer. Electron smoke tests verify the shell works.

## Debugging Failed E2E Tests

When a test fails, use the focused test output and its artifacts before touching code. Don't
guess from the error message.

### Step 1: Capture a trace

The project uses `trace: 'on-first-retry'` with `retries: 0`, so traces aren't recorded by default. Re-run the failing test with `--trace on` to capture one:

```bash
PLAYWRIGHT_HTML_OPEN=never pnpm exec playwright test path/to/test.spec.ts --trace on
```

Read the terminal error and the generated `test-results/` artifacts first. Open the trace with
Playwright's bundled viewer when visual inspection is useful:

```bash
pnpm exec playwright show-trace test-results/<test-folder>/trace.zip
```

### Step 2: Playwright Inspector

When the trace is not enough, re-run the focused test with Playwright Inspector:

```bash
pnpm exec playwright test path/to/test.spec.ts --debug
```

### Workflow

1. Test fails → re-run with `--trace on`
2. Read the terminal error, `error-context.md`, screenshots, and trace
3. Use `show-trace` to inspect the failing action and surrounding page state
4. If still unclear → re-run with `--debug`
5. Fix with evidence, then re-run the focused spec

## Common Helpers

All live in `tests/e2e/helpers/`. The directory is the source of truth; read the implementation
before using a helper.

| Helper                       | What it does                                                       |
| ---------------------------- | ------------------------------------------------------------------ |
| `mockTTS(page)`              | Intercepts `/api/tts/**` and returns the silent audio fixture      |
| `mockBookManagement(page)`   | Provides in-memory book list, upload, delete, and restore behavior |
| `mockVoiceManagement(page)`  | Provides in-memory voice management APIs and silent previews       |
| `navigateToBook(page, id?)`  | Opens a named book or selects the first book from the library      |
| `navigateToSettings(page)`   | Opens settings and waits for voice data to render                  |
| `selectDifferentVoice(page)` | Selects a non-current voice and waits for persistence              |

**Writing new helpers**: If your new E2E test needs a mock that would be useful across multiple specs, extract it into `helpers/`. One mock per file. Follow the existing pattern: accept `Page`, call `page.route()`, return nothing.

## Patterns

**Semantic selectors over CSS classes.** Prefer `getByRole('button', { name: 'Play' })` over `.play-button`. Semantic selectors survive style refactors. CSS class selectors are acceptable for layout containers with no semantic role (e.g., `.fixed.bottom-0` for the player bar). Never use Tailwind utility classes (e.g., `.bg-amber-200\/70`) as element identifiers — add a `data-*` attribute instead.

**`expect.poll()` for async conditions.** When waiting for something that will happen but you don't know when (like TTS requests starting), use `expect.poll()` instead of `waitForTimeout`. It retries until the assertion passes or times out.

```typescript
// good — deterministic
await expect.poll(() => ttsRequests.length, { timeout: 10_000 }).toBeGreaterThan(0)

// bad — timing-dependent, flaky
await page.waitForTimeout(2000)
expect(ttsRequests.length).toBeGreaterThan(0)
```

**Request tracking via `page.on('request')`.** For asserting that API calls were (or weren't) made, attach a listener before the action:

```typescript
const requests: string[] = []
page.on('request', req => {
  if (req.url().includes('/api/tts/')) requests.push(req.url())
})
```

**One journey per test.** Each `test()` block should tell one story: "user does X, sees Y." If you're testing two independent behaviors, write two tests even if they share setup.

## Anti-Patterns

**`waitForTimeout` for assertions.** Flaky — passes in fast environments, fails in slow ones.

**Asserting on CSS class names for behavior.** `toHaveClass(/translate-x-0/)` is testing the animation implementation, not the behavior. Prefer `toBeVisible()` when possible.

**Tailwind utility classes as element locators.** `page.locator('span.bg-amber-200\\/70')` breaks when colors or styles change. Use a semantic data attribute instead (e.g., `[data-active-sentence]`). Tailwind classes describe _how_ something looks, not _what_ it is — tests should target identity, not appearance.

**Testing component internals through DOM queries.** If you're digging into nested DOM structure to verify state, that's a unit test in disguise. E2E tests should verify what the user sees and can interact with.

**Multiple unrelated features in one test.** A test that adds a bookmark AND changes the voice AND checks the pronunciation panel is three tests pretending to be one. It's hard to debug when it fails and unclear what it's actually verifying.
