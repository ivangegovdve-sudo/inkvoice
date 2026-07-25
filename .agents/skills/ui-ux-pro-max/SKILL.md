---
name: ui-ux-pro-max
description: >-
  Searchable UI, UX, accessibility, responsive-layout, typography, color, and
  interaction guidance backed by the pinned ui-ux-pro-max-cli package. Use
  when planning, building, or reviewing InkVoice UI, including components,
  pages, forms, navigation, motion, keyboard behavior, focus, contrast, touch
  targets, loading states, or visual polish. Load the design-system skill
  first for repository components and tokens; InkVoice rules and the design
  system remain authoritative over generic recommendations.
---

# UI/UX Pro Max

Use the version-pinned data in `ui-ux-pro-max-cli` as a design and review lens.
Do not run its project installer: it generates overlapping skills and would
collide with InkVoice's package-managed `design-system` skill.

## Order of authority

1. The user's explicit direction
2. `AGENTS.md` and accepted InkVoice behavior
3. The package-managed `design-system` skill and actual component types
4. UI/UX Pro Max recommendations

Generic advice never authorizes a new token, raw HTML replacement for an
existing primitive, or a guessed design-system prop.

## Query the pinned knowledge

Run the search script from the repository root:

```bash
python3 node_modules/ui-ux-pro-max-cli/assets/scripts/search.py \
  "<specific design or usability question>" --domain ux --max-results 5
```

Use a focused domain when the question is narrower:

```bash
python3 node_modules/ui-ux-pro-max-cli/assets/scripts/search.py \
  "<query>" --domain typography --max-results 5

python3 node_modules/ui-ux-pro-max-cli/assets/scripts/search.py \
  "<query>" --stack nextjs --max-results 5
```

Available high-value domains for InkVoice include `ux`, `style`, `color`,
`typography`, `icons`, `react`, and `web`. Use `--json` when exact fields are
easier to inspect programmatically.

Do not persist a generated design system unless the user explicitly requests
that artifact. InkVoice already has a design system and semantic token
contract.

## Apply the useful checks

For affected UI, review the applicable surfaces:

- keyboard access, focus order, visible focus, accessible names, and semantic
  roles;
- contrast, text size, readable line length, and zoom behavior;
- pointer and touch target size, hover-independent operation, disabled states,
  and feedback;
- responsive layout, overflow, safe resizing, and desktop-window constraints;
- loading, empty, error, and completion states;
- layout stability, avoidable reflow, and perceived responsiveness;
- reduced motion and whether animation communicates state rather than
  decorating it.

Query only the domains relevant to the change. Summarize which lens was used
and the concrete findings in the handoff.
