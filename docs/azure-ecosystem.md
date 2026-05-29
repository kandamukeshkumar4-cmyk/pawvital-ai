# PawVital Azure Ecosystem

Status: AZ-001 inventory baseline for the existing Azure resources. AZ-012
adds the Static Web App staging mirror admin handoff.

Do not rerun `G:\MY Website\azure-free-setup.ps1` for normal app wiring. The
resources below already exist. Rerunning the setup script can create duplicate
random-suffix resources and make future agents wire the wrong names.

## Architecture Boundary

Vercel and Supabase remain the production core. Azure is a support layer for
secrets, telemetry, binary storage, voice, document intake, safety checks,
translation, async queues, live updates, feature flags, maps, and a staging
mirror. Azure must not override deterministic clinical authority in
`src/lib/clinical-matrix.ts` or `src/lib/triage-engine.ts`.

Azure services may enrich inputs and infrastructure, but clinical routing,
emergency handling, owner-facing urgency, and deterministic red-flag behavior
remain owned by the existing PawVital clinical code.

## Manual Admin State

| Item | Status | Notes |
| --- | --- | --- |
| Budget | Manual required | `az consumption budget list` returned no budgets, and the budget PUT for `pawvital-budget` failed with `RBACAccessDenied` on 2026-05-28. Create `$100` budget alerts at `50/80/100%` in Azure Portal Cost Management. |
| Service principal | Done | `pawvital-sp` was created on 2026-05-28. Client ID: `a0570346-7a1e-4c3e-9806-0a01b61f97cc`. It has `Key Vault Secrets User` at the `pawvital-rg` resource-group scope. |
| App env | Done for primary production project | The four Azure bootstrap vars are present in ignored local `.env.local` and encrypted in Vercel Production for `pawvital-ai`. They were not added to previews or `pawvital-ai-build`, so non-production surfaces stay demo-safe unless explicitly enabled. |
| Cognitive retention | Evidence captured | The deployed Azure AI resources expose no CLI-visible resource-level "disable abuse logging" switch. Use the service-specific notes below before enabling each feature. |

## Existing Resources

Subscription: `Azure for Students`

Subscription ID: `d05524c0-6140-404f-890a-3cf074c107d1`

Resource group: `pawvital-rg`

Resource group location: `eastus`

Policy-allowed regional deployment locations observed on this subscription:
`westus3`, `mexicocentral`, `southcentralus`, `centralus`, `northcentralus`.

| Resource | Type | Region | Role |
| --- | --- | --- | --- |
| `pawvital-kv-nil7y8` | Key Vault | `centralus` | Secret source for Azure support layer. |
| `pawvital-appinsights` | Application Insights | `centralus` | Privacy-safe telemetry target. |
| `workspace-pawvitalrgVG49` | Log Analytics workspace | `centralus` | Container Apps generated workspace. |
| `pawvital-aca-env` | Container Apps environment | `centralus` | Future sidecar/container environment. |
| `pawvitalstnil7y8` | Storage account | `centralus` | Binary backing store for media, reports, audio. |
| `pawvital-func-nil7y8` | Function App | `centralus` | Future background jobs. |
| `CentralUSPlan` | App Service plan | `centralus` | Function App plan artifact. |
| `pawvital-swa` | Static Web App | `centralus` | Staging mirror only; Vercel remains production. |
| `pawvital-contentsafety` | Azure AI Content Safety | `centralus` | I/O safety filter only. |
| `pawvital-customvision` | Azure AI Custom Vision Training | `southcentralus` | Future training/testing support. |
| `pawvital-docintel` | Azure AI Document Intelligence | `centralus` | Vet record/PDF field extraction. |
| `pawvital-speech` | Azure AI Speech | `centralus` | Voice-to-text input support. |
| `pawvital-translator` | Azure AI Translator | `global` | UI translation support. |
| `pawvital-sb-nil7y8` | Service Bus namespace | `centralus` | Basic-tier queue for async review/jobs. |
| `pawvital-webpubsub-nil7y8` | Web PubSub | `centralus` | Future live session updates. |
| `pawvital-nh-ns-nil7y8` | Notification Hubs namespace | `centralus` | Future owner push alerts. |
| `pawvital-notifications` | Notification Hub | `centralus` | Push hub under notification namespace. |
| `pawvital-appconfig-nil7y8` | App Configuration | `centralus` | Azure feature flags. |
| `pawvitalacrnil7y8` | Container Registry | `centralus` | Sidecar/container images. |
| `pawvital-maps` | Azure Maps | `global` | Nearest emergency vet lookup. |

