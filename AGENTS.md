<!-- pipeline-test: 2026-04-06 v8-e2e-verdict-test -->
<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

### Overview

PawVital AI is a single Next.js 16.2.1 app (React 19, Tailwind 4, TypeScript 5) with optional Python sidecar microservices under `services/`. Package manager is **npm** (lockfile: `package-lock.json`).

### Key commands

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Dev server | `npm run dev` (port 3000) |
| Lint | `npx eslint .` |
| Tests | `npm test` (Jest 30, runs `jest --verbose`) |
| Build | `npm run build` |
| Finish your task | `node scripts/agent-done.mjs <ticket> "<description>" --agent <name>` |
| Start PR watcher | `node scripts/agent-watcher.mjs --daemon` |
| Watcher status | `node scripts/agent-watcher.mjs --status` |
| Stop watcher | `node scripts/agent-watcher.mjs --stop` |

### When you finish a task

Run this one command from the repo root:

```bash
node scripts/agent-done.mjs <ticket-slug> "<what you did>" --agent <your-name>
```

**Agent names to use:**
- Cursor → `--agent cursor`
- Codex → `--agent codex`
- Antigravity → `--agent antigravity`
- Qoder → `--agent qoder`
- GitHub Copilot → `--agent copilot`
- Claude Code → `--agent claude` (default, can omit)

**What happens automatically after you push:**
1. GitHub opens a PR for your branch (~10 seconds)
2. CI runs: lint → typecheck → build → tests (~2 minutes)
3. The configured GitHub Models review model checks the PR for correctness and clinical safety and must pass the `AI Review Gate`
4. `AI Review Gate` + CI + matching AI approval all pass → auto-merged to master → Vercel deploys → live in ~30 seconds
5. CI fails → auto-fixes lint/TS errors, or AI posts exact fix instructions on the PR

**You do not need to merge anything manually.**

> No extra AI secret is required for PR review. GitHub Actions uses the built-in `GITHUB_TOKEN` plus `models: read` permission to call GitHub Models. If the configured model is not allowed for the repo/org, the `AI Review Gate` still fails closed until model access is restored or the workflow is rerun.

### Demo mode

The app runs in **demo mode** when Supabase environment variables are not set (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). All AI features, dashboard, and auth pages render correctly with demo/fallback data. No `.env.local` file is required to start the dev server.

### External services (all optional for local dev)

- **Supabase** (Postgres + Auth): required for real user data and auth flows
- **NVIDIA NIM API**: required for live AI symptom analysis; falls back to demo responses when not configured
- **Stripe**: subscription payments
- **Upstash Redis**: rate limiting (no-op fallback if missing)
- **HF Sidecars** (5 Python services in `services/`): vision, retrieval, multimodal consult, async review — can run via `docker-compose.sidecars.yml` with stub mode

### Gotchas

- The ESLint config uses `eslint/config` with `defineConfig` and `globalIgnores` (ESLint 9 flat config). Pre-existing lint errors exist in test files (`@typescript-eslint/no-explicit-any`) and one `prefer-const` in `symptom-chat/route.ts`.
- Jest config uses `ts-jest` with `useESM: false` and maps `@/` to `./src/`. Test environment is `node` (not jsdom).
- `next.config.ts` externalizes `pg`, `pg-native`, `pg-pool`, `pg-protocol` from Turbopack bundling.
- The dev server starts very fast (~265ms with Turbopack). Hot reload works without needing restart after dependency changes.
