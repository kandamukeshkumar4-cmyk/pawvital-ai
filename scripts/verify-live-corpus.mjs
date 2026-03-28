import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const corpusImagesDir = path.join(rootDir, "corpus", "images");
const registryPath = path.join(rootDir, "src", "lib", "live-corpus-registry.json");
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));

function statusLine(level, message) {
  const prefix =
    level === "ok" ? "[OK]" : level === "warn" ? "[WARN]" : "[FAIL]";
  console.log(`${prefix} ${message}`);
}

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

function countFiles(dirPath) {
  let count = 0;
  const stack = [dirPath];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else {
        count += 1;
      }
    }
  }

  return count;
}

function findMatches(directoryEntries, hints) {
  const normalizedHints = hints.map((hint) => normalizeSlug(hint));
  return directoryEntries.filter((entry) => {
    const normalizedEntry = normalizeSlug(entry.name);
    return normalizedHints.some(
      (hint) => normalizedEntry === hint || normalizedEntry.includes(hint) || hint.includes(normalizedEntry)
    );
  });
}

function main() {
  if (!fs.existsSync(corpusImagesDir)) {
    statusLine("fail", `Missing corpus image directory: ${corpusImagesDir}`);
    process.exit(1);
  }

  const directoryEntries = fs
    .readdirSync(corpusImagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory());

  const matchedDirectories = new Set();
  let failures = 0;
  let warnings = 0;

  for (const policy of registry) {
    const hints = policy.directoryHints?.length
      ? policy.directoryHints
      : [policy.slug];
    const matches = findMatches(directoryEntries, hints);

    if (matches.length === 0) {
      failures += 1;
      statusLine(
        "fail",
        `${policy.slug} has no matching corpus directory (hints: ${hints.join(", ")})`
      );
      continue;
    }

    let totalFiles = 0;
    for (const match of matches) {
      matchedDirectories.add(match.name);
      totalFiles += countFiles(path.join(corpusImagesDir, match.name));
    }

    if (totalFiles <= 0) {
      warnings += 1;
      statusLine(
        "warn",
        `${policy.slug} matched ${matches.map((entry) => entry.name).join(", ")} but no files were found`
      );
      continue;
    }

    statusLine(
      "ok",
      `${policy.slug} -> ${matches.map((entry) => entry.name).join(", ")} (${totalFiles} file(s), domains=${policy.supportedDomains.join(",")})`
    );
  }

  const unmatchedDirectories = directoryEntries
    .map((entry) => entry.name)
    .filter((name) => !matchedDirectories.has(name));

  for (const unmatched of unmatchedDirectories) {
    warnings += 1;
    statusLine(
      "warn",
      `Corpus directory ${unmatched} is not currently mapped into the live corpus registry`
    );
  }

  console.log("");
  console.log(
    `Live corpus verification summary: ${failures} failure(s), ${warnings} warning(s), ${registry.length} policy source(s)`
  );

  if (failures > 0) {
    process.exit(1);
  }
}

main();
