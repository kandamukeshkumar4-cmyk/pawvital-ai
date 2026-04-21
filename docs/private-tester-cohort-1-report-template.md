# Private Tester Cohort 1 Report Template

Use this after the first 48 hours of Cohort 1.

## Cohort snapshot

- Date window:
- Release branch / commit:
- Founder reviewer:
- Invite count:
- Active tester count:

## Core metrics

- Testers invited:
- Testers signed in:
- Symptom checks started:
- Symptom checks completed:
- Report-linked cases:
- Feedback submitted:
- Emergency results:
- Mild / question results:
- Negative feedback:
- Repeated-question incidents:
- Report failures:
- Sign-in failures:
- Tester access disabled:
- Data deletion requests:

## Trust and comprehension

- Trust score summary:
- Top confusion points:
- Emergency wording observations:
- Mild wording observations:
- Report limitation visibility:

## Safety review

- Any emergency cases below emergency:
- Any emergency cases with low trust:
- Any report failures after emergency results:
- Any repeated-question loops in high-risk sessions:
- Any supplement/community quarantine leaks:

## Bugs and triage

Use the severity rules below so every founder report uses the same launch bar.

### P0

- Unsafe or downgraded emergency guidance
- Sign-in or session persistence broken for invited testers
- Report shows demo/stub content or fails on an emergency path
- Repeated-question loop in a high-risk session
- Private-tester scope leak, paywall block, or deletion/disable control failure
- Browser/mobile smoke fails on the core `/symptom-checker` flow
- Case ID:
- Issue link:
- Summary:

### P1

- Core-flow failure with a viable operator workaround
- Report failure outside the emergency path
- Repeated-question loop outside a high-risk session
- Feedback or deletion follow-up fails but can be recovered manually
- Case ID:
- Issue link:
- Summary:

### P2

- Trust, wording, or comprehension problem with a clear next step still visible
- Admin or telemetry issue that does not block safe tester use
- Case ID:
- Issue link:
- Summary:

### P3

- Polish, copy follow-up, or low-risk founder tooling improvement
- Case ID:
- Issue link:
- Summary:

## Recommended next fixes

1. 
2. 
3. 

## Cohort recommendation

- GO: invite the next 5 testers
- or NO-GO: pause the cohort until the blockers below are fixed

## GO / NO-GO rules

- `NO-GO` if any `P0` remains open.
- `NO-GO` if any unresolved `P1` affects emergency guidance, sign-in, report generation, repeated-question handling, or tester disable/delete follow-up.
- `NO-GO` if `/symptom-checker` still logs a hydration or console error during the launch smoke.
- `GO` only when the final verification checklist below is complete on the exact release branch / commit listed in this report.

## Blockers

Add an entry here for every open `P0` or `P1`, and for any `P2` that should block additional invites until verified.

Use this checklist for each blocker:

- Severity: `P0`, `P1`, `P2`, or `P3`
- Trigger: the exact failure that was observed
- Evidence: case ID, issue link, failing route, or failing command output
- Founder impact: what testers or founder operations could not complete safely
- Required rerun: the exact smoke/test/build command needed before clearing the blocker
- Owner: single DRI
- Status: `open`, `mitigated`, or `verified`
- Exit criterion: one sentence that defines when this blocker is truly closed

Default blocker calls:

- `P0` if emergency guidance is unsafe, sign-in breaks, the emergency report path fails, `/symptom-checker` shows a hydration or console error, or tester disable/delete controls fail.
- `P1` if the core flow fails with a manual workaround, a non-emergency report fails, repeated-question handling breaks outside a high-risk session, or feedback/deletion follow-up needs manual recovery.
- `P2` if trust/copy/admin friction is safe but should be fixed before widening the cohort.
- `P3` if it is polish only and safe to defer.

Blocker entry template:

- Severity:
- Trigger:
- Evidence:
- Founder impact:
- Required rerun:
- Owner:
- Status:
- Exit criterion:

## Final verification checklist

- `npm test`
- `npm run build`
- `npm run smoke:private-tester`
- `npm run smoke:private-tester:access`
- `npm run smoke:private-tester:emergency-bypass`
- `npm run smoke:browser-mobile`
- `/symptom-checker` loads without hydration or console errors for an invited tester
- `/admin/cohort-launch` and `/admin/tester-access` reflect the expected cohort state
