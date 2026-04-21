# Private Tester Cohort 1 Invite

PawVital is in private testing for dog owners.

It helps with urgency guidance and vet handoff reports.

It does not diagnose your dog, replace a veterinarian, prescribe treatment, or guarantee an outcome.

Do not use it as your only source of help in a real emergency.

## Please test

1. One mild symptom example.
2. One confusing symptom example.
3. One old real situation your dog had, if comfortable.
4. The report.
5. The feedback form.

## Before you start

- This is a private dog-only cohort, not a public beta.
- Emergency symptoms still need immediate veterinary care.
- Feedback may be reviewed by the founder to improve the product.
- You can request data deletion during the cohort.

## Consent linkage

- In-product acknowledgement copy lives in `src/components/tester-onboarding/tester-boundary-card.tsx`.
- Browser-side consent recording lives in `src/lib/tester-consent.ts`.
- Founder-side access and deletion controls live at `/admin/tester-access`.
- Until server-side consent persistence is added, acceptance status should be verified manually in the cohort registry when each tester confirms onboarding completion.
