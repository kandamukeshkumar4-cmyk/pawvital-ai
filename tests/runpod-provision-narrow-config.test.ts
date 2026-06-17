import { readFileSync } from "node:fs";
import path from "node:path";

function readProvisionScript(): string {
  return readFileSync(
    path.join(process.cwd(), "scripts", "runpod-provision-narrow.mjs"),
    "utf8"
  );
}

describe("RunPod narrow model pack provisioning config", () => {
  it("uses RunPod REST API GPU type IDs accepted by the current enum", () => {
    const script = readProvisionScript();

    expect(script).not.toContain("NVIDIA A100 40GB PCIe");
    expect(script).not.toContain("NVIDIA A100-SXM4-40GB");
    expect(script).toContain("NVIDIA A100 80GB PCIe");
    expect(script).toContain("NVIDIA A100-SXM4-80GB");
    expect(script).toContain("NVIDIA H100 80GB HBM3");
    expect(script).toContain("NVIDIA H200");
    expect(script).toContain("supportPublicIp: true");
  });
});
