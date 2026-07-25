Applies when: the diff touches rendered UI, `.tsx` components or pages, themes,
Tailwind classes, interaction behavior, component stories, or browser tests.

# Interface, accessibility, and design system

Load the package-managed `design-system` skill before review. Load
`ui-ux-pro-max` for the applicable accessibility and usability lens. Actual
InkVoice rules, Storybook documentation, package exports, and types override
generic advice.

Check:

- feature code uses `src/components/ui/` or package primitives before raw HTML
  and does not recreate an existing button, select, tooltip, menu, badge,
  toast, tabs, or form control;
- new colors use semantic CSS tokens and survive every supported theme;
- component props were confirmed through Storybook MCP or package types;
- interactive controls have correct roles, names, keyboard behavior, visible
  focus, disabled state, and screen-reader semantics;
- icon-only controls have accessible names and decorative icons stay hidden;
- portals, popovers, dialogs, and menus return focus and remain operable under
  browser zoom and constrained Electron window sizes;
- loading, empty, error, and completion states are perceivable without relying
  on color alone;
- async content reserves space where practical and avoids avoidable layout
  shift;
- motion respects reduced-motion preferences and does not hide state changes;
- tests use semantic queries matching the actual Base UI DOM, not stale roles
  or implementation classes.

An unmotivated bypass of an available design-system primitive is a presumptive
blocker.
