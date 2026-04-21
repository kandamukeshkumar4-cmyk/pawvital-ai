import { NextResponse } from "next/server";
import { z } from "zod";
import {
  generateNvidiaJson,
  isNvidiaGenerationConfigured,
} from "@/lib/nvidia-generation";
import { requireAuthenticatedApiUser } from "@/lib/api-auth";
import {
  checkRateLimit,
  getRateLimitId,
  symptomChatLimiter,
} from "@/lib/rate-limit";

const MAX_REQUEST_BYTES = 32 * 1024;

const PetSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    species: z.string().trim().min(1).optional(),
    breed: z.string().trim().min(1).optional(),
    age_years: z.number().finite().optional(),
    weight: z.number().finite().optional(),
    existing_conditions: z.array(z.string()).optional(),
    medications: z.array(z.string()).optional(),
    vaccination_status: z.string().trim().min(1).optional(),
  })
  .passthrough();

const BodySchema = z.object({
  symptoms: z.string().trim().min(1),
  pet: PetSchema,
});

type BodyParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; response: Response };

function jsonError(error: string, status: number, code: string) {
  return NextResponse.json({ error, code }, { status });
}

function decodeUtf8(chunks: Uint8Array[], totalBytes: number) {
  const merged = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(merged);
}

async function readJsonBody<T>(
  request: Request,
  maxBytes: number
): Promise<BodyParseResult<T>> {
  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return {
      ok: false,
      response: jsonError(
        "Request body too large",
        413,
        "PAYLOAD_TOO_LARGE"
      ),
    };
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return {
      ok: false,
      response: jsonError("Request body is required", 400, "INVALID_JSON"),
    };
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {}

        return {
          ok: false,
          response: jsonError(
            "Request body too large",
            413,
            "PAYLOAD_TOO_LARGE"
          ),
        };
      }

      chunks.push(value);
    }
  } catch {
    return {
      ok: false,
      response: jsonError("Malformed JSON body", 400, "INVALID_JSON"),
    };
  }

  const rawBody = decodeUtf8(chunks, totalBytes).trim();
  if (!rawBody) {
    return {
      ok: false,
      response: jsonError("Request body is required", 400, "INVALID_JSON"),
    };
  }

  try {
    return { ok: true, value: JSON.parse(rawBody) as T };
  } catch {
    return {
      ok: false,
      response: jsonError("Malformed JSON body", 400, "INVALID_JSON"),
    };
  }
}

