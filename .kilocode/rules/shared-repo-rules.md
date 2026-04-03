Repo rules for this ticket

Worktree:
- G:\MY Website\pawvital-ai

Do not work in:
- G:\MY Website\pawvital-ai-codex
That worktree is reserved for final landing into master after review.

Branching:
- create a fresh branch for this ticket only
- branch naming format: qwen/<ticket>-<short-name>-v1

Committing:
- make a focused commit for this ticket only
- do not mix unrelated changes
- do not amend old commits unless explicitly told to
- do not modify files outside the listed scope unless absolutely required, and if you do, explain why

Repo constraints:
- read the Next.js repo-specific docs first when touching route handlers:
  G:\MY Website\pawvital-ai\node_modules\next\dist\docs\01-app\01-getting-started\15-route-handlers.md
- deterministic clinical logic must remain the source of truth
- do not move medical logic into prompts
- do not touch RunPod, Vercel, or deploy files unless the ticket explicitly says so
- do not change user-facing payload shape unless the ticket explicitly requires it
- keep changes small, reviewable, and test-backed

Shared memory requirements:
- read project context first:
  - G:\MY Website\petviatal\00 Home.md
  - G:\MY Website\petviatal\01 Projects\PawVital AI\16 Current Context Packet.md
  - G:\MY Website\petviatal\01 Projects\PawVital AI\01 Active Work.md
  - G:\MY Website\petviatal\01 Projects\PawVital AI\04 Ticket Board.md
  - G:\MY Website\petviatal\01 Projects\PawVital AI\10 Current Sprint.md
- update shared memory through the existing automation flow
- do not manually edit Obsidian unless the automation fails or the task explicitly requires human note editing

Kilo completion protocol:
- before saying "complete", run the Kilo-friendly finalizer from the repo root:
  node scripts/kilo-finalize-ticket.mjs --ticket <ticket> --agent <agent-name> --summary "<summary 1>" --summary "<summary 2>" --verification "<command and result>" --verification "<command and result>"
- this is the required path for Kilo agents because Claude-only subagent hooks do not fire in Kilo
- the finalizer is responsible for:
  - completion logging
  - review
  - landing
  - push
  - Vercel verification
  - memory update
- if the finalizer reports a failure, do not say "complete"

Verification expectations:
- run the ticket-specific tests
- run build if runtime code changed
- do not claim completion unless verification passes

Completion message format:
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
- do not say "complete" unless the branch is committed and verification passed
- if anything is incomplete, say exactly what is missing
