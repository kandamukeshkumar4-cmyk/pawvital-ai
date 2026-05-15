#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_READOUT_URL =
  "https://pawvital-ai.vercel.app/api/ai/shadow-rollout";
const DEFAULT_NOT_BEFORE = "2026-05-17T03:06:00Z";
const DEFAULT_WINDOW_END = "2026-05-18T03:06:00Z";
const DEFAULT_JSON_OUTPUT =
  "data/shadow-readout/vet-1492c-scheduled-readout.json";
const DEFAULT_MARKDOWN_OUTPUT =
  "data/shadow-readout/vet-1492c-scheduled-readout.md";

function parseBoolean(value) {
  return value === "1" || value === "true" || value === "yes";
}

function parseDate(value, label) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} is not a valid ISO date: ${value}`);
  }
  return date;
}

function sanitizeForLogs(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/[A-Za-z0-9_-]{32,}/g, "[redacted-token]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]");
}

function summarizePayload(payload) {
  const baseline = payload?.baseline ?? {};
  const summary = payload?.summary ?? {};
  const serviceMetrics = Array.isArray(baseline.serviceMetrics)
    ? baseline.serviceMetrics.map((service) => ({
        service: service.service,
        observations: service.observations ?? service.totalObservations ?? 0,
        shadowComparisons:
          service.shadowComparisons ?? service.shadowComparisonCount ?? 0,
        errors: service.errors ?? service.errorObservations ?? 0,
        timeouts: service.timeouts ?? service.timeoutObservations ?? 0,
      }))
    : [];

  return {
    ok: payload?.ok === true,
    overallStatus: summary.overallStatus ?? null,
    reportCount: Number(baseline.reportCount ?? 0),
    parsedReportCount: Number(baseline.parsedReportCount ?? 0),
    malformedReportCount: Number(baseline.malformedReportCount ?? 0),
    observationCount: Number(baseline.observationCount ?? 0),
    shadowComparisonCount: Number(baseline.shadowComparisonCount ?? 0),
    warning: baseline.warning ?? null,
    serviceMetrics,
  };
}

function decideStatus(readout) {
  if (readout.warning) {
    return {
      status: "readout_warning",
      decision: "HOLD - telemetry readout returned a warning",
    };
  }

  if (readout.reportCount > 0 || readout.observationCount > 0) {
    return {
      status: "ready_for_formal_readout",
      decision: "RUN FORMAL VET-1492C RERUN",
    };
  }

  return {
    status: "healthy_empty_readout",
    decision: "HOLD - no completed production sessions found yet",
  };
}

function toMarkdown(report) {
  const readout = report.readout ?? {};
  const lines = [
    "# VET-1492C Scheduled Shadow Readout",
    "",
    `- generated_at: ${report.generatedAt}`,
    `- status: ${report.status}`,
    `- decision: ${report.decision}`,
    `- due: ${report.due}`,
    `- not_before: ${report.notBefore}`,
    `- window_end: ${report.windowEnd}`,
    `- url: ${report.url}`,
    "",
    "## Readout",
    "",
    `- ok: ${readout.ok ?? "n/a"}`,
    `- overall_status: ${readout.overallStatus ?? "n/a"}`,
    `- report_count: ${readout.reportCount ?? "n/a"}`,
    `- parsed_report_count: ${readout.parsedReportCount ?? "n/a"}`,
    `- malformed_report_count: ${readout.malformedReportCount ?? "n/a"}`,
    `- observation_count: ${readout.observationCount ?? "n/a"}`,
    `- shadow_comparison_count: ${readout.shadowComparisonCount ?? "n/a"}`,
    `- warning: ${readout.warning ?? "null"}`,
    "",
    "## Next Action",
    "",
    report.nextAction,
    "",
    "## Safety",
    "",
    "- This automation only reads production shadow telemetry.",
    "- It does not promote model flags.",
    "- It does not change Vercel environment variables.",
    "- It does not generate production traffic.",
    "- It does not print secret values.",
  ];

  if (Array.isArray(readout.serviceMetrics) && readout.serviceMetrics.length > 0) {
    lines.push("", "## Service Metrics", "");
    for (const service of readout.serviceMetrics) {
      lines.push(
        `- ${service.service}: observations=${service.observations}, shadow_comparisons=${service.shadowComparisons}, errors=${service.errors}, timeouts=${service.timeouts}`
      );
    }
  }

  if (report.error) {
    lines.push("", "## Error", "", sanitizeForLogs(report.error));
  }

  return `${lines.join("\n")}\n`;
}

async function writeFileEnsuringDir(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

async function appendGithubOutput(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  const content = Object.entries(values)
    .map(([key, value]) => `${key}=${String(value).replace(/\r?\n/g, " ")}`)
    .join("\n");
  await fs.appendFile(process.env.GITHUB_OUTPUT, `${content}\n`, "utf8");
}

async function appendStepSummary(markdown) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, markdown, "utf8");
}

async function fetchReadout(url, secret) {
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${secret}`,
      accept: "application/json",
    },
  });

  const body = await response.text();
  if (!response.ok) {
    const excerpt = sanitizeForLogs(body.slice(0, 300));
    throw new Error(`HTTP ${response.status}: ${excerpt}`);
  }

  return JSON.parse(body);
}

