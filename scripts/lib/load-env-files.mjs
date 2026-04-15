import fs from "node:fs";
import path from "node:path";

const DEFAULT_ENV_FILES = [".env.sidecars", ".env.local", ".env"];

function normalizeEnvValue(rawValue) {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith('"')) {
    try {
      return String(JSON.parse(trimmed)).trim();
    } catch {
      // Fall through to the raw trimmed value if the quoted payload is invalid.
    }
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

export function loadEnvFiles(
  rootDir,
  env = process.env,
  envFiles = DEFAULT_ENV_FILES
) {
  for (const relativePath of envFiles) {
    const fullPath = path.join(rootDir, relativePath);
    if (!fs.existsSync(fullPath)) continue;

    for (const line of fs.readFileSync(fullPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;

      const key = trimmed.slice(0, eq).trim();
      if (!key || env[key]) continue;

      env[key] = normalizeEnvValue(trimmed.slice(eq + 1));
    }
  }
}
