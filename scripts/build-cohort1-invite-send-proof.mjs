import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_INPUT = "docs/private-tester-cohort-1-registry-template.csv";
const DEFAULT_JSON_OUT = "plans/VET-1582-cohort1-invite-send-proof-readout.json";
const DEFAULT_MD_OUT = "plans/VET-1582-cohort1-invite-send-proof-readout.md";
const FIRST_COHORT_MAX = 5;

const REQUIRED_COLUMNS = [
  "tester_alias",
  "email",
  "dog_name",
  "dog_age",
  "dog_breed_size",
  "device_browser",
  "allowlist_status",
  "invitation_sent_proof",
  "consent_status",
  "first_login_timestamp",
  "first_symptom_check_timestamp",
  "feedback_submitted",
  "deletion_requested",
  "access_disabled",
  "notes",
];

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    jsonOut: DEFAULT_JSON_OUT,
    markdownOut: DEFAULT_MD_OUT,
    write: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write") {
      options.write = true;
    } else if (arg === "--input") {
      options.input = argv[++index];
    } else if (arg === "--json-out") {
      options.jsonOut = argv[++index];
    } else if (arg === "--markdown-out") {
      options.markdownOut = argv[++index];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function parseCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }

  cells.push(cell);
  return cells.map((value) => value.trim());
}

function parseCsv(content) {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  const rows = lines.slice(1).map((line, rowIndex) => {
    const cells = parseCsvLine(line);
    const row = { __rowNumber: rowIndex + 2 };
    headers.forEach((header, index) => {
      row[header] = cells[index]?.trim() ?? "";
    });
    return row;
  });

  return { headers, rows };
}

function normalize(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return normalize(value).toLowerCase();
}

function isPlaceholder(value) {
  const text = lower(value);
  return (
    text.length === 0 ||
    text === "manual-verify" ||
    text === "manual_verify" ||
    text === "capture-during-invite" ||
    text === "capture-during-launch" ||
    text === "capture-during-onboarding" ||
    text === "pending" ||
    text === "pending_onboarding" ||
    text === "tbd" ||
    text === "todo" ||
    text === "n/a" ||
    text === "na" ||
    text.includes("example")
  );
}

function isExampleRow(row) {
  return (
    lower(row.tester_alias).includes("example") ||
    lower(row.email).includes("example.com") ||
    lower(row.notes).includes("example")
  );
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalize(value));
}

function hashEmail(email) {
  return crypto
    .createHash("sha256")
    .update(lower(email))
    .digest("hex");
}

function maskEmail(email) {
  const normalized = lower(email);
  const [local, domain] = normalized.split("@");
  if (!local || !domain) {
    return "";
  }
  return `${local.slice(0, 1)}***@${domain}`;
}

function buildBlocker(code, severity, detail, rowNumber = null) {
  return { code, detail, rowNumber, severity };
}