async function main() {
  const url = process.env.SHADOW_READOUT_URL ?? DEFAULT_READOUT_URL;
  const notBefore = parseDate(
    process.env.SHADOW_READOUT_NOT_BEFORE ?? DEFAULT_NOT_BEFORE,
    "SHADOW_READOUT_NOT_BEFORE"
  );
  const windowEnd = parseDate(
    process.env.SHADOW_READOUT_WINDOW_END ?? DEFAULT_WINDOW_END,
    "SHADOW_READOUT_WINDOW_END"
  );
  const now = parseDate(
    process.env.SHADOW_READOUT_NOW ?? new Date().toISOString(),
    "SHADOW_READOUT_NOW"
  );
  const force = parseBoolean(process.env.SHADOW_READOUT_FORCE);
  const dryRun = parseBoolean(process.env.SHADOW_READOUT_DRY_RUN);
  const secret = process.env.SHADOW_ROLLOUT_SECRET;
  const jsonOutput = process.env.SHADOW_READOUT_OUTPUT ?? DEFAULT_JSON_OUTPUT;
  const markdownOutput =
    process.env.SHADOW_READOUT_MARKDOWN_OUTPUT ?? DEFAULT_MARKDOWN_OUTPUT;
  const due = force || now >= notBefore;

  let report = {
    generatedAt: now.toISOString(),
    status: "not_due",
    decision: "HOLD - scheduled readout window has not opened",
    due,
    notBefore: notBefore.toISOString(),
    windowEnd: windowEnd.toISOString(),
    url,
    nextAction:
      "Wait until the configured readout window opens, then run the scheduled readout again.",
    readout: null,
  };

  if (!due) {
    // Keep default report.
  } else if (!secret && !dryRun) {
    report = {
      ...report,
      status: "blocked_missing_secret",
      decision: "HOLD - shadow readout secret is not configured",
      nextAction:
        "Configure HF_SIDECAR_API_KEY or ASYNC_REVIEW_WEBHOOK_SECRET as a GitHub secret, then rerun this workflow.",
    };
  } else if (dryRun) {
    report = {
      ...report,
      status: "dry_run_due",
      decision: "DRY RUN - readout window is due",
      nextAction:
        "Dry run only. Dispatch without SHADOW_READOUT_DRY_RUN after the production secret is available.",
      readout: {
        ok: true,
        overallStatus: "dry_run",
        reportCount: 0,
        parsedReportCount: 0,
        malformedReportCount: 0,
        observationCount: 0,
        shadowComparisonCount: 0,
        warning: null,
        serviceMetrics: [],
      },
    };
  } else {
    try {
      const payload = await fetchReadout(url, secret);
      const readout = summarizePayload(payload);
      const decision = decideStatus(readout);
      report = {
        ...report,
        ...decision,
        readout,
        nextAction:
          decision.status === "ready_for_formal_readout"
            ? "Start the formal VET-1492C rerun against this production window before any model promotion."
            : "Keep flags in shadow/off and continue collecting invited tester sessions.",
      };
    } catch (error) {
      report = {
        ...report,
        status: "fetch_failed",
        decision: "HOLD - production shadow readout request failed",
        nextAction:
          "Inspect the production readout endpoint and rerun after the endpoint returns HTTP 200.",
        error: sanitizeForLogs(error instanceof Error ? error.message : String(error)),
      };
    }
  }

  const markdown = toMarkdown(report);
  await writeFileEnsuringDir(jsonOutput, `${JSON.stringify(report, null, 2)}\n`);
  await writeFileEnsuringDir(markdownOutput, markdown);
  await appendGithubOutput({
    due: report.due,
    readout_status: report.status,
    report_count: report.readout?.reportCount ?? 0,
    warning_present: Boolean(report.readout?.warning),
    issue_title: `VET-1492C shadow readout due - ${report.notBefore.slice(
      0,
      10
    )}`,
    json_path: jsonOutput,
    markdown_path: markdownOutput,
  });
  await appendStepSummary(markdown);

  console.log(
    JSON.stringify(
      {
        status: report.status,
        due: report.due,
        decision: report.decision,
        reportCount: report.readout?.reportCount ?? 0,
        warning: report.readout?.warning ?? null,
        jsonOutput,
        markdownOutput,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(sanitizeForLogs(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
