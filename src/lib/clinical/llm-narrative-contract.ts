/**
 * LLM narrative / JSON-shape instructions only.
 *
 * Medical urgency, next-question selection, and differential ordering are
 * implemented in `clinical-matrix.ts`, `triage-engine.ts`, and
 * `src/lib/conversation-state/*` — not in this file or in model prompts alone.
 *
 * symptom-chat/route.ts may import fragments from here to keep the route
 * smaller; do not add branching clinical rules here.
 */

export const CLINICAL_ARCHITECTURE_FOOTER = `
Architecture note for the model: the application computes triage state in
deterministic code. Your role is to communicate clearly and follow the JSON
or prose contract for this turn; do not override stated urgency from the host.
`.trim();
