# Contributing

Thanks for your interest in improving this project.

## Development setup

1. Fork and clone the repository.
2. Run `npm install` from the repository root.
3. Copy `.env.example` to `.env` and configure optional API keys.
4. Run unit tests: `npm run test:unit`
5. Run the dashboard locally: `npm run dashboard:dev`

## Git commits

- Commits must **not** include `Co-authored-by` lines for AI agents (Cursor, Copilot, etc.).
- Do not add unsolicited `.github/workflows/` files.
- Optional: enable hook stripping — `git config core.hooksPath scripts/git-hooks`

In **Cursor**, turn off automatic co-author attribution: **Settings → Cursor Settings → search “co-author”** and disable it so only your identity is used on commits.

## Pull request guidelines

- Keep changes focused on a single concern.
- Add or update tests when behavior changes.
- Do not commit secrets, `.env` files, or local report artifacts under `reports/`.
- Update documentation when you change setup, configuration, or public APIs.

## Code style

- Match existing TypeScript patterns in `src/` and `apps/dashboard/`.
- Prefer small, composable modules over large orchestration files.
- Use meaningful names; avoid drive-by refactors outside your change scope.

## Reporting issues

Include:

- Node.js version (`node -v`)
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs or screenshots (redact secrets)
