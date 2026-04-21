#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { buildThresholdProposalDraft } from "../src/lib/threshold-proposals";
import { extractHistoricalOutcomeFeedback } from "../src/lib/outcome-feedback-backfill";
import type { OutcomeFeedbackInput } from "../src/lib/report-storage";

const rootDir = process.cwd();
const defaultCheckpointPath = path.join(
  rootDir,
  "tmp",
  "outcome-feedback-backfill.checkpoint.json"
);
const defaultRollbackManifestPath = path.join(
  rootDir,
  "tmp",
  "outcome-feedback-backfill.rollback.json"
);

interface BackfillOptions {
  batchSize: number;
  checkpointPath: string;
  dryRun: boolean;
  resetCheckpoint: boolean;
  resume: boolean;
  resumeFrom: number | null;
  rollbackFrom: string | null;
  rollbackManifestPath: string;
}

interface BackfillCheckpoint {
  completedBatchKeys: string[];
  offset: number;
  rollbackManifestPath: string;
  runId: string;
  stage: "scan" | "done";
  stats: {
    insertedEntries: number;
    insertedProposals: number;
    parseErrors: number;
    scanned: number;
    skippedExistingEntries: number;
    skippedExistingProposals: number;
    skippedNoFeedback: number;
  };
}

interface RollbackManifest {
  createdAt: string;
  outcomeFeedbackEntryIds: string[];
  runId: string;
  symptomCheckIds: string[];
  thresholdProposalIds: string[];
}

interface SymptomCheckRow {
  ai_response: string | null;
  created_at: string | null;
  outcome_feedback_entry_id: string | null;
  recommendation: string | null;
  severity: string | null;
  symptoms: string | null;
  symptom_check_id: string;
  threshold_proposal_id: string | null;
}

function toDraftFeedback(
  feedback: NonNullable<ReturnType<typeof extractHistoricalOutcomeFeedback>>["feedback"]
): OutcomeFeedbackInput {
  return {
    ...feedback,
    // Historical ai_response feedback does not preserve authenticated owner
    // context. The draft builder only reads the clinical mismatch fields.
    requestingUserId: "00000000-0000-0000-0000-000000000000",
  };
}

