import { spawnSync } from "node:child_process";
import path from "node:path";

const jestBin = path.join(
  process.cwd(),
  "node_modules",
  "jest",
  "bin",
  "jest.js"
);

const suites = {
  production: {
    files: [
      "tests/symptom-chat.route.test.ts",
      "tests/outcome-feedback.route.test.ts",
    ],
    pattern:
      "VET-1352 production smoke|VET-1352 report smoke|stores structured tester feedback for a saved symptom check",
  },
  "emergency-bypass": {
    files: ["tests/symptom-chat.route.test.ts"],
    pattern: "VET-1352 emergency bypass smoke",
  },
  "tester-access": {
    files: [
      "tests/private-tester-access.test.ts",
      "tests/private-tester-admin.route.test.ts",
      "tests/proxy.auth.test.ts",
      "tests/stripe.checkout.route.test.ts",
      "tests/subscription-state.test.ts",
    ],
    pattern: "VET-1352 tester access smoke",
  },
};

const suiteName = process.argv[2] ?? "production";
const suite = suites[suiteName];

if (!suite) {
  console.error(
    `Unknown private tester smoke suite "${suiteName}". Expected one of: ${Object.keys(
      suites
    ).join(", ")}`
  );
  process.exit(1);
}

const args = [
  jestBin,
  "--runInBand",
  "--runTestsByPath",
  ...suite.files,
  "--testNamePattern",
  suite.pattern,
];

console.log(`Running private tester smoke suite: ${suiteName}`);
console.log(`Jest pattern: ${suite.pattern}`);

const result = spawnSync(process.execPath, args, {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
