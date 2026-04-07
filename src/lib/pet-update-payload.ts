import { z } from "zod";
/**
 * Allowlisted pet fields for authenticated owner updates (API PUT).
 * Excludes id, user_id, deleted_at, created_at — never take those from the client.
 */
const PetSpeciesSchema = z.enum(["dog", "cat", "other"]);
const PetAgeUnitSchema = z.enum(["weeks", "months", "years"]);

export const PetUpdateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    breed: z.string().trim().min(1).max(200).optional(),
    species: PetSpeciesSchema.optional(),
    age_years: z.number().int().min(0).max(40).optional(),
    age_months: z.number().int().min(0).max(11).optional(),
    age_unit: PetAgeUnitSchema.optional(),
    weight: z.number().min(0).max(500).optional(),
    weight_unit: z.enum(["lbs", "kg"]).optional(),
    gender: z.enum(["male", "female"]).optional(),
    is_neutered: z.boolean().optional(),
    existing_conditions: z.array(z.string().max(500)).max(50).optional(),
    medications: z.array(z.string().max(500)).max(50).optional(),
    photo_url: z.string().url().max(2000).optional().or(z.literal("")),
  })
  .strict();

export type PetUpdatePayload = z.infer<typeof PetUpdateBodySchema>;

/**
 * Returns a plain object suitable for Supabase `.update()` with only defined keys.
 */
export function sanitizePetUpdateBody(body: unknown): {
  ok: true;
  data: Record<string, unknown>;
} | { ok: false; error: string } {
  const parsed = PetUpdateBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: "Invalid pet update payload" };
  }
  const entries = Object.entries(parsed.data).filter(
    ([, v]) => v !== undefined
  ) as [keyof PetUpdatePayload, unknown][];
  if (entries.length === 0) {
    return { ok: false, error: "No valid fields to update" };
  }
  const data = Object.fromEntries(entries) as Record<string, unknown>;
  if (data.photo_url === "") {
    data.photo_url = null;
  }
  data.updated_at = new Date().toISOString();
  return { ok: true, data };
}