function loadEnvFiles() {
  for (const relativePath of [".env.sidecars", ".env.local", ".env"]) {
    const fullPath = path.join(rootDir, relativePath);
    if (!fs.existsSync(fullPath)) continue;

    for (const line of fs.readFileSync(fullPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function parseArgs(argv: string[]): BackfillOptions {
  const options: BackfillOptions = {
    batchSize: 100,
    checkpointPath: defaultCheckpointPath,
    dryRun: argv.includes("--dry-run"),
    resetCheckpoint: argv.includes("--reset-checkpoint"),
    resume: argv.includes("--resume"),
    resumeFrom: null,
    rollbackFrom: null,
    rollbackManifestPath: defaultRollbackManifestPath,
  };

  for (const arg of argv) {
    if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    } else if (arg.startsWith("--checkpoint=")) {
      options.checkpointPath = path.resolve(
        rootDir,
        arg.slice("--checkpoint=".length)
      );
    } else if (arg.startsWith("--resume-from=")) {
      options.resumeFrom = Number(arg.slice("--resume-from=".length));
    } else if (arg.startsWith("--rollback-manifest=")) {
      options.rollbackManifestPath = path.resolve(
        rootDir,
        arg.slice("--rollback-manifest=".length)
      );
    } else if (arg.startsWith("--rollback-from=")) {
      options.rollbackFrom = path.resolve(
        rootDir,
        arg.slice("--rollback-from=".length)
      );
    }
  }

  return options;
}

function createEmptyCheckpoint(options: BackfillOptions): BackfillCheckpoint {
  return {
    completedBatchKeys: [],
    offset: 0,
    rollbackManifestPath: options.rollbackManifestPath,
    runId: randomUUID(),
    stage: "scan",
    stats: {
      insertedEntries: 0,
      insertedProposals: 0,
      parseErrors: 0,
      scanned: 0,
      skippedExistingEntries: 0,
      skippedExistingProposals: 0,
      skippedNoFeedback: 0,
    },
  };
}

function readCheckpoint(
  checkpointPath: string,
  options: BackfillOptions
): BackfillCheckpoint {
  if (!fs.existsSync(checkpointPath)) {
    return createEmptyCheckpoint(options);
  }

  const parsed = JSON.parse(fs.readFileSync(checkpointPath, "utf8")) as BackfillCheckpoint;
  return {
    ...createEmptyCheckpoint(options),
    ...parsed,
    completedBatchKeys: Array.isArray(parsed.completedBatchKeys)
      ? parsed.completedBatchKeys
      : [],
    rollbackManifestPath:
      typeof parsed.rollbackManifestPath === "string" &&
      parsed.rollbackManifestPath.trim()
        ? parsed.rollbackManifestPath
        : options.rollbackManifestPath,
    runId:
      typeof parsed.runId === "string" && parsed.runId.trim()
        ? parsed.runId
        : randomUUID(),
  };
}

function writeCheckpoint(checkpointPath: string, checkpoint: BackfillCheckpoint) {
  ensureDir(path.dirname(checkpointPath));
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2) + "\n");
}

function readRollbackManifest(manifestPath: string, runId: string): RollbackManifest {
  if (!fs.existsSync(manifestPath)) {
    return {
      createdAt: new Date().toISOString(),
      outcomeFeedbackEntryIds: [],
      runId,
      symptomCheckIds: [],
      thresholdProposalIds: [],
    };
  }

  const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as RollbackManifest;
  return {
    createdAt:
      typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString(),
    outcomeFeedbackEntryIds: Array.isArray(parsed.outcomeFeedbackEntryIds)
      ? parsed.outcomeFeedbackEntryIds
      : [],
    runId: typeof parsed.runId === "string" ? parsed.runId : runId,
    symptomCheckIds: Array.isArray(parsed.symptomCheckIds) ? parsed.symptomCheckIds : [],
    thresholdProposalIds: Array.isArray(parsed.thresholdProposalIds)
      ? parsed.thresholdProposalIds
      : [],
  };
}

function writeRollbackManifest(
  manifestPath: string,
  manifest: RollbackManifest
) {
  ensureDir(path.dirname(manifestPath));
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

function toUniqueList(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

async function fetchBackfillBatch(
  pool: Pool,
  offset: number,
  batchSize: number
): Promise<SymptomCheckRow[]> {
  const result = await pool.query<SymptomCheckRow>(
    `select
        sc.id as symptom_check_id,
        sc.ai_response,
        sc.created_at,
        sc.recommendation,
        sc.severity,
        sc.symptoms,
        (
          select ofe.id
          from public.outcome_feedback_entries ofe
          where ofe.symptom_check_id = sc.id
          order by ofe.submitted_at desc, ofe.id desc
          limit 1
        ) as outcome_feedback_entry_id,
        (
          select tp.id
          from public.threshold_proposals tp
          where tp.symptom_check_id = sc.id
          order by tp.created_at desc, tp.id desc
          limit 1
        ) as threshold_proposal_id
      from public.symptom_checks sc
      where sc.ai_response is not null
        and (
          position('outcome_feedback' in sc.ai_response) > 0
          or position('outcomeFeedback' in sc.ai_response) > 0
        )
      order by sc.created_at asc, sc.id asc
      offset $1
      limit $2`,
    [offset, batchSize]
  );

  return result.rows;
}

async function insertOutcomeFeedbackEntry(
  pool: Pool,
  row: SymptomCheckRow,
  historical: ReturnType<typeof extractHistoricalOutcomeFeedback>,
  runId: string,
  dryRun: boolean
) {
  if (!historical) {
    return null;
  }

  if (dryRun) {
    return `dry-run-entry-${row.symptom_check_id}`;
  }

  const result = await pool.query<{ id: string }>(
    `insert into public.outcome_feedback_entries (
        symptom_check_id,
        matched_expectation,
        confirmed_diagnosis,
        vet_outcome,
        owner_notes,
        symptom_summary,
        report_title,
        report_severity,
        report_recommendation,
        report_snapshot,
        feedback_source,
        submitted_at
      ) values (
        $1::uuid,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10::jsonb,
        $11,
        $12::timestamptz
      )
      returning id`,
    [
      row.symptom_check_id,
      historical.feedback.matchedExpectation,
      historical.feedback.confirmedDiagnosis || null,
      historical.feedback.vetOutcome || null,
      historical.feedback.ownerNotes || null,
      row.symptoms || null,
      typeof historical.report.title === "string" ? historical.report.title : null,
      row.severity || null,
      row.recommendation || null,
      JSON.stringify({
        ...historical.reportRecord,
        backfill_metadata: {
          migrated_from: "symptom_checks.ai_response.outcome_feedback",
          migrated_run_id: runId,
        },
      }),
      "historical_backfill",
      historical.submittedAt,
    ]
  );

  return result.rows[0]?.id || null;
}

async function insertThresholdProposal(
  pool: Pool,
  row: SymptomCheckRow,
  historical: ReturnType<typeof extractHistoricalOutcomeFeedback>,
  outcomeFeedbackId: string | null,
  runId: string,
  dryRun: boolean
) {
  if (!historical || !outcomeFeedbackId) {
    return null;
  }

  const proposal = buildThresholdProposalDraft({
    feedback: toDraftFeedback(historical.feedback),
    report: historical.report,
    symptomSummary: row.symptoms || "unknown",
  });

  if (!proposal) {
    return null;
  }

  if (dryRun) {
    return `dry-run-proposal-${row.symptom_check_id}`;
  }

  const result = await pool.query<{ id: string }>(
    `insert into public.threshold_proposals (
        outcome_feedback_id,
        symptom_check_id,
        proposal_type,
        status,
        summary,
        rationale,
        reviewer_notes,
        payload
      ) values (
        $1::uuid,
        $2::uuid,
        $3,
        'draft',
        $4,
        $5,
        $6,
        $7::jsonb
      )
      returning id`,
    [
      outcomeFeedbackId,
      row.symptom_check_id,
      proposal.proposalType,
      proposal.summary,
      proposal.rationale,
      "Historical backfill draft from legacy owner outcome feedback.",
      JSON.stringify({
        ...proposal.payload,
        backfill: {
          migratedAt: new Date().toISOString(),
          migratedFrom: "symptom_checks.ai_response.outcome_feedback",
          runId,
        },
      }),
    ]
  );

  return result.rows[0]?.id || null;
}

async function rollbackFromManifest(
  pool: Pool,
  manifestPath: string,
  dryRun: boolean
) {
  const manifest = readRollbackManifest(manifestPath, "manual-rollback");
  const proposalIds = toUniqueList(manifest.thresholdProposalIds);
  const entryIds = toUniqueList(manifest.outcomeFeedbackEntryIds);

  if (dryRun) {
    console.log(
      `[dry-run] would delete ${proposalIds.length} threshold proposals and ${entryIds.length} outcome feedback entries from ${manifestPath}`
    );
    return;
  }

  if (proposalIds.length > 0) {
    await pool.query(
      "delete from public.threshold_proposals where id = any($1::uuid[])",
      [proposalIds]
    );
  }

  if (entryIds.length > 0) {
    await pool.query(
      "delete from public.outcome_feedback_entries where id = any($1::uuid[])",
      [entryIds]
    );
  }

  console.log(
    `Rolled back ${proposalIds.length} threshold proposals and ${entryIds.length} outcome feedback entries from ${manifestPath}`
  );
}

function createPool(databaseUrl: string) {
  return new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("supabase.co")
      ? { rejectUnauthorized: false }
      : undefined,
    max: 2,
  });
}

async function main() {
  loadEnvFiles();
  const options = parseArgs(process.argv.slice(2));
  const databaseUrl = (process.env.DATABASE_URL || "").trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for historical outcome feedback backfill");
  }

  if (options.resetCheckpoint && fs.existsSync(options.checkpointPath)) {
    fs.unlinkSync(options.checkpointPath);
  }

  const pool = createPool(databaseUrl);

  try {
    if (options.rollbackFrom) {
      await rollbackFromManifest(pool, options.rollbackFrom, options.dryRun);
      return;
    }

    const checkpoint =
      options.resume || options.resumeFrom !== null
        ? readCheckpoint(options.checkpointPath, options)
        : createEmptyCheckpoint(options);

    if (options.resumeFrom !== null) {
      checkpoint.offset = Math.max(0, options.resumeFrom);
      checkpoint.stage = "scan";
    }

    const rollbackManifest = readRollbackManifest(
      checkpoint.rollbackManifestPath,
      checkpoint.runId
    );

    while (checkpoint.stage === "scan") {
      const rows = await fetchBackfillBatch(
        pool,
        checkpoint.offset,
        options.batchSize
      );

      if (rows.length === 0) {
        checkpoint.stage = "done";
        writeCheckpoint(options.checkpointPath, checkpoint);
        break;
      }

      const batchKey = `scan:${checkpoint.offset}:${rows.length}`;
      if (checkpoint.completedBatchKeys.includes(batchKey)) {
        checkpoint.offset += rows.length;
        writeCheckpoint(options.checkpointPath, checkpoint);
        continue;
      }

      for (const row of rows) {
        checkpoint.stats.scanned += 1;

        const historical = extractHistoricalOutcomeFeedback(
          row.symptom_check_id,
          row.ai_response
        );

        if (!historical) {
          checkpoint.stats.parseErrors += 1;
          continue;
        }

        let outcomeFeedbackId = row.outcome_feedback_entry_id;
        if (outcomeFeedbackId) {
          checkpoint.stats.skippedExistingEntries += 1;
        } else {
          outcomeFeedbackId = await insertOutcomeFeedbackEntry(
            pool,
            row,
            historical,
            checkpoint.runId,
            options.dryRun
          );

          if (!outcomeFeedbackId) {
            checkpoint.stats.skippedNoFeedback += 1;
            continue;
          }

          checkpoint.stats.insertedEntries += 1;
          if (!options.dryRun) {
            rollbackManifest.outcomeFeedbackEntryIds.push(outcomeFeedbackId);
          }
        }

        const proposal = buildThresholdProposalDraft({
          feedback: toDraftFeedback(historical.feedback),
          report: historical.report,
          symptomSummary: row.symptoms || "unknown",
        });

        if (!proposal) {
          continue;
        }

        if (row.threshold_proposal_id) {
          checkpoint.stats.skippedExistingProposals += 1;
          continue;
        }

        const thresholdProposalId = await insertThresholdProposal(
          pool,
          row,
          historical,
          outcomeFeedbackId,
          checkpoint.runId,
          options.dryRun
        );

        if (!thresholdProposalId) {
          continue;
        }

        checkpoint.stats.insertedProposals += 1;
        if (!options.dryRun) {
          rollbackManifest.thresholdProposalIds.push(thresholdProposalId);
        }
      }

      checkpoint.offset += rows.length;
      checkpoint.completedBatchKeys = [
        ...checkpoint.completedBatchKeys,
        batchKey,
      ].slice(-50);
      rollbackManifest.symptomCheckIds = toUniqueList([
        ...rollbackManifest.symptomCheckIds,
        ...rows.map((row) => row.symptom_check_id),
      ]);

      if (!options.dryRun) {
        writeRollbackManifest(checkpoint.rollbackManifestPath, rollbackManifest);
      }
      writeCheckpoint(options.checkpointPath, checkpoint);
      console.log(
        `Processed historical outcome feedback batch ${batchKey} (entries: ${checkpoint.stats.insertedEntries}, proposals: ${checkpoint.stats.insertedProposals})`
      );
    }

    console.log(
      JSON.stringify(
        {
          checkpoint: options.checkpointPath,
          dryRun: options.dryRun,
          rollbackManifest: checkpoint.rollbackManifestPath,
          stats: checkpoint.stats,
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
