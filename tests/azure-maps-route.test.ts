import { findNearestEmergencyVets } from "@/lib/azure/maps";

jest.mock("@/lib/azure/maps", () => ({
  findNearestEmergencyVets: jest.fn(),
}));

const mockedFindNearestEmergencyVets =
  findNearestEmergencyVets as jest.MockedFunction<
    typeof findNearestEmergencyVets
  >;

describe("POST /api/azure/maps/nearest-vets", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("returns no-store invalid_location for malformed JSON", async () => {
    const { POST } = await import(
      "@/app/api/azure/maps/nearest-vets/route"
    );

    const response = await POST(
      new Request("http://localhost/api/azure/maps/nearest-vets", {
        body: "{",
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toEqual({
      clinics: [],
      enabled: false,
      reason: "invalid_location",
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mockedFindNearestEmergencyVets).not.toHaveBeenCalled();
  });

  it("passes coordinates to the Azure Maps helper without caching the response", async () => {
    mockedFindNearestEmergencyVets.mockResolvedValue({
      clinics: [],
      enabled: true,
    });
    const { POST } = await import(
      "@/app/api/azure/maps/nearest-vets/route"
    );

    const response = await POST(
      new Request("http://localhost/api/azure/maps/nearest-vets", {
        body: JSON.stringify({ latitude: 41.149, longitude: -81.358 }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toEqual({
      clinics: [],
      enabled: true,
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mockedFindNearestEmergencyVets).toHaveBeenCalledWith({
      latitude: 41.149,
      longitude: -81.358,
    });
  });
});
