#!/usr/bin/env node
/**
 * Copies AZURE_* vars from .env.vercel.production.local into .env.local
 * without printing secret values.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sourcePath = join(root, ".env.vercel.production.local");
const targetPath = join(root, ".env.local");

if (!existsSync(sourcePath)) {
  console.error(
    "Missing .env.vercel.production.local — run: npx vercel env pull .env.vercel.production.local --environment=production --yes"
  );
  process.exit(1);
}

function parseEnv(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i <= 0) continue;
    map.set(trimmed.slice(0, i).trim(), trimmed.slice(i + 1));
  }
  return map;
}

const source = parseEnv(readFileSync(sourcePath, "utf8"));
const azureKeys = [...source.keys()].filter(
  (key) => key.startsWith("AZURE_") || key === "PLATFORM_BLOB_PROVIDER"
);

if (azureKeys.length === 0) {
  console.error("No AZURE_* keys found in Vercel pull file.");
  process.exit(1);
}

let targetText = existsSync(targetPath)
  ? readFileSync(targetPath, "utf8")
  : "";

const blockHeader = "\n# --- Azure support layer (synced from Vercel production) ---\n";
const lines = azureKeys.map((key) => `${key}=${source.get(key)}`);
const block = `${blockHeader}${lines.join("\n")}\n`;

if (targetText.includes("# --- Azure support layer")) {
  targetText = targetText.replace(
    /\n# --- Azure support layer[\s\S]*?(?=\n# |\n[A-Z_]|$)/,
    block.trimEnd()
  );
} else {
  targetText = `${targetText.trimEnd()}${block}`;
}

writeFileSync(targetPath, targetText.endsWith("\n") ? targetText : `${targetText}\n`);
console.log(
  `Merged ${azureKeys.length} Azure env vars into .env.local (values not printed).`
);
