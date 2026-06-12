#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const SUPABASE_URL_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "DATABASE_URL",
];
const DEFAULT_ENV_FILE_PATTERN =
  /^\.env(?:$|\.local$|\.production(?:$|[.-].*)|\.prod(?:$|[.-].*)|\.vercel\.production\.local$)/;

function parseArgs(argv) {
  const options = {
    allowProdVariants: false,
    expectedProjectRef: process.env.PAWVITAL_SUPABASE_PROJECT_REF || "",
    includeExamples: false,
    rootDir: process.cwd(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--allow-prod-variants") {
      options.allowProdVariants = true;
    } else if (arg === "--include-examples") {
      options.includeExamples = true;
    } else if (arg === "--root") {
      options.rootDir = path.resolve(argv[++index] || "");
    } else if (arg === "--expected-project-ref") {
      options.expectedProjectRef = String(argv[++index] || "").trim();
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printUsage() {
  console.log(`Usage: node scripts/check-supabase-env-split-brain.mjs [options]

Read-only Supabase env drift guard. Secret values are never printed.

Options:
  --root <path>                    Repo root to scan. Default: cwd
  --expected-project-ref <ref>     Require every Supabase URL to match this ref
  --allow-prod-variants            Do not fail on .env.prod* / .env.production-* files
  --include-examples               Include example env files in the scan
`);
}

function normalizeEnvValue(rawValue) {
  const trimmed = rawValue.trim();
  if (!trimmed) return "";

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function parseEnvFile(filePath) {
  const values = new Map();
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;

    const key = trimmed.slice(0, separator).trim();
    if (!SUPABASE_URL_KEYS.includes(key)) continue;

    values.set(key, normalizeEnvValue(trimmed.slice(separator + 1)));
  }
  return values;
}

function extractProjectRefFromPoolerUsername(username) {
  const decodedUsername = decodeURIComponent(username);
  const prefix = "postgres.";
  if (!decodedUsername.startsWith(prefix)) {
    return null;
  }

  const projectRef = decodedUsername.slice(prefix.length).trim();
  return projectRef || null;
}

function extractProjectRef(rawUrl) {
  if (!rawUrl) return { projectRef: null, reason: "empty" };

  try {
    const parsed = new URL(rawUrl);
    const hostname = parsed.hostname.toLowerCase();
    const suffix = ".supabase.co";
    if (!hostname.endsWith(suffix)) {
      if (hostname.endsWith(".pooler.supabase.com")) {
        const projectRef = extractProjectRefFromPoolerUsername(parsed.username);
        return projectRef
          ? { projectRef }
          : { projectRef: null, reason: "missing-pooler-username" };
      }

      return { projectRef: null, reason: "unsupported-host" };
    }

    const hostPrefix = hostname.slice(0, -suffix.length);
    const projectRef = hostPrefix.startsWith("db.")
      ? hostPrefix.slice("db.".length)
      : hostPrefix;

    return projectRef
      ? { projectRef }
      : { projectRef: null, reason: "unsupported-host" };
  } catch {
    return { projectRef: null, reason: "invalid-url" };
  }
}

function listEnvFiles(rootDir, includeExamples) {
  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => DEFAULT_ENV_FILE_PATTERN.test(name))
    .filter((name) => includeExamples || !/example/i.test(name))
    .sort((left, right) => left.localeCompare(right));
}

function isProdVariant(fileName) {
  return (
    /^\.env\.prod(?:$|[.-].*)/.test(fileName) ||
    /^\.env\.production[-.](?!local$).+/.test(fileName)
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const rootDir = path.resolve(options.rootDir);
  const envFiles = listEnvFiles(rootDir, options.includeExamples);
  const findings = [];
  const refsByFile = [];

  for (const fileName of envFiles) {
    const values = parseEnvFile(path.join(rootDir, fileName));
    const refs = SUPABASE_URL_KEYS.map((key) => {
      const extracted = extractProjectRef(values.get(key) || "");
      return {
        key,
        projectRef: extracted.projectRef,
        present: values.has(key),
        reason: extracted.reason,
      };
    }).filter((entry) => entry.present);

    if (refs.length > 0) {
      refsByFile.push({ fileName, refs });
    }

    for (const ref of refs) {
      if (!ref.projectRef) {
        findings.push(
          `${fileName} has invalid ${ref.key}: ${ref.reason || "unknown"}`
        );
      }
    }

    const uniqueRefs = new Set(
      refs.map((entry) => entry.projectRef).filter(Boolean)
    );
    if (uniqueRefs.size > 1) {
      findings.push(
        `${fileName} has conflicting Supabase URL project refs: ${[...uniqueRefs].join(", ")}`
      );
    }
  }

  const allRefs = new Set(
    refsByFile.flatMap((entry) =>
      entry.refs.map((ref) => ref.projectRef).filter(Boolean)
    )
  );
  if (allRefs.size > 1) {
    findings.push(
      `Multiple Supabase project refs found across env files: ${[...allRefs].join(", ")}`
    );
  }

  if (options.expectedProjectRef) {
    for (const projectRef of allRefs) {
      if (projectRef !== options.expectedProjectRef) {
        findings.push(
          `Supabase project ref ${projectRef} does not match expected ${options.expectedProjectRef}`
        );
      }
    }
  }

  const prodVariants = envFiles.filter(isProdVariant);
  if (prodVariants.length > 0 && !options.allowProdVariants) {
    findings.push(
      `Archive root-level production env variants before deploy: ${prodVariants.join(", ")}`
    );
  }

  console.log("Supabase env drift guard");
  console.log(`Root: ${rootDir}`);
  console.log(`Env files scanned: ${envFiles.length ? envFiles.join(", ") : "none"}`);
  if (refsByFile.length > 0) {
    console.log("Supabase URL refs:");
    for (const entry of refsByFile) {
      const refs = entry.refs
        .map((ref) => `${ref.key}=${ref.projectRef || ref.reason || "invalid"}`)
        .join(", ");
      console.log(`- ${entry.fileName}: ${refs}`);
    }
  }

  if (findings.length > 0) {
    console.error("\n[FAIL] Supabase env drift detected:");
    for (const finding of findings) {
      console.error(`- ${finding}`);
    }
    process.exit(1);
  }

  console.log("\n[PASS] Supabase env files do not expose a split-brain configuration.");
}

main();
