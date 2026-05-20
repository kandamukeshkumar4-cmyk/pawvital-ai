/** @jest-environment jsdom */

import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { usePets } from "@/hooks/useSupabase";
import { useAppStore } from "@/store/app-store";
import type { Pet } from "@/types";

jest.mock("@/lib/supabase", () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: {
          user: { id: "user-1" },
        },
      }),
    },
  })),
  isSupabaseConfigured: true,
}));

const TEST_PET: Pet = {
  id: "draft-pet-1",
  user_id: "user-1",
  name: "Buddy",
  breed: "Golden Retriever",
  species: "dog",
  age_years: 4,
  age_months: 0,
  age_unit: "years",
  weight: 55,
  weight_unit: "lbs",
  gender: "male",
  is_neutered: true,
  existing_conditions: [],
  medications: [],
  created_at: "2026-05-20T00:00:00.000Z",
  updated_at: "2026-05-20T00:00:00.000Z",
};

function SavePetHarness({ pet }: { pet: Pet }) {
  const { savePet } = usePets();
  const [result, setResult] = React.useState("");

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      "button",
      {
        type: "button",
        onClick: async () => {
          try {
            await savePet(pet);
            setResult("saved");
          } catch (error) {
            setResult(error instanceof Error ? error.message : String(error));
          }
        },
      },
      "save pet"
    ),
    React.createElement("div", { "data-testid": "save-result" }, result)
  );
}

describe("usePets savePet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAppStore.setState((state) => ({
      ...state,
      pets: [],
      activePet: null,
      user: {
        id: "user-1",
        email: "tester@example.com",
        full_name: "Tester",
        subscription_status: "free_trial",
        created_at: "2026-05-20T00:00:00.000Z",
      },
      userDataLoaded: true,
    }));
  });

  it("surfaces exact safe error details when the server rejects pet creation", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        error: "Failed to save dog profile.",
        safeError: {
          code: "42501",
          message:
            'new row violates row-level security policy for table "pets"',
          details: "The authenticated role could not insert this pets row.",
          hint: "Use the authenticated owner route instead of a client upsert.",
        },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(React.createElement(SavePetHarness, { pet: TEST_PET }));

    fireEvent.click(screen.getByRole("button", { name: "save pet" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/pets",
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("save-result").textContent).toContain("42501");
      expect(screen.getByTestId("save-result").textContent).toContain(
        'new row violates row-level security policy for table "pets"'
      );
      expect(screen.getByTestId("save-result").textContent).toContain(
        "The authenticated role could not insert this pets row."
      );
      expect(screen.getByTestId("save-result").textContent).toContain(
        "Use the authenticated owner route instead of a client upsert."
      );
    });
  });
});
