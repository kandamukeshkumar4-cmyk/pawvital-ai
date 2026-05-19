# VET-1506C - Local mitmproxy LLM Observability Runbook

## Scope

Use mitmproxy only for local debugging and staging-like agent loops. This
runbook is not approved for production traffic, private tester sessions, Vercel
dashboard traffic, Supabase dashboard traffic, billing consoles, or secret
manager traffic.

Do not capture or publish secrets.

## Allowed Uses

- Inspect whether a local dev run is making an expected model call.
- Confirm provider host, method, status, latency, and approximate payload size.
- Compare local agent loops before a future model-proxy ticket.
- Debug proxy compatibility with local-only test credentials.

## Not Allowed

- Capturing production owner traffic.
- Capturing private tester credentials or sessions.
- Capturing raw API keys, cookies, bearer tokens, webhook secrets, or database
  URLs.
- Saving raw request or response bodies in git.
- Posting mitmproxy screenshots or exports into PRs without redaction.
- Treating captures as organic traffic or production telemetry evidence.

## Local Setup

Install mitmproxy through the local package manager you already use. Keep
captures under `.tmp/mitmproxy/` if you must export anything; `.tmp/` is ignored
by git.

Start the proxy:

```powershell
mitmweb --listen-host 127.0.0.1 --listen-port 8088
```

In a separate PowerShell session, route only the local process you are testing:

```powershell
$env:HTTP_PROXY = "http://127.0.0.1:8088"
$env:HTTPS_PROXY = "http://127.0.0.1:8088"
npm run dev
```

For TLS interception in local Node processes, install the local mitmproxy
certificate and, if needed, point Node at it:

```powershell
$env:NODE_EXTRA_CA_CERTS = "$env:USERPROFILE\.mitmproxy\mitmproxy-ca-cert.cer"
```

Remove the proxy variables when done:

```powershell
Remove-Item Env:HTTP_PROXY -ErrorAction SilentlyContinue
Remove-Item Env:HTTPS_PROXY -ErrorAction SilentlyContinue
Remove-Item Env:NODE_EXTRA_CA_CERTS -ErrorAction SilentlyContinue
```

## Suggested Filters

Use host filters so unrelated traffic is hidden:

```text
~d integrate.api.nvidia.com | ~d api.x.ai | ~d api.openai.com
```

Prefer metadata inspection:

- timestamp
- host
- path category, not full path if it contains identifiers
- HTTP method
- status code
- latency
- request and response byte counts

Avoid retaining raw bodies. If a body must be inspected locally, clear it before
sharing any evidence.

## Redaction Checklist

Before writing any note, PR body, issue comment, or screenshot:

- remove request and response bodies
- remove authorization headers
- remove cookies
- remove query strings that contain identifiers
- remove owner text, pet profile details, and report content
- remove exact API keys or token fragments
- summarize model/provider behavior in words instead of pasting payloads

## Closeout

After a debugging session:

1. Stop mitmproxy.
2. Clear shell proxy variables.
3. Delete unneeded captures from `.tmp/mitmproxy/`.
4. Run `npm run security:secrets` before committing any related notes.
5. Confirm no capture files are tracked by `git status --short`.
