# RunPod Hero Job Manifests

These files are repo-local planning manifests for the RunPod-backed hero-feature work.

They are not direct RunPod API payloads. They define:

- purpose
- recommended GPU
- command to run from this repo
- required env vars
- expected inputs and outputs

Regenerate them with:

```bash
node scripts/runpod-hero-job-manifests.mjs
```
