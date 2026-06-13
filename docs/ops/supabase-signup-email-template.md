# Supabase signup email template (OTP code)

PawVital signup supports entering a **6-digit confirmation code** on `/signup` to avoid
`otp_expired` failures when email security scanners consume the confirmation link before
the user clicks it.

## Required dashboard change

In **Supabase → Authentication → Email Templates → Confirm signup**, include the OTP
token in the email body:

```html
<h2>Confirm your signup</h2>
<p>Your confirmation code:</p>
<p><strong>{{ .Token }}</strong></p>
<p>Enter this code on the PawVital signup page, or use the link below once:</p>
<p><a href="{{ .ConfirmationURL }}">Confirm your mail</a></p>
```

## Redirect URLs

Add these to **Authentication → URL Configuration → Redirect URLs**:

- `http://localhost:3000/api/auth/callback` (local dev)
- `http://localhost:3000/**`
- Your production URL, e.g. `https://your-domain.com/api/auth/callback`

Site URL for local dev: `http://localhost:3000`
