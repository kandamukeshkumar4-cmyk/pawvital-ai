import { redirect } from "next/navigation";

// Paw Circle (community) is quarantined: it was a static mock (hardcoded posts,
// no backend) and is not part of the approved owner experience. It is unlinked
// from the sidebar and any direct visit is redirected to the dashboard until a
// real, moderated community backend exists. See DESIGN.md and
// src/lib/private-tester-scope.ts.
export default function CommunityPage() {
  redirect("/dashboard");
}