export async function POST(request: Request) {
  const rateLimitResult = await checkRateLimit(
    symptomChatLimiter,
    getRateLimitId(request)
  );
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.ceil((rateLimitResult.reset - Date.now()) / 1000)
          ),
        },
      }
    );
  }

  const auth = await requireAuthenticatedApiUser({
    demoMessage: "Symptom analysis requires a configured account backend",
  });
  if ("response" in auth) {
    return auth.response;
  }

  const parsedBody = await readJsonBody<unknown>(request, MAX_REQUEST_BYTES);
  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const body = BodySchema.safeParse(parsedBody.value);
  if (!body.success) {
    return jsonError(
      "Provide a symptom description and pet profile",
      400,
      "VALIDATION_ERROR"
    );
  }

  const { pet, symptoms } = body.data;

  if (!isNvidiaGenerationConfigured("diagnosis")) {
    return NextResponse.json({
      severity: "high",
      recommendation: "vet_48h",
      title: "AI Assessment (Demo Mode)",
      explanation: `Based on the symptoms described for ${pet.name || "your dog"}: "${symptoms}". This is demo mode — add your NVIDIA NIM API key to get full AI-powered veterinary symptom analysis.`,
      differential_diagnoses: [
        {
          condition: "Demo Mode — Configure API Key",
          likelihood: "high",
          description:
            "Add your NVIDIA NIM API key to unlock full veterinary-grade differential diagnosis with clinical specificity.",
        },
      ],
      clinical_notes:
        "Demo mode active. Real analysis will include ICD-10-CM veterinary codes, breed-specific epidemiological data, and evidence-based diagnostic pathways.",
      recommended_tests: [
        {
          test: "Complete Blood Count (CBC)",
          reason: "Baseline hematological assessment",
          urgency: "routine",
        },
      ],
      home_care: [
        {
          instruction: "Monitor symptoms closely",
          duration: "24-48 hours",
          details: "Track frequency, duration, and any changes in severity",
        },
      ],
      actions: [
        "Monitor your dog closely for the next 24-48 hours",
        "Keep a log of when symptoms occur and their duration",
        "Schedule a vet visit if no improvement in 48 hours",
      ],
      warning_signs: [
        "Symptoms suddenly worsen or new symptoms appear",
        "Loss of appetite persists beyond 24 hours",
        "Difficulty breathing or rapid breathing at rest",
        "Inability to stand or walk",
      ],
      vet_questions: ["Ask your vet about breed-specific risk factors"],
    });
  }

  try {
    const prompt = `You are a board-certified veterinary internist (DACVIM) with 20+ years of clinical experience, fellowship training in emergency medicine, and deep expertise in breed-specific pathology. You think like a specialist — not a Google search. Your analysis must reflect the depth and specificity of a $300 specialist consultation.

PATIENT HISTORY:
- Patient: ${pet.name || "your dog"}
- Species: ${pet.species || "Dog"}
- Breed: ${pet.breed || "Unknown breed"}
- Age: ${typeof pet.age_years === "number" ? pet.age_years : "Unknown"} years ${typeof pet.age_years === "number" ? (pet.age_years >= 7 ? "(GERIATRIC — elevated oncological, orthopedic, and organ-failure risk)" : pet.age_years <= 1 ? "(PEDIATRIC — elevated infectious, congenital, and developmental risk)" : "") : ""}
- Weight: ${typeof pet.weight === "number" ? pet.weight : "Unknown"} lbs
- Known conditions: ${pet.existing_conditions?.join(", ") || "None documented"}
- Current medications: ${pet.medications?.join(", ") || "None"}
- Vaccination status: ${pet.vaccination_status || "Unknown"}

PRESENTING COMPLAINT (owner-reported): "${symptoms}"

CLINICAL ANALYSIS PROTOCOL:
You MUST analyze like a real veterinary specialist would. This means:

1. DIFFERENTIAL DIAGNOSES — List 3-5 specific conditions ranked by likelihood. Do NOT give vague answers like "could be many things." Name the actual diseases/conditions with their veterinary terminology. For each differential:
   - Use the actual medical/veterinary term (e.g., "Intervertebral Disc Disease (IVDD)" not "back problems")
   - Consider breed-specific prevalence data (e.g., IVDD is 10-12x more common in Dachshunds)
   - Factor in age-related incidence rates
   - Note if the condition interacts with existing conditions/medications

2. CLINICAL NOTES — Write like you're dictating to a veterinary colleague. Include:
   - Suspected anatomical systems involved
   - Pathophysiological reasoning for your top differential
   - Breed-specific epidemiological context with actual prevalence data where relevant
   - How the patient's age/weight shifts your differential ranking
   - Any drug interactions or contraindications with current medications

3. RECOMMENDED DIAGNOSTICS — Specific tests a vet should run, not generic advice. Include:
   - Name the exact test (e.g., "Serum T4 + Free T4 by equilibrium dialysis" not just "blood test")
   - Explain what each test rules in/out
   - Prioritize: which test to run FIRST for fastest diagnosis
   - Estimated cost range when relevant

4. HOME CARE — Specific, measurable instructions (not "monitor closely"). Include:
   - Exact parameters to track (e.g., "Count respiratory rate at rest — normal is 15-30 breaths/min for dogs")
   - Time-bound instructions (e.g., "Withhold food for 12 hours, then offer 1/4 normal portion of bland diet: boiled chicken breast + white rice, 2:1 ratio")
   - What to measure and how (e.g., "Check capillary refill time: press gum above canine tooth, should return to pink in < 2 seconds")

5. VET VISIT PREP — Specific questions the owner should ask their vet, tailored to the differentials

Respond in this exact JSON format:
{
  "severity": "low" | "medium" | "high" | "emergency",
  "recommendation": "monitor" | "vet_48h" | "vet_24h" | "emergency_vet",
  "title": "Specific clinical assessment title (e.g., 'Suspected Cranial Cruciate Ligament Tear' not 'Leg Problem')",
  "explanation": "Write 4-6 sentences explaining the clinical picture to a dog owner. Use precise medical terms but immediately follow each with a plain-English explanation in parentheses. Connect the dots between symptoms, breed predisposition, and age factors. Be specific about WHY you suspect what you suspect.",
  "differential_diagnoses": [
    {
      "condition": "Full medical name of condition",
      "likelihood": "high" | "moderate" | "low",
      "description": "2-3 sentences: Why this condition fits, breed-specific prevalence, what distinguishes it from other differentials, expected progression if untreated"
    }
  ],
  "clinical_notes": "Technical paragraph written as if dictating to a veterinary colleague. Include suspected pathophysiology, relevant breed predisposition data with prevalence percentages where known, anatomical systems involved, and any red flags in the presentation. Reference actual veterinary literature concepts.",
  "recommended_tests": [
    {
      "test": "Exact diagnostic test name",
      "reason": "What this test confirms or rules out, and which differential it targets",
      "urgency": "stat" | "urgent" | "routine"
    }
  ],
  "home_care": [
    {
      "instruction": "Specific action with measurable parameters",
      "duration": "Exact timeframe",
      "details": "Step-by-step details including normal vs abnormal values"
    }
  ],
  "actions": ["5-7 specific, actionable steps — not generic advice. Each should reference the specific condition suspected."],
  "warning_signs": ["4-6 specific clinical escalation signs with thresholds — e.g., 'Respiratory rate exceeds 40 breaths/min at rest' not just 'breathing problems'"],
  "vet_questions": ["3-5 specific questions to ask the vet, tailored to the differential diagnoses — e.g., 'Ask about orthogonal radiographs of the stifle joint to assess for cruciate ligament integrity'"]
}

Severity guidelines:
- "low": Self-limiting, evidence-based home management appropriate. Clinical signs consistent with benign etiology.
- "medium": Warrants professional evaluation if symptoms persist >48h or any single escalation sign appears. May require diagnostics to rule out serious pathology.
- "high": Clinical presentation suggests pathology requiring veterinary intervention within 24h. Delay risks disease progression or complications.
- "emergency": Presentation consistent with potentially life-threatening condition. Immediate emergency veterinary care required — triage priority.

CRITICAL RULES:
- NEVER give generic advice that could apply to any pet. Every recommendation must reference the specific breed, age, weight, and symptom combination.
- Name actual diseases, not vague categories. "Immune-mediated hemolytic anemia (IMHA)" not "blood disorder."
- Include specific vital sign parameters the owner can check at home.
- If symptoms could indicate a surgical emergency (GDV, foreign body obstruction, splenic torsion), flag it prominently regardless of perceived likelihood.
- Always err on the side of caution. A false alarm costs a vet visit. A missed emergency costs a life.

Respond ONLY with valid JSON. No markdown, no code blocks, just the JSON object.`;

    const result = await generateNvidiaJson<Record<string, unknown>>({
      role: "diagnosis",
      prompt,
      maxTokens: 4096,
      temperature: 0.35,
      contextLabel: "symptom check",
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Symptom check error:", error);
    return NextResponse.json(
      {
        severity: "medium",
        recommendation: "vet_48h",
        title: "Unable to Complete Full Analysis",
        explanation:
          "We encountered an issue performing the full AI analysis. Based on general guidelines, we recommend monitoring your dog closely and consulting your veterinarian if symptoms persist or worsen.",
        actions: [
          "Monitor your dog closely for the next 24 hours",
          "Keep a written log of symptoms and timing",
          "Ensure fresh water and a quiet resting area",
          "Avoid strenuous activity",
          "Contact your veterinarian if symptoms worsen",
        ],
        warning_signs: [
          "Difficulty breathing",
          "Complete loss of appetite for 24+ hours",
          "Inability to stand or walk",
          "Sudden behavioral changes",
        ],
      },
      { status: 200 }
    );
  }
}
