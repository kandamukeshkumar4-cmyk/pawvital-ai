# Production Auth Env Recovery Runbook

**Ticket:** VET-1484S  
**Author:** Claude (Sonnet)  
**Date:** 2026-05-13  
**Severity at time of incident:** P1 — all authentication broken in production

---

## Incident Summary

All PawVital production sign-in and sign-up flows failed with DNS errors beginning some time before 2026-05-13. Users who attempted to sign in received network errors because the client-side JavaScript bundle contained a stale, inactive Supabase project URL baked in at build time. Additionally, even if auth had succeeded, a private-tester gate was blocking every new user from accessing the app.

**Symptoms observed:**
- `Failed to fetch` / DNS failure on every auth call from the browser
- Sign-in and sign-up forms returned network errors to users
- No successful auth sessions in the last N hours before discovery
- Supabase project `gswjpmgxidofwmjngavh` was INACTIVE (free-tier auto-pause)

---

## Root Cause

Three compounding failures:

### 1. Stale `NEXT_PUBLIC_SUPABASE_URL` on Vercel

The Vercel production environment had `NEXT_PUBLIC_SUPABASE_URL` set to the URL of an **old, decommissioned Supabase project** (`cvkdmbgujgcfuqtqgtxv`). Because `NEXT_PUBLIC_` variables are baked into the client bundle at build time — not injected at runtime — every deployed bundle contained the wrong URL. The browser sent every auth request to a non-existent host.

### 2. Active Supabase project was auto-paused

The correct Supabase project (`gswjpmgxidofwmjngavh`) had been auto-paused by Supabase's free-tier inactivity policy. Even if the URL had been correct, the project would have returned 503 responses until manually restored.

### 3. Private-tester gate blocking all post-auth access

`NEXT_PUBLIC_PRIVATE_TESTER_MODE=true` and `PRIVATE_TESTER_INVITE_ONLY=true` were set on Vercel production with no allowed-email list that matched real users. This meant that even a user who successfully authenticated would be bounced back to `/login` with `reason=access_required`. This gate was independent of the DNS failure and would have masked the auth fix if not addressed simultaneously.

---

## Why `NEXT_PUBLIC_` Vars Are Different

Variables prefixed `NEXT_PUBLIC_` are **embedded into the JavaScript bundle by the Next.js compiler at build time**. They are read from the environment once, during `next build`, and frozen into the emitted `.js` files. Consequences:

- Changing a `NEXT_PUBLIC_` var on Vercel does **not** take effect until a new build runs.
- Promoting an older deployment re-uses that deployment's already-baked bundle, including any stale URL.
- Server-only vars (no prefix) are read at request time and update immediately on redeploy without a full rebuild.

**Never use "promote last deployment" to recover from a stale `NEXT_PUBLIC_` var.** You must trigger a fresh build.

---

## Recovery Steps (Repeatable Runbook)

### Step 1 — Check if the Supabase project is active

Go to https://supabase.com/dashboard and confirm the project status shows `ACTIVE_HEALTHY`. Or use the Supabase MCP:

```
# via MCP or CLI
supabase projects list
```

If status is `INACTIVE` or `PAUSED`, proceed to Step 2. Otherwise skip to Step 3.

### Step 2 — Restore the Supabase project

In the Supabase dashboard, navigate to the project and click **Restore project**. Wait for status to return to `ACTIVE_HEALTHY` (typically 30–120 seconds).

Via CLI:
```bash
supabase projects restore <project-ref>
```

Verify health:
```bash
curl -I https://<project-ref>.supabase.co/auth/v1/health
# Expected: HTTP/2 200
```

### Step 3 — Verify `NEXT_PUBLIC_SUPABASE_URL` on Vercel

```bash
vercel env ls production | grep NEXT_PUBLIC_SUPABASE_URL
```

Compare the value to the active project URL. It must be:
```
https://<active-project-ref>.supabase.co
```

### Step 4 — Verify `NEXT_PUBLIC_SUPABASE_ANON_KEY` on Vercel

```bash
vercel env ls production | grep NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Confirm the key matches the **active** project. Keys are project-scoped. A key from `cvkdmbgujgcfuqtqgtxv` will not authenticate against `gswjpmgxidofwmjngavh`.

To retrieve the correct anon key: Supabase dashboard > Project settings > API > `anon` `public` key.

### Step 5 — Update mismatched env vars

If either var is wrong, update both:

```bash
echo "https://gswjpmgxidofwmjngavh.supabase.co" | vercel env add NEXT_PUBLIC_SUPABASE_URL production --force
echo "<correct-anon-key>" | vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production --force
```

`--force` overwrites the existing value without an interactive prompt.

### Step 6 — Force a fresh rebuild (do NOT just promote)

You must trigger a new build so the updated `NEXT_PUBLIC_` values are baked in. Do not use "promote to production" — that reuses the old bundle.

```bash
# Get the latest deployment ID
vercel deployments ls --prod

