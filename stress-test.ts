import { config } from "dotenv";
config({ path: ".env.local" });

import { OpenAI } from "openai";

let evaluateImageGate;
let detectBreedWithNyckel, fetchBreedProfile, runRoboflowSkinWorkflow;
let extractWithQwen, phraseWithKimi, diagnoseWithDeepSeek, verifyWithGLM, runVisionPipeline;

async function setupImports() {
  ({ evaluateImageGate } = await import("./src/lib/image-gate.js"));
  ({
    detectBreedWithNyckel,
    fetchBreedProfile,
    runRoboflowSkinWorkflow,
  } = await import("./src/lib/pet-enrichment.js"));
  ({
    extractWithQwen,
    phraseWithKimi,
    diagnoseWithDeepSeek,
    verifyWithGLM,
    runVisionPipeline,
  } = await import("./src/lib/nvidia-models.js"));
}

// Helper to fetch a real dog image for testing vision models
async function getTestImage() {
  const res = await fetch("https://images.dog.ceo/breeds/retriever-golden/n02099601_3004.jpg");
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

const TEST_PET = {
  name: "Stressy",
  species: "Dog",
  breed: "Golden Retriever",
  age_years: 3,
  weight: 65,
};

async function checkService(name, fn) {
  try {
    const start = Date.now();
    const result = await fn();
    const duration = Date.now() - start;
    console.log(`✅ [${name}] OK (${duration}ms)`);
    return { name, success: true, duration, result };
  } catch (error) {
    console.error(`❌ [${name}] FAILED: ${error.message}`);
    return { name, success: false, error };
  }
}

async function runHealthChecks() {
  console.log("=== STARTING HEALTH CHECKS (1 call each) ===");
  const base64Image = await getTestImage();
  const dataUri = `data:image/jpeg;base64,${base64Image}`;

  const checks = [
    checkService("Hugging Face Gate", () => evaluateImageGate(dataUri)),
    checkService("Nyckel Breed", () => detectBreedWithNyckel(dataUri, TEST_PET)),
    checkService("Roboflow Skin", () => runRoboflowSkinWorkflow(dataUri, TEST_PET)),
    checkService("API Ninjas", () => fetchBreedProfile("Golden Retriever", TEST_PET)),
    checkService("NVIDIA Qwen", () =>
      extractWithQwen(`Extract symptoms: "My dog is vomiting and limping"`)
    ),
    checkService("NVIDIA Kimi", () =>
      phraseWithKimi(`Ask the owner when the vomiting started.`)
    ),
    checkService("NVIDIA Nemotron", () =>
      diagnoseWithDeepSeek(`Write a 1-sentence dummy diagnosis for an upset stomach.`)
    ),
    checkService("NVIDIA GLM", () =>
      verifyWithGLM(`Verify this is safe: "Feed the dog plain chicken and rice."`)
    ),
    checkService("Vision Pipeline (Llama 11B)", () =>
      runVisionPipeline(dataUri, "He has a normal leg", TEST_PET)
    ),
  ];

  await Promise.all(checks);

  // Explicitly check Llama 3.2 90B Vision via a direct call to test the 90B endpoint specifically
  // since runVisionPipeline only routes to 90B if a wound is detected.
  await checkService("Vision 90B Explicit Check", async () => {
    const client = new OpenAI({
      baseURL: "https://integrate.api.nvidia.com/v1",
      apiKey: process.env.NVIDIA_VISION_DETAILED_API_KEY || process.env.NVIDIA_API_KEY || process.env.NVIDIA_QWEN_API_KEY,
    });
    const res = await client.chat.completions.create({
      model: "meta/llama-3.2-90b-vision-instruct",
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUri } },
            { type: "text", text: "What breed is this dog? Just the name." },
          ],
        },
      ],
      max_tokens: 20,
    });
    return res.choices[0]?.message?.content;
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runStressTest(concurrency = 5) {
  console.log(`\n=== STARTING STRESS TEST (${concurrency} concurrent calls) ===`);
  const base64Image = await getTestImage();
  const dataUri = `data:image/jpeg;base64,${base64Image}`;

  // We test the endpoints heavily
  const endpoints = [
    { name: "Hugging Face Gate", fn: () => evaluateImageGate(dataUri) },
    { name: "Nyckel Breed", fn: () => detectBreedWithNyckel(dataUri, TEST_PET) },
    { name: "Roboflow Skin", fn: () => runRoboflowSkinWorkflow(dataUri, TEST_PET) },
    { name: "API Ninjas", fn: () => fetchBreedProfile("Golden Retriever", TEST_PET) },
    { name: "NVIDIA Qwen", fn: () => extractWithQwen(`Test ${Math.random()}`) },
    { name: "NVIDIA Kimi", fn: () => phraseWithKimi(`Test ${Math.random()}`) },
    { name: "NVIDIA Nemotron", fn: () => diagnoseWithDeepSeek(`Test ${Math.random()}`) },
    { name: "NVIDIA GLM", fn: () => verifyWithGLM(`Test ${Math.random()}`) },
  ];

  for (const endpoint of endpoints) {
    console.log(`\nStress testing [${endpoint.name}]...`);
    const promises = [];
    for (let i = 0; i < concurrency; i++) {
        // slightly stagger start times to avoid identical instantiations sometimes breaking things
        promises.push(delay(i * 100).then(() => checkService(endpoint.name, endpoint.fn)));
    }
    const results = await Promise.all(promises);
    const successes = results.filter(r => r.success).length;
    console.log(`[${endpoint.name}] Result: ${successes}/${concurrency} succeeded.`);
  }
}

async function main() {
  await setupImports();
  await runHealthChecks();
  await runStressTest(5);
  console.log("\n✅ All tests complete.");
}

main().catch(console.error);
