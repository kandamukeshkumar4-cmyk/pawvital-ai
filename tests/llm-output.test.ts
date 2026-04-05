import {
  extractFirstJsonObject,
  safeParseJson,
  stripMarkdownCodeFences,
  stripThinkingBlocks,
} from "@/lib/llm-output";

describe("llm-output utilities", () => {
  it("removes reasoning blocks before parsing", () => {
    expect(
      stripThinkingBlocks('<think>internal reasoning</think>{"ok":true}')
    ).toBe('{"ok":true}');
  });

  it("removes surrounding markdown fences", () => {
    expect(stripMarkdownCodeFences('```json\n{"ok":true}\n```')).toBe(
      '{"ok":true}'
    );
  });

  it("extracts the first JSON object from noisy model output", () => {
    expect(
      extractFirstJsonObject(
        'preface {"outer":{"nested":true},"value":1} trailing text'
      )
    ).toBe('{"outer":{"nested":true},"value":1}');
  });

  it("parses fenced JSON with thinking blocks", () => {
    const parsed = safeParseJson<{ severity: string }>(
      '<think>reasoning</think>```json\n{"severity":"high"}\n```',
      "test output"
    );

    expect(parsed).toEqual({ severity: "high" });
  });

  it("throws a labeled error for invalid JSON", () => {
    expect(() => safeParseJson("not-json", "symptom check")).toThrow(
      "symptom check returned invalid JSON"
    );
  });
});