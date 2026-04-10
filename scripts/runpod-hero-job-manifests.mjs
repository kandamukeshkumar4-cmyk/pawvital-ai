import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const outputDir = path.join(rootDir, "deploy", "runpod", "jobs");
const benchmarkInput = "data/benchmarks/dog-triage/gold-candidate";

function readJson(relativePath) {
  return JSON.parse(
    fs.readFileSync(path.join(rootDir, relativePath), "utf8")
  );
}

function writeJson(fileName, payload) {
  const fullPath = path.join(outputDir, fileName);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(fullPath, JSON.stringify(payload, null, 2) + "\n");
  return fullPath;
}

function buildManifests() {
  const narrowModelPack = readJson("data/runpod-experiments/narrow-model-pack.json");
  const multimodalPilot = readJson("data/runpod-experiments/multimodal-pilot.json");

  return [
    {
      fileName: "vet-910-benchmark-eval.json",
      payload: {
        job_id: "vet-910-benchmark-eval",
        purpose: "Run the dog triage benchmark suite against the deployed app",
        recommended_gpu: "CPU or low-cost GPU",
        command: `node scripts/runpod-benchmark.mjs --input=${benchmarkInput} --base-url=$APP_BASE_URL --output=runpod-benchmark-report.json`,
        env_required: ["APP_BASE_URL"],
        inputs: [benchmarkInput],
        outputs: ["runpod-benchmark-report.json"]
      }
    },
    {
      fileName: "vet-911-silent-trial.json",
      payload: {
        job_id: "vet-911-silent-trial",
        purpose: "Run the existing Phase 5 shadow cycle and emit a silent-trial readiness report",
        recommended_gpu: "Existing sidecar pods",
        command: "node scripts/runpod-phase5-cycle.mjs && node scripts/report-phase5-shadow.mjs --output=phase5-shadow-report.md",
        env_required: ["APP_BASE_URL", "HF_SIDECAR_API_KEY", "RUNPOD_API_KEY"],
        inputs: ["deploy/runpod/pods.json"],
        outputs: ["phase5-shadow-report.md"]
      }
    },
    {
      fileName: "vet-915-narrow-model-pack.json",
      payload: {
        job_id: "vet-915-narrow-model-pack",
        purpose: "Coordinate narrow-model experiments that improve extraction and reranking without owning triage",
        recommended_gpu: "NVIDIA RTX 4090",
        config: narrowModelPack,
        env_required: ["RUNPOD_API_KEY"],
        inputs: ["data/runpod-experiments/narrow-model-pack.json"],
        outputs: ["experiment-metrics.json", "model-eval-summary.md"]
      }
    },
    {
      fileName: "vet-916-multimodal-pilot.json",
      payload: {
        job_id: "vet-916-multimodal-pilot",
        purpose: "Coordinate advisory-only multimodal dog-triage pilots on RunPod GPUs",
        recommended_gpu: "NVIDIA L40S",
        config: multimodalPilot,
        env_required: ["RUNPOD_API_KEY"],
        inputs: ["data/runpod-experiments/multimodal-pilot.json"],
        outputs: ["multimodal-pilot-metrics.json", "multimodal-pilot-summary.md"]
      }
    }
  ];
}

function main() {
  const written = [];
  for (const manifest of buildManifests()) {
    written.push(writeJson(manifest.fileName, manifest.payload));
  }
  console.log(`Wrote ${written.length} RunPod hero job manifest(s):`);
  for (const filePath of written) {
    console.log(`- ${filePath}`);
  }
}

main();
