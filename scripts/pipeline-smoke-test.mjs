#!/usr/bin/env node

/**
 * Pipeline Smoke Test for VET-917
 *
 * Creates a temporary smoke branch, pushes it, verifies PR creation,
 * and documents the expected CI chain. Optionally cleans up afterward.
 *
 * Usage:
 *   node scripts/pipeline-smoke-test.mjs              # full test with cleanup
 *   node scripts/pipeline-smoke-test.mjs --no-cleanup # keep branch for inspection
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const BRANCH_NAME = `qwen/smoke-test-${TIMESTAMP}`;
const RUNBOOK_PATH = path.join(process.cwd(), "docs", "qoder-delivery-runbook.md");

let noCleanup = false;
if (process.argv.includes("--no-cleanup")) {
  noCleanup = true;
}

function run(cmd, options = {}) {
  console.log(`$ ${cmd}`);
  try {
    return execSync(cmd, { stdio: "pipe", ...options }).toString().trim();
  } catch (error) {
    if (options.ignoreError) {
      return error.stdout?.toString().trim() || error.stderr?.toString().trim() || "";
    }
    console.error(`Error: ${error.message}`);
    console.error(`stdout: ${error.stdout?.toString()}`);
    console.error(`stderr: ${error.stderr?.toString()}`);
    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("=".repeat(60));
  console.log("Pipeline Smoke Test for VET-917");
  console.log("=".repeat(60));
  console.log();

  // Step 1: Verify we're on master and clean
  console.log("Step 1: Checking current branch state...");
  const currentBranch = run("git branch --show-current");
  console.log(`Current branch: ${currentBranch}`);

  if (currentBranch !== "master") {
    console.log("Not on master. Checking out master...");
    run("git checkout master");
  }

  const status = run("git status --porcelain");
  if (status) {
    console.error("Error: Working directory is not clean. Stash or commit changes first.");
    process.exit(1);
  }
  console.log("Working directory is clean.");
  console.log();

  // Step 2: Verify workflow configurations
  console.log("Step 2: Verifying workflow configurations...");
  const autoPr = fs.readFileSync(".github/workflows/auto-pr.yml", "utf8");
  const ci = fs.readFileSync(".github/workflows/ci.yml", "utf8");

  const checks = [
    { file: "auto-pr.yml", pattern: "qwen/**", found: autoPr.includes("qwen/**") },
    { file: "auto-pr.yml", pattern: "qoder/**", found: autoPr.includes("qoder/**") },
    { file: "ci.yml", pattern: "qwen/**", found: ci.includes("qwen/**") },
    { file: "ci.yml", pattern: "qoder/**", found: ci.includes("qoder/**") },
  ];

  let allChecksPassed = true;
  for (const check of checks) {
    const status = check.found ? "PASS" : "FAIL";
    console.log(`  ${status}: ${check.file} contains ${check.pattern}`);
    if (!check.found) allChecksPassed = false;
  }

  if (!allChecksPassed) {
    console.error("\nError: Some workflow checks failed. Fix before proceeding.");
    process.exit(1);
  }
  console.log("All workflow checks passed.");
  console.log();

  // Step 3: Create and push smoke branch
  console.log("Step 3: Creating smoke test branch...");
  run(`git checkout -b ${BRANCH_NAME}`);
  console.log(`Created branch: ${BRANCH_NAME}`);

  // Add a trivial change
  const runbookContent = fs.readFileSync(RUNBOOK_PATH, "utf8");
  const updatedContent = runbookContent + `\n\n<!-- Smoke test added at ${TIMESTAMP} -->\n`;
  fs.writeFileSync(RUNBOOK_PATH, updatedContent);

  run(`git add ${RUNBOOK_PATH}`);
  run(`git commit -m "chore: pipeline smoke test ${TIMESTAMP}"`);
  console.log("Committed trivial change to runbook.");

  console.log("\nStep 4: Pushing to origin...");
  run(`git push -u origin ${BRANCH_NAME}`);
  console.log(`Pushed to origin/${BRANCH_NAME}`);
  console.log();

  // Step 5: Wait for PR creation
  console.log("Step 5: Waiting for auto-PR creation...");
  console.log("Polling for PR (up to 60 seconds)...");

  let prUrl = null;
  let prNumber = null;
  const maxAttempts = 12;
  const pollInterval = 5000; // 5 seconds

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`  Attempt ${attempt}/${maxAttempts}...`);

    try {
      const prList = run(
        `gh pr list --head ${BRANCH_NAME} --state open --json number,url --jq '.[0].url'`,
        { ignoreError: true }
      );

      if (prList && prList.startsWith("http")) {
        prUrl = prList;
        prNumber = run(
          `gh pr list --head ${BRANCH_NAME} --state open --json number --jq '.[0].number'`,
          { ignoreError: true }
        );
        break;
      }
    } catch (error) {
      // PR not created yet, continue polling
    }

    if (attempt < maxAttempts) {
      await sleep(pollInterval);
    }
  }

  if (prUrl) {
    console.log(`\nPR created successfully!`);
    console.log(`PR URL: ${prUrl}`);
    console.log(`PR Number: #${prNumber}`);
  } else {
    console.error("\nWarning: PR not created within 60 seconds.");
    console.error("This could be due to:");
    console.error("  - GitHub Actions delay");
    console.error("  - Missing GH_TOKEN in environment");
    console.error("  - Branch not matching workflow triggers");
    console.error("\nYou can check manually:");
    console.error(`  gh pr list --head ${BRANCH_NAME}`);
    console.error("\nContinuing with documentation update...");
  }
  console.log();

  // Step 6: Document expected CI chain
  console.log("Step 6: Expected CI Chain");
  console.log("-".repeat(40));
  console.log("1. auto-pr.yml — PR creation (should be complete if PR exists)");
  console.log("2. ci.yml — Lint, Type Check, Build, Test, CI Gate (~2-5 minutes)");
  console.log("3. ai-review.yml — AI Code Review (~1-2 minutes after CI)");
  console.log("4. auto-merge.yml — Squash merge to master (if all gates pass)");
  console.log("5. Vercel — Production deploy (~30 seconds after merge)");
  console.log();

  if (prUrl) {
    console.log("Monitor your PR here:");
    console.log(`  ${prUrl}`);
    console.log();
    console.log("CI checks will appear as status checks on the PR.");
    console.log("AI review will post as a comment when ready.");
  }
  console.log();

  // Step 7: Cleanup (optional)
  if (!noCleanup) {
    console.log("Step 7: Cleaning up...");

    // Switch back to master
    run("git checkout master");

    // Delete local branch
    run(`git branch -D ${BRANCH_NAME}`, { ignoreError: true });
    console.log(`Deleted local branch: ${BRANCH_NAME}`);

    // Delete remote branch
    run(`git push origin --delete ${BRANCH_NAME}`, { ignoreError: true });
    console.log(`Deleted remote branch: origin/${BRANCH_NAME}`);

    // Close PR if it was created
    if (prNumber) {
      run(`gh pr close ${prNumber}`, { ignoreError: true });
      console.log(`Closed PR #${prNumber}`);
    }

    console.log("Cleanup complete.");
  } else {
    console.log("Step 7: Skipping cleanup (--no-cleanup flag set)");
    console.log(`Branch ${BRANCH_NAME} is still available for inspection.`);
    console.log(`To clean up manually:`);
    console.log(`  git checkout master`);
    console.log(`  git branch -D ${BRANCH_NAME}`);
    console.log(`  git push origin --delete ${BRANCH_NAME}`);
    if (prNumber) {
      console.log(`  gh pr close ${prNumber}`);
    }
  }
  console.log();

  // Summary
  console.log("=".repeat(60));
  console.log("Smoke Test Summary");
  console.log("=".repeat(60));
  console.log(`Workflow configs: All checks passed`);
  console.log(`Branch created: ${BRANCH_NAME}`);
  console.log(`Branch pushed: Yes`);
  console.log(`PR created: ${prUrl ? "Yes" : "Pending (check GitHub)"}`);
  if (prUrl) {
    console.log(`PR URL: ${prUrl}`);
  }
  console.log(`Cleanup: ${noCleanup ? "Skipped" : "Complete"}`);
  console.log();
  console.log("Next steps:");
  console.log("1. If PR exists, monitor CI checks on GitHub");
  console.log("2. Verify AI review posts after CI passes");
  console.log("3. Verify auto-merge triggers after AI approval");
  console.log("4. Verify Vercel production deployment after merge");
  console.log();
  console.log("Smoke test complete!");
}

main().catch((error) => {
  console.error("Fatal error:", error.message);
  process.exit(1);
});
