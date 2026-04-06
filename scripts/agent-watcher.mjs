#!/usr/bin/env node
/**
 * agent-watcher.mjs
 *
 * Runs in the background on your local machine. Polls GitHub every 60 seconds
 * for open PRs with failed CI or rejected AI reviews. When it finds one, it
 * dispatches the fix to the agent that created the branch:
 *
 *   claude/*       → Claude Code CLI (automatic fix)
 *   codex/*        → Codex CLI (automatic fix)
 *   cursor/*       → Creates task file + desktop notification
 *   copilot/*      → Creates task file + desktop notification
 *   antigravity/*  → Creates task file + desktop notification
 *
 * Usage:
 *   node scripts/agent-watcher.mjs              # foreground (logs to console)
 *   node scripts/agent-watcher.mjs --daemon      # background (logs to file)
 *   node scripts/agent-watcher.mjs --once         # single check, then exit
 *   node scripts/agent-watcher.mjs --status       # show watcher state
 *   node scripts/agent-watcher.mjs --stop         # stop background daemon
 *
 * Environment:
 *   WATCHER_INTERVAL=60        Poll interval in seconds (default: 60)
 *   WATCHER_MAX_RETRIES=3      Max retries per PR (default: 3)
 *   WATCHER_DRY_RUN=1          Log what would happen without dispatching
 */

import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const POLL_INTERVAL = parseInt(process.env.WATCHER_INTERVAL || '60', 10) * 1000;
const MAX_RETRIES = parseInt(process.env.WATCHER_MAX_RETRIES || '3', 10);
const DRY_RUN = process.env.WATCHER_DRY_RUN === '1';
const STATE_DIR = join(REPO_ROOT, '.agent-watcher');
const STATE_FILE = join(STATE_DIR, 'state.json');
const TASKS_DIR = join(REPO_ROOT, '.agent-tasks');
const LOG_FILE = join(STATE_DIR, 'watcher.log');
const PID_FILE = join(STATE_DIR, 'watcher.pid');

// Agent CLI dispatch map
const CLI_AGENTS = {
  claude: 'claude',
  codex: 'codex',
};

const NOTIFY_AGENTS = ['cursor', 'copilot', 'antigravity', 'qwen', 'minimax'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function gh(cmd) {
  try {
    return execSync(`gh ${cmd}`, {
      encoding: 'utf8',
      cwd: REPO_ROOT,
      timeout: 30000,
      env: { ...process.env, GH_NO_UPDATE_NOTIFIER: '1' },
    }).trim();
  } catch (e) {
    return '';
  }
}

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', cwd: REPO_ROOT, timeout: 30000, ...opts }).trim();
}

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  if (process.env._WATCHER_DAEMON) {
    try { appendFileSync(LOG_FILE, line + '\n'); } catch { /* ignore */ }
  }
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// ---------------------------------------------------------------------------
// State management — tracks retries and cooldowns per PR
// ---------------------------------------------------------------------------

function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    }
  } catch { /* corrupt state — start fresh */ }
  return { prs: {} };
}

