import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, "..", "..");
const defaultArtifactRoot = path.join(repoRoot, ".tmp", "browser-mobile-smoke");
const defaultWindowsRuntimeRoot = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, "pawvital-browser-mobile-smoke")
  : defaultArtifactRoot;
const artifactRoot = path.resolve(
  process.env.PAWVITAL_SMOKE_ARTIFACT_DIR || defaultArtifactRoot
);
const runtimeRoot = path.resolve(
  process.env.PAWVITAL_SMOKE_RUNTIME_ROOT ||
    (process.platform === "win32" ? defaultWindowsRuntimeRoot : artifactRoot)
);
const tempRoot = path.join(runtimeRoot, "tmp");
const browsersRoot = path.resolve(
  process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(runtimeRoot, "ms-playwright")
);
const configPath = path.join(repoRoot, "playwright.browser-mobile.config.ts");
const playwrightCli = path.join(repoRoot, "node_modules", "playwright", "cli.js");
const system32Root = path.resolve(
  process.env.windir || "C:\\Windows",
  "System32"
);
const browserLockPath = path.join(browsersRoot, "__dirlock");

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

function clearStaleBrowserLock() {
  if (!fs.existsSync(browserLockPath)) {
    return;
  }

  const stats = fs.statSync(browserLockPath);
  const ageMs = Date.now() - stats.mtimeMs;
  const staleThresholdMs = 60_000;

  if (ageMs < staleThresholdMs) {
    return;
  }

  fs.rmSync(browserLockPath, { force: true });
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

function resolveWindowsChromeExecutable() {
  if (process.platform !== "win32") {
    return null;
  }

  const candidates = [
    path.join(process.env.ProgramFiles || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "", "Google", "Chrome", "Application", "chrome.exe"),
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
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
  PAWVITAL_SMOKE_RUNTIME_ROOT: runtimeRoot,
  PLAYWRIGHT_BROWSERS_PATH: browsersRoot,
  PW_TEST_HTML_REPORT_OPEN: "never",
  TEMP: tempRoot,
  TMP: tempRoot,
  TMPDIR: tempRoot,
};
const localChromeExecutable = resolveWindowsChromeExecutable();

if (localChromeExecutable) {
  env.PAWVITAL_SMOKE_EXECUTABLE_PATH = localChromeExecutable;
}

const rawArgs = process.argv.slice(2);
const installOnly = rawArgs.includes("--install-only");
const forwardedArgs = rawArgs.filter((arg) => arg !== "--install-only");

console.log("[browser-mobile-smoke] repo root:", repoRoot);
console.log("[browser-mobile-smoke] artifact root:", artifactRoot);
console.log("[browser-mobile-smoke] runtime root:", runtimeRoot);
console.log("[browser-mobile-smoke] browser cache:", browsersRoot);
console.log("[browser-mobile-smoke] temp root:", tempRoot);
if (localChromeExecutable) {
  console.log("[browser-mobile-smoke] windows chrome executable:", localChromeExecutable);
}
console.log(
  "[browser-mobile-smoke] base url:",
  env.PAWVITAL_SMOKE_BASE_URL || "http://127.0.0.1:3100"
);

if (installOnly) {
  if (localChromeExecutable) {
    console.log(
      "[browser-mobile-smoke] using installed Chrome on Windows; no bundled browser download required."
    );
    process.exit(0);
  }

  clearStaleBrowserLock();
  run(["install", "chromium", "chromium-headless-shell"], env);
}

run(["test", "--config", configPath, ...forwardedArgs], env);
