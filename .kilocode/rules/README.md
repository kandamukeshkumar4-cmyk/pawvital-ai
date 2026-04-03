# PawVital Kilo Rules

Use these files in Kilo's `Rules` tab and in each agent's custom prompt override.

Recommended setup:

1. Add the shared file to `Additional Instruction Files`:
   - `G:\MY Website\pawvital-ai\.kilocode\rules\shared-repo-rules.md`
2. For each agent, use the matching file below as the source for the custom prompt override:
   - `ask.md`
   - `backendreliabilityengineer.md`
   - `clinicallogicreviewer.md`
   - `code.md`
   - `code-reviewer.md`
   - `code-simplifier.md`
   - `code-skeptic.md`
   - `debug.md`
   - `deploymentguard.md`
   - `docs-specialist.md`
   - `frontend-specialist.md`
   - `orchestrator.md`
   - `plan.md`
   - `rcaengineer.md`
   - `techlead.md`
   - `test-engineer.md`
   - `testregressionengineer.md`

This keeps the global repo rules shared while letting each agent have a clear PawVital-specific role.
