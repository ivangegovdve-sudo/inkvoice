# Review rubric

Report an issue only when all of these hold:

1. It materially affects correctness, user data, security, performance,
   accessibility, packaging, developer experience, or maintainability.
2. It is discrete and actionable.
3. The reviewed change introduced it, removed the guard that prevented it, or
   touched the enclosing function where the defect is directly exposed.
4. A maintainer would plausibly fix it.
5. It does not rest on an unstated requirement.
6. Cross-file breakage names the affected caller, consumer, script, or test.
7. The requested fix matches InkVoice's actual level of rigor.
8. Code and tests agreeing with each other do not override the accepted
   request or a repository invariant.

## Findings

Every finding contains:

- `file:line`;
- a one-sentence summary;
- a concrete failure scenario or maintenance cost; and
- a CONFIRMED or PLAUSIBLE verdict after verification.

For correctness, describe the reachable input, state, timing, or platform and
the wrong user-visible result. For cleanup and conventions, name the concrete
duplication, wasted work, broken command, or quoted repository rule.

Do not report style preferences, hypothetical breakage with no named consumer,
pre-existing problems outside touched code, or missing tests that do not pass
the testing skill's value gate.

## Verification

- **CONFIRMED:** the code and repository evidence establish the trigger and
  consequence.
- **PLAUSIBLE:** the mechanism exists and the trigger is realistic, but runtime
  or platform evidence remains unavailable.
- **REFUTED:** the code, type, contract, or an existing guard disproves the
  candidate.

At medium effort, prefer precision and refute unsupported triggers. At high
effort, keep realistic cold-cache, malformed-file, persisted-state, timing,
and packaged-runtime triggers as PLAUSIBLE when the code does not exclude
them.

Keep severity honest. A blocker is a release decision, not emphasis.
