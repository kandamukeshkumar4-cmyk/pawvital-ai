import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), ".env.local"), quiet: true });

jest.setTimeout(300000);

const hasLiveRetrieval =
  process.env.RUN_LIVE_RETRIEVAL_TESTS === "1" &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) &&
  Boolean(
    process.env.NVIDIA_API_KEY ||
      process.env.NVIDIA_VISION_API_KEY ||
      process.env.NVIDIA_QWEN_API_KEY ||
      process.env.NVIDIA_DEEPSEEK_API_KEY
  );

const describeIfLive = hasLiveRetrieval ? describe : describe.skip;

let searchKnowledgeChunks: typeof import("@/lib/knowledge-retrieval").searchKnowledgeChunks;
let searchReferenceImages: typeof import("@/lib/knowledge-retrieval").searchReferenceImages;

describeIfLive("live retrieval integration", () => {
  beforeAll(async () => {
    const retrieval = await import("@/lib/knowledge-retrieval");
    searchKnowledgeChunks = retrieval.searchKnowledgeChunks;
    searchReferenceImages = retrieval.searchReferenceImages;
  });

  it("retrieves wound-management knowledge semantically", async () => {
    const results = await searchKnowledgeChunks(
      "initial wound management lavage debridement bandage dog",
      5
    );

    expect(results.length).toBeGreaterThan(0);
    expect(
      results.some((result) =>
        `${result.sourceTitle} ${result.chunkTitle} ${result.textContent}`
          .toLowerCase()
          .includes("wound")
      )
    ).toBe(true);
  });

  it("retrieves malassezia and pyoderma knowledge semantically", async () => {
    const [malassezia, pyoderma] = await Promise.all([
      searchKnowledgeChunks("malassezia dermatitis yeast dog skin", 5),
      searchKnowledgeChunks(
        "bacterial pyoderma dermatitis dog skin infection",
        5
      ),
    ]);

    expect(malassezia.length).toBeGreaterThan(0);
    expect(
      malassezia.some((result) =>
        `${result.sourceTitle} ${result.chunkTitle} ${result.textContent}`
          .toLowerCase()
          .includes("malassezia")
      )
    ).toBe(true);

    expect(pyoderma.length).toBeGreaterThan(0);
    expect(
      pyoderma.some((result) =>
        `${result.sourceTitle} ${result.chunkTitle} ${result.textContent}`
          .toLowerCase()
          .match(/pyoderma|bacterial/i)
      )
    ).toBe(true);
  });

  it("retrieves ringworm, mange, healthy skin, and tick images", async () => {
    const [ringworm, mange, healthy, ticks] = await Promise.all([
      searchReferenceImages("ringworm circular hair loss dog skin", 5),
      searchReferenceImages("demodicosis mange crusting hair loss dog", 5),
      searchReferenceImages("healthy dog skin close up", 5),
      searchReferenceImages("tick infestation on dog skin close up", 5),
    ]);

    expect(ringworm.length).toBeGreaterThan(0);
    expect(
      ringworm.some((match) => match.conditionLabel === "ringworm")
    ).toBe(true);

    expect(mange.length).toBeGreaterThan(0);
    expect(
      mange.some((match) => match.conditionLabel === "demodicosis_mange")
    ).toBe(true);

    expect(healthy.length).toBeGreaterThan(0);
    expect(healthy[0]?.conditionLabel).toBe("healthy_skin");

    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks[0]?.conditionLabel).toBe("tick_infestation");
  });

  it("survives concurrent retrieval load without empty responses", async () => {
    const knowledgeQueries = [
      "initial wound management lavage debridement bandage dog",
      "malassezia dermatitis yeast dog skin",
      "bacterial pyoderma dermatitis dog skin infection",
      "wound dressings bandages moist wound healing dog",
    ];

    const imageQueries = [
      "ringworm circular hair loss dog skin",
      "demodicosis mange crusting hair loss dog",
      "healthy dog skin close up",
      "tick infestation on dog skin close up",
    ];

    const results = await Promise.all([
      ...knowledgeQueries.map((query) => searchKnowledgeChunks(query, 5)),
      ...imageQueries.map((query) => searchReferenceImages(query, 5)),
    ]);

    expect(results.every((result) => result.length > 0)).toBe(true);
  });
});
