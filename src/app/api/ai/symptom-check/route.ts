import { NextResponse } from "next/server";
import { openai, isOpenAIConfigured } from "@/lib/openai";

export async function POST(request: Request) {
  try {
    const { symptoms, pet } = await request.json();

    if (!isOpenAIConfigured) {
      return NextResponse.json({
        severity: "medium",
        recommendation: "vet_48h",
        title: "AI Assessment (Demo Mode)",
        explanation: `Based on the symptoms described for ${pet?.name || "your pet"}: "${symptoms}". In demo mode, we provide general guidance. With a configured OpenAI API key, you'll get breed-specific, AI-powered analysis. We recommend monitoring closely and consulting your vet if symptoms persist.`,
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

    const prompt = `You are a veterinary AI assistant. A pet owner is describing symptoms for their pet.

Pet Profile:
- Name: ${pet.name}
- Breed: ${pet.breed}
- Age: ${pet.age_years} years
- Weight: ${pet.weight} lbs
- Existing conditions: ${pet.existing_conditions?.join(", ") || "None"}

Symptoms described: "${symptoms}"

Analyze these symptoms and respond in this exact JSON format:
{
  "severity": "low" | "medium" | "high" | "emergency",
  "recommendation": "monitor" | "vet_48h" | "emergency_vet",
  "title": "Brief assessment title",
  "explanation": "Detailed explanation of what might be happening, considering the breed and age. 2-3 sentences.",
  "actions": ["Action 1", "Action 2", "Action 3", "Action 4", "Action 5"],
  "warning_signs": ["Warning sign 1", "Warning sign 2", "Warning sign 3", "Warning sign 4"]
}

Guidelines:
- "low" severity: Minor issue, likely resolves on its own
- "medium" severity: Worth monitoring, schedule vet if persists
- "high" severity: Needs veterinary attention within 24-48 hours
- "emergency" severity: Needs immediate emergency veterinary care
- Always err on the side of caution
- Consider breed-specific health risks
- Consider age-related conditions
- Always include a disclaimer that this is not a substitute for veterinary care

Respond ONLY with valid JSON.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 1000,
    });

    const content = completion.choices[0].message.content;
    if (!content) {
      throw new Error("No response from AI");
    }

    const result = JSON.parse(content);
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
