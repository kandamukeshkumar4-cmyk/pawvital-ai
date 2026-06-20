import { summarizeFollowupsForContext } from "@/lib/health-log/context";

describe("summarizeFollowupsForContext (follow-up outcome → Brain reasoning)", () => {
  it("(proof e) a WORSE outcome escalates the next action toward the vet", () => {
    const out = summarizeFollowupsForContext(
      [
        {
          prompt: "Is the stool change better, same, or worse?",
          status: "worse",
          updated_at: "2026-06-18T10:00:00Z",
        },
      ],
      "Bruno",
    );
    expect(out).toContain("WORSE");
    expect(out.toLowerCase()).toContain("vet");
    expect(out).toContain("2026-06-18");
  });

  it("(proof e) a BETTER outcome de-escalates", () => {
    const out = summarizeFollowupsForContext(
      [{ prompt: "Any improvement since the probiotic?", status: "better" }],
      "Bruno",
    );
    expect(out.toLowerCase()).toContain("de-escalat");
    expect(out.toLowerCase()).not.toContain("worse");
  });

  it("(proof e) the SAME follow-up yields three different next actions by outcome", () => {
    const prompt = "Is appetite better, same, or worse?";
    const worse = summarizeFollowupsForContext([{ prompt, status: "worse" }], "Bruno");
    const same = summarizeFollowupsForContext([{ prompt, status: "same" }], "Bruno");
    const better = summarizeFollowupsForContext([{ prompt, status: "better" }], "Bruno");
    // The owner's answer measurably changes what the Brain says next.
    expect(new Set([worse, same, better]).size).toBe(3);
    expect(same.toLowerCase()).toContain("keep monitoring");
  });

  it("pending follow-ups read as active concerns with a due date", () => {
    const out = summarizeFollowupsForContext(
      [
        {
          prompt: "How is the limp today?",
          status: "pending",
          due_at: "2026-06-21T00:00:00Z",
        },
      ],
      "Bruno",
    );
    expect(out.toLowerCase()).toContain("active concern");
    expect(out).toContain("2026-06-21");
  });

  it("dismissed follow-ups and empty lists contribute nothing", () => {
    expect(summarizeFollowupsForContext([], "Bruno")).toBe("");
    expect(
      summarizeFollowupsForContext([{ prompt: "x", status: "dismissed" }], "Bruno"),
    ).toBe("");
  });
});