function analyzeRegistry(inputPath, csvContent, now = new Date()) {
  const { headers, rows } = parseCsv(csvContent);
  const missingColumns = REQUIRED_COLUMNS.filter(
    (column) => !headers.includes(column)
  );
  const blockers = [];

  if (missingColumns.length > 0) {
    blockers.push(
      buildBlocker(
        "MISSING_COLUMNS",
        "P0",
        `Missing required column(s): ${missingColumns.join(", ")}`
      )
    );
  }

  const realRows = rows.filter((row) => !isExampleRow(row));
  const exampleRows = rows.length - realRows.length;
  const duplicateEmails = new Set();
  const seenEmails = new Set();
  const rowSummaries = [];

  for (const row of realRows) {
    const email = lower(row.email);
    const allowlistStatus = lower(row.allowlist_status);
    const invitationProof = normalize(row.invitation_sent_proof);
    const consentStatus = lower(row.consent_status);
    const deletionRequested = lower(row.deletion_requested);
    const accessDisabled = lower(row.access_disabled);
    const rowIssues = [];

    if (!looksLikeEmail(email)) {
      rowIssues.push("invalid_email");
      blockers.push(
        buildBlocker(
          "INVALID_EMAIL",
          "P0",
          "A registry row does not have a valid tester email.",
          row.__rowNumber
        )
      );
    } else if (seenEmails.has(email)) {
      duplicateEmails.add(email);
      rowIssues.push("duplicate_email");
      blockers.push(
        buildBlocker(
          "DUPLICATE_EMAIL",
          "P0",
          "The same tester email appears more than once.",
          row.__rowNumber
        )
      );
    } else {
      seenEmails.add(email);
    }

    if (allowlistStatus !== "allowlisted") {
      rowIssues.push("not_allowlisted");
      blockers.push(
        buildBlocker(
          "TESTER_NOT_ALLOWLISTED",
          "P0",
          "Every intended Cohort 1 invite recipient must be allowlisted before launch proof can pass.",
          row.__rowNumber
        )
      );
    }

    if (isPlaceholder(invitationProof)) {
      rowIssues.push("missing_invitation_sent_proof");
      blockers.push(
        buildBlocker(
          "MISSING_INVITATION_SENT_PROOF",
          "P0",
          "Invitation delivery proof is blank, placeholder, or manual-verify.",
          row.__rowNumber
        )
      );
    }

    for (const [field, code] of [
      ["tester_alias", "MISSING_TESTER_ALIAS"],
      ["dog_name", "MISSING_DOG_NAME"],
      ["dog_age", "MISSING_DOG_AGE"],
      ["dog_breed_size", "MISSING_DOG_BREED_SIZE"],
      ["device_browser", "MISSING_DEVICE_BROWSER"],
    ]) {
      if (isPlaceholder(row[field])) {
        rowIssues.push(code.toLowerCase());
        blockers.push(
          buildBlocker(
            code,
            "P1",
            `${field} is missing or placeholder.`,
            row.__rowNumber
          )
        );
      }
    }

    rowSummaries.push({
      rowNumber: row.__rowNumber,
      emailHash: looksLikeEmail(email) ? hashEmail(email) : null,
      maskedEmail: looksLikeEmail(email) ? maskEmail(email) : null,
      allowlistStatus,
      invitationProofPresent: !isPlaceholder(invitationProof),
      consentStatus: consentStatus || "missing",
      firstLoginCaptured: !isPlaceholder(row.first_login_timestamp),
      firstSymptomCheckCaptured: !isPlaceholder(row.first_symptom_check_timestamp),
      feedbackSubmitted: lower(row.feedback_submitted) === "yes",
      deletionRequested: deletionRequested === "yes",
      accessDisabled: accessDisabled === "yes",
      rowIssues,
    });
  }

  if (exampleRows > 0) {
    blockers.push(
      buildBlocker(
        "PLACEHOLDER_ROWS_PRESENT",
        "P1",
        `${exampleRows} example/template row(s) are present and are not invite proof.`
      )
    );
  }

  if (realRows.length === 0) {
    blockers.push(
      buildBlocker(
        "NO_INTENDED_TESTERS",
        "P0",
        "No real intended Cohort 1 tester rows are present."
      )
    );
  }

  if (realRows.length > FIRST_COHORT_MAX) {
    blockers.push(
      buildBlocker(
        "FIRST_COHORT_CAP_EXCEEDED",
        "P0",
        `Initial Cohort 1 launch is capped at ${FIRST_COHORT_MAX} testers; registry has ${realRows.length}.`
      )
    );
  }

  const p0Blockers = blockers.filter((blocker) => blocker.severity === "P0");
  const rowsWithProof = rowSummaries.filter(
    (row) =>
      row.allowlistStatus === "allowlisted" && row.invitationProofPresent
  ).length;
  const inviteSendProofDecision =
    p0Blockers.length === 0 && realRows.length > 0
      ? "GO_REVIEW_ONLY"
      : "HOLD";

  return {
    ticket: "VET-1582C",
    mode: "cohort1-invite-send-proof-readout",
    generatedAt: now.toISOString(),
    source: {
      registryPath: inputPath,
      redacted: true,
      maxInitialCohortSize: FIRST_COHORT_MAX,
      requiredColumns: REQUIRED_COLUMNS,
      missingColumns,
    },
    decision: {
      inviteSendProof: inviteSendProofDecision,
      cohortLaunchExecution: "HOLD",
      publicBeta: "HOLD",
      reason:
        inviteSendProofDecision === "GO_REVIEW_ONLY"
          ? "The registry contains real intended tester rows with allowlist status and invitation-send proof. This validates invite proof only; full tester-flow evidence is still required separately."
          : "The registry does not yet contain sufficient real invitation-send proof for the intended private-tester cohort.",
    },
    summary: {
      registryRowCount: rows.length,
      exampleRowCount: exampleRows,
      intendedTesterCount: realRows.length,
      rowsWithInvitationProof: rowsWithProof,
      duplicateEmailCount: duplicateEmails.size,
      p0BlockerCount: p0Blockers.length,
      blockerCount: blockers.length,
    },
    rowSummaries,
    blockers,
    requiredNextActions: [
      "Replace template/example rows with the intended private-tester cohort only.",
      "Keep the initial Cohort 1 invite set at 5 testers or fewer.",
      "Record real invitation delivery proof per tester, such as timestamp plus channel/provider/message reference.",
      "Keep allowlist status separate from invitation-send proof.",
      "After testers run the flow, update first login, symptom-check, report, History, feedback, deletion, and access-disable fields from evidence.",
      "Do not mark Cohort 1 launch execution GO until full tester-flow and monitoring evidence exists.",
    ],
    guardrails: [
      "This readout does not send invitations.",
      "This readout does not mutate Vercel env, Supabase schema, model flags, provider routing, or clinical logic.",
      "Raw tester emails are not emitted; row summaries use masked email plus SHA-256 hash.",
      "Allowlisted tester count is not invitation-send proof.",
    ],
  };
}

