# VET-727: Canonical unknown-option policy (decision record)

**Date:** 2026-04-03  
**Agent:** RCA  
**Type:** documentation / decision hygiene  
**Related:** VET-722 (`docs/tickets/VET-722-unknown-option-proposal.md`)

## Canonical policy

The **VET-722** proposal merged on the mainline is the single canonical source for explicit-`unknown` policy: per-question **SAFE / UNSAFE / NEEDS DECISION** labels, the summary table, and the **UNSAFE** and **NEEDS DECISION** rules (clarification vs emergency-redirect, policy gates). In this repo that content is **`docs/tickets/VET-722-unknown-option-proposal.md`** (landed with VET-722).

**Verify the file is present on your baseline:** `git fetch` then `git show origin/master:docs/tickets/VET-722-unknown-option-proposal.md` (use your remote’s default branch name if not `master`).

Matrix-usage corrections that do **not** change those buckets may still land as factual fixes; changing buckets is a **policy revision**, not a typo fix.

## Revision path

To change classifications or disposition rules:

1. Open a **new ticket** explicitly scoped as a **revision to VET-722** (not a silent edit to the landed doc).
2. State clinical or product justification and expected impact on coercion/schema/tests.
3. Review and land through the normal branch workflow; update the VET-722 doc in that ticket with a dated revision note if the table changes.

## Why silent classification flips are unsafe

Several agents may implement coercion, schema work, and tests against the **landed** table at once. Rewriting SAFE/UNSAFE/NEEDS without a ticket and review removes a shared source of truth: implementations and tests diverge, and risk is hidden because the repo still “has a VET-722 doc.”

This record exists to prevent **policy drift** of the kind that motivated VET-727; it does not open new clinical decisions beyond “follow VET-722 until a revision ticket lands.”
