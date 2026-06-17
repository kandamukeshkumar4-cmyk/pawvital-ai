#!/usr/bin/env node
/**
 * guard-prod-deploy.mjs — Production deploy guardrail (ops-only).
 *
 * PURPOSE
 *   Prevent an accidental `vercel --prod` from a dirty or non-master checkout.
 *   In the past, deploying from a feature branch or a checkout with uncommitted
 *   changes has pushed unfinished work to production. This guard fails fast
 *   (exit 1) unless the local HEAD is exactly `origin/master` AND the working
 *   tree is clean.
 *
 * WHAT IT CHECKS (all must pass)
 *   1. `git fetch origin --quiet` succeeds (refresh remote refs).
 *   2. HEAD commit === origin/master commit (you are on the released line, fully
 *      up to date — not ahead, not behind, not on a feature branch).
 *   3. `git status --porcelain` is empty (no staged/unstaged/untracked changes).
 *
 * BEHAVIOR
 *   - On any failure: prints a clear red explanation of every failing check and
 *     exits 1 (blocks the deploy).
 *   - On success: prints OK (green) and exits 0.
 *
 * USAGE
 *   node scripts/guard-prod-deploy.mjs        # run the guard directly
 *   npm run deploy:prod                        # guard, then `npx vercel --prod`
 *
 *   The guard is wired ahead of the real deploy in package.json so that
 *   `npm run deploy:prod` cannot reach Vercel unless the guard passes.
 *
 * NOTES
 *   - Cross-platform: uses child_process.execSync, no shell-specific syntax.
 *   - Ops-only: contains no app/clinical logic. Safe to run anywhere.
 */

import { execSync } from 'node:child_process';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

/** Run a git command, return trimmed stdout. Throws on non-zero exit. */
function git(args) {
  return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function fail(lines) {
  console.error(`${RED}${BOLD}✖ Production deploy BLOCKED by guard-prod-deploy${RESET}`);
  for (const line of lines) {
    console.error(`${RED}  - ${line}${RESET}`);
  }
  console.error(
    `${YELLOW}\nProduction deploys are only allowed from a clean checkout that is exactly origin/master.\n` +
      `Fix the items above (e.g. \`git switch master && git pull\`, commit/stash/clean changes),\n` +
      `then re-run. To override in a true emergency, run \`npx vercel --prod\` manually and own the risk.${RESET}`,
  );
  process.exit(1);
}

const problems = [];

// 1. Refresh remote refs so the HEAD === origin/master comparison is meaningful.
try {
  execSync('git fetch origin --quiet', { stdio: ['ignore', 'ignore', 'pipe'] });
} catch (err) {
  const detail = (err && err.stderr ? err.stderr.toString().trim() : String(err)) || 'unknown error';
  fail([`\`git fetch origin\` failed: ${detail}`, 'Cannot verify you are up to date with origin/master; refusing to deploy.']);
}

// 2. HEAD must equal origin/master.
let head = '';
let originMaster = '';
try {
  head = git('rev-parse HEAD');
} catch {
  fail(['Unable to resolve local HEAD (`git rev-parse HEAD`). Are you inside a git repo?']);
}
try {
  originMaster = git('rev-parse origin/master');
} catch {
  fail(['Unable to resolve `origin/master`. Does the remote branch exist and is it fetched?']);
}

if (head !== originMaster) {
  let branch = 'unknown';
  try {
    branch = git('rev-parse --abbrev-ref HEAD');
  } catch {
    /* ignore */
  }
  problems.push(
    `HEAD is not origin/master (on branch "${branch}").`,
    `  local  HEAD          = ${head}`,
    `  remote origin/master = ${originMaster}`,
    'You may be on a feature branch, ahead of master, or behind master.',
  );
}

// 3. Working tree must be clean.
let porcelain = '';
try {
  porcelain = git('status --porcelain');
} catch {
  fail(['`git status --porcelain` failed; cannot confirm a clean working tree.']);
}

if (porcelain.length > 0) {
  const changed = porcelain.split('\n').filter(Boolean);
  problems.push(
    `Working tree is dirty (${changed.length} change${changed.length === 1 ? '' : 's'}); commit, stash, or clean before deploying:`,
    ...changed.slice(0, 20).map((l) => `    ${l}`),
    ...(changed.length > 20 ? [`    ...and ${changed.length - 20} more`] : []),
  );
}

if (problems.length > 0) {
  fail(problems);
}

console.log(`${GREEN}${BOLD}✔ guard-prod-deploy OK${RESET} ${GREEN}— HEAD === origin/master and working tree is clean. Safe to deploy.${RESET}`);
process.exit(0);
