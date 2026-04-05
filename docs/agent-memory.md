# Agent Memory

## 2026-04-05 - NVIDIA-only runtime refactor

- Branch: `qwen/mega-nvidia-only-refactor-v1`
- Scope: remove Anthropic from app runtime paths, centralize NVIDIA generation/parsing helpers, normalize NVIDIA key resolution, and preserve existing route contracts.

### Runtime provider policy

- Runtime LLM provider for `src/app/api/ai/*`: NVIDIA NIM only.
- Shared default key: `NVIDIA_API_KEY`.
- Optional role overrides: `NVIDIA_QWEN_API_KEY`, `NVIDIA_KIMI_API_KEY`, `NVIDIA_DEEPSEEK_API_KEY`, `NVIDIA_GLM_API_KEY`.
- Legacy Anthropic runtime helpers were removed from the app surface.

### Helper architecture

- `src/lib/llm-output.ts` centralizes model-output cleanup and JSON parsing.
- `src/lib/nvidia-generation.ts` centralizes text/JSON generation on top of `src/lib/nvidia-models.ts`.
- `src/lib/nvidia-models.ts` now resolves per-role keys dynamically and treats placeholder values as unconfigured.

### Route changes

- `src/app/api/ai/symptom-check/route.ts` now uses NVIDIA diagnosis generation.
- `src/app/api/ai/health-score/route.ts` now uses NVIDIA phrasing-verifier generation.
- `src/app/api/ai/supplements/route.ts` now uses NVIDIA diagnosis generation.
- `src/app/api/ai/symptom-chat/route.ts` now uses shared parsing helpers, NVIDIA-only runtime calls, and deterministic pending-answer recovery rules for appetite/stool edge cases.

### Environment and docs

- Added root `.env.example` with the exact placeholder `nvapi-REPLACE_WITH_YOUR_REAL_NVIDIA_NIM_KEY`.
- Rewrote `README.md` for NVIDIA-only runtime setup.

### Validation completed

- Focused Jest: `tests/llm-output.test.ts`, `tests/nvidia-models.test.ts`, `tests/symptom-chat.route.test.ts` all passing (`109 passed`).
- Editor diagnostics for touched files are clean.
- `npm run build` previously failed on a touched `nvidia-models.ts` type issue; that narrowing fix is now in place.
- Fresh redirected build output reached `Compiled successfully` and `Running TypeScript ...` but did not emit a final completion marker in this environment, so build verification remains partially tooling-limited.

### Known follow-ups

- Re-run `npm run build` in a fully reliable terminal path if a release-ready build artifact is required before landing.
- If this work gets a formal ticket id, update the shared PawVital Obsidian memory via `scripts/update-pawvital-memory.mjs complete ...`.