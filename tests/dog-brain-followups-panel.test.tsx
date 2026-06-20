/** @jest-environment jsdom */

import * as React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FollowupsPanel } from "@/components/dog-brain/followups-panel";

const PET = "pet-1";
const PROMPT = "Stool was off 3 days ago. Better, same, or worse today?";

function mockFetch() {
  const fetchMock = jest.fn(
    (url: string | URL | Request, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "GET") {
        return Promise.resolve({
          json: async () => ({
            data: [
              { id: "f1", signal_key: "stool_change", prompt: PROMPT, due_at: null },
            ],
          }),
        } as Response);
      }
      // PATCH resolve outcome
      return Promise.resolve({ json: async () => ({ data: { id: "f1" } }) } as Response);
    },
  );
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe("FollowupsPanel — Brain follow-ups surfaced in the Reminders queue", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders a pending Brain follow-up for the active pet (display-only, no auto-create)", async () => {
    const fetchMock = mockFetch();
    render(<FollowupsPanel petId={PET} />);

    // The owner sees the Brain's question rendered in the queue.
    const item = await screen.findByText(PROMPT);
    expect(item).toBeTruthy();

    // It fetched this pet's pending follow-ups…
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/dog-brain/followups?pet_id=${PET}`,
    );
    // …and, with no signals passed, never POSTed to auto-create any.
    const postCalls = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST",
    );
    expect(postCalls).toHaveLength(0);
  });

  it("resolving 'worse' PATCHes the outcome and removes the item from the queue", async () => {
    const fetchMock = mockFetch();
    render(<FollowupsPanel petId={PET} />);

    const worseBtn = await screen.findByRole("button", { name: /worse/i });
    fireEvent.click(worseBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/dog-brain/followups/f1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ status: "worse" }),
        }),
      );
    });

    // Optimistic removal — the resolved follow-up leaves the queue.
    await waitFor(() => expect(screen.queryByText(PROMPT)).toBeNull());
  });

  it("renders nothing when there are no pending follow-ups", async () => {
    const fetchMock = jest.fn(() =>
      Promise.resolve({ json: async () => ({ data: [] }) } as Response),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const { container } = render(<FollowupsPanel petId={PET} />);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/dog-brain/followups?pet_id=${PET}`,
      ),
    );
    expect(container.textContent).toBe("");
  });
});
