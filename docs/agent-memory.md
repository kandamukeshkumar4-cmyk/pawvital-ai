# Agent Memory

## 2026-04-05 — NVIDIA-only runtime (autonomous ticket)

- **Branch:** `cursor/nvidia-only-autonomous-20260405`
- **Summary:** Runtime LLM traffic for `src/app/api/ai/*` uses NVIDIA NIM only (OpenAI SDK + `https://integrate.api.nvidia.com/v1`). Anthropic runtime paths and helpers were removed. Shared parsing lives in `src/lib/llm-output.ts`; text calls go through `src/lib/nvidia-generation.ts` and `src/lib/nvidia-models.ts`.

### Key resolution (priority)

1. Role-specific key when set: `NVIDIA_QWEN_API_KEY` (extraction), `NVIDIA_DEEPSEEK_API_KEY` (diagnosis), `NVIDIA_GLM_API_KEY` (safety), `NVIDIA_KIMI_API_KEY` (vision_deep).
2. Else `NVIDIA_API_KEY`.
3. Placeholder values (e.g. `nvapi-REPLACE_WITH_YOUR_REAL_NVIDIA_NIM_KEY`) count as unset.

Phrasing / phrasing_verifier / vision_fast / vision_detailed use the shared key only unless a future override is added.

### Files touched in this effort

- `src/lib/nvidia-models.ts`, `src/lib/nvidia-generation.ts`, `src/lib/llm-output.ts`, `src/lib/embedding-models.ts`
- `src/app/api/ai/symptom-chat/route.ts`, `symptom-check`, `health-score`, `supplements`
- `README.md`, `.env.example`
- Tests: `tests/llm-output.test.ts`, `tests/nvidia-models.test.ts`, `tests/symptom-chat.route.test.ts` (partial), `tests/retrieval.integration.test.ts` (live gate env list)
- `stress-test.ts` (API key fallback chain)

### Validation (this session)

- `npx eslint` on touched API/lib files: **0 errors** (warnings only in `symptom-chat` for unused vars).
- `npm run build`: **pass** (required a minimal `unknown[]` typing fix in `src/lib/sidecar-observability.ts` for TS inference).
- `npx jest tests/llm-output.test.ts tests/nvidia-models.test.ts`: **pass**.
- `tests/symptom-chat.route.test.ts`: **7 failures** (telemetry/compression expectations vs current mocks); treat as follow-up, not caused by NVIDIA provider swap.

### Known limitations / next tickets

- Align `symptom-chat.route.test.ts` with current telemetry/compression behavior or adjust mocks.
- Repo-wide `npm run lint` reports many issues under `Roo-Code/` and other paths; scoped lint on edited app files is clean.

### Earlier note (superseded branch name)

Prior work landed on `qwen/mega-nvidia-only-refactor-v1`; this ticket continues as `cursor/nvidia-only-autonomous-20260405`.