function renderMarkdown(readout) {
  const blockerLines =
    readout.blockers.length === 0
      ? "- None for invite-send proof. Full Cohort 1 flow evidence is still separate."
      : readout.blockers
          .map((blocker) => {
            const row = blocker.rowNumber ? ` row ${blocker.rowNumber}:` : "";
            return `- ${blocker.severity} ${blocker.code}${row} ${blocker.detail}`;
          })
          .join("\n");

  const rowLines =
    readout.rowSummaries.length === 0
      ? "- No real tester rows present."
      : readout.rowSummaries
          .map(
            (row) =>
              `- Row ${row.rowNumber}: ${row.maskedEmail ?? "invalid-email"} hash=${row.emailHash ?? "n/a"} allowlist=${row.allowlistStatus || "missing"} inviteProof=${row.invitationProofPresent ? "present" : "missing"}`
          )
          .join("\n");

  return `# VET-1582C - Cohort 1 Invite-Send Proof Readout

Generated: ${readout.generatedAt}

## Decision

| Lane | Decision | Evidence |
|---|---|---|
| Invite-send proof | ${readout.decision.inviteSendProof} | ${readout.decision.reason} |
| Cohort 1 launch execution | ${readout.decision.cohortLaunchExecution} | Full tester-flow evidence, monitoring window, and readout counts are required separately. |
| Public beta | ${readout.decision.publicBeta} | Public beta remains blocked until Cohort 1, privacy/support, product-intelligence, model, monitoring, rollback, and PR gates pass. |

## Summary

- Registry path: \`${readout.source.registryPath}\`
- Registry rows: ${readout.summary.registryRowCount}
- Example/template rows ignored: ${readout.summary.exampleRowCount}
- Intended tester rows: ${readout.summary.intendedTesterCount}
- Rows with invitation proof: ${readout.summary.rowsWithInvitationProof}
- P0 blockers: ${readout.summary.p0BlockerCount}
- Total blockers: ${readout.summary.blockerCount}

## Redacted Rows

${rowLines}

## Blockers

${blockerLines}

## Required Next Actions

${readout.requiredNextActions.map((action) => `- ${action}`).join("\n")}

## Guardrails

${readout.guardrails.map((guardrail) => `- ${guardrail}`).join("\n")}

Verdict: invite-send proof ${readout.decision.inviteSendProof}; Cohort 1 launch execution HOLD.
`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(options.input);
  const csvContent = fs.readFileSync(inputPath, "utf8");
  const readout = analyzeRegistry(options.input, csvContent);

  if (options.write) {
    fs.mkdirSync(path.dirname(options.jsonOut), { recursive: true });
    fs.writeFileSync(options.jsonOut, `${JSON.stringify(readout, null, 2)}\n`);
    fs.writeFileSync(options.markdownOut, renderMarkdown(readout));
  }

  process.stdout.write(`${JSON.stringify(readout, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export { analyzeRegistry, parseCsv, renderMarkdown };
