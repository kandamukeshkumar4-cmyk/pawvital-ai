"use client";

import { useState } from "react";
import {
  ExternalLink,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  Phone,
} from "lucide-react";
import Button from "@/components/ui/button";
import type {
  FindNearestEmergencyVetsResult,
  NearestEmergencyVet,
} from "@/lib/azure/maps";
import { CollapsibleSection } from "./collapsible-section";

type MapsUnavailableReason =
  | "feature_disabled"
  | "invalid_location"
  | "maps_unavailable"
  | "not_configured";

type MapsResponse = FindNearestEmergencyVetsResult;

type LookupState =
  | "idle"
  | "locating"
  | "loading"
  | "results"
  | "unavailable";

function formatDistance(distanceMeters: number | null): string | null {
  if (distanceMeters === null) {
    return null;
  }
  const miles = distanceMeters / 1609.344;
  return `${miles.toFixed(miles >= 10 ? 0 : 1)} mi`;
}

function shouldHideUnavailable(reason: MapsUnavailableReason): boolean {
  return reason === "feature_disabled" || reason === "not_configured";
}

export function NearestVetFinder() {
  const [clinics, setClinics] = useState<NearestEmergencyVet[]>([]);
  const [hidden, setHidden] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [state, setState] = useState<LookupState>("idle");

  const lookupClinics = async (coords: GeolocationCoordinates) => {
    setState("loading");
    setMessage(null);
    try {
      const response = await fetch("/api/azure/maps/nearest-vets", {
        body: JSON.stringify({
          latitude: coords.latitude,
          longitude: coords.longitude,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as MapsResponse;
      if (!data.enabled) {
        if (shouldHideUnavailable(data.reason)) {
          setHidden(true);
          return;
        }
        setClinics([]);
        setMessage("Nearby emergency clinics are unavailable right now.");
        setState("unavailable");
        return;
      }

      setClinics(data.clinics);
      setState("results");
      setMessage(
        data.clinics.length
          ? null
          : "No nearby emergency clinics were found for this location."
      );
    } catch {
      setClinics([]);
      setMessage("Nearby emergency clinics are unavailable right now.");
      setState("unavailable");
    }
  };

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setMessage("Location access is not available in this browser.");
      setState("unavailable");
      return;
    }

    setState("locating");
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      (position) => void lookupClinics(position.coords),
      (error) => {
        if (error.code === 1) {
          setHidden(true);
          return;
        }
        setMessage("Location access failed. Try again when GPS is available.");
        setState("unavailable");
      },
      {
        enableHighAccuracy: false,
        maximumAge: 5 * 60 * 1000,
        timeout: 10000,
      }
    );
  };

  if (hidden) {
    return null;
  }

  const busy = state === "locating" || state === "loading";

  return (
    <CollapsibleSection
      title="Nearby emergency vets"
      icon={MapPin}
      iconColor="text-red-600"
      defaultOpen
    >
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-800">
              Use your current location once to find nearby emergency clinics.
            </p>
            <p className="mt-1 text-xs text-gray-500">
              PawVital does not save your coordinates.
            </p>
          </div>
          <Button
            type="button"
            variant="danger"
            size="sm"
            className="w-full gap-2 sm:w-auto"
            disabled={busy}
            onClick={requestLocation}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LocateFixed className="h-4 w-4" />
            )}
            <span>{busy ? "Searching" : "Find nearby"}</span>
          </Button>
        </div>

        {message ? <p className="text-sm text-gray-600">{message}</p> : null}

        {clinics.length > 0 ? (
          <div className="grid gap-3">
            {clinics.map((clinic) => {
              const distance = formatDistance(clinic.distanceMeters);
              return (
                <div
                  key={clinic.id}
                  className="rounded-lg border border-red-100 bg-red-50/50 p-3"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-950">
                        {clinic.name}
                      </p>
                      {clinic.address ? (
                        <p className="mt-1 text-sm text-gray-700">
                          {clinic.address}
                        </p>
                      ) : null}
                      {distance ? (
                        <p className="mt-1 text-xs font-semibold text-red-700">
                          {distance} away
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {clinic.phone ? (
                        <a
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-50"
                          href={`tel:${clinic.phone}`}
                        >
                          <Phone className="h-3.5 w-3.5" />
                          Call
                        </a>
                      ) : null}
                      <a
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-50"
                        href={clinic.mapUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <Navigation className="h-3.5 w-3.5" />
                        Map
                      </a>
                      {clinic.website ? (
                        <a
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                          href={clinic.website}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Site
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </CollapsibleSection>
  );
}
