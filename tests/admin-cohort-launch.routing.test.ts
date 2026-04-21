import fs from "node:fs";
import path from "node:path";

const cohortLaunchSourcePath = path.join(
  process.cwd(),
  "src",
  "app",
  "(dashboard)",
  "admin",
  "cohort-launch",
  "page.tsx"
);
const appPathsManifestPath = path.join(
  process.cwd(),
  ".next",
  "server",
  "app-paths-manifest.json"
);

describe("admin cohort launch routing", () => {
  it("keeps the cohort launch page in the dashboard app tree", () => {
    expect(fs.existsSync(cohortLaunchSourcePath)).toBe(true);
  });

  it("maps the cohort launch page into the app-path manifest when build output exists", () => {
    if (!fs.existsSync(appPathsManifestPath)) {
      expect(fs.existsSync(cohortLaunchSourcePath)).toBe(true);
      return;
    }

    const manifest = JSON.parse(
      fs.readFileSync(appPathsManifestPath, "utf8")
    ) as Record<string, string>;

    expect(manifest["/(dashboard)/admin/cohort-launch/page"]).toBe(
      "app/(dashboard)/admin/cohort-launch/page.js"
    );
  });
});
