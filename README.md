# PawVital AI

PawVital AI is a Next.js veterinary triage application built around a deterministic clinical matrix, structured symptom memory, and NVIDIA-hosted model inference for runtime AI features.

## Runtime Provider Policy

- Runtime LLM provider: NVIDIA NIM only
- Base URL: `https://integrate.api.nvidia.com/v1`
- Shared default key: `NVIDIA_API_KEY`
- Optional role overrides: `NVIDIA_QWEN_API_KEY`, `NVIDIA_KIMI_API_KEY`, `NVIDIA_DEEPSEEK_API_KEY`, `NVIDIA_GLM_API_KEY` (each falls back to `NVIDIA_API_KEY` when unset)

Runtime AI under `src/app/api/ai` uses the official OpenAI JavaScript SDK pointed at NVIDIA’s OpenAI-compatible base URL (`https://integrate.api.nvidia.com/v1`). One `NVIDIA_API_KEY` is enough for all roles unless you split billing or quotas with the optional overrides.

## Setup

1. Install dependencies.

```bash
npm install
```

2. Copy `.env.example` to `.env.local` and fill in a real NVIDIA NIM key.

```env
# NVIDIA NIM shared key for all models
NVIDIA_API_KEY=nvapi-REPLACE_WITH_YOUR_REAL_NVIDIA_NIM_KEY

# Optional per-role overrides
NVIDIA_QWEN_API_KEY=nvapi-REPLACE_WITH_YOUR_REAL_NVIDIA_NIM_KEY
NVIDIA_KIMI_API_KEY=nvapi-REPLACE_WITH_YOUR_REAL_NVIDIA_NIM_KEY
NVIDIA_DEEPSEEK_API_KEY=nvapi-REPLACE_WITH_YOUR_REAL_NVIDIA_NIM_KEY
NVIDIA_GLM_API_KEY=nvapi-REPLACE_WITH_YOUR_REAL_NVIDIA_NIM_KEY
```

3. If you run the optional Hugging Face sidecars locally, copy `.env.sidecars.example` into the sidecar environment you use for those services.

4. Start the app.

```bash
npm run dev
```

## Validation

Use these commands before landing runtime changes:

```bash
npm run lint
npm run build
npm test
```

## Notes

- The deterministic clinical matrix remains the source of truth for medical flow and urgency handling.
- Shared `NVIDIA_API_KEY` is enough to enable all core text and vision roles unless you intentionally override individual roles.
- JSON parsing for NVIDIA model output is centralized so routes can safely handle fenced JSON, `<think>` blocks, and loose surrounding text.
