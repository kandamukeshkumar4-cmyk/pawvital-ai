import { evaluateImageGate } from "@/lib/image-gate";

describe("image gate", () => {
  const originalHfToken = process.env.HF_TOKEN;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalHfToken === undefined) {
      delete process.env.HF_TOKEN;
    } else {
      process.env.HF_TOKEN = originalHfToken;
    }
  });

  it("keeps local blur gating active when remote classification is skipped", async () => {
    process.env.HF_TOKEN = "test-token";
    const fetchSpy = jest.spyOn(global, "fetch");

    const result = await evaluateImageGate(
      "data:image/jpeg;base64,ZmFrZQ==",
      { width: 1024, height: 768, blurScore: 9, estimatedKb: 180 },
      { skipRemoteClassification: true }
    );

    expect(result).toEqual({ reason: "blurry" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps local resolution gating active when remote classification is skipped", async () => {
    process.env.HF_TOKEN = "test-token";
    const fetchSpy = jest.spyOn(global, "fetch");

    const result = await evaluateImageGate(
      "data:image/jpeg;base64,ZmFrZQ==",
      { width: 320, height: 240, blurScore: 30, estimatedKb: 40 },
      { skipRemoteClassification: true }
    );

    expect(result).toEqual({ reason: "low_resolution" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
