/** @jest-environment jsdom */

import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OwnerOutcomeForm } from "@/components/symptom-report/owner-outcome-form";

const SYMPTOM_CHECK_ID = "11111111-1111-1111-1111-111111111111";

describe("OwnerOutcomeForm", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("posts the selected outcome and confirmed diagnosis to the feedback API", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, proposalCreated: false }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<OwnerOutcomeForm symptomCheckId={SYMPTOM_CHECK_ID} />);

    // All three outcome choices are rendered.
    expect(screen.getByText("Yes, it matched")).toBeTruthy();
    expect(screen.getByText("Partly")).toBeTruthy();
    expect(screen.getByText("No, it was different")).toBeTruthy();

    fireEvent.click(screen.getByText("No, it was different"));
    fireEvent.change(screen.getByPlaceholderText("What did the vet diagnose?"), {
      target: { value: "otitis externa" },
    });
    fireEvent.click(screen.getByText("Share outcome"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/ai/outcome-feedback");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({
      symptomCheckId: SYMPTOM_CHECK_ID,
      matchedExpectation: "no",
      confirmedDiagnosis: "otitis externa",
    });

    await screen.findByText("Thank you — your update was saved.");
  });

  it("shows the clinical-review message when the API reports a proposal was created", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, proposalCreated: true }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<OwnerOutcomeForm symptomCheckId={SYMPTOM_CHECK_ID} />);

    fireEvent.click(screen.getByText("Partly"));
    fireEvent.click(screen.getByText("Share outcome"));

    await screen.findByText(
      "Thank you — your report was flagged for clinical review."
    );
  });

  it("blocks submission until an outcome choice is made", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<OwnerOutcomeForm symptomCheckId={SYMPTOM_CHECK_ID} />);

    fireEvent.click(screen.getByText("Share outcome"));

    await screen.findByText(
      "Please choose whether this matched what happened."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders nothing without a symptomCheckId", () => {
    const { container } = render(<OwnerOutcomeForm symptomCheckId={null} />);
    expect(container.firstChild).toBeNull();
  });
});
