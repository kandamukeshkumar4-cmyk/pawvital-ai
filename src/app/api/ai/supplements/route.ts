import { NextResponse } from "next/server";

export const maxDuration = 60;
import { z } from "zod";
import {
  generateNvidiaJson,
  isNvidiaGenerationConfigured,
} from "@/lib/nvidia-generation";
import { requireAuthenticatedApiUser } from "@/lib/api-auth";
import {
  checkRateLimit,
  generalApiLimiter,
  getRateLimitId,
} from "@/lib/rate-limit";

const MAX_REQUEST_BYTES = 24 * 1024;

const PetSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    breed: z.string().trim().min(1).optional(),
    species: z.string().trim().min(1).optional(),
    age_years: z.number().finite().optional(),
    age_months: z.number().finite().optional(),
    weight: z.number().finite().optional(),
    weight_unit: z.string().trim().min(1).optional(),
    gender: z.string().trim().min(1).optional(),
    is_neutered: z.boolean().optional(),
    existing_conditions: z.array(z.string()).optional(),
    medications: z.array(z.string()).optional(),
  })
  .passthrough();

const BodySchema = z.object({
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
    generalApiLimiter,
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
    demoMessage:
      "Supplement recommendations require a configured account backend",
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
      "Provide a pet profile for supplement recommendations",
      400,
      "VALIDATION_ERROR"
    );
  }

  const { pet } = body.data;

  if (!isNvidiaGenerationConfigured("diagnosis")) {
    return NextResponse.json({
      supplements: [],
      summary: `Demo mode: Connect an NVIDIA NIM API key for personalized supplement awareness for ${pet.name || "your pet"}.`,
    });
  }

  try {
    const prompt = `You are a veterinary nutrition AI assistant. Generate a vet-safe supplement awareness plan.
Do NOT provide dosing, frequency, brand names, or pricing — those decisions belong to the veterinarian.
Your job is to give the owner clear educational context so they can have an informed vet conversation.

Pet Profile:
- Name: ${pet.name || "your dog"}
- Breed: ${pet.breed || "Unknown breed"}
- Species: ${pet.species || "Dog"}
- Age: ${typeof pet.age_years === "number" ? pet.age_years : "Unknown"} years, ${typeof pet.age_months === "number" ? pet.age_months : "Unknown"} months
- Weight: ${typeof pet.weight === "number" ? pet.weight : "Unknown"} ${pet.weight_unit || "lbs"}
- Gender: ${pet.gender || "Unknown"}, ${pet.is_neutered ? "neutered/spayed" : "intact"}
- Existing conditions: ${pet.existing_conditions?.join(", ") || "None"}
- Medications: ${pet.medications?.join(", ") || "None"}

Respond in this exact JSON format — no other keys allowed:
{
  "supplements": [
    {
      "name": "Supplement name (generic, e.g. 'Omega-3 fatty acids')",
      "purpose": "One sentence: what this supplement supports in dogs like this one",
      "why_ask_vet": "One sentence: why the owner should confirm this with their vet before starting",
      "evidence": "Brief note on the quality of evidence (e.g. 'Good evidence in large breeds with joint issues')",
      "priority": "ask_vet" | "monitor"
    }
  ],
  "summary": "2-3 sentence overview of the plan, vet-first framing"
}

Rules:
- priority "ask_vet" = worth discussing at next vet visit
- priority "monitor" = low priority, can mention if the vet brings it up
- Include 3-5 supplements. Never include dosing, frequency, brand names, or pricing.
- Respond ONLY with valid JSON.`;

    // Supplements are non-clinical structured generation — use the fast
    // 'phrasing' model (llama-4-maverick-17b), not the heavy 253B 'diagnosis'
    // clinical model, which was timing out and falling through to the
    // "Unable to generate" placeholder for every request.
    const result = await generateNvidiaJson<Record<string, unknown>>({
      role: "phrasing",
      prompt,
      maxTokens: 1024,
      temperature: 0.3,
      contextLabel: "supplements",
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({
      supplements: [],
      summary: "Unable to generate a plan at this time. Please try again.",
    });
  }
}
