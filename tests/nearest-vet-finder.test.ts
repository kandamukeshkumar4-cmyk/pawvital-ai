/** @jest-environment jsdom */

import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NearestVetFinder } from "@/components/symptom-report/nearest-vet-finder";

type GeolocationSuccess = (position: {
  coords: Pick<GeolocationCoordinates, "latitude" | "longitude">;
}) => void;
type GeolocationFailure = (error: Pick<GeolocationPositionError, "code">) => void;

function setGeolocationMock(
  implementation: (
    success: GeolocationSuccess,
    failure: GeolocationFailure
  ) => void
) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: jest.fn(implementation),
    },
  });
}

describe("NearestVetFinder", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("requests one-time browser location and renders returned clinics", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      json: async () => ({
        clinics: [
          {
            address: "1 Clinic Way",
            distanceMeters: 1609.344,
            id: "clinic-1",
            mapUrl:
              "https://www.google.com/maps/search/?api=1&query=41.150000%2C-81.360000",
            name: "Kent Emergency Veterinary Hospital",
            phone: "+13305550123",
            website: "https://clinic.example",
          },
        ],
        enabled: true,
      }),
      ok: true,
    });
    global.fetch = fetchMock;
    setGeolocationMock((success) =>
      success({ coords: { latitude: 41.149, longitude: -81.358 } })
    );

    render(React.createElement(NearestVetFinder));

    fireEvent.click(screen.getByRole("button", { name: "Find nearby" }));

    await waitFor(() =>
      expect(
        screen.getByText("Kent Emergency Veterinary Hospital")
      ).toBeTruthy()
    );
    expect(screen.getByText("1.0 mi away")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/azure/maps/nearest-vets", {
      body: JSON.stringify({
        latitude: 41.149,
        longitude: -81.358,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  });

  it("hides itself when browser location permission is denied", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    setGeolocationMock((_, failure) => failure({ code: 1 }));

    const { container } = render(React.createElement(NearestVetFinder));

    fireEvent.click(screen.getByRole("button", { name: "Find nearby" }));

    await waitFor(() => expect(container.textContent).toBe(""));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
