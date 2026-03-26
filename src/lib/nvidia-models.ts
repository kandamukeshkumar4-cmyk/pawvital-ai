import OpenAI from "openai";

// =============================================================================
// NVIDIA NIM Multi-Model Client
// All models accessed through NVIDIA's OpenAI-compatible API
// =============================================================================

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const SHARED_NVIDIA_API_KEY =
  process.env.NVIDIA_API_KEY || process.env.NVIDIA_VISION_API_KEY;
const VISION_FAST_API_KEY =
  process.env.NVIDIA_VISION_FAST_API_KEY ||
  SHARED_NVIDIA_API_KEY ||
  process.env.NVIDIA_DEEPSEEK_API_KEY;
const VISION_DETAILED_API_KEY =
  process.env.NVIDIA_VISION_DETAILED_API_KEY ||
  SHARED_NVIDIA_API_KEY ||
  process.env.NVIDIA_QWEN_API_KEY;

// --- Model Definitions ---
// Each model is assigned a role based on its strengths

export const MODELS = {
  // Qwen 3.5 122B — fast, accurate structured data extraction
  // (397B available as fallback but too slow for real-time chat)
  extraction: {
    name: "qwen/qwen3.5-122b-a10b",
    fallback: "qwen/qwen3.5-397b-a17b",
    role: "Data Extraction" as const,
    apiKey: process.env.NVIDIA_QWEN_API_KEY,
  },
  // Kimi K2.5 — natural language, empathetic phrasing
  phrasing: {
    name: "moonshotai/kimi-k2.5",
    fallback: null,
    role: "Question Phrasing" as const,
    apiKey: process.env.NVIDIA_KIMI_API_KEY,
  },
  // Nemotron Ultra 253B — NVIDIA's most powerful model for clinical diagnosis
  // (DeepSeek V3.2 as fallback; R1/V3.1 have CUDA issues on NIM)
  diagnosis: {
    name: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
    fallback: "deepseek-ai/deepseek-v3.2",
    role: "Diagnosis Report" as const,
    apiKey: process.env.NVIDIA_DEEPSEEK_API_KEY,
  },
  // GLM-5 — safety verification layer
  safety: {
    name: "z-ai/glm5",
    fallback: null,
    role: "Safety Verification" as const,
    apiKey: process.env.NVIDIA_GLM_API_KEY,
  },
  // ── 3-Tier Vision Pipeline ──
  // Tier 1: Llama 3.2 11B Vision — fast triage + wound detection
  vision_fast: {
    name: "meta/llama-3.2-11b-vision-instruct",
    fallback: "meta/llama-4-maverick-17b-128e-instruct",
    role: "Fast Triage" as const,
    apiKey: VISION_FAST_API_KEY,
  },
  // Tier 2: Llama 3.2 90B Vision — detailed wound feature extraction
  vision_detailed: {
    name: "meta/llama-3.2-90b-vision-instruct",
    fallback: "meta/llama-4-maverick-17b-128e-instruct",
    role: "Detailed Analysis" as const,
    apiKey: VISION_DETAILED_API_KEY,
  },
  // Tier 3: Kimi K2.5 — deep clinical reasoning, 256K context, multi-image
  vision_deep: {
    name: "moonshotai/kimi-k2.5",
    fallback: null,
    role: "Deep Reasoning" as const,
    apiKey: process.env.NVIDIA_KIMI_API_KEY,
  },
} as const;

type ModelRole = keyof typeof MODELS;

const ROLE_CONCURRENCY_LIMITS: Partial<Record<ModelRole, number>> = {
  extraction: 2,
  diagnosis: 1,
  vision_detailed: 1,
  vision_deep: 1,
};

const roleInflight = new Map<ModelRole, number>();
const roleQueues = new Map<ModelRole, Array<() => void>>();

async function withRoleConcurrency<T>(
  role: ModelRole,
  fn: () => Promise<T>
): Promise<T> {
  const limit = ROLE_CONCURRENCY_LIMITS[role];
  if (!limit) return fn();

  const active = roleInflight.get(role) ?? 0;
  if (active >= limit) {
    await new Promise<void>((resolve) => {
      const queue = roleQueues.get(role) ?? [];
      queue.push(resolve);
      roleQueues.set(role, queue);
    });
  }

  roleInflight.set(role, (roleInflight.get(role) ?? 0) + 1);

  try {
    return await fn();
  } finally {
    const remaining = (roleInflight.get(role) ?? 1) - 1;
    if (remaining <= 0) {
      roleInflight.delete(role);
    } else {
      roleInflight.set(role, remaining);
    }

    const queue = roleQueues.get(role);
    const next = queue?.shift();
    if (queue && queue.length === 0) {
      roleQueues.delete(role);
    }
    next?.();
  }
}

