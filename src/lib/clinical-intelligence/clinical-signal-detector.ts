export interface ClinicalSignal {
  id: string;
  evidenceText: string;
  confidence: number;
  canRaiseUrgency: boolean;
  canLowerUrgency: false;
  needsConfirmation: boolean;
  suggestedQuestionId?: string;
}

interface SignalPattern {
  id: string;
  matchers: RegExp[];
  confidence: number;
  canRaiseUrgency: boolean;
  needsConfirmation: boolean;
  suggestedQuestionId?: string;
}

const NEGATION_WORDS = new Set([
  "no",
  "not",
  "never",
  "nothing",
  "none",
  "isn't",
  "isnt",
  "doesn't",
  "doesnt",
  "didn't",
  "didnt",
  "wasn't",
  "wasnt",
  "without",
  "normal",
  "fine",
  "okay",
  "ok",
  "good",
  "better",
  "recovered",
  "stopped",
  "ceased",
  "resolved",
  "improved",
  "back to normal",
]);

const SIGNAL_PATTERNS: SignalPattern[] = [
  {
    id: "possible_abdominal_pain",
    matchers: [
      /yelps?\s+(?:when\s+)?(?:i\s+)?(?:touch|press|poke|squeeze|lift|pick\s+up)/i,
      /(?:he|she)\s+(?:cries?|whines?|whimpers?)\s+(?:when\s+)?touched/i,
      /tender\s+(?:belly|abdomen|stomach)/i,
      /(?:belly|abdomen|stomach)\s+(?:is\s+)?(?:sore|painful|hurts?|tender)/i,
    ],
    confidence: 0.75,
    canRaiseUrgency: true,
    needsConfirmation: true,
    suggestedQuestionId: "emergency_global_screen",
  },
  {
    id: "possible_nonproductive_retching",
    matchers: [
      /tries?\s+to\s+vomit\s+but\s+nothing\s+(?:comes?\s+up|out)/i,
      /retching\s+(?:but\s+)?(?:nothing\s+comes?\s+up|dry\s+heaves?)/i,
      /dry\s+heaves?/i,
      /unproductive\s+(?:retching|vomiting)/i,
      /(?:he|she)\s+(?:is\s+)?(?:trying|attempting)\s+to\s+(?:vomit|throw\s+up)\s+but\s+can't/i,
    ],
    confidence: 0.9,
    canRaiseUrgency: true,
    needsConfirmation: false,
    suggestedQuestionId: "bloat_retching_abdomen_check",
  },
  {
    id: "possible_pale_gums",
    matchers: [
      /(?:gums?|mouth)\s+(?:look|are|is|seem|appear)\s+(?:white|pale|gray|grey)/i,
      /pale\s+(?:gums?|mouth)/i,
      /white\s+(?:gums?|mouth)/i,
    ],
    confidence: 0.9,
    canRaiseUrgency: true,
    needsConfirmation: false,
    suggestedQuestionId: "gum_color_check",
  },
  {
    id: "possible_blue_gums",
    matchers: [
      /(?:gums?|mouth|tongue)\s+(?:look|are|is|seem|appear)\s+(?:blue|cyanotic|purplish?)/i,
      /(?:gums?|mouth|tongue).{0,40}\b(?:blueish|bluish|blue|cyanotic|purplish?)\b/i,
      /blue\s+(?:gums?|mouth|tongue)/i,
    ],
    confidence: 0.95,
    canRaiseUrgency: true,
    needsConfirmation: false,
    suggestedQuestionId: "gum_color_check",
  },
  {
    id: "possible_breathing_difficulty",
    matchers: [
      /breathing\s+(?:weird|strange|odd|funny|heavy|hard|fast|rapid|shallow|labored|laboured|difficult|noisy)/i,
      /(?:struggling|difficulty|trouble)\s+(?:to\s+)?breathe/i,
      /short\s+of\s+breath/i,
      /(?:wheezing|gasping|choking)/i,
      /(?:he|she)\s+(?:is\s+)?(?:panting|breathing)\s+(?:heavily|hard|fast|rapidly|with\s+effort)/i,
    ],
    confidence: 0.8,
    canRaiseUrgency: true,
    needsConfirmation: true,
    suggestedQuestionId: "breathing_difficulty_check",
  },
  {
    id: "possible_collapse_or_weakness",
    matchers: [
      /won'?t\s+(?:get\s+up|stand\s+up|move|walk)/i,
      /can't\s+(?:get\s+up|stand\s+up|move|walk)/i,
      /(?:collapsed?|fainted|passed\s+out)/i,
      /(?:lying|laying)\s+down\s+and\s+(?:won'?t|can't|refuses?\s+to)\s+(?:get\s+up|move)/i,
      /(?:very\s+)?(?:weak|lethargic|limp)/i,
    ],
    confidence: 0.85,
    canRaiseUrgency: true,
    needsConfirmation: true,
    suggestedQuestionId: "collapse_weakness_check",
  },
  {
    id: "possible_urinary_obstruction",
    matchers: [
      /keeps?\s+(?:trying|attempting)\s+to\s+pee/i,
      /(?:straining|struggles?)\s+(?:to\s+)?(?:urinate|pee)/i,
      /(?:can't|cannot|won'?t|unable\s+to)\s+(?:urinate|pee)/i,
      /(?:frequent\s+)?(?:trips?|attempts?)\s+to\s+(?:urinate|pee)\s+(?:with\s+)?(?:little|no|nothing)/i,
      /(?:he|she)\s+(?:is\s+)?(?:straining|pushing)\s+(?:to\s+)?(?:urinate|pee)/i,
    ],
    confidence: 0.85,
    canRaiseUrgency: true,
    needsConfirmation: true,
    suggestedQuestionId: "urinary_blockage_check",
  },
  {
    id: "toxin_exposure",
    matchers: [
      /ate\s+(?:chocolate|grapes?|raisins?|onions?|garlic|xylitol|mushrooms?|alcohol|antifreeze)/i,
      /(?:ate|chewed|ingested|swallowed|licked)\s+(?:rat\s+poison|rodenticide|poison|toxin|toxic|chemical|medication|pills?|drugs?)/i,
      /(?:exposed\s+to|got\s+into)\s+(?:cleaning\s+products?|pesticides?|herbicides?|antifreeze)/i,
      /(?:chocolate|grapes?|raisins?|onions?|garlic|xylitol)\s+(?:exposure|ingestion|consumption)/i,
    ],
    confidence: 0.9,
    canRaiseUrgency: true,
    needsConfirmation: false,
    suggestedQuestionId: "toxin_exposure_check",
  },
  {
    id: "possible_heat_stroke",
    matchers: [
      /panting\s+heavily\s+(?:after\s+)?(?:being\s+outside|in\s+the\s+heat|exercise|walk|play)/i,
      /(?:overheated|heat\s+stroke|heatstroke|heat\s+exhaustion)/i,
      /(?:very\s+)?hot\s+(?:after\s+)?(?:outside|walk|exercise|car)/i,
      /(?:panting|drooling)\s+(?:excessively|heavily)\s+and\s+(?:hot|warm)/i,
    ],
    confidence: 0.8,
    canRaiseUrgency: true,
    needsConfirmation: true,
    suggestedQuestionId: "emergency_global_screen",
  },
  {
    id: "possible_neuro_emergency",
    matchers: [
      /had\s+a\s+seizure\s+(?:and\s+)?(?:is\s+)?(?:not\s+acting\s+normal|disoriented|confused|stumbling)/i,
      /(?:multiple|cluster|prolonged)\s+seizures?/i,
      /(?:tilted|tilting)\s+head/i,
      /(?:circling|walking\s+in\s+circles)/i,
      /(?:sudden|acute)\s+(?:blindness|paralysis|weakness)/i,
    ],
    confidence: 0.9,
    canRaiseUrgency: true,
    needsConfirmation: false,
    suggestedQuestionId: "seizure_neuro_check",
  },
  {
    id: "possible_trauma",
    matchers: [
      /hit\s+by\s+(?:a\s+)?(?:car|vehicle|truck)/i,
      /(?:fell|fallen|jumped)\s+(?:from|off)\s+(?:a\s+)?(?:height|balcony|window|roof|stairs)/i,
      /(?:was\s+)?(?:attacked|bitten)\s+by\s+(?:another\s+)?(?:dog|animal)/i,
      /(?:suspected|possible)\s+(?:fracture|broken\s+bone)/i,
    ],
    confidence: 0.95,
    canRaiseUrgency: true,
    needsConfirmation: false,
    suggestedQuestionId: "emergency_global_screen",
  },
  {
    id: "possible_bloat_gdv",
    matchers: [
      /(?:belly|abdomen|stomach)\s+(?:looks?|is|seems?|appears?)\s+(?:swollen|swollen\s+and\s+hard|distended|bloated|tight|firm)/i,
      /(?:swollen|distended|bloated)\s+(?:belly|abdomen|stomach)/i,
      /(?:restless|pacing)\s+(?:and\s+)?(?:swollen|bloated)\s+(?:belly|abdomen)/i,
    ],
    confidence: 0.85,
    canRaiseUrgency: true,
    needsConfirmation: false,
    suggestedQuestionId: "bloat_retching_abdomen_check",
  },
  {
    id: "possible_bloody_vomit",
    matchers: [
      /vomit(?:ing|ed)?\s+(?:blood|red|bloody|coffee\s+ground)/i,
      /(?:blood|red\s+fluid)\s+in\s+(?:vomit|throw\s+up)/i,
      /(?:he|she)\s+(?:threw\s+up|vomited)\s+(?:blood|something\s+red|red\s+fluid)/i,
    ],
    confidence: 0.9,
    canRaiseUrgency: true,
    needsConfirmation: false,
    suggestedQuestionId: "emergency_global_screen",
  },
  {
    id: "possible_bloody_diarrhea",
    matchers: [
      /(?:blood|bloody|red)\s+(?:in\s+)?(?:diarrhea|stool|poop|feces)/i,
      /(?:diarrhea|stool|poop)\s+(?:with\s+)?(?:blood|red|bloody)/i,
      /(?:he|she)\s+has\s+(?:bloody|blood\s+in\s+(?:the|his|her))\s+(?:diarrhea|stool|poop)/i,
    ],
    confidence: 0.85,
    canRaiseUrgency: true,
    needsConfirmation: false,
    suggestedQuestionId: "emergency_global_screen",
  },
];

