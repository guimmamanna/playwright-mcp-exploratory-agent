# Troubleshooting

## `npm install` fails on Playwright browsers

```bash
npx playwright install chromium
```

On Linux CI, install system dependencies:

```bash
npx playwright install-deps chromium
```

## Tests fail with module not found (`../../src/...`)

Ensure you are on the latest main branch after the `agent/` → `src/` layout migration. Run tests from the repository root:

```bash
npm test
```

## Dashboard shows zero sessions

1. Confirm `examples/reports/demo-session/` exists.
2. Check `apps/dashboard` resolves the repo root (two levels up from `apps/dashboard`).
3. Set `EXPLORATORY_REPORTS_DIRS=../../examples/reports` if you customized paths.

## Live exploration exits immediately

- Verify network access to `EXPLORATORY_BASE_URL`.
- Run headed for debugging: `npm run explore:headed`
- Inspect output under `reports/exploratory/runs/`.

## LLM reasoning not activating

Set `GEMINI_API_KEY` in `.env`. Without a key, the mock LLM provider is used and `reasoningEnabled` stays off in default CLI config.

## MCP server not connecting

MCP works with any compatible agent (Cursor, VS Code, Claude Desktop, Windsurf, etc.), not only Cursor.

1. Copy `config/mcp.json.example` into your agent’s MCP config (e.g. `.cursor/mcp.json`, `.vscode/mcp.json`, or Claude Desktop config).
2. Restart the agent or reload MCP servers after changes.
3. Run `npx @playwright/mcp@latest --help` to verify the package resolves.
4. Confirm the config file is valid JSON and the `mcpServers` key matches your client’s expected schema.

## Vercel build fails on monorepo

- Root Directory must be `apps/dashboard`.
- Install command must run from repo root: `cd ../.. && npm install`.

## Assumptions

- Exploration against third-party sites may change DOM structure; flaky findings are expected.
- Generated tests under `tests/exploratory/*.generated.spec.ts` are gitignored and created per run.
