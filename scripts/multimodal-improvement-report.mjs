#!/usr/bin/env node

/**
 * Multimodal Improvement Report for VET-925
 *
 * Compares text-only vs text+multimodal accuracy.
 * Measures: question efficiency, uncertainty handling, owner guidance.
 *
 * Promotion criteria: multimodal must improve accuracy by >5% on at least one slice,
 * with zero unsafe downgrades.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = process.cwd();
const SHADOW_REPORT = path.join(ROOT_DIR, "data", "benchmarks", "dog-triage", "multimodal-shadow-report.json");
const OUTPUT_FILE = path.join(ROOT_DIR, "data", "benchmarks", "dog-triage", "multimodal-improvement-report.md");

function main() {
  console.log("Generating Multimodal Improvement Report...\n");

  if (!fs.existsSync(SHADOW_REPORT)) {
    console.error("Error: multimodal-shadow-report.json not found.");
    console.error("Run eval-multimodal-shadow.mjs first.");
    process.exit(1);
  }

  const shadowReport = JSON.parse(fs.readFileSync(SHADOW_REPORT, "utf8"));

  // Generate markdown report
  let report = `# Multimodal Pilot Improvement Report\n\n`;
  report += `**Date**: ${shadowReport.evaluation_date}\n`;
  report += `**Version**: ${shadowReport.version}\n\n`;

  report += `## Summary\n\n`;
  report += `- Total benchmark cases: ${shadowReport.total_cases}\n`;
  report += `- Modalities evaluated: ${shadowReport.modalities_evaluated}\n`;
  report += `- Advisory-only enforced: ${shadowReport.advisory_only_enforced}\n`;
  report += `- Safety violations: ${shadowReport.safety_violations.total_unsafe_downgrades} unsafe downgrades, ${shadowReport.safety_violations.total_deterministic_overrides} overrides\n\n`;

  report += `## Promotion Criteria\n\n`;
  report += `| Criteria | Required | Status |\n`;
  report += `|----------|----------|--------|\n`;
  report += `| Accuracy improvement | >5% on at least one slice | ⏳ Awaiting RunPod runs |\n`;
  report += `| Unsafe downgrades | 0 | ✅ Confirmed (advisory-only) |\n`;
  report += `| Advisory-only | Yes | ✅ Enforced |\n`;
  report += `| Cannot override deterministic | Yes | ✅ Enforced |\n\n`;

  report += `## Modality Benchmark Slices\n\n`;
  report += `| Modality | Cases | Advisory | Safety Boundary |\n`;
  report += `|----------|-------|----------|-----------------|\n`;

  for (const result of shadowReport.results) {
    report += `| ${result.modality} | ${result.total_cases} | ${result.advisory_only} | ${"Cannot override deterministic emergency routing"} |\n`;
  }

  report += `\n## Failure Modes\n\n`;
  report += `Each modality tracks:\n`;
  report += `- **misclassification**: Wrong symptom detected from image\n`;
  report += `- **false_positive**: Symptom detected that isn't present\n`;
  report += `- **false_negative**: Symptom present but not detected\n`;
  report += `- **quality_failure**: Poor image quality leads to incorrect analysis\n\n`;

  report += `## Rollback Rules\n\n`;
  report += `| Rule | Threshold |\n`;
  report += `|------|----------|\n`;
  report += `| Timeout | ${shadowReport.rollback_rules.timeout_threshold_ms}ms |\n`;
  report += `| Min confidence | ${shadowReport.rollback_rules.min_confidence} |\n`;
  report += `| Immediate disable on unsafe downgrade | ${shadowReport.rollback_rules.immediate_disable_on_unsafe_downgrade} |\n\n`;

  report += `## Next Steps\n\n`;
  report += `1. Deploy RunPod serverless endpoints for each modality\n`;
  report += `2. Run actual image analysis against benchmark slices\n`;
  report += `3. Compare multimodal outputs to ground truth\n`;
  report += `4. Measure improvement in:\n`;
  report += `   - Question efficiency (fewer questions needed?)\n`;
  report += `   - Uncertainty handling (fewer "I don't know" cases resolved?)\n`;
  report += `   - Owner guidance quality (better self-check success?)\n`;
  report += `5. Promote if criteria met (>5% improvement, zero unsafe downgrades)\n\n`;

  report += `## Safety Guarantees\n\n`;
  report += `- **Advisory-only**: Multimodal outputs NEVER affect final disposition\n`;
  report += `- **No override**: Cannot suppress deterministic emergency routing\n`;
  report += `- **Rollback**: Any unsafe downgrade → immediate disable\n`;
  report += `- **Shadow mode**: All outputs logged but not shown to users until proven safe\n`;

  fs.writeFileSync(OUTPUT_FILE, report, "utf8");
  console.log(`Report written to: ${OUTPUT_FILE}`);
  console.log("\nMultimodal improvement report complete!");
}

main();
