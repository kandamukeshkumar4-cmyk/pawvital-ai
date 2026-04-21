# Browser/Mobile Smoke Checklist

This is the VET-1369 repo-owned browser/mobile smoke path for the private tester
result flow. It pins Playwright to writable repo-local and local-temp artifacts
so the runner does not fall back to `C:\Windows\System32\.playwright-mcp`.

## Default writable paths

`npm run smoke:browser-mobile` resolves paths from the repo root, not from the
caller's current working directory. That keeps the smoke runner out of
`C:\Windows\System32` even if the caller starts from a protected directory.

- artifact root: `<repo>/.tmp/browser-mobile-smoke`
- Windows runtime root: `%LOCALAPPDATA%/pawvital-browser-mobile-smoke`
- non-Windows runtime root: `<repo>/.tmp/browser-mobile-smoke`
- temp root: `<runtime root>/tmp`
- Playwright browser cache: `<runtime root>/ms-playwright`
- Playwright HTML report: `...\playwright-report`
- Playwright traces and screenshots: `...\test-results`

The runner sets these automatically:

- `TMP`
- `TEMP`
- `TMPDIR`
- `PLAYWRIGHT_BROWSERS_PATH`
- `PAWVITAL_SMOKE_ARTIFACT_DIR`
- `PAWVITAL_SMOKE_RUNTIME_ROOT`
- `PAWVITAL_SMOKE_EXECUTABLE_PATH` on Windows when local Chrome is available

## Commands

Install bundled browsers when the local machine needs them:

```bash
npm run smoke:browser-mobile:install
```

On Windows, the runner prefers the locally installed Chrome executable when it
exists, so the install step becomes a no-op and still avoids protected system
directories. Linux/Codex fallback continues to use bundled Playwright browsers.

Run the automated desktop + mobile smoke flow against a local dev server:

```bash
npm run smoke:browser-mobile
```

Run a headed mobile pass for manual observation:

```bash
npm run smoke:browser-mobile -- --project mobile-chromium --headed
```

Run against an already-running server or preview URL:

```bash
set PAWVITAL_SMOKE_BASE_URL=http://127.0.0.1:3100
npm run smoke:browser-mobile -- --project desktop-chromium
```

## Automated smoke cases

The browser/mobile smoke spec covers:

- tester onboarding first-use boundary
- returning-user acknowledgement bypass
- emergency result flow for `My dog collapsed and has pale gums.`
- mild/question result flow for `My dog has mild itching but is eating normally.`
- report rendering in the result flow
- result-page feedback widget visibility and submission

The automated runner uses route mocks for the symptom-chat and feedback writes so
the smoke path can validate browser/mobile UX without touching clinical logic,
report-generation logic, or the live feedback ledger.

## Manual browser checklist

Run the headed command when you need a visible browser pass and confirm:

### Emergency

- enter `My dog collapsed and has pale gums.`
- emergency urgency renders immediately
- `Generate Emergency Vet Summary` opens the report
- the report shows smoke-fixture content, not demo fallback copy
- the feedback widget is visible and saves successfully

### Mild/question

- enter `My dog has mild itching but is eating normally.`
- the follow-up question is understandable
- the non-emergency report opens
- the feedback widget is visible and saves successfully

### Tester onboarding

- the first-use boundary screen appears
- acknowledgement unlocks the symptom checker
- reloading skips the boundary for the acknowledged user

### Parallel scope note

- once `VET-1368` is present on the tested ref, verify `Supplements` and
  `Paw Circle` are hidden or otherwise quarantined for private testers

## Codex Cloud / Linux fallback

If local Windows browser execution is still blocked, run the same smoke suite in
Linux with a temp-backed artifact directory:

```bash
PAWVITAL_SMOKE_ARTIFACT_DIR=/tmp/pawvital-browser-mobile-smoke npm run smoke:browser-mobile
```

For a running preview or already-started app:

```bash
PAWVITAL_SMOKE_ARTIFACT_DIR=/tmp/pawvital-browser-mobile-smoke \
PAWVITAL_SMOKE_BASE_URL=http://127.0.0.1:3100 \
npm run smoke:browser-mobile -- --project mobile-chromium
```

The Linux fallback uses the same smoke specs and still keeps browser artifacts
out of protected system directories.