## AZ-012 Static Web App Staging Mirror Handoff

Goal: link the existing `pawvital-swa` Static Web App to GitHub as a staging
mirror only. Vercel remains the owner-facing production host for
`pawvital-ai.vercel.app`; `pawvital-swa` must not receive production DNS, Vercel
environment variables, or live traffic routing.

### Boundary

| Item | Required value |
| --- | --- |
| Azure resource | Existing `pawvital-swa` in `pawvital-rg`; do not create a duplicate Static Web App. |
| GitHub repository | `kandamukeshkumar4-cmyk/pawvital-ai`. |
| Branch | `swa-test` only. Do not select `master` or any agent feature branch. |
| Azure purpose | Staging mirror and Azure hosting compatibility check. |
| Production host | Vercel remains production. Do not change Vercel project settings, domains, env vars, or deploy hooks for AZ-012. |
| Secret rule | Do not paste deployment tokens, GitHub tokens, Supabase secrets, Vercel env values, or Key Vault values into docs, chat, commits, screenshots, or PR text. |

### Preflight

1. In GitHub, create or refresh `swa-test` from the current green `master`
   commit after the latest production gates are passing.
2. Confirm `swa-test` can accept the Azure-generated workflow commit. If branch
   protection blocks Azure from committing `.github/workflows/azure-static-web-apps-*.yml`,
   temporarily allow the admin to commit to `swa-test`; do not switch the Azure
   setup to `master`.
3. Confirm no PawVital production domain is assigned to `pawvital-swa`. Leave the
   default `*.azurestaticapps.net` host as the staging URL unless a separate
   DNS ticket authorizes a staging subdomain.

### Azure Portal Steps

1. Open https://portal.azure.com.
2. Search for `Static Web Apps`, then open `pawvital-swa`.
3. Confirm the resource is under subscription `Azure for Students`, resource
   group `pawvital-rg`, and region `centralus`.
4. If the Portal exposes deployment-token or deployment-authorization settings,
   keep the workflow on the Azure-generated Static Web Apps deployment token.
   Azure stores this in GitHub as a repository secret named like
   `AZURE_STATIC_WEB_APPS_API_TOKEN...`.
5. Return to **Overview**. If the resource offers a GitHub/source-control setup
   action, choose **GitHub** as the source and sign in when prompted.
6. Authorize **Azure Static Web Apps** for the GitHub account only if the
   repository list is missing. In GitHub this is under **Settings -> Applications
   -> Authorized OAuth Apps -> Azure Static Web Apps -> Grant**.
7. Set repository details exactly:

   | Portal field | Value |
   | --- | --- |
   | Organization | `kandamukeshkumar4-cmyk` |
   | Repository | `pawvital-ai` |
   | Branch | `swa-test` |

8. In **Build Details**, choose the **Next.js** preset:

   | Portal field | Value |
   | --- | --- |
   | App location | `/` |
   | API location | empty |
   | Output location | empty |

   PawVital is a hybrid Next.js app with App Router route handlers. Do not use
   static export settings for AZ-012 unless a later ticket changes
   `next.config.ts` to `output: "export"`.
9. Select **Review + create** or the equivalent final setup action. Azure should
   create a GitHub Actions workflow on `swa-test` and create a GitHub repository
   Actions secret named like `AZURE_STATIC_WEB_APPS_API_TOKEN...`.
10. After the workflow appears in GitHub, inspect the file on `swa-test` before
    any branch promotion:

    ```yaml
    on:
      push:
        branches:
          - swa-test
      pull_request:
        branches:
          - swa-test
    ```

    The deploy step should keep `app_location: "/"`, `api_location: ""`,
    `output_location: ""`, and `production_branch: "swa-test"` if Azure includes
    that field. If the generated workflow targets `master`, stop and correct the
    setup on `swa-test`; do not merge it.
11. If the build needs environment variables, add only staging/demo-safe values
    or dedicated GitHub Actions staging secrets. Do not copy Vercel Production
    secrets or Supabase service-role credentials into the SWA workflow.
12. When the GitHub Actions run succeeds, open the Azure-generated default host
    from `pawvital-swa` and mark it as a staging mirror URL. Do not add a custom
    domain or production alias in AZ-012.

### Ongoing Refresh

Refresh the mirror by fast-forwarding `swa-test` from a known-good `master`
after production gates are already green:

```powershell
git fetch origin
git switch swa-test
git merge --ff-only origin/master
git push origin swa-test
```