function parseLooseJsonObject(input: string): Record<string, unknown> {
  let json = input.trim().replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (json.startsWith("```")) {
    json = json
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "");
  }
  const match = json.match(/\{[\s\S]*\}/);
  if (match) json = match[0];
  return JSON.parse(json) as Record<string, unknown>;
}

// --- Client Factory ---

function createClient(role: ModelRole): OpenAI | null {
  const model = MODELS[role];
  if (!model.apiKey || model.apiKey.startsWith("your_")) return null;
  return new OpenAI({
    baseURL: NVIDIA_BASE_URL,
    apiKey: model.apiKey,
  });
}

// Lazy-initialized clients
const clients: Partial<Record<ModelRole, OpenAI>> = {};

function getClient(role: ModelRole): OpenAI | null {
  if (!(role in clients)) {
    clients[role] = createClient(role) || undefined;
  }
  return clients[role] || null;
}

// --- Check if multi-model stack is configured ---

export function isNvidiaConfigured(): boolean {
  // Core models needed: extraction, phrasing, diagnosis, safety, and at least one vision
  const core: (keyof typeof MODELS)[] = ["extraction", "phrasing", "diagnosis", "safety", "vision_fast"];
  return core.every((role) => {
    const m = MODELS[role];
    return m.apiKey && !m.apiKey.startsWith("your_");
  });
}

// --- Generic completion helper ---

interface CompletionOptions {
  role: ModelRole;
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

export async function complete({
  role,
  prompt,
  systemPrompt,
  maxTokens = 1024,
  temperature = 0.6,
}: CompletionOptions): Promise<string> {
  const client = getClient(role);
  if (!client) throw new Error(`NVIDIA ${MODELS[role].role} model not configured`);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  // Disable thinking mode for models that enable it by default
  // Thinking consumes from max_tokens budget and returns content in wrong field
  const modelName = MODELS[role].name;
  const disableThinking: Record<string, unknown> = {};
  if (modelName.includes("kimi")) {
    disableThinking.chat_template_kwargs = { thinking: false };
  } else if (modelName.includes("glm")) {
    disableThinking.chat_template_kwargs = { enable_thinking: false };
  }

  // Try primary model, then fallback if it fails
  const modelsToTry: string[] = [modelName];
  const fallback = MODELS[role].fallback;
  if (fallback) modelsToTry.push(fallback);

  let lastError: Error | null = null;
  for (const model of modelsToTry) {
    try {
      const response = await withRoleConcurrency(role, () =>
        client.chat.completions.create({
          model,
          messages,
          max_tokens: maxTokens,
          temperature,
          top_p: role === "diagnosis" ? 0.7 : 0.9,
          stream: false,
          ...disableThinking,
        })
      );

      const message = response.choices[0]?.message;
      // Some NVIDIA NIM models return text in reasoning_content/reasoning
      const content =
        message?.content ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (message as any)?.reasoning_content ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (message as any)?.reasoning;
      if (!content) {
        lastError = new Error(`Empty response from ${model}`);
        continue;
      }
      return content.trim();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[NVIDIA] ${model} failed, trying fallback...`, lastError.message);
      continue;
    }
  }

  throw lastError || new Error(`All models failed for ${MODELS[role].role}`);
}

// --- Specialized Functions ---

/**
 * Extract structured data from user message using Qwen 3.5 122B.
 * Falls back to 397B if 122B fails. Returns parsed JSON with symptoms and answers.
 */
export async function extractWithQwen(prompt: string): Promise<string> {
  return complete({
    role: "extraction",
    prompt,
    maxTokens: 384,
    temperature: 0.1,
  });
}

/**
 * Phrase a clinical question naturally using Kimi K2.5.
 * Returns a warm, empathetic question string.
 */
export async function phraseWithKimi(prompt: string): Promise<string> {
  return complete({
    role: "phrasing",
    prompt,
    maxTokens: 160,
    temperature: 0.5,
  });
}

/**
 * Generate clinical diagnosis report using Nemotron Ultra 253B.
 * Falls back to DeepSeek V3.2. Deep reasoning for differential diagnosis ranking.
 */
export async function diagnoseWithDeepSeek(prompt: string): Promise<string> {
  return complete({
    role: "diagnosis",
    prompt,
    maxTokens: 2048,
    temperature: 0.4,
  });
}

/**
 * Safety verification using GLM-5.
 * Reviews diagnosis for missed emergencies and dangerous advice.
 */
export async function verifyWithGLM(prompt: string): Promise<string> {
  return complete({
    role: "safety",
    prompt,
    maxTokens: 640,
    temperature: 0.1,
  });
}

// =============================================================================
// 3-TIER VISION PIPELINE
//
// Tier 1 (Fast Triage):    Llama 3.2 11B Vision → wound detection + quick severity
// Tier 2 (Detailed):       Llama 3.2 90B Vision → deep wound feature extraction
// Tier 3 (Deep Reasoning): Kimi K2.5 → complex cases, breed differentials
//
// Routing: ALL images → Tier 1. If wound + moderate/severe → Tier 2.
//          If ambiguous/severe/red flags → Tier 3.
// =============================================================================

/** Shared canine anatomy instruction block */
const CANINE_ANATOMY_RULES = `CRITICAL — USE CORRECT CANINE ANATOMY TERMS:
Dogs do NOT have arms, forearms, hands, feet, fingers, toes, ankles, or wrists.
- Front leg / forelimb (NOT arm/forearm)
- Hind leg / rear leg (NOT leg alone)
- Paw (NOT hand/foot), Digits (NOT fingers/toes)
- Carpus (NOT wrist), Tarsus / hock (NOT ankle)
- Stifle (NOT knee), Muzzle (NOT face), Flank (NOT side)`;

/** Shared helper: call a vision model with an image */
async function callVisionModel(
  role: "vision_fast" | "vision_detailed" | "vision_deep",
  imageUrl: string,
  prompt: string,
  maxTokens: number = 512,
  temperature: number = 0.2
): Promise<string> {
  const client = getClient(role);
  if (!client) throw new Error(`Vision model ${MODELS[role].role} not configured`);

  const modelsToTry: string[] = [MODELS[role].name];
  const fallback = MODELS[role].fallback;
  if (fallback) modelsToTry.push(fallback);

  // Kimi K2.5 needs thinking disabled
  const extras: Record<string, unknown> = {};
  if (MODELS[role].name.includes("kimi")) {
    extras.chat_template_kwargs = { thinking: false };
  }

  let lastError: Error | null = null;
  for (const model of modelsToTry) {
    try {
      const response = await withRoleConcurrency(role, () =>
        client.chat.completions.create({
          model,
          messages: [{
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageUrl } },
              { type: "text", text: prompt },
            ],
          }],
          max_tokens: maxTokens,
          temperature,
          stream: false,
          ...extras,
        })
      );

      const message = response.choices[0]?.message;
      const content =
        message?.content ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (message as any)?.reasoning_content ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (message as any)?.reasoning;
      if (!content) { lastError = new Error(`Empty response from ${model}`); continue; }

      // Strip thinking tags
      return content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[Vision ${MODELS[role].role}] ${model} failed:`, lastError.message);
      continue;
    }
  }
  throw lastError || new Error(`All models failed for ${MODELS[role].role}`);
}

