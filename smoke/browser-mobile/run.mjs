import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, "..", "..");
const defaultArtifactRoot = path.join(repoRoot, ".tmp", "browser-mobile-smoke");
const artifactRoot = path.resolve(
  process.env.PAWVITAL_SMOKE_ARTIFACT_DIR || defaultArtifactRoot
);
const tempRoot = path.join(artifactRoot, "tmp");
const browsersRoot = path.resolve(
  process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(artifactRoot, "ms-playwright")
);
const configPath = path.join(repoRoot, "playwright.browser-mobile.config.ts");
const playwrightCli = path.join(repoRoot, "node_modules", "playwright", "cli.js");
const system32Root = path.resolve(
  process.env.windir || "C:\\Windows",
  "System32"
);

function normalizeForComparison(value) {
  return path.resolve(value).replace(/\//g, "\\").toLowerCase();
}

function ensureNotSystem32(targetPath, label) {
  if (
    process.platform === "win32" &&
    normalizeForComparison(targetPath).startsWith(
      normalizeForComparison(system32Root)
    )
  ) {
    throw new Error(
      `${label} resolved inside ${system32Root}, which would recreate the EPERM smoke-runner failure.`
    );
  }
}

function ensureDirectory(targetPath) {
  ensureNotSystem32(targetPath, "Smoke artifact path");
  fs.mkdirSync(targetPath, { recursive: true });
}

function run(args, env) {
  const result = spawnSync(process.execPath, [playwrightCli, ...args], {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });

  if (result.error) {
    console.error("[browser-mobile-smoke] Playwright runner failed:", result.error);
  }

  if (typeof result.status === "number") {
    process.exit(result.status);
  }

  process.exit(1);
}

if (!fs.existsSync(playwrightCli)) {
  console.error(
    "Local Playwright is not installed. Run `npm install` before the browser/mobile smoke path."
  );
  process.exit(1);
}

ensureDirectory(artifactRoot);
ensureDirectory(tempRoot);
ensureDirectory(browsersRoot);

const env = {
  ...process.env,
  PAWVITAL_SMOKE_ARTIFACT_DIR: artifactRoot,
  PLAYWRIGHT_BROWSERS_PATH: browsersRoot,
  PW_TEST_HTML_REPORT_OPEN: "never",
  TEMP: tempRoot,
  TMP: tempRoot,
  TMPDIR: tempRoot,
};

const rawArgs = process.argv.slice(2);
const installOnly = rawArgs.includes("--install-only");
const forwardedArgs = rawArgs.filter((arg) => arg !== "--install-only");

console.log("[browser-mobile-smoke] repo root:", repoRoot);
console.log("[browser-mobile-smoke] artifact root:", artifactRoot);
console.log("[browser-mobile-smoke] browser cache:", browsersRoot);
console.log("[browser-mobile-smoke] temp root:", tempRoot);
console.log(
  "[browser-mobile-smoke] base url:",
  env.PAWVITAL_SMOKE_BASE_URL || "http://127.0.0.1:3100"
);

if (installOnly) {
  run(["install", "chromium"], env);
}

run(["test", "--config", configPath, ...forwardedArgs], env);
