import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const SKIPPED_FILE_RE =
  /(^package-lock\.json$|\.png$|\.jpe?g$|\.gif$|\.ico$|\.pdf$|\.zip$|\.lock$|\.tsbuildinfo$)/i;

const SECRET_PATTERNS = [
  ["private-key", /-----BEGIN (?:RSA |DSA |EC |OPENSSH |)?PRIVATE KEY-----/g],
  ["aws-access-key", /AKIA[0-9A-Z]{16}/g],
  ["github-token", /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,}/g],
  ["google-api-key", /AIza[0-9A-Za-z_-]{35}/g],
  ["stripe-secret-key", /sk_(?:live|test)_[0-9A-Za-z]{24,}/g],
  ["stripe-webhook-secret", /whsec_[0-9A-Za-z]{24,}/g],
  ["anthropic-key", /sk-ant-[0-9A-Za-z_-]{40,}/g],
  ["openai-key", /sk-(?:proj-)?[0-9A-Za-z_-]{40,}/g],
  ["nvidia-nim-key", /nvapi-[0-9A-Za-z_-]{30,}/g],
  ["huggingface-token", /hf_[0-9A-Za-z]{30,}/g],
  ["jwt-like-token", /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g],
];

const LITERAL_ASSIGNMENT_RE =
  /^\s*(?:-|export\s+|const\s+|let\s+|var\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*["']?([^"'\s#;,]+)["']?\s*$/;

function git(args) {
  return execFileSync("git", ["-C", ROOT, ...args], {
    encoding: "utf8",
    maxBuffer: 80 * 1024 * 1024,
  });
}

function fingerprint(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function entropy(value) {
  const counts = new Map();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);

  let score = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    score -= probability * Math.log2(probability);
  }
  return score;
}

function isPlaceholder(value) {
  const normalized = value.trim().replace(/^["']|["']$/g, "").toLowerCase();
  if (!normalized) return true;
  if (/^(true|false|null|undefined|\d+)$/.test(normalized)) return true;

  return (
    /(your|placeholder|example|changeme|change_me|replace|dummy|stub|demo|localhost)/i.test(normalized) ||
    /(\.example|pawvital\.test|supabase\.example|correct-anon-key|dev-secret|dev-api-key)/i.test(normalized) ||
    /(testsecret|test-secret|xxx|<.*>|\$\{|\$\(|secrets\.|vars\.|github\.|env\.|process\.env)/i.test(normalized) ||
    /(sk-candidate|gold-candidate|high-risk-followup)/i.test(normalized)
  );
}

function isSecretAssignmentKey(key) {
  const normalized = key.toUpperCase();
  if (normalized.startsWith("NEXT_PUBLIC_")) {
    return !/(ANON_KEY|PUBLISHABLE_KEY|APP_URL|SUPABASE_URL|PRIVATE_TESTER)/.test(normalized);
  }
  if (normalized.endsWith("TOKENS")) return false;

  return (
    normalized === "TOKEN" ||
    normalized.endsWith("_TOKEN") ||
    normalized === "API_KEY" ||
    normalized.endsWith("_API_KEY") ||
    normalized.includes("SECRET") ||
    normalized.endsWith("_PASSWORD") ||
    normalized.endsWith("_PRIVATE_KEY") ||
    normalized.endsWith("_SERVICE_ROLE_KEY") ||
    normalized === "DATABASE_URL" ||
    normalized === "CLOUDINARY_URL"
  );
}

function addFinding(findings, file, line, rule, value) {
  const cleaned = value.trim().replace(/^["']|["']$/g, "");
  if (isPlaceholder(cleaned)) return;

  findings.push({
    file,
    line,
    rule,
    fingerprint: fingerprint(cleaned),
    valueLength: cleaned.length,
  });
}

function scanFile(file, text, findings) {
  const lines = text.split(/\r?\n/);

  lines.forEach((lineText, index) => {
    for (const [rule, pattern] of SECRET_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(lineText))) {
        addFinding(findings, file, index + 1, rule, match[0]);
      }
    }

    const assignment = lineText.match(LITERAL_ASSIGNMENT_RE);
    if (!assignment) return;

    const [, key, value] = assignment;
    if (!isSecretAssignmentKey(key)) return;
    if (value.length < 16 && entropy(value) < 3.8) return;
    addFinding(findings, file, index + 1, `literal-assignment:${key.toUpperCase()}`, value);
  });
}

const trackedFiles = git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
  .split("\0")
  .filter(Boolean)
  .filter((file) => !SKIPPED_FILE_RE.test(file));

const findings = [];
for (const file of trackedFiles) {
  const fullPath = path.join(ROOT, file);
  let stats;
  try {
    stats = statSync(fullPath);
  } catch {
    continue;
  }
  if (stats.size > MAX_FILE_BYTES) continue;

  try {
    scanFile(file.replaceAll("\\", "/"), readFileSync(fullPath, "utf8"), findings);
  } catch {
    continue;
  }
}

if (findings.length > 0) {
  console.error("Secret scan failed. Redacted findings:");
  for (const finding of findings) {
    console.error(
      `- ${finding.file}:${finding.line} ${finding.rule} fingerprint=${finding.fingerprint} length=${finding.valueLength}`,
    );
  }
  process.exit(1);
}

console.log(`Secret scan passed across ${trackedFiles.length} tracked and pending text files.`);