/** Result from the full vision pipeline */
export interface VisionPipelineResult {
  tier1_fast: string;        // Raw JSON from Tier 1
  tier2_detailed?: string;   // Raw JSON from Tier 2 (only if wound detected)
  tier3_deep?: string;       // Raw text from Tier 3 (only if complex case)
  combined: string;          // Merged analysis for downstream consumption
  tiersUsed: number[];       // Which tiers ran: [1], [1,2], [1,2,3]
  woundDetected: boolean;
  severity: "normal" | "needs_review" | "urgent";
}

/**
 * Full 3-tier image analysis pipeline.
 * Automatically routes through tiers based on wound detection and severity.
 */
export async function analyzeImageWithVision(
  base64Image: string,
  textContext?: string,
  breedInfo?: { breed: string; age_years: number; weight: number }
): Promise<string> {
  const result = await runVisionPipeline(base64Image, textContext, breedInfo);
  return result.combined;
}

export async function runVisionPipeline(
  base64Image: string,
  textContext?: string,
  breedInfo?: { breed: string; age_years: number; weight: number }
): Promise<VisionPipelineResult> {
  const imageUrl = base64Image.startsWith("data:")
    ? base64Image
    : `data:image/jpeg;base64,${base64Image}`;

  const breedContext = breedInfo
    ? buildBreedRiskContext(breedInfo.breed, breedInfo.age_years)
    : "";

  // ═══════════════════════════════════════════════════════════════════════
  // TIER 1: Fast Triage — Llama 3.2 11B Vision
  // Goal: Detect wound, quick severity, basic features
  // ═══════════════════════════════════════════════════════════════════════
  const tier1Prompt = `You are a veterinary triage nurse. Quickly assess this dog photo.
${breedInfo ? `Patient: ${breedInfo.breed}, ${breedInfo.age_years}yr, ${breedInfo.weight}lbs` : ""}
${textContext ? `Owner says: "${textContext}"` : ""}
${CANINE_ANATOMY_RULES}

Output ONLY valid JSON:
{
  "wound_present": true/false,
  "body_area": "specific location using canine anatomy terms",
  "estimated_size": "small|medium|large",
  "wound_type": "laceration|puncture|abrasion|abscess|hot_spot|rash|mass|swelling|alopecia|normal|unknown",
  "color": ["visible colors, e.g. red, yellow, pink"],
  "swelling": "none|mild|moderate|severe",
  "discharge": "none|clear|yellow|green|bloody|mixed",
  "tissue_visible": false,
  "hair_loss_around": false,
  "red_flags": [],
  "severity_classification": "normal|needs_review|urgent",
  "urgency": "monitor_at_home|vet_soon|vet_24h|ER_NOW",
  "confidence": 0.0,
  "suggested_symptoms_for_matrix": ["wound_skin_issue"],
  "breed_relevant_notes": ""
}`;

  console.log("[Vision Pipeline] Tier 1: Llama 3.2 11B Vision (fast triage)...");
  const tier1Raw = await callVisionModel("vision_fast", imageUrl, tier1Prompt, 448, 0.1);
  console.log("[Vision Pipeline] Tier 1 complete");

  // Parse Tier 1 to decide routing
  let tier1Data: Record<string, unknown> = {};
  try {
    tier1Data = parseLooseJsonObject(tier1Raw);
  } catch { /* tier1Data stays empty — treat as needs_review */ }

  const woundDetected = tier1Data.wound_present === true;
  const tier1Severity = (tier1Data.severity_classification as string) || "needs_review";
  const tier1Urgency = (tier1Data.urgency as string) || "vet_soon";
  const hasRedFlags = Array.isArray(tier1Data.red_flags) && tier1Data.red_flags.length > 0;
  const tier1Confidence =
    typeof tier1Data.confidence === "number" ? tier1Data.confidence : undefined;
  const tier1WoundType =
    typeof tier1Data.wound_type === "string"
      ? tier1Data.wound_type.toLowerCase()
      : "unknown";
  const tier1Discharge =
    typeof tier1Data.discharge === "string"
      ? tier1Data.discharge.toLowerCase()
      : "none";
  const tier1Swelling =
    typeof tier1Data.swelling === "string"
      ? tier1Data.swelling.toLowerCase()
      : "none";
  const tier1TissueVisible = tier1Data.tissue_visible === true;
  const tier1LowConfidence =
    typeof tier1Confidence !== "number" || tier1Confidence < 0.72;
  const tier1VeryLowConfidence =
    typeof tier1Confidence !== "number" || tier1Confidence < 0.55;
  const tier1ConcerningFeatures =
    tier1TissueVisible ||
    ["yellow", "green", "bloody", "mixed"].includes(tier1Discharge) ||
    ["moderate", "severe"].includes(tier1Swelling) ||
    ["puncture", "abscess", "mass", "swelling", "unknown"].includes(
      tier1WoundType
    );
  let isComplexCase =
    tier1Severity === "urgent" ||
    tier1Urgency === "ER_NOW" ||
    hasRedFlags ||
    tier1TissueVisible ||
    tier1Swelling === "severe" ||
    ["green", "bloody", "mixed"].includes(tier1Discharge) ||
    (woundDetected && tier1VeryLowConfidence);
  const needsDetailedAnalysis =
    woundDetected &&
    (tier1Severity === "urgent" ||
      tier1ConcerningFeatures ||
      tier1LowConfidence);

  // If normal / no wound → return Tier 1 only
  if (!woundDetected && tier1Severity === "normal") {
    console.log("[Vision Pipeline] Tier 1 only — no wound, normal appearance");
    return {
      tier1_fast: tier1Raw,
      combined: tier1Raw,
      tiersUsed: [1],
      woundDetected: false,
      severity: "normal",
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TIER 2: Detailed Analysis — Llama 3.2 90B Vision
  // Goal: Deep wound characterization, tissue assessment, measurements
  // ═══════════════════════════════════════════════════════════════════════
  let tier2Raw: string | undefined;
  let tier2Data: Record<string, unknown> = {};
  if (needsDetailedAnalysis) {
    const tier2Prompt = `You are a board-certified veterinary dermatologist performing a detailed wound assessment on a dog photo.

${breedInfo ? `PATIENT: ${breedInfo.breed}, ${breedInfo.age_years} years old, ${breedInfo.weight} lbs` : ""}
${breedContext ? `\nBREED-SPECIFIC RISK FACTORS:\n${breedContext}` : ""}
${textContext ? `\nOWNER'S DESCRIPTION: "${textContext}"` : ""}

INITIAL TRIAGE FINDINGS: ${JSON.stringify(tier1Data)}

${CANINE_ANATOMY_RULES}

Perform a DETAILED wound characterization:

1. LESION TYPE & MORPHOLOGY: Exact wound type, shape, depth estimate
2. SIZE: Estimated dimensions in cm
3. BORDERS: Well-defined, diffuse, undermined, raised, irregular
4. SURFACE: Granulation tissue, necrotic tissue, epithelializing edges
5. DISCHARGE: Type, amount, color, odor indicators
6. SURROUNDING TISSUE: Erythema extent, induration, satellite lesions, hair loss pattern
7. INFLAMMATION GRADING: Score 0-3 for each: redness, swelling, heat indicators, pain signs
8. HEALING ASSESSMENT: Acute vs chronic, healing vs worsening, infected vs clean
9. TISSUE LAYERS VISIBLE: Epidermis only, dermis, subcutaneous, muscle, bone

Output ONLY valid JSON:
{
  "body_area": "precise anatomical location",
  "lesion_details": {
    "type": "specific wound type",
    "estimated_size_cm": "LxW",
    "depth_estimate": "superficial|partial_thickness|full_thickness|deep",
    "color": "detailed color description",
    "borders": "well-defined|diffuse|undermined|irregular",
    "surface": "description of wound bed",
    "discharge": "none|serous|purulent|sanguineous|mixed",
    "discharge_amount": "none|scant|moderate|copious"
  },
  "inflammation_score": {
    "redness": 0, "swelling": 0, "heat_signs": 0, "pain_signs": 0
  },
  "tissue_health": "healthy_granulation|necrotic|mixed|clean",
  "healing_status": "acute_fresh|healing_well|worsening|chronic|infected",
  "infection_indicators": ["list of infection signs found"],
  "observations": ["detailed clinical observations"],
  "visible_abnormalities": ["specific abnormalities with descriptions"],
  "estimated_severity": "mild|moderate|severe",
  "red_flags_detected": [],
  "consistent_with": ["top differential diagnoses ranked by likelihood"],
  "additional_symptoms_to_check": ["follow-up questions based on findings"],
  "breed_relevant_notes": "breed-specific risk assessment"
}`;

    try {
      console.log("[Vision Pipeline] Tier 2: Llama 3.2 90B Vision (detailed analysis)...");
      tier2Raw = await callVisionModel("vision_detailed", imageUrl, tier2Prompt, 900, 0.15);
      try {
        tier2Data = parseLooseJsonObject(tier2Raw);
      } catch {
        tier2Data = {};
      }

      const tier2Severity =
        typeof tier2Data.estimated_severity === "string"
          ? tier2Data.estimated_severity.toLowerCase()
          : "";
      const tier2HealingStatus =
        typeof tier2Data.healing_status === "string"
          ? tier2Data.healing_status.toLowerCase()
          : "";
      const tier2RedFlagsDetected =
        Array.isArray(tier2Data.red_flags_detected) &&
        tier2Data.red_flags_detected.length > 0;
      const tier2InfectionIndicators =
        Array.isArray(tier2Data.infection_indicators) &&
        tier2Data.infection_indicators.length > 0;
      const tier2DifferentialCount = Array.isArray(tier2Data.consistent_with)
        ? tier2Data.consistent_with.length
        : 0;

      isComplexCase =
        isComplexCase ||
        tier2RedFlagsDetected ||
        tier2InfectionIndicators ||
        tier2Severity === "severe" ||
        tier2HealingStatus === "infected" ||
        tier2HealingStatus === "worsening" ||
        tier2DifferentialCount > 2;
      console.log("[Vision Pipeline] Tier 2 complete");
    } catch (err) {
      console.error("[Vision Pipeline] Tier 2 failed (non-blocking):", err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TIER 3: Deep Reasoning — Kimi K2.5 (256K context)
  // Goal: Breed-specific differentials, clinical reasoning, action plan
  // Only for: severe wounds, red flags, ambiguous cases
  // ═══════════════════════════════════════════════════════════════════════
  let tier3Raw: string | undefined;
  if (isComplexCase) {
    const tier3Prompt = `You are a senior veterinary internist (DACVIM) reviewing a complex case. This dog photo has been flagged as requiring expert review.

${breedInfo ? `PATIENT: ${breedInfo.breed}, ${breedInfo.age_years} years old, ${breedInfo.weight} lbs` : ""}
${breedContext ? `\nBREED-SPECIFIC RISK FACTORS:\n${breedContext}` : ""}
${textContext ? `\nOWNER'S DESCRIPTION: "${textContext}"` : ""}

TIER 1 TRIAGE: ${JSON.stringify(tier1Data)}
${tier2Raw ? `TIER 2 DETAILED: ${tier2Raw.substring(0, 1500)}` : ""}

${CANINE_ANATOMY_RULES}

Provide EXPERT clinical reasoning:
1. Top 3 differential diagnoses with breed-specific risk factors and probability
2. For EACH differential: key clinical features supporting/opposing it
3. Recommended immediate action with urgency classification
4. Critical warning signs the owner should watch for
5. What additional information (photos, history) would refine the diagnosis

Output ONLY valid JSON:
{
  "expert_assessment": "1-2 sentence clinical summary",
  "differentials": [
    {
      "condition": "condition name",
      "probability": 0.0,
      "breed_risk_factor": "normal|elevated|high",
      "supporting_features": ["features from image supporting this"],
      "opposing_features": ["features that argue against this"]
    }
  ],
  "recommended_action": "specific next step",
  "urgency": "monitor_at_home|vet_soon|vet_24h|ER_NOW",
  "warning_signs": ["signs that should trigger ER visit"],
  "additional_info_needed": ["what would help refine diagnosis"],
  "severity_classification": "normal|needs_review|urgent"
}`;

    try {
      console.log("[Vision Pipeline] Tier 3: Kimi K2.5 (deep reasoning)...");
      tier3Raw = await callVisionModel("vision_deep", imageUrl, tier3Prompt, 700, 0.2);
      console.log("[Vision Pipeline] Tier 3 complete");
    } catch (err) {
      console.error("[Vision Pipeline] Tier 3 failed (non-blocking):", err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // COMBINE RESULTS — Merge all tiers into a single analysis string
  // ═══════════════════════════════════════════════════════════════════════
  const tiersUsed = [1];
  const parts: string[] = [tier1Raw];
  if (tier2Raw) { tiersUsed.push(2); parts.push(tier2Raw); }
  if (tier3Raw) { tiersUsed.push(3); parts.push(tier3Raw); }

  // Determine final severity (highest severity wins)
  let finalSeverity: "normal" | "needs_review" | "urgent" = tier1Severity as "normal" | "needs_review" | "urgent";
  if (tier3Raw) {
    try {
      let json = tier3Raw;
      const match = json.match(/\{[\s\S]*\}/);
      if (match) json = match[0];
      const tier3Data = JSON.parse(json);
      if (tier3Data.severity_classification === "urgent" || tier3Data.urgency === "ER_NOW") {
        finalSeverity = "urgent";
      }
    } catch { /* keep tier1 severity */ }
  }

  const combined = parts.join("\n\n---TIER_SEPARATOR---\n\n");
  console.log(`[Vision Pipeline] Complete: tiers=${tiersUsed.join(",")}, wound=${woundDetected}, severity=${finalSeverity}`);

  return {
    tier1_fast: tier1Raw,
    tier2_detailed: tier2Raw,
    tier3_deep: tier3Raw,
    combined,
    tiersUsed,
    woundDetected,
    severity: finalSeverity,
  };
}

// =============================================================================
// BREED-SPECIFIC RISK CONTEXT FOR VISION ANALYSIS
// Hardcoded — NOT LLM-generated. Gives the vision model breed-aware context.
// =============================================================================

const BREED_VISION_RISKS: Record<string, string[]> = {
  "golden retriever": [
    "Hot spots (acute moist dermatitis) — 3x more common in this breed",
    "Skin masses/lipomas — 1.8x higher incidence",
    "Allergic dermatitis — common in Goldens",
    "Mast cell tumors — elevated breed risk, any skin mass should be evaluated",
    "Hip/elbow dysplasia — check for joint swelling or abnormal stance",
    "Subvalvular aortic stenosis — watch for exercise intolerance signs",
  ],
  labrador: [
    "Hot spots (acute moist dermatitis) — 2.8x more common",
    "Skin masses/lipomas — 1.5x higher incidence",
    "Allergic dermatitis — very common in Labs",
    "Elbow/hip dysplasia — check for joint swelling",
    "Exercise-induced collapse — watch for weakness after activity",
  ],
  "german shepherd": [
    "Perianal fistulas — breed-specific skin condition",
    "Degenerative myelopathy — check for hind limb posture",
    "Hip dysplasia — check for abnormal stance",
    "Exocrine pancreatic insufficiency — watch for body condition",
    "GDV/bloat — DEEP CHEST BREED, high risk",
  ],
  bulldog: [
    "Skin fold dermatitis — extremely common in brachycephalic breeds",
    "Hot spots — 2.5x more common",
    "Wound infections — 1.5x higher risk due to skin folds",
    "Autoimmune skin diseases — 1.8x elevated risk",
    "Cherry eye — check for eye abnormalities",
    "Brachycephalic airway syndrome — watch for respiratory distress signs",
  ],
  "french bulldog": [
    "Skin fold dermatitis — very common",
    "Allergic dermatitis — extremely prevalent in Frenchies",
    "Interdigital cysts — check paw area carefully",
    "Brachycephalic airway syndrome — respiratory distress risk",
    "Spinal issues (IVDD) — check for posture abnormalities",
  ],
  poodle: [
    "Sebaceous adenitis — breed-specific skin condition causing hair loss",
    "Addison's disease — watch for lethargy/weakness signs",
    "Bloat/GDV — Standard Poodles are deep-chested, high risk",
    "Ear infections — floppy ears trap moisture",
  ],
  rottweiler: [
    "Osteosarcoma — elevated bone cancer risk, any limb swelling is serious",
    "Cruciate ligament disease — check for knee swelling",
    "GDV/bloat — DEEP CHEST BREED, high risk",
    "Elbow dysplasia — check for joint abnormalities",
  ],
  beagle: [
    "Ear infections — very common due to floppy ears",
    "Allergic dermatitis — elevated risk",
    "Cherry eye — check for eye abnormalities",
    "Hypothyroidism — watch for skin/coat changes",
  ],
  dachshund: [
    "Intervertebral disc disease (IVDD) — very high risk, check posture",
    "Acanthosis nigricans — breed-specific skin darkening",
    "Skin allergies — common in the breed",
    "Ear infections — floppy ears",
  ],
  "great dane": [
    "GDV/bloat — EXTREMELY HIGH RISK deep-chested breed",
    "Dilated cardiomyopathy — watch for exercise intolerance",
    "Wobbler syndrome — check for neck/gait abnormalities",
    "Osteosarcoma — elevated bone cancer risk",
    "Hot spots — large breeds prone to skin issues",
  ],
  boxer: [
    "Mast cell tumors — HIGHEST breed risk for skin cancers",
    "Skin masses — any lump must be evaluated urgently",
    "Allergic dermatitis — very common",
    "GDV/bloat — deep-chested breed risk",
    "Dilated cardiomyopathy — heart disease risk",
  ],
  husky: [
    "Zinc-responsive dermatosis — breed-specific skin condition",
    "Autoimmune skin diseases (pemphigus, lupus) — elevated risk",
    "Eye conditions (cataracts, corneal dystrophy) — check eyes",
    "Hip dysplasia — moderate breed risk",
  ],
  pitbull: [
    "Allergic dermatitis — extremely common in pit bulls",
    "Demodex mange — elevated susceptibility",
    "Skin infections — common secondary to allergies",
    "Cruciate ligament tears — athletic breed risk",
    "Mast cell tumors — moderate elevated risk",
  ],
};

function buildBreedRiskContext(breed: string, ageYears: number): string {
  const breedLower = breed.toLowerCase();
  let risks: string[] = [];

  // Exact match first, then partial match
  for (const [key, breedRisks] of Object.entries(BREED_VISION_RISKS)) {
    if (breedLower.includes(key) || key.includes(breedLower)) {
      risks = breedRisks;
      break;
    }
  }

  // Add age-specific context
  const ageContext: string[] = [];
  if (ageYears < 1) {
    ageContext.push("PUPPY: Higher risk of congenital conditions, parasites, parvo");
    ageContext.push("Immune system still developing — infections can escalate faster");
  } else if (ageYears >= 7) {
    ageContext.push("SENIOR DOG: Higher cancer risk — any new mass needs urgent evaluation");
    ageContext.push("Arthritis common — check for joint swelling, abnormal stance");
    ageContext.push("Slower healing — wounds may need more aggressive treatment");
  }

  const lines: string[] = [];
  if (risks.length > 0) lines.push(...risks);
  if (ageContext.length > 0) lines.push(...ageContext);

  return lines.map((r) => `- ${r}`).join("\n");
}

// =============================================================================
// STAGE 5: HARDCODED VISUAL RED FLAG GUARDRAILS
// These override EVERYTHING — if triggered, skip further analysis and go to ER.
// Pure code, no LLM. Based on veterinary emergency triage criteria.
// =============================================================================

export interface GuardrailResult {
  triggered: boolean;
  urgency: "ER_NOW" | "vet_24h" | null;
  flags: string[];
  blockFurtherAnalysis: boolean;
}

export function imageGuardrail(tier1Data: Record<string, unknown>): GuardrailResult {
  const flags: string[] = [];

  // Tissue exposed — deep wound, immediate ER
  if (tier1Data.tissue_visible === true) {
    flags.push("TISSUE_EXPOSED → ER_NOW: Deep wound with visible tissue/muscle/bone");
  }

  // Infected discharge (green/bloody)
  const discharge = (tier1Data.discharge as string || "").toLowerCase();
  if (["green", "bloody", "mixed"].includes(discharge)) {
    flags.push(`INFECTED_DISCHARGE (${discharge}) → ER potential: Signs of active infection`);
  }

  // Severe swelling
  if (tier1Data.swelling === "severe") {
    flags.push("SEVERE_SWELLING → ER_NOW: Could indicate abscess, allergic reaction, or compartment syndrome");
  }

  // Puncture wounds are always dangerous (hidden depth)
  if (tier1Data.wound_type === "puncture") {
    flags.push("PUNCTURE_WOUND → vet_24h: Puncture wounds can be deeper than they appear, high infection risk");
  }

  // Necrosis colors (black/purple tissue)
  const colors = Array.isArray(tier1Data.color) ? tier1Data.color : [];
  for (const c of colors) {
    const cl = (c as string).toLowerCase();
    if (cl.includes("black") || cl.includes("purple") || cl.includes("grey") || cl.includes("gray")) {
      flags.push(`NECROSIS_SIGNS (${cl}) → ER_NOW: Possible tissue death requiring debridement`);
    }
  }

  // Model-detected red flags
  const redFlags = Array.isArray(tier1Data.red_flags) ? tier1Data.red_flags : [];
  if (redFlags.length > 0) {
    flags.push(...redFlags.map((f: unknown) => `MODEL_RED_FLAG: ${f}`));
  }

  // ER_NOW urgency from model
  if (tier1Data.urgency === "ER_NOW") {
    flags.push("MODEL_URGENCY: ER_NOW classification from vision model");
  }

  // Determine final urgency
  const isER = flags.some(f =>
    f.includes("ER_NOW") || f.includes("TISSUE_EXPOSED") || f.includes("NECROSIS") || f.includes("SEVERE_SWELLING")
  );

  return {
    triggered: flags.length > 0,
    urgency: isER ? "ER_NOW" : flags.length > 0 ? "vet_24h" : null,
    flags,
    blockFurtherAnalysis: isER,
  };
}

/**
 * Parse vision analysis JSON and extract data for the clinical matrix.
 * Returns symptoms and red flags that can be directly fed into the triage engine.
 */
export function parseVisionForMatrix(visionResult: string): {
  symptoms: string[];
  redFlags: string[];
  severityClass: "normal" | "needs_review" | "urgent";
} {
  try {
    let jsonText = visionResult.trim();
    jsonText = jsonText.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonText = jsonMatch[0];

    const parsed = JSON.parse(jsonText);

    // Extract symptoms for the clinical matrix
    const symptoms: string[] = [];
    if (parsed.suggested_symptoms_for_matrix && Array.isArray(parsed.suggested_symptoms_for_matrix)) {
      symptoms.push(...parsed.suggested_symptoms_for_matrix);
    }
    // Also infer from lesion type
    if (parsed.lesion_details?.type) {
      const type = parsed.lesion_details.type.toLowerCase();
      if (["wound", "laceration", "puncture", "hot_spot", "abscess", "rash", "mass", "alopecia", "swelling"].includes(type)) {
        if (!symptoms.includes("wound_skin_issue")) symptoms.push("wound_skin_issue");
      }
    }

    // Extract red flags
    const redFlags: string[] = [];
    if (parsed.red_flags_detected && Array.isArray(parsed.red_flags_detected)) {
      for (const flag of parsed.red_flags_detected) {
        const flagLower = (flag as string).toLowerCase();
        if (flagLower.includes("deep") && flagLower.includes("wound")) redFlags.push("wound_deep_bleeding");
        if (flagLower.includes("bone") || flagLower.includes("muscle")) redFlags.push("wound_bone_visible");
        if (flagLower.includes("spread") || flagLower.includes("rapid")) redFlags.push("wound_spreading_rapidly");
        if (flagLower.includes("bleed")) redFlags.push("wound_deep_bleeding");
        if (flagLower.includes("necrosis") || flagLower.includes("dead tissue")) redFlags.push("wound_spreading_rapidly");
        if (flagLower.includes("distend") || flagLower.includes("bloat")) redFlags.push("gdv_distended");
        if (flagLower.includes("breathing") || flagLower.includes("respiratory")) redFlags.push("breathing_severe");
      }
    }

    // Severity classification
    const severityClass = (parsed.severity_classification || "needs_review") as "normal" | "needs_review" | "urgent";

    return { symptoms, redFlags, severityClass };
  } catch {
    console.error("[Vision Parser] Failed to parse vision JSON for matrix");
    return { symptoms: [], redFlags: [], severityClass: "needs_review" };
  }
}