This push should trigger only the Azure Static Web Apps workflow for `swa-test`.
Vercel production continues to deploy from `master` through the existing Vercel
integration.

### References

- Azure Static Web Apps portal setup:
  https://learn.microsoft.com/en-us/azure/static-web-apps/get-started-portal
- Azure Static Web Apps build configuration:
  https://learn.microsoft.com/en-in/azure/static-web-apps/build-configuration
- Azure Static Web Apps branch environments:
  https://learn.microsoft.com/en-us/azure/static-web-apps/branch-environments
- Azure Static Web Apps deployment token management:
  https://learn.microsoft.com/en-us/azure/static-web-apps/deployment-token-management
- Azure Static Web Apps Next.js support:
  https://learn.microsoft.com/en-us/azure/static-web-apps/nextjs
- Azure Static Web Apps hybrid Next.js deployment:
  https://learn.microsoft.com/en-us/azure/static-web-apps/deploy-nextjs-hybrid

## Key Vault Contract

Production code should read only the four app env vars below. Feature-specific
keys and connection strings live in Key Vault.

| Env var | Purpose |
| --- | --- |
| `AZURE_TENANT_ID` | Service principal tenant. |
| `AZURE_CLIENT_ID` | Service principal client ID. |
| `AZURE_CLIENT_SECRET` | Service principal secret. |
| `AZURE_KEY_VAULT_NAME` | `pawvital-kv-nil7y8`. |

Current Key Vault secret names:

| Secret | Consumer |
| --- | --- |
| `appconfig-connection-string` | App Configuration flag reader. |
| `appinsights-connection-string` | App Insights telemetry. |
| `azure-storage-connection-string` | Blob uploads. |
| `contentsafety-endpoint` | Content Safety. |
| `contentsafety-key` | Content Safety. |
| `customvision-training-endpoint` | Custom Vision training. |
| `customvision-training-key` | Custom Vision training. |
| `docintel-endpoint` | Document Intelligence. |
| `docintel-key` | Document Intelligence. |
| `maps-key` | Azure Maps. |
| `servicebus-connection-string` | Service Bus producer/worker. |
| `speech-endpoint` | Speech. |
| `speech-key` | Speech. |
| `speech-region` | Speech region, currently `centralus`. |
| `translator-endpoint` | Translator. |
| `translator-key` | Translator. |
| `translator-region` | Translator region, currently `global`. |
| `webpubsub-connection-string` | Web PubSub. |

Secret naming rule: Key Vault secret names use lowercase hyphenated names. Do
not use underscores; Azure rejects those names.

## Feature Flags

Every Azure feature must check App Configuration before calling Azure. Missing
or unreachable flags default to off.

Initial flag keys:

| Flag | Default | Purpose |
| --- | --- | --- |
| `azure.speech.enabled` | off | Voice symptom input. |
| `azure.docintel.enabled` | off | Vet PDF/document intake. |
| `azure.translator.enabled` | off | Owner language translation. |
| `azure.telemetry.sampling` | off or minimal | App Insights sampling control. |
| `azure.async-review.enabled` | off | Service Bus async jobs. |
| `azure.maps.enabled` | off | Consent-gated nearest emergency vet lookup. |

## Data Boundary

| Service | Allowed data | Forbidden data |
| --- | --- | --- |
| Key Vault | Secrets and connection strings. | Raw symptoms, owner names, transcripts, reports. |
| App Insights | Route names, latency, status codes, coarse feature flags, sanitized error codes. | Raw symptoms, owner names, pet names, coordinates, chat transcripts, report bodies. |
| Blob Storage | Owner-uploaded binary files and generated report binaries when linked by Supabase records. | Primary clinical state; Supabase remains record source of truth. |
| Speech | Owner-provided voice audio for transcription when explicitly enabled. | Emergency bypass blocking; text input remains fallback. |
| Document Intelligence | Uploaded vet PDFs/labs for field extraction. | Deterministic clinical state mutation without owner/app confirmation. |
| Content Safety | Text/image safety screening around I/O. | Clinical severity decisions or emergency routing authority. |
| Translator | UI translation before/after clinical engine calls. | Non-English deterministic engine state; engine receives normalized English. |
| Service Bus | Minimal job metadata and IDs. | Full chat transcripts or raw PII payloads. |
| Web PubSub | Session update events and sanitized status messages. | Secrets, raw coordinates, full clinical records. |
| App Configuration | Feature flags and sampling config. | Secrets or owner data. |
| Maps | Browser-consented location lookup request. | Persisted coordinates or telemetry coordinates. |

