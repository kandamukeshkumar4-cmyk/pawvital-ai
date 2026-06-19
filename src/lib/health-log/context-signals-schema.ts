import { z } from "zod";
import type { ContextSignals } from "./types";

/**
 * Shared zod schema for daily-log `context_signals`.
 *
 * Single source of truth used by BOTH the /api/health-log route and the test
 * suites — previously this schema was duplicated in the route and in
 * tests/vet-dog-brain-gaps.test.ts, which let them drift. Keep this in sync with
 * the `ContextSignals` TypeScript type in ./types.ts (the compile-time guard at
 * the bottom fails the build if they diverge structurally).
 */
export const ContextSignalsSchema = z
  .object({
    gi: z
      .object({
        blood_in_stool: z.boolean().optional(),
        straining: z.boolean().optional(),
        change_note: z.string().max(500).optional(),
      })
      .optional(),
    urinary: z
      .object({
        accidents: z.boolean().optional(),
        color_change: z.boolean().optional(),
        increased_thirst: z.boolean().optional(),
      })
      .optional(),
    mobility: z
      .object({
        limping: z.boolean().optional(),
        limb: z.string().max(50).optional(),
        reluctance_to_move: z.boolean().optional(),
      })
      .optional(),
    skin_ear: z
      .object({
        scratching: z.boolean().optional(),
        head_shaking: z.boolean().optional(),
        odor: z.boolean().optional(),
        hot_spot: z.boolean().optional(),
      })
      .optional(),
    breathing: z
      .object({
        coughing: z.boolean().optional(),
        labored: z.boolean().optional(),
        exercise_intolerance: z.boolean().optional(),
      })
      .optional(),
    seizure: z
      .object({
        occurred: z.boolean(),
        duration_sec: z.number().int().min(0).max(7200).optional(),
        recovery_note: z.string().max(500).optional(),
      })
      .optional(),
    medication: z
      .object({
        name: z.string().max(200).optional(),
        time_given: z.string().max(20).optional(),
        missed_late: z.boolean().optional(),
        dose_notes: z.string().max(500).optional(),
        side_effect_notes: z.string().max(500).optional(),
      })
      .optional(),
  })
  .optional()
  .nullable();

export type ContextSignalsSchemaInput = z.infer<typeof ContextSignalsSchema>;

// Compile-time guard: the parsed schema output must be assignable to the
// hand-written ContextSignals type (null/undefined allowed). If the two drift,
// this assignment fails `tsc` and the build breaks — forcing them back in sync.
const _schemaTypeGuard: ContextSignals | null | undefined =
  undefined as ContextSignalsSchemaInput;
void _schemaTypeGuard;
