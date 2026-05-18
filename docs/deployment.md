# Deployment

## Vercel (dashboard)

The Next.js dashboard in `apps/dashboard` is the primary deployable surface.

### Project settings

| Setting | Value |
| --- | --- |
| Root Directory | `apps/dashboard` |
| Framework | Next.js |
| Install Command | `cd ../.. && npm install` |
| Build Command | `npm run build` |

### Environment variables (optional)

| Name | Example | Purpose |
| --- | --- | --- |
| `EXPLORATORY_REPORTS_DIRS` | `../../examples/reports` | Report directories (comma-separated) |
| `EXPLORATORY_BASE_URL` | `https://demo.playwright.dev/todomvc` | Default URL in settings UI |

Sample data in `examples/reports/` is included in the repository so the deployed dashboard works without external storage.

### CLI deploy

```bash
npm install -g vercel   # if needed
cd apps/dashboard
vercel link             # first time only
vercel --prod
```

## Exploration runs in CI

Exploration harness tests can run in CI with mocked or headed Chromium:

```bash
npm run test:unit
npm run explore:distributed:ci
```

Live site exploration in CI requires setting `EXPLORATORY_BASE_URL` and secrets for optional LLM keys. Use short `maxSteps` in run config to control duration.

## Assumptions

- Node 20+ on the build image
- Outbound HTTPS allowed for demo targets
- Report storage for production dashboards should move to object storage or a database for multi-tenant use
