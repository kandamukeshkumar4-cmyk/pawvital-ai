# PawVital Azure Foundation (Student / dedicated subscription)

Operator runbook for a **PawVital-only** Azure subscription. Do not share billing or resource groups with AlphaEdge.

## Prerequisites

- Azure CLI (`az login`)
- Subscription ID for the PawVital student or dedicated account
- Region: `eastus` (single region for all resources)

## Quick provision

```powershell
cd deploy/azure
./provision-pawvital-foundation.ps1 -SubscriptionId "<SUBSCRIPTION_ID>" -Environment dev
```

Production: repeat with `-Environment prod` and a separate resource group `pawvital-prod`.

## Resources created

| Resource | Name pattern | Purpose |
|----------|--------------|---------|
| Resource group | `pawvital-{env}-rg` | Isolation |
| Budget | `pawvital-{env}-budget` | Alerts at $10 / $25 / $50 |
| Key Vault | `pawvital-{env}-kv` | Secrets (see `src/lib/azure/index.ts` AZURE_SECRET_NAMES) |
| App Insights | `pawvital-{env}-insights` | Turn latency / VET-1572 |
| Storage | `pawvital{env}store` | Reports, images, vet PDFs |
| Cognitive Services (multi) | Speech, Translator, Doc Intel, Content Safety | Feature flags in App Configuration |

## Post-provision (Vercel + local)

1. Store secrets in Key Vault using names from `AZURE_SECRET_NAMES` in `src/lib/azure/index.ts`.
2. Set Vercel env: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_KEY_VAULT_NAME`.
3. Enable App Configuration flags: `azure.speech.enabled`, `azure.docintel.enabled`, `azure.translator.enabled`.
4. Add `NVIDIA_API_KEY` (server-only, not in Key Vault unless you choose to).
5. Run `npm run check:azure:vercel-env` and `npm run check:supabase-env` before cutover.

## Cutover sequence (C-track)

1. **VET-1585** — `PLATFORM_*_PROVIDER` defaults keep Supabase auth/db; run `npm run smoke:azure-cutover` before any flip.
2. **Azure foundation** — provision script + Key Vault secrets (`npm run check:keyvault-env-template`).
3. **Dual-write** — reports/pets to Azure PG while reads stay on Supabase (operator window).
4. **C1 Entra** — set `PLATFORM_AUTH_PROVIDER=azure-entra` + `AZURE_ENTRA_*` for new signups.
5. **C2 Azure PostgreSQL** — set `PLATFORM_DB_PROVIDER=azure-postgres` + `DATABASE_URL` to Flexible Server.
6. **C3** — blob/env swap, `npm run smoke:azure-cutover`, remove Supabase env vars.

Planner promotion: `npm run check:shadow-planner-gate` must pass before `CLINICAL_PLANNER_MODE=live`.

