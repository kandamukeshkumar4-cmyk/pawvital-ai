import fs from "node:fs";
import path from "node:path";

const EXPECTED_TURN_DEPTH = "standard";

function resolveRoot(argv) {
  const rootIndex = argv.indexOf("--root");
  if (rootIndex >= 0) {
    return path.resolve(argv[rootIndex + 1] ?? ".");
  }

  const rootArg = argv.find((arg) => arg.startsWith("--root="));
  if (rootArg) {
    return path.resolve(rootArg.slice("--root=".length));
  }

  return process.cwd();
}

function parseEnvTemplate(text) {
  const values = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) continue;

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values.set(key, value);
  }
  return values;
}

function readText(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function main() {
  const root = resolveRoot(process.argv.slice(2));
  const failures = [];

  const envValues = parseEnvTemplate(readText(root, ".env.example"));
  if (envValues.get("SYMPTOM_CHAT_TURN_DEPTH") !== EXPECTED_TURN_DEPTH) {
    failures.push(
      `.env.example must set SYMPTOM_CHAT_TURN_DEPTH=${EXPECTED_TURN_DEPTH}`
    );
  }

  const vercelConfig = JSON.parse(readText(root, "vercel.json"));
  if (vercelConfig.env?.SYMPTOM_CHAT_TURN_DEPTH !== EXPECTED_TURN_DEPTH) {
    failures.push(
      `vercel.json env.SYMPTOM_CHAT_TURN_DEPTH must be ${EXPECTED_TURN_DEPTH}`
    );
  }

  const flowSource = readText(
    root,
    "src/lib/symptom-chat/question-response-flow.ts"
  );
  if (
    !/DEFAULT_SYMPTOM_CHAT_TURN_DEPTH:\s*SymptomChatTurnDepth\s*=\s*["']standard["']/.test(
      flowSource
    )
  ) {
    failures.push(
      "question-response-flow.ts must keep DEFAULT_SYMPTOM_CHAT_TURN_DEPTH as standard"
    );
  }

  const packageJson = JSON.parse(readText(root, "package.json"));
  if (
    packageJson.scripts?.["ops:turn-depth-guard"] !==
    "node scripts/check-symptom-turn-depth-config.mjs"
  ) {
    failures.push("package.json must expose ops:turn-depth-guard");
  }

  if (failures.length > 0) {
    console.error("Symptom chat turn-depth guard failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(
    `Symptom chat turn-depth guard passed: SYMPTOM_CHAT_TURN_DEPTH=${EXPECTED_TURN_DEPTH}`
  );
}

main();