function saveState(state) {
  ensureDir(STATE_DIR);
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function getPrState(state, prNumber) {
  if (!state.prs[prNumber]) {
    state.prs[prNumber] = {
      retries: 0,
      lastRetry: null,
      status: 'watching', // watching | dispatched | exhausted | merged
    };
  }
  return state.prs[prNumber];
}

// ---------------------------------------------------------------------------
// GitHub: fetch open PRs with problems
// ---------------------------------------------------------------------------

function getOpenPRs() {
  const raw = gh(
    'pr list --state open --base master --json number,headRefName,title,createdAt,author --limit 20'
  );
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function getPRCheckStatus(prNumber) {
  // Get SHA via gh --json (no jq — Windows-safe)
  const prRaw = gh(`pr view ${prNumber} --json headRefOid`);
  let sha = '';
  try {
    sha = JSON.parse(prRaw).headRefOid;
  } catch {
    return { ci: 'unknown', review: 'unknown', details: '' };
  }
  if (!sha) return { ci: 'unknown', review: 'unknown', details: '' };

  // Get check runs via API — parse JSON in Node.js
  const checksRaw = gh(`api "repos/{owner}/{repo}/commits/${sha}/check-runs"`);
  let checks = [];
  try {
    const parsed = JSON.parse(checksRaw || '{}');
    checks = (parsed.check_runs || []).map(c => ({
      name: c.name,
      status: c.status,
      conclusion: c.conclusion,
    }));
  } catch {
    checks = [];
  }

  const ciGate = checks.find(c => c.name === 'CI Gate');
  const aiReview = checks.find(c => c.name === 'AI Review');

  let ci = 'pending';
  if (ciGate) {
    if (ciGate.conclusion === 'success') ci = 'passed';
    else if (ciGate.conclusion === 'failure') ci = 'failed';
    else if (ciGate.status === 'completed') ci = ciGate.conclusion || 'unknown';
  }

  // AI Review runs via workflow_run (not on the PR commit), so check PR comments
  // for the review verdict instead of check runs
  let review = 'pending';
  let verdict = '';
  let fixInstructions = '';
  const commentsRaw = gh(`pr view ${prNumber} --json comments`);
  try {
    const comments = JSON.parse(commentsRaw).comments || [];
    // Find the AI review comment (look for our marker)
    for (const c of comments) {
      if (c.body && c.body.includes('AI Code Review')) {
        review = 'completed';
        if (c.body.includes('REQUEST_CHANGES') || c.body.includes(':x:')) {
          verdict = 'REQUEST_CHANGES';
        } else if (c.body.includes(':white_check_mark:') && c.body.includes('Verdict: `APPROVE`')) {
          verdict = 'APPROVE';
        } else {
          verdict = 'UNKNOWN';
        }
        // Extract fix instructions
        const fixMatch = c.body.match(/### How to fix\n([\s\S]*?)(?:\n---|\n\*\(|$)/);
        if (fixMatch) fixInstructions = fixMatch[1].trim();
      }
    }
  } catch { /* ignore parse errors */ }

  // If CI passed but no review comment yet, check how long PR has been open
  // If > 10 minutes with no review, something is wrong
  if (ci === 'passed' && review === 'pending') {
    // Leave as pending — watcher will check again next cycle
  }

  // Get CI failure details
  let ciFailureDetails = '';
  if (ci === 'failed') {
    const failedChecks = checks
      .filter(c => c.conclusion === 'failure' && c.name !== 'CI Gate')
      .map(c => c.name);
    ciFailureDetails = `Failed checks: ${failedChecks.join(', ')}`;

    // Check for auto-fix analysis
    try {
      const allComments = JSON.parse(commentsRaw).comments || [];
      for (const c of allComments) {
        if (c.body && c.body.includes('CI Failed')) {
          const analysisMatch = c.body.match(/\*\*Root cause:\*\* (.*)/);
          if (analysisMatch) ciFailureDetails += `\nRoot cause: ${analysisMatch[1]}`;
        }
      }
    } catch { /* ignore */ }
  }

  return {
    ci,
    review,
    verdict,
    fixInstructions,
    ciFailureDetails,
    details: `CI: ${ci}, Review: ${review}${verdict ? `, Verdict: ${verdict}` : ''}`,
  };
}

// ---------------------------------------------------------------------------
// Agent extraction from branch name
// ---------------------------------------------------------------------------

function getAgentFromBranch(branchName) {
  const prefix = branchName.split('/')[0];
  if (CLI_AGENTS[prefix]) return { name: prefix, type: 'cli' };
  if (NOTIFY_AGENTS.includes(prefix)) return { name: prefix, type: 'notify' };
  // Branches like feature/*, fix/*, etc. — default to claude
  return { name: prefix, type: 'notify' };
}

// ---------------------------------------------------------------------------
// Build fix context for the agent
// ---------------------------------------------------------------------------

function buildFixContext(pr, checkStatus) {
  const parts = [];

  parts.push(`# Fix Required: PR #${pr.number} — ${pr.title}`);
  parts.push(`Branch: ${pr.headRefName}`);
  parts.push(`Status: ${checkStatus.details}`);
  parts.push('');

  if (checkStatus.ci === 'failed') {
    parts.push('## CI Failure');
    parts.push(checkStatus.ciFailureDetails || 'CI checks failed. Run `npm test` and `npm run build` locally to see errors.');
    parts.push('');
  }

  if (checkStatus.verdict === 'REQUEST_CHANGES') {
    parts.push('## AI Review: Changes Requested');
    if (checkStatus.fixInstructions) {
      parts.push(checkStatus.fixInstructions);
    } else {
      parts.push('The AI reviewer requested changes. Check the PR comments for details.');
    }
    parts.push('');
  }

  parts.push('## Instructions');
  parts.push(`1. Checkout branch: git checkout ${pr.headRefName}`);
  parts.push('2. Fix the issues described above');
  parts.push('3. Test locally: npm test && npm run build');
  parts.push(`4. Commit and push: git add -A && git commit -m "fix: address review feedback" && git push`);
  parts.push('');
  parts.push('CI will re-run automatically when you push.');

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Dispatch: CLI agents (Claude, Codex)
// ---------------------------------------------------------------------------

function dispatchCLI(agent, pr, fixContext) {
  const branch = pr.headRefName;

  log(`  → Dispatching to ${agent.name} CLI for PR #${pr.number}`);

  if (DRY_RUN) {
    log(`  [DRY RUN] Would run ${agent.name} CLI on branch ${branch}`);
    return true;
  }

  // Ensure we're on the right branch
  try {
    run(`git fetch origin ${branch}`);
    run(`git checkout ${branch}`);
    run(`git pull origin ${branch}`);
  } catch (e) {
    log(`  ✗ Failed to checkout ${branch}: ${e.message}`);
    return false;
  }

  const prompt = [
    `You are fixing a failed PR (#${pr.number}: "${pr.title}") on branch ${branch}.`,
    '',
    fixContext,
    '',
    'Fix all the issues, then run the tests to verify. Do NOT run agent-done.mjs — just fix the code, commit, and push to this branch.',
    'After pushing, CI will re-run automatically.',
  ].join('\n');

  try {
    if (agent.name === 'claude') {
      // Claude Code CLI — run with the fix prompt
      const child = spawn('claude', [
        '--print',
        '--dangerously-skip-permissions',
        '-p', prompt,
      ], {
        cwd: REPO_ROOT,
        stdio: 'inherit',
        shell: true,
        timeout: 300000, // 5 minute timeout
      });

      child.on('exit', (code) => {
        if (code === 0) {
          log(`  ✓ Claude completed fix for PR #${pr.number}`);
        } else {
          log(`  ✗ Claude exited with code ${code} for PR #${pr.number}`);
        }
      });
    } else if (agent.name === 'codex') {
      // Codex CLI
      const child = spawn('codex', [
        '--approval-mode', 'auto',
        prompt,
      ], {
        cwd: REPO_ROOT,
        stdio: 'inherit',
        shell: true,
        timeout: 300000,
      });

      child.on('exit', (code) => {
        if (code === 0) {
          log(`  ✓ Codex completed fix for PR #${pr.number}`);
        } else {
          log(`  ✗ Codex exited with code ${code} for PR #${pr.number}`);
        }
      });
    }
    return true;
  } catch (e) {
    log(`  ✗ Failed to dispatch to ${agent.name}: ${e.message}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Dispatch: Notify-only agents (Cursor, Copilot, Antigravity, etc.)
// ---------------------------------------------------------------------------

function dispatchNotify(agent, pr, fixContext) {
  log(`  → Creating task file for ${agent.name} (PR #${pr.number})`);

  if (DRY_RUN) {
    log(`  [DRY RUN] Would create task file for ${agent.name}`);
    return true;
  }

  // Write task file that the agent can pick up
  ensureDir(TASKS_DIR);
  const taskFile = join(TASKS_DIR, `pr-${pr.number}-${agent.name}.md`);
  const taskContent = [
    `---`,
    `pr: ${pr.number}`,
    `branch: ${pr.headRefName}`,
    `agent: ${agent.name}`,
    `created: ${new Date().toISOString()}`,
    `status: pending`,
    `---`,
    '',
    fixContext,
  ].join('\n');

  writeFileSync(taskFile, taskContent);
  log(`  ✓ Task file: ${taskFile}`);

  // Send Windows toast notification
  try {
    const notifTitle = `PawVital: PR #${pr.number} needs fixes`;
    const notifBody = `${agent.name} — ${pr.title}. Check .agent-tasks/ for details.`;
    execSync(
      `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; ` +
      `[System.Windows.Forms.MessageBox]::Show('${notifBody.replace(/'/g, "''")}', '${notifTitle.replace(/'/g, "''")}', 'OK', 'Warning')"`,
      { timeout: 1000, stdio: 'ignore' }
    );
  } catch {
    // Toast notification is best-effort — don't fail if it doesn't work
    // On non-Windows or locked screen, just rely on the task file
  }

  // Also write to a consolidated task board
  const boardFile = join(TASKS_DIR, 'TASK-BOARD.md');
  const boardEntry = `\n- [ ] **PR #${pr.number}** (${agent.name}) — ${pr.title} — ${new Date().toISOString().slice(0, 16)}\n`;

  let board = '';
  if (existsSync(boardFile)) {
    board = readFileSync(boardFile, 'utf8');
  } else {
    board = '# Agent Task Board\n\nFailed PRs that need agent attention:\n';
  }

  // Don't add duplicate entries
  if (!board.includes(`PR #${pr.number}`)) {
    board += boardEntry;
    writeFileSync(boardFile, board);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Main: check one PR
// ---------------------------------------------------------------------------

function processPR(pr, state) {
  const prState = getPrState(state, pr.number);
  const agent = getAgentFromBranch(pr.headRefName);

  // Skip if exhausted
  if (prState.status === 'exhausted') return;
  if (prState.status === 'merged') return;

  // Skip if retried recently (5 minute cooldown)
  if (prState.lastRetry) {
    const elapsed = Date.now() - new Date(prState.lastRetry).getTime();
    if (elapsed < 5 * 60 * 1000) {
      return; // Still in cooldown
    }
  }

  // Check PR status
  const checkStatus = getPRCheckStatus(pr.number);

  // Skip if everything is fine — CI passed AND review approved
  if (checkStatus.ci === 'passed' && checkStatus.verdict === 'APPROVE') return;

  // Skip if still in progress
  if (checkStatus.ci === 'pending' || checkStatus.review === 'pending') return;

  // Something needs fixing: CI failed, review rejected, or verdict unknown
  const needsFix =
    checkStatus.ci === 'failed' ||
    checkStatus.verdict === 'REQUEST_CHANGES' ||
    checkStatus.verdict === 'UNKNOWN';

  if (!needsFix) return;

  log(`PR #${pr.number} (${pr.headRefName}) — needs fix: ${checkStatus.details}`);

  // Check retry limit
  if (prState.retries >= MAX_RETRIES) {
    log(`  ⚠ Max retries (${MAX_RETRIES}) reached — marking as exhausted`);
    prState.status = 'exhausted';
    saveState(state);

    // Post a comment on the PR
    if (!DRY_RUN) {
      gh(`pr comment ${pr.number} --body "## Agent Watcher: Retry Limit Reached

The local agent watcher attempted ${MAX_RETRIES} fixes but the PR is still failing.

**Manual intervention required.** Check the PR comments above for fix instructions.

*(Posted by agent-watcher.mjs)*"`);
    }
    return;
  }

  // Build fix context
  const fixContext = buildFixContext(pr, checkStatus);

  // Dispatch based on agent type
  let dispatched = false;
  if (agent.type === 'cli') {
    dispatched = dispatchCLI(agent, pr, fixContext);
  } else {
    dispatched = dispatchNotify(agent, pr, fixContext);
  }

  if (dispatched && !DRY_RUN) {
    prState.retries++;
    prState.lastRetry = new Date().toISOString();
    prState.status = 'dispatched';
    saveState(state);
  }
}

// ---------------------------------------------------------------------------
// Clean up: remove state for merged/closed PRs
// ---------------------------------------------------------------------------

function cleanupState(state, openPRNumbers) {
  const tracked = Object.keys(state.prs).map(Number);
  let cleaned = 0;
  for (const prNum of tracked) {
    if (!openPRNumbers.includes(prNum)) {
      // PR was merged or closed — clean up
      delete state.prs[prNum];
      cleaned++;

      // Remove task file if it exists
      const taskFiles = [
        join(TASKS_DIR, `pr-${prNum}-*.md`),
      ];
      // Simple cleanup — try common agent names
      for (const agentName of [...Object.keys(CLI_AGENTS), ...NOTIFY_AGENTS]) {
        const taskFile = join(TASKS_DIR, `pr-${prNum}-${agentName}.md`);
        if (existsSync(taskFile)) {
          try { unlinkSync(taskFile); } catch { /* ignore */ }
        }
      }
    }
  }
  if (cleaned > 0) {
    saveState(state);
    log(`Cleaned up state for ${cleaned} merged/closed PR(s)`);
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

async function pollOnce() {
  const state = loadState();
  const prs = getOpenPRs();

  if (prs.length === 0) {
    return;
  }

  const openNumbers = prs.map(p => p.number);

  // Clean up state for closed/merged PRs
  cleanupState(state, openNumbers);

  // Process each open PR
  for (const pr of prs) {
    try {
      processPR(pr, state);
    } catch (e) {
      log(`Error processing PR #${pr.number}: ${e.message}`);
    }
  }
}

async function mainLoop() {
  log('Agent Watcher started');
  log(`Poll interval: ${POLL_INTERVAL / 1000}s | Max retries: ${MAX_RETRIES} | Dry run: ${DRY_RUN}`);
  log(`Watching repo: ${REPO_ROOT}`);
  log('');

  // Run immediately on start
  await pollOnce();

  // Then poll on interval
  setInterval(async () => {
    try {
      await pollOnce();
    } catch (e) {
      log(`Poll error: ${e.message}`);
    }
  }, POLL_INTERVAL);
}

// ---------------------------------------------------------------------------
// CLI: --once, --daemon, --status, --stop
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes('--status')) {
  const state = loadState();
  const prCount = Object.keys(state.prs).length;
  console.log('Agent Watcher Status');
  console.log('====================');

  // Check if daemon is running
  if (existsSync(PID_FILE)) {
    const pid = readFileSync(PID_FILE, 'utf8').trim();
    console.log(`Daemon PID: ${pid}`);
    try {
      process.kill(parseInt(pid, 10), 0); // Check if process exists
      console.log('Daemon: RUNNING');
    } catch {
      console.log('Daemon: STOPPED (stale PID file)');
    }
  } else {
    console.log('Daemon: NOT RUNNING');
  }

  console.log(`Tracked PRs: ${prCount}`);
  for (const [prNum, prState] of Object.entries(state.prs)) {
    console.log(`  PR #${prNum}: ${prState.status} (${prState.retries}/${MAX_RETRIES} retries)`);
    if (prState.lastRetry) {
      console.log(`    Last retry: ${prState.lastRetry}`);
    }
  }
  process.exit(0);
}

if (args.includes('--stop')) {
  if (existsSync(PID_FILE)) {
    const pid = readFileSync(PID_FILE, 'utf8').trim();
    try {
      process.kill(parseInt(pid, 10));
      console.log(`Stopped watcher (PID ${pid})`);
    } catch (e) {
      console.log(`Could not stop PID ${pid}: ${e.message}`);
    }
    try { unlinkSync(PID_FILE); } catch { /* ignore */ }
  } else {
    console.log('No watcher running (no PID file found)');
  }
  process.exit(0);
}

if (args.includes('--once')) {
  log('Running single check...');
  await pollOnce();
  log('Done.');
  process.exit(0);
}

if (args.includes('--daemon')) {
  // Fork self as a detached background process
  ensureDir(STATE_DIR);
  const child = spawn(process.execPath, [__filename], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, _WATCHER_DAEMON: '1' },
  });
  child.unref();
  writeFileSync(PID_FILE, String(child.pid));
  console.log(`Agent Watcher started in background (PID ${child.pid})`);
  console.log(`Log file: ${LOG_FILE}`);
  console.log(`State: ${STATE_FILE}`);
  console.log('');
  console.log('Commands:');
  console.log('  node scripts/agent-watcher.mjs --status   # check status');
  console.log('  node scripts/agent-watcher.mjs --stop     # stop watcher');
  process.exit(0);
}

// Default: run in foreground
await mainLoop();
