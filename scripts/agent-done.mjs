#!/usr/bin/env node
/**
 * agent-done.mjs
 *
 * Any agent runs this when done with a task. Handles branch creation,
 * commit, and push automatically, then prints a GitHub PR link.
 *
 * Usage:
 *   node scripts/agent-done.mjs <ticket-slug> "<description>" [--agent <name>]
 *
 * Examples:
 *   node scripts/agent-done.mjs vet-730-fix-vomit "fix vomit detection fallback" --agent cursor
 *   node scripts/agent-done.mjs add-dark-mode "add dark mode to settings" --agent codex
 */

import { execSync } from 'child_process';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', ...opts }).trim();
}

function runVisible(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

function die(msg) {
  console.error(`\nError: ${msg}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Parse arguments
// ---------------------------------------------------------------------------

const rawArgs = process.argv.slice(2);

if (rawArgs.length < 2) {
  console.error(
    'Usage: node scripts/agent-done.mjs <ticket-slug> "<description>" [--agent <name>]\n' +
    '\n' +
    'Examples:\n' +
    '  node scripts/agent-done.mjs vet-730-fix-vomit "fix vomit detection fallback" --agent cursor\n' +
    '  node scripts/agent-done.mjs add-dark-mode "add dark mode to settings"\n'
  );
  process.exit(1);
}

const ticketSlug = rawArgs[0];
const description = rawArgs[1];

// Parse --agent flag
let agentFlag = null;
for (let i = 2; i < rawArgs.length; i++) {
  if (rawArgs[i] === '--agent' && rawArgs[i + 1]) {
    agentFlag = rawArgs[i + 1];
    break;
  }
}

// Auto-detect agent: --agent flag > AGENT_NAME env var > default "claude"
const agentName = agentFlag || process.env.AGENT_NAME || 'claude';

console.log(`\nAgent:   ${agentName}`);
console.log(`Ticket:  ${ticketSlug}`);
console.log(`Message: ${description}\n`);

// ---------------------------------------------------------------------------
// Validate: must be inside a git repo
// ---------------------------------------------------------------------------

try {
  run('git rev-parse --is-inside-work-tree');
} catch {
  die('Not inside a git repository. Run this script from the repo root.');
}

// ---------------------------------------------------------------------------
// Gather git state
// ---------------------------------------------------------------------------

const currentBranch = run('git rev-parse --abbrev-ref HEAD');
const statusOutput = run('git status --porcelain');
const hasUncommitted = statusOutput.length > 0;

const targetBranch = `${agentName}/${ticketSlug}`;

console.log(`Current branch: ${currentBranch}`);
console.log(`Target branch:  ${targetBranch}`);
console.log(`Uncommitted changes: ${hasUncommitted ? 'yes' : 'none'}\n`);

// ---------------------------------------------------------------------------
// Get remote origin URL and convert to HTTPS browser URL
// ---------------------------------------------------------------------------

let remoteUrl = '';
let prPageUrl = '';
try {
  remoteUrl = run('git remote get-url origin');
  // Convert SSH (git@github.com:org/repo.git) → HTTPS browser URL
  if (remoteUrl.startsWith('git@')) {
    // git@github.com:org/repo.git → https://github.com/org/repo
    remoteUrl = remoteUrl
      .replace(/^git@([^:]+):/, 'https://$1/')
      .replace(/\.git$/, '');
  } else {
    // https://github.com/org/repo.git → https://github.com/org/repo
    remoteUrl = remoteUrl.replace(/\.git$/, '');
  }
  prPageUrl = `${remoteUrl}/compare/${targetBranch}?expand=1`;
} catch {
  // Non-fatal — we'll just skip the link
}

// ---------------------------------------------------------------------------
// Case 1: On master/main with uncommitted changes
//   → create branch, stage all, commit, push
// ---------------------------------------------------------------------------

const isOnDefault = currentBranch === 'master' || currentBranch === 'main';

if (isOnDefault && hasUncommitted) {
  console.log('On default branch with uncommitted changes → creating feature branch...\n');

  // Check remote branch does not already exist
  try {
    const remoteBranches = run('git ls-remote --heads origin');
    if (remoteBranches.includes(`refs/heads/${targetBranch}`)) {
      die(
        `Remote branch '${targetBranch}' already exists.\n` +
        `Resolve conflicts or choose a different ticket slug.`
      );
    }
  } catch (e) {
    if (e.message && e.message.includes('already exists')) throw e;
    // ls-remote failures are non-fatal (no network, etc.)
  }

  runVisible(`git checkout -b "${targetBranch}"`);
  runVisible('git add -A');
  runVisible(`git commit -m ${JSON.stringify(description)}`);
  runVisible(`git push -u origin "${targetBranch}"`);

// ---------------------------------------------------------------------------
// Case 2: On a feature branch with uncommitted changes
//   → stage all, commit, push
// ---------------------------------------------------------------------------

} else if (!isOnDefault && hasUncommitted) {
  console.log('On feature branch with uncommitted changes → committing and pushing...\n');

  runVisible('git add -A');
  runVisible(`git commit -m ${JSON.stringify(description)}`);
  runVisible(`git push -u origin "${currentBranch}"`);

// ---------------------------------------------------------------------------
// Case 3: On a feature branch, nothing uncommitted
//   → push if branch is ahead of remote, or if remote branch doesn't exist yet
// ---------------------------------------------------------------------------

} else if (!isOnDefault && !hasUncommitted) {
  // Check whether the remote branch exists at all
  let remoteBranchExists = false;
  try {
    const lsOutput = run(`git ls-remote --heads origin "${currentBranch}"`);
    remoteBranchExists = lsOutput.trim().length > 0;
  } catch {
    remoteBranchExists = false;
  }

  if (!remoteBranchExists) {
    // Branch exists locally but not on remote — push to publish it
    console.log('Branch has no remote tracking branch — pushing to create it...\n');
    runVisible(`git push -u origin "${currentBranch}"`);
  } else {
    // Branch exists remotely — check if we're ahead
    let aheadCount = 0;
    try {
      aheadCount = parseInt(run(`git rev-list --count "origin/${currentBranch}..HEAD"`), 10);
    } catch {
      aheadCount = 0;
    }

    if (aheadCount > 0) {
      console.log(`On feature branch, ${aheadCount} commit(s) ahead of origin → pushing...\n`);
      runVisible(`git push origin "${currentBranch}"`);
    } else {
      die(
        'Nothing to do — no uncommitted changes and branch is already up to date with origin.\n' +
        'Make your changes first, then run this script again.'
      );
    }
  }

// ---------------------------------------------------------------------------
// Case 4: On master with no uncommitted changes
// ---------------------------------------------------------------------------

} else {
  die(
    'Nothing to do — on the default branch with no uncommitted changes.\n' +
    'Make your changes first, then run this script again.'
  );
}

// ---------------------------------------------------------------------------
// Success output
// ---------------------------------------------------------------------------

console.log('\n--------------------------------------------------');
console.log('Done! Your changes have been pushed.');
console.log('');
console.log('What happens next (automatically):');
console.log('  1. GitHub opens a PR for your branch (~10 seconds)');
console.log('  2. CI runs: lint → typecheck → build → tests (~2 min)');
console.log('  3. Claude Sonnet reviews the code for clinical safety');
console.log('  4. All checks pass → auto-merged to master → Vercel deploys');
console.log('');

if (prPageUrl) {
  console.log(`Open a PR manually if needed:`);
  console.log(`  ${prPageUrl}`);
}

console.log('--------------------------------------------------\n');
