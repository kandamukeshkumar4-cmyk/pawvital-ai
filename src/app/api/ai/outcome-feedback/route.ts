import { NextResponse } from "next/server";
import { saveOutcomeFeedbackToDB } from "@/lib/report-storage";

interface OutcomeFeedbackRequestBody {
  symptomCheckId?: string;
  matchedExpectation?: "yes" | "partly" | "no";
  confirmedDiagnosis?: string;
  vetOutcome?: string;
  ownerNotes?: string;
}

export async function POST(request: Request) {
  let body: OutcomeFeedbackRequestBody;
  try {
    body = (await request.json()) as OutcomeFeedbackRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.symptomCheckId || !body.matchedExpectation) {
    return NextResponse.json(
      { error: "symptomCheckId and matchedExpectation are required" },
      { status: 400 }
    );
  }

  const saved = await saveOutcomeFeedbackToDB({
    symptomCheckId: body.symptomCheckId,
    matchedExpectation: body.matchedExpectation,
    confirmedDiagnosis: body.confirmedDiagnosis,
    vetOutcome: body.vetOutcome,
    ownerNotes: body.ownerNotes,
  });

  if (!saved) {
    return NextResponse.json(
      { ok: false, error: "Unable to save outcome feedback" },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true });
}
