# Security Header Allowances

VET-1362 keeps the browser hardening policy centralized in `next.config.ts` so the app and Vercel runtime share one source of truth for security headers.

## Intentional CSP allowances

- `script-src 'self' 'unsafe-inline'` stays enabled because the current Next.js 16 app router still emits inline bootstrap and hydration script that would break without a nonce or hash-based rollout.
- `script-src` adds `'unsafe-eval'` only in development so local Next.js debugging keeps working; production omits it.
- `style-src 'self' 'unsafe-inline' https:` preserves framework-injected inline styles and any HTTPS-hosted stylesheet/font delivery already used by tester-facing routes.
- `img-src 'self' data: blob: https:` is required for symptom-checker photo previews, uploaded image blobs, and report/reference images that resolve over HTTPS.
- `font-src 'self' data: https:` keeps local/data URL fonts working while allowing HTTPS-hosted font assets when configured.
- `connect-src 'self' https:` preserves same-origin browser fetches plus HTTPS SaaS backends such as Supabase without opening non-HTTPS origins.
- `form-action 'self' https://checkout.stripe.com` preserves the checkout handoff for the pricing flow while keeping form submissions otherwise same-origin only.

## Other enforced protections

- `frame-ancestors 'none'` and `X-Frame-Options: DENY` both block framing/clickjacking attempts.
- `Strict-Transport-Security` is production-only so local HTTP development stays usable while deployed environments enforce long-lived HTTPS.
- `Referrer-Policy`, `Permissions-Policy`, and `X-Content-Type-Options` remain explicit and app-wide.
