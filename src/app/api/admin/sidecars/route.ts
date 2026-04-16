import {
  GET as getShadowRollout,
  PATCH as patchShadowRollout,
} from "../shadow-rollout/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = getShadowRollout;
export const PATCH = patchShadowRollout;
