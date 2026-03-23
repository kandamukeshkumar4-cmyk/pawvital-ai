import { NextResponse } from "next/server";
import { anthropic, isAnthropicConfigured } from "@/lib/anthropic";

export async function POST(request: Request) {
  try {
    const { pet } = await request.json();

    if (!isAnthropicConfigured) {
      return NextResponse.json({
        supplements: [],
        nutrition_grade: "B+",
        monthly_cost: "$90",
        summary: `Demo mode: Connect an ANTHROPIC_API_KEY for personalized supplement recommendations for ${pet?.name || "your pet"}.`,
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

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") throw new Error("Unexpected response type");

    return NextResponse.json(JSON.parse(content.text));
  } catch {
    return NextResponse.json({
      supplements: [],
      nutrition_grade: "B+",
      monthly_cost: "$90",
      summary: "Unable to generate a full plan at this time. Please try again.",
    });
  }
}
