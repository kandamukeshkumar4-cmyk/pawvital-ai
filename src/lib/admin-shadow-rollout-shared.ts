import type { SidecarServiceName } from "./clinical-evidence";

export const LIVE_SPLIT_VALUES = [0, 5, 10, 15, 20] as const;

export type LiveSplitPct = (typeof LIVE_SPLIT_VALUES)[number];

export function serviceToLiveSplitEnv(service: SidecarServiceName) {
  const suffix = service.replace(/-service$/, "").replace(/-/g, "_").toUpperCase();
  return `SIDECAR_LIVE_SPLIT_${suffix}`;
}
