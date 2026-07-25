---
name: linear
description: >-
  Manage InkVoice work in the owner's private Linear workspace. Use when a
  request names a Linear issue, asks to read or update a ticket, asks to create
  an issue, or asks what Linear work is available. Resolve teams, projects,
  statuses, and identities at runtime; never commit private workspace metadata
  or issue content to this public repository. Not for code isolation, delivery
  orchestration, project breakdown, or creating tickets without a user request.
---

# Linear

Use the configured `linear-personal` connection for ticket mechanics without
encoding the owner's private workspace in the repository.

## Privacy boundary

Treat team names and keys, project names and identifiers, issue descriptions,
comments, assignees, and workspace membership as private runtime data.

- Never add resolved Linear metadata or issue content to tracked files,
  fixtures, examples, skill text, or configuration.
- Never copy private issue prose into a commit message or public handoff unless
  the user explicitly asks for that exact disclosure.
- Never print authentication material. Authentication belongs to the Linear
  connection, not this repository.
- Refer to a ticket by its identifier only when needed for the current task.

## Resolve context dynamically

When a request names an issue, fetch it before acting. Read its title,
description, status, relationships, and project context as the working spec.
The user's latest instruction and the checked-out repository remain
authoritative when they conflict with ticket prose.

Do not assume a team key, project, workflow state name, or owner identity. Use
the issue's returned relationships. When creating an issue without an existing
issue context, list available teams or ask the user only if more than one
plausible target remains.

Match workflow states by their semantic type where the connection exposes it.
Otherwise inspect the target team's available states instead of assuming names
such as `Backlog`, `In Progress`, or `Done`.

## Read and work

1. Fetch the named issue and any directly relevant project or blocking
   relationships.
2. Restate the goal briefly without reproducing private prose.
3. For a requested implementation, move the issue to the team's active state
   when work actually begins.
4. Add a concise progress comment only when it communicates material evidence,
   a decision the ticket needs, or remaining work.
5. Move the issue to its completed state only when its requested outcome is
   satisfied. Leave partial work active and state what remains.

## Create

Create an issue only when the user asks to capture work in Linear.

- Resolve the destination team at runtime.
- Use a concise title and a checkable description with the intended outcome,
  constraints already decided, and observable completion conditions.
- Add a project only when the user named one or the runtime context makes the
  relationship unambiguous.
- Do not invent project-planning, delivery, branch, or parallel-ticket
  conventions.

## Guardrails

- Do not touch Linear when no request or ticket places Linear in scope.
- Do not create tracking issues merely because code is changing.
- Do not modify unrelated issues, projects, labels, or assignments.
- Do not close incomplete work.
- If the configured connection is unavailable or its target is ambiguous,
  report the specific missing context before mutating anything.
