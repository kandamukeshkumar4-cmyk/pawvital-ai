import { NextResponse } from "next/server";
import { anthropic, isAnthropicConfigured } from "@/lib/anthropic";

export async function POST(request: Request) {
  try {
    const { symptoms, pet } = await request.json();

    if (!isAnthropicConfigured) {
      return NextResponse.json({
        severity: "medium",
        recommendation: "vet_48h",
        title: "AI Assessment (Demo Mode)",
        explanation: `Based on the symptoms described for ${pet?.name || "your pet"}: "${symptoms}". This is demo mode — add your ANTHROPIC_API_KEY to get real AI-powered, breed-specific symptom analysis powered by Claude. We recommend monitoring closely and consulting your vet if symptoms persist.`,
        actions: [
          "Monitor your pet closely for the next 24-48 hours",
          "Keep a log of when symptoms occur and their duration",
          "Ensure fresh water is always available",
          "Avoid strenuous activity until symptoms resolve",
          "Schedule a vet visit if no improvement in 48 hours",
        ],
        warning_signs: [
          "Symptoms suddenly worsen",
          "Loss of appetite persists beyond 24 hours",
          "Difficulty breathing or rapid breathing",
          "Inability to stand or walk",
        ],
      });
    }

    const prompt = `You are an expert veterinary AI assistant with deep knowledge of animal health, breed-specific conditions, and age-related risks. A pet owner is describing symptoms and needs your help.

Pet Profile:
- Name: ${pet.name}
- Breed: ${pet.breed}
- Age: ${pet.age_years} years
- Weight: ${pet.weight} lbs
- Existing conditions: ${pet.existing_conditions?.join(", ") || "None"}
- Current medications: ${pet.medications?.join(", ") || "None"}

Symptoms described by owner: "${symptoms}"

Analyze these symptoms carefully. Consider:
1. Breed-specific predispositions (e.g., Golden Retrievers are prone to hip dysplasia, cancer; Bulldogs to breathing issues)
2. Age-related conditions (senior dogs 7+ have different risk profiles)
3. Interaction with existing conditions and medications
4. Urgency level based on symptom combination and severity

Respond in this exact JSON format:
{
  "severity": "low" | "medium" | "high" | "emergency",
  "recommendation": "monitor" | "vet_48h" | "emergency_vet",
  "title": "Brief assessment title (5-8 words)",
  "explanation": "Detailed, empathetic explanation of what might be happening. Consider the specific breed and age. Explain in plain language a worried pet parent can understand. 3-4 sentences.",
  "actions": ["Specific action 1", "Specific action 2", "Specific action 3", "Specific action 4", "Specific action 5"],
  "warning_signs": ["Escalation sign 1", "Escalation sign 2", "Escalation sign 3", "Escalation sign 4"]
}

Severity guidelines:
- "low": Minor issue, likely resolves on its own with home care
- "medium": Worth monitoring closely, schedule vet visit if persists beyond 48 hours
- "high": Needs veterinary attention within 24-48 hours
- "emergency": Needs IMMEDIATE emergency veterinary care — do not wait

CRITICAL: Always err on the side of caution. When in doubt, recommend a higher severity level. A false alarm is always better than missing something serious.

Respond ONLY with valid JSON. No markdown, no code blocks, just the JSON object.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type");
    }

    const result = JSON.parse(content.text);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Symptom check error:", error);
    return NextResponse.json(
      {
        severity: "medium",
        recommendation: "vet_48h",
        title: "Unable to Complete Full Analysis",
        explanation:
          "We encountered an issue performing the full AI analysis. Based on general guidelines, we recommend monitoring your pet closely and consulting your veterinarian if symptoms persist or worsen.",
        actions: [
          "Monitor your pet closely for the next 24 hours",
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
