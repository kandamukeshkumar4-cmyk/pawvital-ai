/**
 * Self-Check Guides for VET-924
 *
 * Step-by-step instructions for critical signs owners can assess at home.
 */

export interface SelfCheckGuide {
  key: string;
  title: string;
  steps: string[];
  normalAppearance: string;
  concerningAppearance: string;
  cantAssessFallback: string;
}

export const SELF_CHECK_GUIDES: SelfCheckGuide[] = [
  {
    key: "gum_color",
    title: "Check Your Dog's Gum Color",
    steps: [
      "Gently lift your dog's upper lip",
      "Look at the gum color above the teeth",
      "Compare to the descriptions below",
      "Note: lighting can affect appearance - check in good light",
    ],
    normalAppearance: "Gums should be bubblegum pink (may be darker in dogs with pigmented gums)",
    concerningAppearance:
      "Blue/purple gums = emergency (lack of oxygen). Pale/white gums = emergency (blood loss/shock). Bright red gums = emergency (heat stroke/toxicity)",
    cantAssessFallback: "If your dog won't let you check or you can't see clearly, this requires veterinary assessment",
  },
  {
    key: "breathing_effort",
    title: "Assess Your Dog's Breathing",
    steps: [
      "Watch your dog while they're resting",
      "Count breaths for 15 seconds, multiply by 4",
      "Normal: 10-30 breaths per minute",
      "Look for: belly movement, nostril flaring, open-mouth breathing",
    ],
    normalAppearance: "Quiet, effortless breathing with minimal chest/belly movement",
    concerningAppearance:
      "Fast breathing (>40/min), labored breathing, belly heaving, or open-mouth breathing = seek vet care",
    cantAssessFallback: "If you can't count or your dog is too restless, watch for obvious struggle to breathe",
  },
  {
    key: "abdominal_distension",
    title: "Check for Abdominal Swelling",
    steps: [
      "Look at your dog's belly from above and the side",
      "Gently press on the belly with your hand",
      "Compare to their normal shape",
      "Note if belly feels tight or hard vs soft",
    ],
    normalAppearance: "Belly should be tucked or flat, soft to gentle pressure",
    concerningAppearance:
      "Distended, tight, or painful belly + unproductive retching = emergency (possible GDV)",
    cantAssessFallback: "If you're unsure about belly shape, watch for restlessness, retching, or distress",
  },
  {
    key: "dehydration",
    title: "Check for Dehydration (Skin Tent Test)",
    steps: [
      "Gently pinch the skin between your dog's shoulder blades",
      "Lift it up and release",
      "Watch how quickly it returns to normal",
      "Also check if gums feel moist or sticky",
    ],
    normalAppearance: "Skin snaps back immediately, gums feel moist",
    concerningAppearance:
      "Skin stays tented or returns slowly, gums feel sticky = dehydration (seek vet care)",
    cantAssessFallback: "If your dog won't let you test or you're unsure, offer small amounts of water and monitor",
  },
  {
    key: "pain_localization",
    title: "Identify Where It Hurts",
    steps: [
      "Gently run your hands over your dog's body",
      "Watch for flinching, yelping, or pulling away",
      "Note which areas seem sensitive",
      "Compare both sides (left vs right)",
    ],
    normalAppearance: "No reaction to gentle pressure, relaxed posture",
    concerningAppearance:
      "Flinching, crying, or aggression when touching specific areas = pain (needs vet assessment)",
    cantAssessFallback: "If your dog is too painful to touch or you can't tell, stop and seek veterinary care",
  },
];

export function getSelfCheckGuide(key: string): SelfCheckGuide | undefined {
  return SELF_CHECK_GUIDES.find((guide) => guide.key === key);
}

export function getAllSelfCheckGuides(): SelfCheckGuide[] {
  return SELF_CHECK_GUIDES;
}
