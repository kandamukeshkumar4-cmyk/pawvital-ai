import { OpenAI } from "openai";
import { config } from "dotenv";

config({ path: ".env.local" });

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

const MODELS = {
  extraction: {
    name: "qwen/qwen3.5-122b-a10b",
    role: "Data Extraction (Qwen 3.5 122B)",
    apiKey: process.env.NVIDIA_QWEN_API_KEY,
  },
  phrasing: {
    name: "moonshotai/kimi-k2.5",
    role: "Question Phrasing (Kimi K2.5)",
    apiKey: process.env.NVIDIA_KIMI_API_KEY,
  },
  diagnosis: {
    name: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
    role: "Diagnosis Report (Nemotron Ultra 253B)",
    apiKey: process.env.NVIDIA_DEEPSEEK_API_KEY, // Note: using deepseek key as configured in nvidia-models.ts
  },
  safety: {
    name: "z-ai/glm5",
    role: "Safety Verification (GLM-5)",
    apiKey: process.env.NVIDIA_GLM_API_KEY,
  },
  vision: {
    name: "meta/llama-4-maverick-17b-128e-instruct",
    role: "Image Analysis (Llama 4 Maverick)",
    apiKey: process.env.NVIDIA_DEEPSEEK_API_KEY, // Note: using deepseek key as configured in nvidia-models.ts
  },
};

async function testModel(key, modelConfig) {
  console.log(`\nTesting ${modelConfig.role}...`);
  if (!modelConfig.apiKey || modelConfig.apiKey.startsWith("your_")) {
    console.error(`❌ API Key missing or invalid for ${modelConfig.role}`);
    return;
  }

  const client = new OpenAI({
    baseURL: NVIDIA_BASE_URL,
    apiKey: modelConfig.apiKey,
  });

  try {
    const disableThinking = {};
    if (modelConfig.name.includes("kimi")) {
        disableThinking.chat_template_kwargs = { thinking: false };
    } else if (modelConfig.name.includes("glm")) {
        disableThinking.chat_template_kwargs = { enable_thinking: false };
    }
      
    const response = await client.chat.completions.create({
      model: modelConfig.name,
      messages: [{ role: "user", content: "Hi! Just replying 'OK' is enough." }],
      max_tokens: 10,
      temperature: 0.1,
      ...disableThinking
    });

    console.log(`✅ Success! Response: ${response.choices[0]?.message?.content}`);
  } catch (err) {
    console.error(`❌ Error testing ${modelConfig.name}:`, err.message);
  }
}

async function runTests() {
  console.log("Starting API Tests...");
  for (const [key, config] of Object.entries(MODELS)) {
    await testModel(key, config);
  }
}

runTests();
