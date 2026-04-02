@AGENTS.md

# PawVital Shared Memory

Workspace-level shared context also exists at:

- `G:\MY Website\CLAUDE.md`

Persistent project memory lives in the Obsidian vault:

- `G:\MY Website\petviatal`

## Read At Session Start

- `G:\MY Website\petviatal\00 Home.md`
- `G:\MY Website\petviatal\01 Projects\PawVital AI\16 Current Context Packet.md`
- `G:\MY Website\petviatal\01 Projects\PawVital AI\00 Project Home.md`
- `G:\MY Website\petviatal\01 Projects\PawVital AI\01 Active Work.md`
- `G:\MY Website\petviatal\01 Projects\PawVital AI\04 Ticket Board.md`

Load more context as needed:

- `G:\MY Website\petviatal\01 Projects\PawVital AI\02 Architecture.md`
- `G:\MY Website\petviatal\01 Projects\PawVital AI\03 Repo Map.md`
- `G:\MY Website\petviatal\01 Projects\PawVital AI\05 Decisions.md`
- `G:\MY Website\petviatal\01 Projects\PawVital AI\06 Runbook.md`
- `G:\MY Website\petviatal\01 Projects\PawVital AI\07 Agent Registry.md`
- `G:\MY Website\petviatal\01 Projects\PawVital AI\08 Session Onboarding.md`
- `G:\MY Website\petviatal\01 Projects\PawVital AI\09 Completed Tickets.md`
- `G:\MY Website\petviatal\01 Projects\PawVital AI\10 Current Sprint.md`
- `G:\MY Website\petviatal\01 Projects\PawVital AI\17 Activity Log.md`
- `G:\MY Website\petviatal\01 Projects\PawVital AI\18 Ticket Briefs\README.md`

## Mandatory Working Rule

- implementation in `G:\MY Website\pawvital-ai`
- final reviewed landing in `G:\MY Website\pawvital-ai-codex`
- every completed ticket must update shared Obsidian memory
- new agents and new models must be added to the Obsidian agent registry

Prefer the shared memory automation command over manual vault edits:

- from the workspace root: `node pawvital-ai/scripts/update-pawvital-memory.mjs complete ...`
- preferred one-command review + land path: `node pawvital-ai/scripts/finalize-pawvital-ticket.mjs ...`
- land reviewed work with: `node pawvital-ai/scripts/land-pawvital-ticket.mjs ...`
- when a new worker/model joins: `node pawvital-ai/scripts/update-pawvital-memory.mjs register-agent ...`

## Recommended Launch

Prefer launching Claude from:

- `G:\MY Website\start-claude-workspace-wsl.cmd`

This keeps the full workspace, Obsidian vault, source worktree, codex worktree, and review worktree in the same session context with the working plugin path. Use `G:\MY Website\start-claude-workspace.cmd` only as the Windows fallback.
