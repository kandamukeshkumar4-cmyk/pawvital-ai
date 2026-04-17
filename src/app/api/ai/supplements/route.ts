import { NextResponse } from "next/server";
import { z } from "zod";
import {
  generateNvidiaJson,
  isNvidiaGenerationConfigured,
} from "@/lib/nvidia-generation";
import {
  enforceRateLimit,
  enforceTrustedOrigin,
  parseJsonBody,
} from "@/lib/api-route";

const RequestBodySchema = z.object({
  pet: z.object({
    name: z.string().trim().min(1).max(120),
    breed: z.string().trim().min(1).max(120),
    species: z.string().trim().min(1).max(40),
    age_years: z.number().min(0).max(40),
    age_months: z.number().min(0).max(11).default(0),
    weight: z.number().min(0).max(500),
    weight_unit: z.enum(["lbs", "kg"]).default("lbs"),
    gender: z.enum(["male", "female"]).default("male"),
    is_neutered: z.boolean().default(true),
    existing_conditions: z
      .array(z.string().max(200))
      .max(50)
      .optional()
      .default([]),
    medications: z
      .array(z.string().max(200))
      .max(50)
      .optional()
      .default([]),
  }),
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

  try {
    const parsed = await parseJsonBody(request, RequestBodySchema);
    if (!parsed.ok) {
      return parsed.response;
    }

    const { pet } = parsed.data;

    if (!isNvidiaGenerationConfigured("diagnosis")) {
      return NextResponse.json({
        supplements: [],
        nutrition_grade: "B+",
        monthly_cost: "$90",
        summary: `Demo mode: Connect an NVIDIA NIM API key for personalized supplement recommendations for ${pet?.name || "your pet"}.`,
      });
    }

    const prompt = `You are a veterinary nutrition AI expert. Create a personalized supplement plan.

Pet Profile:
- Name: ${pet.name}
- Breed: ${pet.breed}
- Species: ${pet.species}
- Age: ${pet.age_years} years, ${pet.age_months} months
- Weight: ${pet.weight} ${pet.weight_unit}
- Gender: ${pet.gender}, ${pet.is_neutered ? "neutered/spayed" : "intact"}
- Existing conditions: ${pet.existing_conditions?.join(", ") || "None"}
- Medications: ${pet.medications?.join(", ") || "None"}

Create a supplement plan. Respond in this exact JSON format:
{
  "supplements": [
    {
      "name": "Supplement name",
      "purpose": "Why this supplement is recommended",
      "dosage": "Recommended dosage",
      "frequency": "How often",
      "brand": "Recommended brand",
      "price": "Estimated monthly cost",
      "priority": "essential" | "recommended" | "optional"
    }
  ],
  "nutrition_grade": "A+",
  "monthly_cost": "$XX",
  "summary": "2-3 sentence summary of the plan"
}

Consider breed-specific needs, age-related requirements, and existing conditions. Include 4-6 supplements. Respond ONLY with valid JSON.`;

    const result = await generateNvidiaJson<Record<string, unknown>>({
      role: "diagnosis",
      prompt,
      maxTokens: 1024,
      temperature: 0.3,
      contextLabel: "supplements",
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({
      supplements: [],
      nutrition_grade: "B+",
      monthly_cost: "$90",
      summary: "Unable to generate a full plan at this time. Please try again.",
    });
  }
}
