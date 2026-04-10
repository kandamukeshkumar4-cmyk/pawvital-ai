import type { SidecarServiceName } from "./clinical-evidence";

export type SidecarErrorCategory =
  | "timeout"
  | "connection_refused"
  | "http_error"
  | "parse_error"
  | "unknown";

export type SidecarCallResult<T> =
  | { ok: true; data: T; latencyMs: number; service: SidecarServiceName }
  | {
      ok: false;
      error: string;
      category: SidecarErrorCategory;
      latencyMs: number;
      service: SidecarServiceName;
    };
