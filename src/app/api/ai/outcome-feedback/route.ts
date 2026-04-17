import { z } from "zod";
import { saveOutcomeFeedbackToDB } from "@/lib/report-storage";
import {
  enforceRateLimit,
  enforceTrustedOrigin,
  jsonError,
  jsonOk,
  parseJsonBody,
  requireAuthenticatedUser,
} from "@/lib/api-route";

const OutcomeFeedbackRequestBodySchema = z.object({
  symptomCheckId: z.string().uuid(),
  matchedExpectation: z.enum(["yes", "partly", "no"]),
  confirmedDiagnosis: z.string().trim().max(500).optional(),
  vetOutcome: z.string().trim().max(500).optional(),
  ownerNotes: z.string().trim().max(2000).optional(),
});

export async function POST(request: Request) {
  const trustedOriginError = enforceTrustedOrigin(request);
  if (trustedOriginError) {
    return trustedOriginError;
  }

  const rateLimitError = await enforceRateLimit(request);
  if (rateLimitError) {
    return rateLimitError;
  }

  const auth = await requireAuthenticatedUser();
  if ("response" in auth) {
    return auth.response;
  }

  const parsedBody = await parseJsonBody(request, OutcomeFeedbackRequestBodySchema);
  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const { data: ownedCheck, error: ownedCheckError } = await auth.supabase
    .from("symptom_checks")
    .select("id")
    .eq("id", parsedBody.data.symptomCheckId)
    .maybeSingle();

  if (ownedCheckError) {
    return jsonError("Unable to verify symptom check", 500, "CHECK_LOOKUP_FAILED");
  }

  if (!ownedCheck) {
    return jsonError("Symptom check not found", 404, "NOT_FOUND");
  }

  const saved = await saveOutcomeFeedbackToDB({
    symptomCheckId: parsedBody.data.symptomCheckId,
    matchedExpectation: parsedBody.data.matchedExpectation,
    confirmedDiagnosis: parsedBody.data.confirmedDiagnosis,
    vetOutcome: parsedBody.data.vetOutcome,
    ownerNotes: parsedBody.data.ownerNotes,
  });

  const saveOk =
    typeof saved === "boolean" ? saved : saved.ok;

  if (!saveOk) {
    return jsonError(
      "Unable to save outcome feedback",
      503,
      "SAVE_FAILED"
    );
  }

  if (typeof saved === "boolean") {
    return jsonOk({ ok: true });
  }

  return jsonOk({
    ok: true,
    proposalCreated: saved.proposalCreated,
    structuredStored: saved.structuredStored,
    warnings: saved.warnings,
  });
}
