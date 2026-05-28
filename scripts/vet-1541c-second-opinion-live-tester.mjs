#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(
  scriptDir,
  "..",
  "tests",
  "fixtures",
  "second-opinion-qualifying-flow-matrix.json"
);

const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
const testerScript = fixture.productionSafeTesterScript;

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(testerScript, null, 2));
  process.exit(0);
}

console.log("VET-1541C production-safe second-opinion tester script");
console.log("");
console.log(`Target: ${testerScript.target}`);
console.log(`Profile: ${testerScript.profile}`);
console.log("");
console.log("Owner turns:");
for (const [index, turn] of testerScript.ownerTurns.entries()) {
  console.log(`${index + 1}. ${turn.phase}: ${turn.text}`);
}
console.log("");
console.log("Avoid owner phrases:");
for (const phrase of testerScript.avoidOwnerPhrases) {
  console.log(`- ${phrase}`);
}
console.log("");
console.log("Expected sanitized trace:");
for (const [key, value] of Object.entries(testerScript.expectedTrace)) {
  console.log(`- ${key}: ${value}`);
}
console.log("");
console.log("Admin verification:");
for (const [index, step] of testerScript.adminVerification.entries()) {
  console.log(`${index + 1}. ${step}`);
}
