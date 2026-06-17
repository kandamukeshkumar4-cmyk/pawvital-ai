import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const scriptPath = path.join(
  process.cwd(),
  "scripts",
  "build-cohort1-invite-send-proof.mjs"
);

const header =
  "tester_alias,email,dog_name,dog_age,dog_breed_size,device_browser,allowlist_status,invitation_sent_proof,consent_status,first_login_timestamp,first_symptom_check_timestamp,feedback_submitted,deletion_requested,access_disabled,notes";

function runValidator(csv: string) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pawvital-cohort-"));
  const csvPath = path.join(tmpDir, "registry.csv");
  fs.writeFileSync(csvPath, csv);

  const result = spawnSync(process.execPath, [scriptPath, "--input", csvPath], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }

  return {
    output: result.stdout,
    readout: JSON.parse(result.stdout),
  };
}

describe("Cohort 1 invite-send proof validator", () => {
  it("keeps the template/example registry on HOLD", () => {
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("tester@example.com");

    const readout = JSON.parse(result.stdout);
    expect(readout.decision.inviteSendProof).toBe("HOLD");
    expect(readout.summary.intendedTesterCount).toBe(0);
    expect(readout.blockers.map((entry: { code: string }) => entry.code)).toEqual(
      expect.arrayContaining(["NO_INTENDED_TESTERS", "PLACEHOLDER_ROWS_PRESENT"])
    );
  });

  it("accepts a capped real invite-proof registry as review-only proof", () => {
    const csv = [
      header,
      "alpha,a@example.test,Biscuit,4 years,medium mix,iPhone Safari,allowlisted,2026-06-12T15:40:00Z email msg alpha,pending_onboarding,,,,no,no,manual invite sent",
      "beta,b@example.test,Moose,7 years,large lab,Android Chrome,allowlisted,2026-06-12T15:45:00Z email msg beta,pending_onboarding,,,,no,no,manual invite sent",
    ].join("\n");

    const { output, readout } = runValidator(csv);

    expect(output).not.toContain("a@example.test");
    expect(output).not.toContain("b@example.test");
    expect(readout.decision.inviteSendProof).toBe("GO_REVIEW_ONLY");
    expect(readout.decision.cohortLaunchExecution).toBe("HOLD");
    expect(readout.summary.intendedTesterCount).toBe(2);
    expect(readout.summary.rowsWithInvitationProof).toBe(2);
    expect(readout.summary.p0BlockerCount).toBe(0);
  });

  it("rejects over-cap launch registries and duplicate emails", () => {
    const rows = Array.from({ length: 6 }, (_, index) => {
      const email = index === 5 ? "tester1@example.test" : `tester${index + 1}@example.test`;
      return `tester-${index + 1},${email},Dog ${index + 1},3 years,medium,desktop Chrome,allowlisted,2026-06-12T15:4${index}:00Z email msg ${index},pending_onboarding,,,,no,no,manual invite sent`;
    });
    const { readout } = runValidator([header, ...rows].join("\n"));

    expect(readout.decision.inviteSendProof).toBe("HOLD");
    expect(readout.summary.intendedTesterCount).toBe(6);
    expect(readout.blockers.map((entry: { code: string }) => entry.code)).toEqual(
      expect.arrayContaining(["FIRST_COHORT_CAP_EXCEEDED", "DUPLICATE_EMAIL"])
    );
  });
});