# Redeploy from source (not a promotion)
vercel redeploy <deployment-id> --target production
```

Or push a commit to trigger the Vercel GitHub integration automatically.

### Step 7 — Verify the correct URL is baked into the client bundle

After the new build completes, confirm the bundle contains the correct project ref and not the stale one:

```bash
# Check for correct project ref
curl -s https://pawvital-ai.vercel.app/login \
  | grep -oE '"[^"]*_next[^"]*\.js"' \
  | head -5 \
  | while read jsFile; do
      url=$(echo $jsFile | tr -d '"')
      result=$(curl -s "https://pawvital-ai.vercel.app$url" | grep -c "gswjpmgxidofwmjngavh" || true)
      echo "$url: $result hits"
    done

# Also check the stale ref is gone (reuse the chunk URLs extracted from the HTML above)
curl -s https://pawvital-ai.vercel.app/login \
  | grep -oE '"[^"]*_next[^"]*\.js"' \
  | head -5 \
  | while read jsFile; do
      url=$(echo $jsFile | tr -d '"')
      stale=$(curl -s "https://pawvital-ai.vercel.app$url" | grep -c "cvkdmbgujgcfuqtqgtxv" || true)
      if [ "$stale" -gt 0 ]; then echo "FAIL: stale ref in $url"; else echo "OK: $url"; fi
    done
```

Expected: at least one JS chunk contains `gswjpmgxidofwmjngavh`; none contain `cvkdmbgujgcfuqtqgtxv`.

### Step 8 — Check private-tester flags if users still can't access after auth

If auth succeeds (no DNS errors) but users are redirected to `/login?reason=access_required`, the private-tester gate is blocking them:

```bash
vercel env ls production | grep -i private_tester
```

To disable the gate entirely:
```bash
echo "false" | vercel env add NEXT_PUBLIC_PRIVATE_TESTER_MODE production --force
echo "false" | vercel env add PRIVATE_TESTER_MODE production --force
```

These server-side vars take effect on next request after redeploy; `NEXT_PUBLIC_` variant requires a fresh build.

After disabling, redeploy and verify users can reach `/dashboard` after sign-in.

---

## Verification Checklist

- [ ] Supabase project status: `ACTIVE_HEALTHY`
- [ ] `NEXT_PUBLIC_SUPABASE_URL` on Vercel matches active project
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` on Vercel matches active project
- [ ] Fresh build triggered (not a promotion)
- [ ] Client bundle contains correct project ref (`gswjpmgxidofwmjngavh`)
- [ ] Client bundle does NOT contain stale ref (`cvkdmbgujgcfuqtqgtxv`)
- [ ] Supabase auth health endpoint returns 200
- [ ] `NEXT_PUBLIC_PRIVATE_TESTER_MODE` is `false` (or confirmed intentional)
- [ ] A test user can sign in end-to-end and reach `/dashboard`

---

## Prevention

### Upgrade Supabase to Pro tier

Free-tier projects auto-pause after 1 week of inactivity. A paused project causes the same class of failure as a wrong URL. Upgrading to Pro disables auto-pause.

### Add a URL contract test to CI

A unit test in `tests/auth-production-env-contract.test.ts` now:
- Guards against the stale project ref being re-added (`cvkdmbgujgcfuqtqgtxv`)
- Verifies `isSupabaseConfigured` behavior for empty and valid URLs

This test runs in CI on every PR and will fail if the stale URL is introduced again.

### Document the two separate var sets

| Var name | Scope | Read when |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Client (baked at build) | Build time — requires rebuild to change |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client (baked at build) | Build time — requires rebuild to change |
| `SUPABASE_URL` | Server only | Request time — safe to rotate without rebuild |
| `SUPABASE_ANON_KEY` | Server only | Request time — safe to rotate without rebuild |

The `NEXT_PUBLIC_` pair is the source of truth for browser auth flows. The non-prefixed pair is only used by server-side Supabase calls (route handlers, middleware) and does not affect client auth.

---

## Stale Env Var Cleanup Note

During the incident, `SUPABASE_URL` and `SUPABASE_ANON_KEY` (without `NEXT_PUBLIC_` prefix) existed on Vercel with potentially stale values pointing to the old project. These vars only reach server-side code. They are **not** the source of truth for client-side auth.

These should be cleaned up to point to the active project to avoid confusion:

```bash
echo "https://gswjpmgxidofwmjngavh.supabase.co" | vercel env add SUPABASE_URL production --force
echo "<service-role-or-anon-key>" | vercel env add SUPABASE_ANON_KEY production --force
```

Do not delete them — server route handlers depend on them for Supabase Admin API calls.

---

## Timeline (2026-05-13)

| Time | Action |
|---|---|
| Discovery | Auth completely broken: DNS failure on all auth calls |
| T+0 | Identified stale `NEXT_PUBLIC_SUPABASE_URL` (`cvkdmbgujgcfuqtqgtxv`) on Vercel |
| T+5m | Found active project `gswjpmgxidofwmjngavh` was INACTIVE (auto-paused) |
| T+10m | Restored Supabase project via dashboard |
| T+15m | Updated `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` on Vercel |
| T+20m | Found private-tester gate (`PRIVATE_TESTER_MODE=true`, `INVITE_ONLY=true`) blocking all users |
| T+25m | Set `NEXT_PUBLIC_PRIVATE_TESTER_MODE=false` and `PRIVATE_TESTER_MODE=false` |
| T+30m | Triggered fresh `vercel redeploy` |
| T+45m | Verified client bundle contains correct URL, auth endpoint returns 200 |
| T+50m | Confirmed end-to-end auth working |
