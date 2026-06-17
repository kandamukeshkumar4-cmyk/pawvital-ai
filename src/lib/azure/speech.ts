import { getSpeechToken, type AzureClientOptions } from "@/lib/azure";
import {
  getFlag,
  type AzureFeatureFlagOptions,
} from "@/lib/azure/app-config";

export const AZURE_SPEECH_FEATURE_FLAG = "azure.speech.enabled";
export const AZURE_SPEECH_TOKEN_TTL_SECONDS = 540;

type SpeechTokenFetchResponse = {
  ok: boolean;
  status: number;
  text(): Promise<string>;
};

export type SpeechTokenFetch = (
  input: string,
  init: {
    headers: Record<string, string>;
    method: "POST";
  }
) => Promise<SpeechTokenFetchResponse>;

export type AzureSpeechAuthorizationToken =
  | {
      enabled: false;
      reason: "feature_disabled" | "speech_unavailable";
    }
  | {
      enabled: true;
      expiresInSeconds: number;
      region: string;
      token: string;
    };

export type AzureSpeechAuthorizationTokenOptions = AzureFeatureFlagOptions &
  AzureClientOptions & {
    fetchToken?: SpeechTokenFetch;
  };

function defaultFetchToken(
  input: string,
  init: {
    headers: Record<string, string>;
    method: "POST";
  }
): Promise<SpeechTokenFetchResponse> {
  return fetch(input, init);
}

function buildSpeechIssueTokenUrl(region: string): string {
  return `https://${encodeURIComponent(region)}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;
}

export async function getSpeechAuthorizationToken(
  options: AzureSpeechAuthorizationTokenOptions = {}
): Promise<AzureSpeechAuthorizationToken> {
  const enabled = await getFlag(AZURE_SPEECH_FEATURE_FLAG, options);
  if (!enabled) {
    return { enabled: false, reason: "feature_disabled" };
  }

  const config = await getSpeechToken(options);
  if (!config) {
    return { enabled: false, reason: "speech_unavailable" };
  }

  try {
    const fetchToken = options.fetchToken ?? defaultFetchToken;
    const response = await fetchToken(buildSpeechIssueTokenUrl(config.region), {
      headers: {
        "Ocp-Apim-Subscription-Key": config.key,
      },
      method: "POST",
    });
    if (!response.ok) {
      return { enabled: false, reason: "speech_unavailable" };
    }

    const token = (await response.text()).trim();
    if (!token) {
      return { enabled: false, reason: "speech_unavailable" };
    }

    return {
      enabled: true,
      expiresInSeconds: AZURE_SPEECH_TOKEN_TTL_SECONDS,
      region: config.region,
      token,
    };
  } catch {
    return { enabled: false, reason: "speech_unavailable" };
  }
}
