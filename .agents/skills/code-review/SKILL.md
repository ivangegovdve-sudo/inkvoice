---
name: code-review
description: >-
  InkVoice's manual code-review workflow for repository changes, with focused
  lenses for correctness, cache and persistent-data safety, Electron
  packaging, EPUB behavior, accessibility and design-system usage, developer
  experience, and tests. Use only when a person explicitly invokes
  /code-review or $code-review, or when an agent is explicitly instructed to
  load this file as the review procedure. Never invoke it implicitly.
disable-model-invocation: true
argument-hint: '[low|medium|high] [--fix] [--debug] [target]'
---

# Code Review

Never substitute a harness-native review command. This skill is the shared
Claude/Codex definition of an InkVoice review.

The default review is read-only. Only `--fix` authorizes edits after reporting
findings. The skill is manual-only in both harnesses through this file's
`disable-model-invocation: true` and `agents/openai.yaml`'s
`allow_implicit_invocation: false`.

## Arguments

`[level] [--fix] [--debug] [target]`, all optional:

- **level:** `low`, `medium`, or `high`; default `medium`.
- **`--fix`:** report first, then apply verified non-blocking findings.
- **`--debug`:** expose phase transitions and decisive evidence. Otherwise
  keep progress terse and return the report only.
- **target:** a commit, branch, diff expression, file path, or free-form scope.

## Phase 0: Resolve scope

Determine the exact review surface before judging it.

- With no target, inspect staged, unstaged, and untracked changes. Use
  `git status --short`, `git diff`, `git diff --cached`, and
  `git ls-files --others --exclude-standard`; read untracked files directly.
- For a commit or branch, use the matching Git diff and verify the resolved
  changed-file list.
- Inspect symlink targets and Git modes when links changed.
- Carry the original request and acceptance context when supplied. Do not
  invent requirements absent from both the request and repository.
- If the scope is empty, report `No changes to review` and stop.

Summarize the change in one paragraph and build a scope block containing the
diff command or commands, changed files, original request, and accepted
constraints. Every lens receives the same scope block.

## Phase 1: Select lenses

Every lens lives in `references/` and starts with an `Applies when` predicate.
Read the complete files for all selected lenses.

Always select:

- [correctness.md](references/correctness.md)
- [cleanup.md](references/cleanup.md)
- [conventions.md](references/conventions.md)

Select when its predicate matches:

- [cache-data-safety.md](references/cache-data-safety.md)
- [electron-packaging.md](references/electron-packaging.md)
- [epub.md](references/epub.md)
- [interface.md](references/interface.md)
- [testing.md](references/testing.md)
- [developer-experience.md](references/developer-experience.md)

Read [rubric.md](references/rubric.md) for every review.

At low effort, use correctness only and cap the report at four unverified
findings. At medium, use every applicable lens and verify candidates by file.
At high, give every applicable lens an independent pass, verify by location,
and finish with a gap sweep for missed removed behavior, cross-file
asymmetry, and second-order regressions.

## Phase 2: Find

Use independent reviewers when the harness provides them and policy permits;
otherwise perform separate sequential passes, rereading the diff and scope
before each lens. Never let one lens's candidates seed another lens.

Each pass returns only actionable candidates with:

- repository-relative file and line;
- one-sentence summary;
- a concrete user-visible failure or maintenance cost; and
- the evidence that makes the mechanism possible.

Candidate limits are six per lens at medium and eight per lens at high. Do not
pad.

## Phase 3: Verify

At medium and high, re-read the actual code independently of the finder and
assign each candidate one verdict:

- **CONFIRMED:** reachable inputs or state produce the stated consequence.
- **PLAUSIBLE:** the mechanism is real but its runtime trigger needs evidence.
- **REFUTED:** the code, contract, or an existing guard disproves it.

Use precision at medium: uncertain mechanisms lean REFUTED. Use recall at
high: realistic timing, platform, corrupt-state, and cold-cache triggers may
remain PLAUSIBLE. Drop every REFUTED or unverified candidate.

## Phase 4: Report

Merge findings with the same root cause, rank correctness and safety above
cleanup, then cap the report at eight findings for medium and twelve for high.
Never cut a blocker.

Presumptive blockers are:

- a path that can delete or evict the user-curated TTS cache without explicit
  user action;
- a persistent-state or database migration that can silently discard data;
- a secret, credential, private Linear content, or personal filesystem detail
  entering the public repository;
- an Electron packaging change that prevents the installed application from
  launching or locating its bundled resources; or
- an unmotivated design-system bypass in changed UI.

Return findings first and the verdict last:

```text
1. path/to/file.ts:42 — summary (CONFIRMED, blocker)
   Failure: concrete state or input → consequence.

Scope: 6 files, git diff HEAD
Lenses: correctness, conventions, cache-data-safety — skipped: EPUB (not touched)
Mode: sequential
Verdict: hold — finding 1 is a presumptive blocker.
```

Use `ship` when nothing survives, `ship with fixes` when findings survive but
none is a blocker, and `hold` when at least one blocker survives. If nothing
survives, say `No findings survived verification`.

## Apply fixes

With `--fix`, apply verified non-blocking findings after the report. Skip a fix
that would change accepted behavior, reach outside the reviewed scope, or
requires an unresolved user decision. Never auto-fix a blocker.

After changes, run the baseline checks from `AGENTS.md` plus every
change-specific layer selected through the `testing` skill. Report each
finding as fixed, skipped with reason, or requiring a decision, then recompute
the ship verdict.
