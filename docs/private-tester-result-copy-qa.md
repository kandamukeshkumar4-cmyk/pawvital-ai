# Private Tester Result Copy QA

This audit captures the owner-facing result-state review for Cohort 1.

## Scope

- Emergency
- Same-day / urgent
- Routine / monitor
- Question / insufficient info
- Report fail-safe

## Copy guardrails

Allowed:

- urgency guidance
- triage support
- vet handoff
- not a diagnosis
- contact a veterinarian for emergencies

Do not use:

- diagnosis claims
- treatment claims
- cure or prevention claims
- AI vet wording
- panic language
- supplement recommendation language

## Surface map

- Emergency / urgent result framing: `src/components/symptom-report/report-presentation.ts`
- Severity banner and urgency hierarchy: `src/components/symptom-report/severity-header.tsx`
- Owner summary and vet handoff expectations: `src/components/symptom-report/owner-summary.tsx`
- Action steps and warning signs: `src/components/symptom-report/action-steps.tsx`
- Question / insufficient-info state: `src/app/(dashboard)/symptom-checker/conversation-state-ui.ts`
- Terminal cannot-assess panel: `src/components/symptom-checker/terminal-outcome-panel.tsx`
- Report fail-safe follow-up currently remains in symptom-checker chat flow: `src/app/(dashboard)/symptom-checker/page.tsx`

## Review matrix

### Emergency

1. What is the urgency?
   Yes. Emergency states use explicit emergency-vet language in the severity header.
2. What should I do now?
   Yes. Action steps direct immediate veterinary care.
3. Why?
   Yes. Owner summary explains why the urgency was chosen.
4. What would make it worse?
   Yes. Warning signs are shown prominently.
5. What should I tell the vet?
   Yes. Vet handoff section is explicit.
6. What can PawVital not determine?
   Yes. Limitations are shown in owner summary and disclaimer.

### Same-day / urgent

1. What is the urgency?
   Yes. Report presentation differentiates urgent from monitor states.
2. What should I do now?
   Yes. Action steps are concrete and calm.
3. Why?
   Yes. Explanation is visible in owner summary.
4. What would make it worse?
   Yes. Warning signs are visible above the fold on supported layouts.
5. What should I tell the vet?
   Yes. Vet handoff copy is present.
6. What can PawVital not determine?
   Yes. Limitations and disclaimer stay visible.

### Routine / monitor

1. What is the urgency?
   Yes. Monitor language is non-alarmist.
2. What should I do now?
   Yes. Action steps focus on observation and scheduled follow-up.
3. Why?
   Yes. Explanation is shown without overclaiming.
4. What would make it worse?
   Yes. Warning signs section is still present.
5. What should I tell the vet?
   Yes. Handoff summary remains available.
6. What can PawVital not determine?
   Yes. Limitations stay visible.

### Question / insufficient info

1. What is the urgency?
   Partial. Conversation-state UI explains that more information is needed, but this is not yet a report-page state.
2. What should I do now?
   Partial. Chat flow prompts for the next needed answer.
3. Why?
   Yes. The state explains missing information.
4. What would make it worse?
   Partial. Safety relies on the chat flow and emergency escalation, not a dedicated report surface.
5. What should I tell the vet?
   Partial. No dedicated report exists yet for this state.
6. What can PawVital not determine?
   Yes. Cannot-assess copy exists in the terminal panel.

### Report fail-safe

1. What is the urgency?
   Partial. Safe fallback messaging exists in chat flow, but not as a dedicated report template.
2. What should I do now?
   Partial. Current fallback messaging is functional but not centralized into a result-page artifact.
3. Why?
   Partial. Failure messaging should be tightened if this becomes a first-class report state.
4. What would make it worse?
   Partial. Emergency fallback remains safe through the existing bypass path.
5. What should I tell the vet?
   Partial. Current fallback copy points back to handoff/report retry behavior.
6. What can PawVital not determine?
   Yes. The medical disclaimer continues to bound the system.

## Cohort note

Emergency and mild result copy are ready for Cohort 1. Question / insufficient-info and report fail-safe states should still be treated as operator watchpoints during the first 48 hours because they are not yet fully unified into dedicated report-page templates.
