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
