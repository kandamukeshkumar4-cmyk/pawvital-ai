import { jsonOk } from "@/lib/api-route";
import {
  getEnvironmentValidationIssues,
  getCanonicalAppUrl,
  hasSymptomChatSessionSecret,
  isResendConfigured,
  isStripeFullyConfigured,
  isSupabaseConfigured,
  isSupabaseServiceRoleConfigured,
  isUpstashConfigured,
  serverEnv,
} from "@/lib/env";
import {
  getSymptomChatSessionStoreMode,
  isSymptomChatSessionStoreDistributed,
} from "@/lib/symptom-chat/server-session";

export const dynamic = "force-dynamic";

function buildHealthPayload() {
  const issues = getEnvironmentValidationIssues();
  const ok = issues.length === 0;

  return {
    ok,
    status: ok ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    environment: serverEnv.NODE_ENV,
    appUrl: getCanonicalAppUrl(),
    checks: {
      resendConfigured: isResendConfigured(),
      stripeConfigured: isStripeFullyConfigured(),
      supabaseConfigured: isSupabaseConfigured(),
      supabaseServiceConfigured: isSupabaseServiceRoleConfigured(),
      upstashConfigured: isUpstashConfigured(),
      symptomChatSessionSecretConfigured: hasSymptomChatSessionSecret(),
      symptomChatSessionStoreDistributed:
        isSymptomChatSessionStoreDistributed(),
      symptomChatSessionStoreMode: getSymptomChatSessionStoreMode(),
    },
    issues,
  };
}

export async function GET() {
  const payload = buildHealthPayload();
  return jsonOk(payload, { status: payload.ok ? 200 : 503 });
}

export async function HEAD() {
  const payload = buildHealthPayload();
  return new Response(null, {
    status: payload.ok ? 200 : 503,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
