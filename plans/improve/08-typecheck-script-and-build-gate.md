# Plan 08 — Add a typecheck Script and Attempt Re-enabling Build-Time Type Errors

## Goal

`package.json` has no `typecheck` script even though CI runs `npx tsc --noEmit` and the README's pre-push checklist omits typechecking. Separately, `next.config.ts` sets `typescript.ignoreBuildErrors: true` with a comment that is now stale (it claims `symptom-chat/route.ts` exports a helper that breaks route-export validation; verified at the stamp commit the file's only export is `POST` at line 1214). This plan (a) adds `"typecheck": "tsc --noEmit"`, (b) attempts to remove `ignoreBuildErrors` and keeps the removal only if `npm run build` passes, and (c) updates the README pre-push checklist. Low risk; fully reversible.

## Why

A named script makes the CI gate reproducible locally with one command, and `ignoreBuildErrors: true` is a standing safety hole — if its original justification is gone, builds should fail on type errors again.

## Git stamp

Written against commit: `19d15ac2fb919996212747653c1638aac08f90f1`

Drift check (run before starting):

```bash
git -C "G:\MY Website\pawvital-ai" diff --stat 19d15ac2fb919996212747653c1638aac08f90f1 -- package.json next.config.ts README.md
```

If the output is non-empty for files this plan edits beyond what the plan describes, **STOP and report**. KNOWN EXCEPTION: `README.md` is dirty in the working tree at authoring time (unrelated landing-page edits). Read the CURRENT README, find the pre-push checklist by content (the ```bash block containing `npm run lint`), and edit what is actually there.

## Current state (real code, verified at the stamp commit)

### 1. No typecheck script

`package.json` scripts begin (lines 5–11):

```json
  "scripts": {
    "dev": "next dev",
    "build": "node scripts/build.js",
    "start": "next start",
    "lint": "eslint",
    "test": "jest --verbose",
    "test:watch": "jest --watch",
```

No `typecheck` entry exists anywhere in the scripts block (verified by reading the full file). Note `build` runs `node scripts/build.js`, not `next build` directly.

### 2. The ignore flag and stale comment

`next.config.ts` lines 51–59:

```typescript
const nextConfig: NextConfig = {
  // Exclude Node.js-only packages from bundling
  serverExternalPackages: ["pg", "pg-native", "pg-pool", "pg-protocol"],
  // Skip type-checking during build — handled separately by CI `tsc --noEmit`.
  // Needed because symptom-chat/route.ts exports a helper that triggers
  // Next.js route-export validation (we must not modify clinical files).
  typescript: {
    ignoreBuildErrors: true,
  },
```

Staleness verified: `rg "^export " src/app/api/ai/symptom-chat/route.ts` returns exactly one line — `1214:export async function POST(request: Request) {`.

### 3. CI already typechecks

`.github/workflows/ci.yml` line 100:

```yaml
      - run: npx tsc --noEmit
```

### 4. README pre-push checklist

`README.md` lines 240–246 (at the stamp commit; the file is dirty — re-locate by content):

```bash
# Validate before pushing
npm run lint
npm run build
npm test
npm run security:secrets
```

### 5. Baseline typecheck status

`npx tsc --noEmit` passes clean at the stamp commit (verified by the auditing pass; re-verify in step 1).

## Steps

1. **Baseline.**
   - Gate: `npx tsc --noEmit` → exit 0, no output. If it fails, STOP and report (the premise is gone).

2. **Add the script.** In `package.json`, add to scripts (after `"lint"`):

   ```json
   "typecheck": "tsc --noEmit",
   ```

   - Gate: `npm run typecheck` → exit 0, no output.

3. **Attempt removing `ignoreBuildErrors`.** In `next.config.ts`, delete the `typescript: { ignoreBuildErrors: true },` block AND its two stale comment lines (the `// Skip type-checking...` through `// ...clinical files).` lines quoted above). Then run the build.
   - Gate: `npm run build` → exit 0.
   - **If the build FAILS:** restore `next.config.ts` exactly to its prior content, record the exact build error text in your handoff report, and keep only the step-2 script addition + step-4 README edit. This is a defined fallback, not a STOP.
   - **If the build PASSES:** keep the removal. No replacement comment is needed.

4. **Update the README checklist.** In the current `README.md`, find the validate-before-pushing bash block (content quoted above; line numbers may have drifted) and add `npm run typecheck` after `npm run lint`:

   ```bash
   # Validate before pushing
   npm run lint
   npm run typecheck
   npm run build
   npm test
   npm run security:secrets
   ```

   - Gate: `rg -n "npm run typecheck" README.md` → exactly one match inside the checklist block.

5. **Full gate.**
   - Gate: `npm run typecheck` → exit 0, no output.
   - Gate: `npm run build` → exit 0 (with whichever next.config.ts state survived step 3).
   - Gate: `npx eslint next.config.ts` → 0 errors.

## Repo conventions

- npm; CI typecheck command: `npx tsc --noEmit` (`.github/workflows/ci.yml:100`) — the new script mirrors it exactly.
- Build is wrapped: `npm run build` → `node scripts/build.js`. Do not modify `scripts/build.js`.

## Out of scope

- Fixing any type errors `npm run build` might reveal — if removal fails, revert it and report; do not chase errors into source files.
- `src/app/api/ai/symptom-chat/route.ts` and all clinical files — read-only for the staleness verification.
- CI workflow changes (CI already typechecks).
- The dirty landing-page/auth-page edits in the working tree — do not touch.

## STOP conditions

- `npx tsc --noEmit` fails at baseline (step 1).
- `package.json` already has a `typecheck` script (someone landed it) — report, and continue only with the remaining steps that still apply.
- The README checklist block cannot be found by content in the current dirty file.
- `npm run build` fails even WITH `ignoreBuildErrors: true` restored — environment problem; stop and report.
