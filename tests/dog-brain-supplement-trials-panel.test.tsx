/** @jest-environment jsdom */

import * as React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  SupplementTrialsPanel,
  type SupplementTrial,
} from "@/components/dog-brain/supplement-trials-panel";

const PET = "11111111-1111-4111-8111-111111111111";

function trial(over: Partial<SupplementTrial> = {}): SupplementTrial {
  return {
    id: "t1",
    supplement_name: "Fish Oil",
    reason_signal_key: "energy_behavior_change",
    status: "ask_vet",
    outcome: null,
    outcome_at: null,
    follow_up_due_at: null,
    created_at: "2026-06-23T00:00:00.000Z",
    ...over,
  };
}

/** Mock fetch with a mutable trials list so re-reads reflect prior mutations. */
function mockFetch(initial: SupplementTrial[]) {
  let list = [...initial];
  const fetchMock = jest.fn((url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? "GET";
    if (method === "GET") {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: list }) } as Response);
    }
    if (method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      list = [
        trial({ id: `t${list.length + 1}`, supplement_name: body.supplement_name, reason_signal_key: body.reason_signal_key ?? null }),
        ...list,
      ];
      return Promise.resolve({ ok: true, status: 201, json: async () => ({ data: list[0] }) } as Response);
    }
    // PATCH ?id=...
    const id = new URL(u, "http://localhost").searchParams.get("id");
    const body = JSON.parse(String(init?.body ?? "{}"));
    list = list.map((t) => (t.id === id ? { ...t, status: "outcome_recorded", outcome: body.outcome, outcome_at: "2026-06-23T01:00:00.000Z" } : t));
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: list.find((t) => t.id === id) }) } as Response);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe("SupplementTrialsPanel — concrete DB-backed trials", () => {
  afterEach(() => jest.restoreAllMocks());

  it("loads and renders real persisted trials for the pet", async () => {
    const fetchMock = mockFetch([trial()]);
    render(<SupplementTrialsPanel petId={PET} petName="Scout" />);
    expect(await screen.findByText("Fish Oil")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(`/api/dog-brain/supplements?pet_id=${PET}`);
  });

  it("starting a trial POSTs the supplement name and re-reads the persisted list", async () => {
    const fetchMock = mockFetch([]);
    render(<SupplementTrialsPanel petId={PET} petName="Scout" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Supplement name"), { target: { value: "Glucosamine" } });
    fireEvent.click(screen.getByRole("button", { name: /track to ask vet/i }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === "POST");
      expect(post).toBeTruthy();
      expect(JSON.parse(String((post![1] as RequestInit).body))).toMatchObject({
        pet_id: PET,
        supplement_name: "Glucosamine",
      });
    });
    // The persisted row shows up after the re-read.
    expect(await screen.findByText("Glucosamine")).toBeTruthy();
  });

  it("recording an outcome PATCHes with the outcome and shows the terminal state", async () => {
    const fetchMock = mockFetch([trial()]);
    render(<SupplementTrialsPanel petId={PET} petName="Scout" />);
    const worse = await screen.findByRole("button", { name: /^worse$/i });
    fireEvent.click(worse);

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === "PATCH");
      expect(patch).toBeTruthy();
      expect(String(patch![0])).toContain("/api/dog-brain/supplements?id=t1");
      expect(JSON.parse(String((patch![1] as RequestInit).body))).toEqual({ outcome: "worse" });
    });
    expect(await screen.findByText(/outcome recorded: worse/i)).toBeTruthy();
  });

  it("one-tap suggestion chip starts a concrete trial for that supplement", async () => {
    const fetchMock = mockFetch([]);
    render(<SupplementTrialsPanel petId={PET} petName="Scout" suggestions={["Probiotic"]} />);
    const chip = await screen.findByRole("button", { name: /\+ Probiotic/ });
    fireEvent.click(chip);

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === "POST");
      expect(JSON.parse(String((post![1] as RequestInit).body)).supplement_name).toBe("Probiotic");
    });
  });

  it("never renders dosage / frequency / brand / price (safety invariant)", async () => {
    mockFetch([trial()]);
    const { container } = render(<SupplementTrialsPanel petId={PET} petName="Scout" suggestions={["Fish Oil"]} />);
    await screen.findByText("Fish Oil");
    expect(container.textContent?.toLowerCase()).not.toMatch(/dose|dosage|\bmg\b|\bml\b|\$|\/day|price/);
  });

  it("renders nothing without a pet", () => {
    const { container } = render(<SupplementTrialsPanel petId={null} petName="Scout" />);
    expect(container.textContent).toBe("");
  });
});
