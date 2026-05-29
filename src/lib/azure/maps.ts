import { getMapsClient } from "@/lib/azure";
import {
  getFlag,
  type AzureFeatureFlagOptions,
} from "@/lib/azure/app-config";

export const AZURE_MAPS_FEATURE_FLAG = "azure.maps.enabled";

export type AzureMapsFetch = (
  input: string | URL,
  init?: RequestInit
) => Promise<Pick<Response, "json" | "ok" | "status">>;

export type NearestEmergencyVet = {
  address: string | null;
  distanceMeters: number | null;
  id: string;
  mapUrl: string;
  name: string;
  phone: string | null;
  website: string | null;
};

export type FindNearestEmergencyVetsOptions = AzureFeatureFlagOptions & {
  fetchMaps?: AzureMapsFetch;
  limit?: number;
  radiusMeters?: number;
};

export type FindNearestEmergencyVetsResult =
  | {
      clinics: NearestEmergencyVet[];
      enabled: true;
    }
  | {
      clinics: [];
      enabled: false;
      reason:
        | "feature_disabled"
        | "invalid_location"
        | "maps_unavailable"
        | "not_configured";
    };

type AzureMapsSearchResponse = {
  results?: Array<{
    address?: {
      freeformAddress?: unknown;
    };
    dist?: unknown;
    id?: unknown;
    poi?: {
      name?: unknown;
      phone?: unknown;
      url?: unknown;
    };
    position?: {
      lat?: unknown;
      lon?: unknown;
    };
  }>;
};

function isValidCoordinate(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

function normalizeLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return 5;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), 10);
}

function normalizeRadius(radiusMeters: number | undefined): number {
  if (typeof radiusMeters !== "number" || !Number.isFinite(radiusMeters)) {
    return 50000;
  }
  return Math.min(Math.max(Math.trunc(radiusMeters), 1000), 100000);
}

function asString(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function asDistance(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asPosition(
  value: { lat?: unknown; lon?: unknown } | undefined
): { latitude: number; longitude: number } | null {
  if (
    !value ||
    typeof value.lat !== "number" ||
    typeof value.lon !== "number" ||
    !isValidCoordinate(value.lat, -90, 90) ||
    !isValidCoordinate(value.lon, -180, 180)
  ) {
    return null;
  }

  return { latitude: value.lat, longitude: value.lon };
}

function buildMapUrl(position: { latitude: number; longitude: number }): string {
  const query = `${position.latitude.toFixed(6)},${position.longitude.toFixed(6)}`;
  const encodedQuery = encodeURIComponent(query);
  return `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`;
}

function mapSearchResult(
  result: NonNullable<AzureMapsSearchResponse["results"]>[number],
  index: number
): NearestEmergencyVet | null {
  const position = asPosition(result.position);
  const name = asString(result.poi?.name);
  if (!position || !name) {
    return null;
  }

  return {
    address: asString(result.address?.freeformAddress),
    distanceMeters: asDistance(result.dist),
    id: asString(result.id) ?? `${name}-${index}`,
    mapUrl: buildMapUrl(position),
    name,
    phone: asString(result.poi?.phone),
    website: asString(result.poi?.url),
  };
}

function buildSearchUrl(input: {
  key: string;
  latitude: number;
  limit: number;
  longitude: number;
  radiusMeters: number;
}): URL {
  const url = new URL("https://atlas.microsoft.com/search/fuzzy/json");
  url.searchParams.set("api-version", "1.0");
  url.searchParams.set("subscription-key", input.key);
  url.searchParams.set("query", "emergency veterinarian");
  url.searchParams.set("lat", input.latitude.toFixed(6));
  url.searchParams.set("lon", input.longitude.toFixed(6));
  url.searchParams.set("radius", String(input.radiusMeters));
  url.searchParams.set("limit", String(input.limit));
  return url;
}

export async function findNearestEmergencyVets(
  input: {
    latitude: number;
    longitude: number;
  },
  options: FindNearestEmergencyVetsOptions = {}
): Promise<FindNearestEmergencyVetsResult> {
  if (
    !isValidCoordinate(input.latitude, -90, 90) ||
    !isValidCoordinate(input.longitude, -180, 180)
  ) {
    return { clinics: [], enabled: false, reason: "invalid_location" };
  }

  const enabled = await getFlag(AZURE_MAPS_FEATURE_FLAG, options);
  if (!enabled) {
    return { clinics: [], enabled: false, reason: "feature_disabled" };
  }

  const mapsClient = await getMapsClient(options);
  if (!mapsClient) {
    return { clinics: [], enabled: false, reason: "not_configured" };
  }

  const fetchMaps = options.fetchMaps ?? fetch;
  const url = buildSearchUrl({
    key: mapsClient.key,
    latitude: input.latitude,
    limit: normalizeLimit(options.limit),
    longitude: input.longitude,
    radiusMeters: normalizeRadius(options.radiusMeters),
  });

  try {
    const response = await fetchMaps(url, { method: "GET" });
    if (!response.ok) {
      return { clinics: [], enabled: false, reason: "maps_unavailable" };
    }

    const payload = (await response.json()) as AzureMapsSearchResponse;
    const clinics = (payload.results ?? [])
      .map(mapSearchResult)
      .filter((clinic): clinic is NearestEmergencyVet => Boolean(clinic));

    return { clinics, enabled: true };
  } catch {
    return { clinics: [], enabled: false, reason: "maps_unavailable" };
  }
}