Emergency paths must bypass Azure middleware. Azure outages or quotas must never
block deterministic emergency guidance.

## Cognitive Retention Evidence

Checked on 2026-05-28 against `pawvital-speech`, `pawvital-docintel`,
`pawvital-contentsafety`, and `pawvital-translator` with
`az cognitiveservices account show`. The ARM properties returned no
service-level data-retention toggle for these resources. Current service
boundary decisions:

| Service | Retention / logging decision |
| --- | --- |
| Speech | Use real-time speech-to-text only for AZ-005. Microsoft documents real-time speech-to-text as server-memory processing with no data stored at rest. Do not call SDK `EnableAudioLogging()`, do not add `storeAudio=true`, and do not use batch transcription without an explicit TTL/delete design. |
| Document Intelligence | AZ-006 may use analysis output as owner/app-confirmed context only. Microsoft documents analyze inputs/results as temporary same-region storage; analyze responses are retained for 24 hours and can be purged with the Delete Analyze Result API. Implement deletion after successful extraction where the SDK/API supports it. |
| Content Safety | Microsoft documents that input text/images are not stored during detection, are not used for training, and Azure OpenAI abuse monitoring does not apply to Content Safety payloads. Use as an I/O filter only. |
| Translator | Microsoft documents Translator as no-trace for submitted translation data. Text translation should be preferred for AZ-007; document translation needs a separate temporary-file handling review before use. |

Reference docs:

- Speech to text data privacy: https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/speech-service/speech-to-text/data-privacy-security
- Speech audio/transcription logging: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/logging-audio-transcription
- Document Intelligence data privacy: https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/document-intelligence/data-privacy-security
- Content Safety data privacy: https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/content-safety/data-privacy
- Translator data privacy: https://learn.microsoft.com/en-us/legal/cognitive-services/translator/data-privacy-security

## Quota And Cost Guardrails

These limits are guardrails for initial implementation. Treat Azure Portal
pricing and quota blades as source of truth before enabling a feature publicly.

| Service | Current SKU | Guardrail |
| --- | --- | --- |
| Speech | `F0` | Speech-to-text free tier is 5 audio hours/month; gate with `azure.speech.enabled`. |
| Document Intelligence | `F0` | Free tier covers 0-500 pages/month; gate with `azure.docintel.enabled`. |
| Translator | `F0` | Free tier covers 2M standard/custom translation characters/month; gate with `azure.translator.enabled`. |
| Content Safety | `F0` | F0 has low request-rate limits; use only as an I/O filter and track usage. |
| Custom Vision Training | `F0` | Training/testing support only; do not call from owner request paths without a flag. |
| Service Bus | `Basic` | Queues only. Do not design for topics or fan-out on this SKU. |
| Web PubSub | `Free_F1` | Use only after telemetry proves polling load. Fallback to polling. |
| App Configuration | `Free` | Flags default off if unavailable. |
| Static Web App | `Free` | Staging mirror only. |
| Storage | `Standard_LRS` | Store only required binaries; Supabase owns records and access decisions. |
| Container Registry | `Standard` | Not an always-free service. Keep image pushes minimal and preserve budget guardrails. |
| Azure Maps | `G2` | Gen2 is transaction based with a monthly free tier by meter; require consent and track usage. |

Pricing references:

- Azure AI Speech pricing: https://azure.microsoft.com/pricing/details/cognitive-services/speech-services/
- Azure Document Intelligence pricing: https://azure.microsoft.com/pricing/details/ai-document-intelligence/
- Azure Translator pricing: https://azure.microsoft.com/pricing/details/cognitive-services/translator/
- Azure AI Content Safety overview/limits: https://learn.microsoft.com/azure/ai-services/content-safety/overview
- Azure Maps pricing: https://azure.microsoft.com/pricing/details/azure-maps/

## Implementation Order

1. AZ-002: Azure foundation module for Key Vault access and demo-safe client
   factories.
2. AZ-003: Privacy-safe App Insights telemetry.
3. AZ-004 and AZ-008: Blob Storage helpers and App Configuration flags.
4. AZ-005, AZ-006, AZ-007: Speech, Document Intelligence plus Content Safety,
   and Translator.
5. AZ-009: Service Bus queue producer and worker scaffold.
6. AZ-010, AZ-011, AZ-012: Maps, Web PubSub, and Static Web App mirror.

Each code ticket needs a unit test with Azure clients mocked and a demo-mode
test proving absent env or absent secret disables the feature cleanly.
