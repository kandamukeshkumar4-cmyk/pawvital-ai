#!/usr/bin/env node

/**
 * Miss-to-Ticket Workflow for VET-923
 *
 * Takes review queue entry, generates ticket description
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = process.cwd();
const QUEUE_FILE = path.join(ROOT_DIR, "data", "benchmarks", "dog-triage", "review-queue.json");
const OUTPUT_FILE = path.join(ROOT_DIR, "data", "benchmarks", "dog-triage", "miss-tickets.jsonl");
const TEMPLATE_FILE = path.join(ROOT_DIR, "data", "benchmarks", "dog-triage", "miss-ticket-template.md");

function main() {
  console.log("Miss-to-Ticket Workflow for VET-923");
  console.log("=" .repeat(60));

  // Generate template
  const template = `# Miss-to-Ticket Template

## Ticket Format
\`VET-XXX: [failure_type] in [complaint_family] — [details]\`

## Required Fields
- **Benchmark Case Reference**: case_id from benchmark suite
- **Actual Behavior**: what the system did
- **Expected Behavior**: what the system should have done
- **Suggested Fix Area**: which file/module likely needs changes
- **Severity**: emergency_miss (critical) | other (high/medium/low)

## Example
\`VET-950: emergency_miss in difficulty_breathing — blue gums not triggering escalation\`

- Benchmark Case: emergency-blue-gums-breathing
- Actual: Asked follow-up questions instead of escalating
- Expected: Immediate emergency disposition
- Suggested Fix: src/lib/triage-engine.ts emergency screen logic
- Severity: critical
`;

  fs.writeFileSync(TEMPLATE_FILE, template, "utf8");
  console.log(`Template written to: ${TEMPLATE_FILE}`);

  // Create empty miss-tickets file
  fs.writeFileSync(OUTPUT_FILE, "", "utf8");
  console.log(`Miss tickets file created: ${OUTPUT_FILE}`);
  console.log("\nWorkflow ready - will populate after silent trial runs");
}

main();
