/** @jest-environment jsdom */

import * as React from "react";
import { render, screen } from "@testing-library/react";
import { BrainTimelineSection } from "@/components/analytics/brain-timeline-section";

const SUMMARY = "Appetite was lower than normal";
const DATA = {
  entries: [
    {
      date: "2026-06-18",
      source: "daily_log",
      summary: SUMMARY,
      tone: "changed",
      details: [],
      hasPhotos: false,
    },
  ],
  vetSummary: "Bruno had reduced appetite this week.",
  recurringSymptoms: ["appetite"],
  logNext: ["Keep logging meals"],
};

describe("BrainTimelineSection — History Brain timeline", () => {
  afterEach(() => jest.restoreAllMocks());

  it("fetches and renders the owner timeline for the active pet", async () => {
    const fetchMock = jest.fn(() =>
      Promise.resolve({ json: async () => ({ data: DATA }) } as Response),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<BrainTimelineSection petId="pet-1" petName="Bruno" />);

    // The dated owner event renders…
    expect(await screen.findByText(SUMMARY)).toBeTruthy();
    // …from the owner-scoped timeline route…
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/analytics/vet-timeline?pet_id=pet-1",
    );
    // …with the vet-ready summary framing.
    expect(screen.getByText(/Bruno had reduced appetite/i)).toBeTruthy();
  });

  it("shows an empty state when there is no timeline yet", async () => {
    const fetchMock = jest.fn(() =>
      Promise.resolve({ json: async () => ({ data: null }) } as Response),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<BrainTimelineSection petId="pet-1" petName="Bruno" />);
    expect(await screen.findByText(/No Brain timeline yet/i)).toBeTruthy();
  });

  it("never fetches without a pet and shows the empty state", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<BrainTimelineSection petId={null} petName="Bruno" />);
    expect(await screen.findByText(/No Brain timeline yet/i)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
