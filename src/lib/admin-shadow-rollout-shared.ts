export const LIVE_SPLIT_VALUES = [0, 5, 10, 15, 20] as const;

export type LiveSplitPct = (typeof LIVE_SPLIT_VALUES)[number];
