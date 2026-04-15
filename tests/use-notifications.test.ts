/** @jest-environment jsdom */

import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useNotifications } from "@/hooks/useNotifications";

jest.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
}));

function NotificationHarness() {
  const { notifications, unreadCount, markRead, markAllRead } =
    useNotifications();

  return (
    React.createElement("div", null,
      React.createElement("p", null, `Unread: ${unreadCount}`),
      React.createElement(
        "button",
        { type: "button", onClick: () => markRead("notif-1") },
        "Mark one"
      ),
      React.createElement(
        "button",
        { type: "button", onClick: () => markAllRead() },
        "Mark all"
      ),
      notifications.map((notification) =>
        React.createElement(
          "span",
          { key: notification.id },
          `${notification.id}:${notification.read ? "read" : "unread"}`
        )
      )
    )
  );
}

describe("useNotifications reliability guards", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: jest.fn(),
    });
  });

  it("rolls back optimistic mark-all-read when the route fails", async () => {
    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/notifications?limit=20") {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                id: "notif-1",
                type: "system",
                title: "A notification",
                body: null,
                metadata: {},
                read: false,
                created_at: "2026-04-14T12:00:00.000Z",
              },
            ],
          }),
        } as Response;
      }

      if (
        url === "/api/notifications/mark-all-read" &&
        init?.method === "POST"
      ) {
        return {
          ok: false,
          json: async () => ({ error: "nope" }),
        } as Response;
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    render(React.createElement(NotificationHarness));

    await screen.findByText("Unread: 1");
    expect(screen.getByText("notif-1:unread")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Mark all" }));

    await waitFor(() => {
      expect(screen.getByText("Unread: 1")).toBeTruthy();
      expect(screen.getByText("notif-1:unread")).toBeTruthy();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/notifications/mark-all-read", {
      method: "POST",
    });
  });
});
