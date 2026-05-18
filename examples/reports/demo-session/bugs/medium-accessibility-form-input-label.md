# Form input should have a visible label

## Metadata

| Field | Value |
| --- | --- |
| Severity | Medium |
| Category | Accessibility |
| Session | demo-session-001 |
| URL | https://demo.playwright.dev/todomvc |

## Description

The new-todo input may not expose an accessible name to assistive technologies.

## Reproduction

1. Open https://demo.playwright.dev/todomvc
2. Focus the new todo input with keyboard only
3. Inspect accessible name in devtools accessibility tree

## Recommendation

Associate a visible label or `aria-label` with the input.
