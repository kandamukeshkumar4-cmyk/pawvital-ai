# PawVital Azure Ecosystem

Status: AZ-001 inventory baseline for the existing Azure resources.

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
| Budget | Manual required | CLI creation is RBAC-blocked. Create `$100` budget alerts at `50/80/100%` in Azure Portal Cost Management. |
| Service principal | Required before production wiring | Create `pawvital-sp` scoped to `pawvital-rg` with `Key Vault Secrets User`. |
| App env | Required before production wiring | Store only `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, and `AZURE_KEY_VAULT_NAME` in Vercel and local `.env.local`. |
| Cognitive retention | Manual required | Disable data retention/abuse monitoring where each cognitive resource and Portal blade supports it. Record any unsupported resource in this doc. |

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
