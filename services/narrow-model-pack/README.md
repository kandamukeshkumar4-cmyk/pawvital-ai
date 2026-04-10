# Narrow Model Pack — VET-915

Minimal GPU deployment serving only the 4 essential text models for PawVital's core triage pipeline.

## Models Served

| Role | Model | GPU Memory |
|------|-------|-----------|
| extraction | qwen/qwen3.5-122b-a10b | ~25GB |
| phrasing | meta/llama-3.3-70b-instruct | ~40GB |
| diagnosis | nvidia/llama-3.1-nemotron-ultra-253b-v1 | ~80GB (TP=2) |
| safety | z-ai/glm5 | ~20GB |

**Total GPU requirement:** A100 80GB or equivalent for the largest model. The server lazy-loads one role at a time, not all models simultaneously.

## Architecture

```
┌──────────────────────────────────────┐
│   PawVital Next.js App (Vercel)     │
│                                     │
│  HF_NARROW_MODEL_PACK_URL ──────┐   │
└─────────────────────────────────┼───┘
                                  │
                                  ▼
┌──────────────────────────────────────────────┐
│   RunPod: Narrow Model Pack (Port 8085)     │
│                                              │
│   FastAPI + vLLM lazy loader               │
│   ├── /v1/chat/completions (OpenAI compat) │
│   ├── /v1/models                            │
│   └── /healthz                              │
│                                              │
│   Model roles:                               │
│   ├── extraction  (Qwen 122B)               │
│   ├── phrasing    (Llama 70B)               │
│   ├── diagnosis   (Nemotron 253B)           │
│   └── safety      (GLM-5)                   │
└──────────────────────────────────────────────┘
```

## Deployment

### Prerequisites

- `RUNPOD_API_KEY` in `.env.local`
- `HF_SIDECAR_API_KEY` in `.env.local`
- SSH key at `~/.ssh/runpod_id_ed25519`

### Provision

```bash
# Dry run — shows plan
node scripts/runpod-provision-narrow.mjs --provision

# Actually provision
node scripts/runpod-provision-narrow.mjs --provision --force
```

### Health Check

```bash
node scripts/runpod-provision-narrow.mjs --health
```

### Wire to Vercel

```bash
node scripts/runpod-provision-narrow.mjs --wire
```

This sets:
- `HF_NARROW_MODEL_PACK_URL` → `https://{pod_id}-8085.proxy.runpod.net/v1`
- `NARROW_PACK_ENABLED` → `true`

### Stop

```bash
node scripts/runpod-provision-narrow.mjs --stop
```

## Local Development

```bash
cd services/narrow-model-pack
pip install -r requirements.txt

SIDECAR_API_KEY=test python server.py --port 8085
```

Test:
```bash
curl http://localhost:8085/healthz
curl http://localhost:8085/v1/models
```

## Cost Optimization

The narrow pack excludes:
- Vision models (Llama 3.2 11B/90B, Kimi K2.5)
- Heavy retrieval sidecars (text, image, multimodal consult)

**Estimated savings:** 40-60% vs full consult pod, depending on GPU choice.

## GPU Selection

Recommended GPUs (in order of cost efficiency):
1. NVIDIA A100 80GB — recommended for the 253B diagnosis model
2. NVIDIA H100/H200 — best for faster cold loads and larger context windows
3. NVIDIA RTX 6000 Ada — acceptable for smaller role experiments only

The 253B Nemotron Ultra requires tensor parallelism (TP=2) even on A100 80GB.

## Integration with PawVital

When a future ticket wires `HF_NARROW_MODEL_PACK_URL`, the symptom-chat route should:
1. Route text model requests to the narrow pack instead of NVIDIA NIM
2. Fall back to NVIDIA API keys if narrow pack is unhealthy
3. Continue using NVIDIA for vision (not served by narrow pack)

This provides a cost-effective middle ground between full NVIDIA API usage and self-hosted models.
