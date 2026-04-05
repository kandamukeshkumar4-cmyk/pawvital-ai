import { NextResponse } from "next/server";
import {
  generateNvidiaJson,
  isNvidiaGenerationConfigured,
} from "@/lib/nvidia-generation";

export async function POST(request: Request) {
  try {
    const { pet } = await request.json();

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