function hasNegationContext(message: string, matchIndex: number): boolean {
  const windowStart = Math.max(0, matchIndex - 60);
  const context = message.slice(windowStart, matchIndex);
  const words = context.toLowerCase().split(/\s+/);

  // Check last 8 words before match for negation
  const recentWords = words.slice(-8);
  return recentWords.some((word) => {
    const clean = word.replace(/[^a-z]/g, "");
    return NEGATION_WORDS.has(clean) || NEGATION_WORDS.has(word.toLowerCase());
  });
}

function extractEvidence(message: string, match: RegExpExecArray): string {
  const start = Math.max(0, match.index - 20);
  const end = Math.min(message.length, match.index + match[0].length + 20);
  let evidence = message.slice(start, end).trim();

  // Clean up partial words at edges
  if (start > 0 && message[start - 1] !== " ") {
    const firstSpace = evidence.indexOf(" ");
    if (firstSpace > 0) {
      evidence = evidence.slice(firstSpace + 1);
    }
  }
  if (end < message.length && message[end] !== " ") {
    const lastSpace = evidence.lastIndexOf(" ");
    if (lastSpace > 0) {
      evidence = evidence.slice(0, lastSpace);
    }
  }

  return evidence.trim() || match[0];
}

export function detectSignals(ownerMessage: string): ClinicalSignal[] {
  const normalized = ownerMessage.trim();
  if (!normalized) {
    return [];
  }

  const detected = new Map<string, ClinicalSignal>();

  for (const pattern of SIGNAL_PATTERNS) {
    let matchedPattern = false;

    for (const matcher of pattern.matchers) {
      const flags = matcher.flags.includes("g")
        ? matcher.flags
        : `${matcher.flags}g`;
      const globalMatcher = new RegExp(matcher.source, flags);
      let match: RegExpExecArray | null;

      while ((match = globalMatcher.exec(normalized)) !== null) {
        if (hasNegationContext(normalized, match.index)) {
          continue;
        }

        const evidenceText = extractEvidence(normalized, match);

        const signal: ClinicalSignal = {
          id: pattern.id,
          evidenceText,
          confidence: pattern.confidence,
          canRaiseUrgency: pattern.canRaiseUrgency,
          canLowerUrgency: false,
          needsConfirmation: pattern.needsConfirmation,
          suggestedQuestionId: pattern.suggestedQuestionId,
        };

        detected.set(pattern.id, signal);
        matchedPattern = true;
        break;
      }

      if (matchedPattern) {
        break;
      }
    }
  }

  return Array.from(detected.values());
}

export function detectSignalsWithExplanations(
  ownerMessage: string
): {
  signals: ClinicalSignal[];
  explanations: string[];
} {
  const signals = detectSignals(ownerMessage);
  const explanations = signals.map(
    (s) =>
      `Detected "${s.id}" with confidence ${s.confidence} from phrase: "${s.evidenceText}"${
        s.needsConfirmation ? " (needs confirmation)" : ""
      }`
  );
  return { signals, explanations };
}
