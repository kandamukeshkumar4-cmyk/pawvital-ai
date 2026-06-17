#Requires -Version 5.1
param(
  [Parameter(Mandatory = $true)]
  [string]$SubscriptionId,
  [ValidateSet("dev", "prod")]
  [string]$Environment = "dev",
  [string]$Location = "eastus",
  [decimal]$BudgetAmount = 50
)

$ErrorActionPreference = "Stop"
$rg = "pawvital-$Environment-rg"
$kv = "pawvital-$Environment-kv"
$insights = "pawvital-$Environment-insights"
$storage = "pawvital$($Environment)store".ToLower().Replace("-", "")

Write-Host "Setting subscription $SubscriptionId"
az account set --subscription $SubscriptionId

Write-Host "Creating resource group $rg in $Location"
az group create --name $rg --location $Location --output none

Write-Host "Creating budget alert (cap USD $BudgetAmount)"
$budgetName = "pawvital-$Environment-budget"
az consumption budget create `
  --budget-name $budgetName `
  --amount $BudgetAmount `
  --category Cost `
  --time-grain Monthly `
  --resource-group $rg `
  2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Warning "Budget creation may require Cost Management permissions at subscription scope; create manually in portal."
}

Write-Host "Creating Key Vault $kv"
az keyvault create --name $kv --resource-group $rg --location $Location --output none

Write-Host "Creating Application Insights $insights"
az monitor app-insights component create `
  --app $insights `
  --location $Location `
  --resource-group $rg `
  --application-type web `
  --output none

Write-Host "Creating storage account $storage"
az storage account create `
  --name $storage `
  --resource-group $rg `
  --location $Location `
  --sku Standard_LRS `
  --output none

Write-Host "Creating cognitive services account (Speech, Translator, Doc Intel, Content Safety)"
$cognitive = "pawvital-$Environment-cog"
az cognitiveservices account create `
  --name $cognitive `
  --resource-group $rg `
  --kind CognitiveServices `
  --sku S0 `
  --location $Location `
  --yes `
  --output none `
  2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Warning "Cognitive Services account may already exist or SKU unavailable on student subscription."
}

Write-Host @"

Foundation scaffold complete (or use existing pawvital-rg — see docs/azure-ecosystem.md).

Existing subscription resources are preferred when pawvital-rg already exists:
  Resource group: pawvital-rg
  Key Vault:      pawvital-kv-nil7y8
  App Config:     pawvital-appconfig-nil7y8

Next steps:
- Copy cognitive keys/endpoints into Key Vault (speech, translator, docintel, contentsafety)
- Create App Configuration store and set feature flags (azure.speech.enabled, azure.docintel.enabled, azure.translator.enabled)
- Populate Key Vault secrets (see src/lib/azure/index.ts AZURE_SECRET_NAMES)
- Run: npm run check:keyvault-env-template
- Wire Vercel env vars and run npm run check:azure:vercel-env

"@
