# PawVital Shared Repo Rules For Kilo Agents

These rules apply to every PawVital Kilo agent conversation.

## Repo Rules For This Project

Worktree:
- `G:\MY Website\pawvital-ai` unless a ticket explicitly assigns a different clean PawVital worktree

Do not work in:
- `G:\MY Website\pawvital-ai-codex`
That worktree is reserved for final landing into `master` after review.

Branching:
- create a fresh branch for the ticket only
- branch naming format: `qwen/<ticket>-<short-name>-v1`
- do not reuse another ticket branch

Committing:
- make a focused commit set for the ticket only
- do not mix unrelated changes
- do not amend old commits unless explicitly told to
- push the ticket branch to GitHub before saying `complete`

Repo constraints:
- read the Next.js repo-specific docs first when touching route handlers:
  - `G:\MY Website\pawvital-ai\node_modules\next\dist\docs\01-app\01-getting-started\15-route-handlers.md`
- deterministic clinical logic remains the source of truth
- do not move medical decisions into prompts
- do not touch RunPod, Vercel, billing-sensitive infrastructure, or deploy files unless the ticket explicitly requires it
- do not change user-facing payload shape unless the ticket explicitly requires it
- keep changes small, reviewable, and test-backed

## Shared Memory Rules

Before starting, read:
- `G:\MY Website\petviatal\00 Home.md`
- `G:\MY Website\petviatal\01 Projects\PawVital AI\01 Active Work.md`
- `G:\MY Website\petviatal\01 Projects\PawVital AI\04 Ticket Board.md`
- `G:\MY Website\petviatal\01 Projects\PawVital AI\10 Current Sprint.md`
- `G:\MY Website\petviatal\01 Projects\PawVital AI\16 Current Context Packet.md`
- the specific ticket brief in `G:\MY Website\petviatal\01 Projects\PawVital AI\18 Ticket Briefs\`

Do not claim memory is updated just because you read the notes.

After completion:
- run the PawVital Kilo finalizer from the repo root:
  - `node scripts/kilo-finalize-ticket.mjs --ticket <ticket> --agent <agent-name> --summary "<summary>" --verification "<verification>"`
- if the finalizer fails, report the exact failure
- do not say `complete` unless the branch is committed, pushed, and the finalizer or equivalent memory update path succeeded

## Review And Landing Discipline

- one ticket
- one branch
- one clear owner
- one review
- one landing
- do not overwrite another agent's work
- do not "help" by editing files outside your assigned scope

## Completion Message Format

<ticket> complete

Branch:
- <branch-name>

Commit:
- <commit-id>

Files changed:
- <absolute path 1>
- <absolute path 2>
- <absolute path 3>

What changed:
- <short bullet 1>
- <short bullet 2>
- <short bullet 3>

Verification:
- <test command and result>
- <build command and result>

Notes:
- <any caveats or follow-ups>

Important:
- do not say `complete` unless committed, pushed to GitHub, and verification passed
- if anything is incomplete, say exactly what is missing
