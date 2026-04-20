import {
  getMissingQuestions,
  type TriageSession,
} from "@/lib/triage-engine";
import { FOLLOW_UP_QUESTIONS, SYMPTOM_MAP } from "@/lib/clinical-matrix";
import { coerceAmbiguousReplyToUnknown } from "@/lib/ambiguous-reply";
import {
  coerceAnswerForQuestion,
  coerceChoiceAnswerFromIntent,
  questionAllowsCanonicalUnknown,
  sanitizePendingRawAnswer,
  shouldEscalateForUnknown,
  shouldPersistRawPendingAnswer,
} from "@/lib/symptom-chat/answer-coercion";

export function resolvePendingQuestionAnswer({
  questionId,
  rawMessage,
  combinedUserSignal,
  turnAnswers,
  turnSymptoms,
}: {
  questionId: string;
  rawMessage: string;
  combinedUserSignal: string;
  turnAnswers: Record<string, string | boolean | number>;
  turnSymptoms: string[];
}): { value: string | boolean | number; source: string } | null {
  const directAnswer = coerceFallbackAnswerForPendingQuestion(
    questionId,
    rawMessage
  );
  if (directAnswer !== null) {
    return { value: directAnswer, source: "direct_coercion" };
  }

  const combinedAnswer = coerceFallbackAnswerForPendingQuestion(
    questionId,
    combinedUserSignal
  );
  if (combinedAnswer !== null) {
    return { value: combinedAnswer, source: "combined_signal" };
  }

  if (
    !shouldPersistRawPendingAnswer(
      questionId,
      rawMessage,
      turnAnswers,
      turnSymptoms
    )
  ) {
    return null;
  }

  const rawFallback = sanitizePendingRawAnswer(rawMessage);
  if (!rawFallback) {
    return null;
  }

  return { value: rawFallback, source: "raw_fallback" };
}

function coerceFallbackAnswerForPendingQuestion(
  questionId: string,
  rawMessage: string
): string | boolean | number | null {
  const question = FOLLOW_UP_QUESTIONS[questionId];
  if (!question) {
    return null;
  }

  if (questionAllowsCanonicalUnknown(question)) {
    const unknownCoercion = coerceAmbiguousReplyToUnknown(rawMessage);
    if (unknownCoercion !== null) {
      return unknownCoercion;
    }
  }

  const deterministic = deriveDeterministicAnswerForQuestion(questionId, rawMessage);
  if (deterministic !== null) {
    return deterministic;
  }

  if (questionId === "which_leg" || questionId === "wound_location") {
    return null;
  }

  if (question.data_type === "string") {
    return null;
  }

  return coerceAnswerForQuestion(questionId, rawMessage);
}

export function extractDeterministicAnswersForTurn(
  rawMessage: string,
  session: TriageSession
): Record<string, string | boolean | number> {
  const answers: Record<string, string | boolean | number> = {};
  const candidateQuestions = getDeterministicCandidateQuestionIds(session);

  for (const questionId of candidateQuestions) {
    if (shouldSkipDeterministicQuestion(session, questionId, rawMessage)) {
      continue;
    }

    const derivedAnswer = deriveDeterministicAnswerForQuestion(
      questionId,
      rawMessage
    );
    if (derivedAnswer !== null) {
      answers[questionId] = derivedAnswer;
    }
  }

  return answers;
}

function deriveDeterministicAnswerForQuestion(
  questionId: string,
  rawMessage: string
): string | boolean | number | null {
  switch (questionId) {
    case "which_leg":
      return extractLegLocation(rawMessage);
    case "wound_location":
      return extractBodyLocation(rawMessage);
    case "limping_onset":
      return extractLimpingOnset(rawMessage);
    case "breathing_onset":
      return extractBreathingOnset(rawMessage);
    case "abdomen_onset":
      return extractAbdomenOnset(rawMessage);
    case "limping_progression":
      return extractLimpingProgression(rawMessage);
    case "weight_bearing":
      return extractWeightBearingStatus(rawMessage);
    case "trauma_history":
      return extractTraumaHistory(rawMessage);
    case "appetite_status":
      return extractAppetiteStatus(rawMessage);
    case "stool_consistency":
      return extractStoolConsistency(rawMessage);
    case "gum_color":
      return extractGumColor(rawMessage);
    case "water_intake":
      return extractWaterIntake(rawMessage);
    case "consciousness_level":
      return extractConsciousnessLevel(rawMessage);
    case "blood_color":
      return extractBloodColor(rawMessage);
    case "blood_amount":
      return extractBloodAmount(rawMessage);
    case "vomit_blood":
      return extractVomitBlood(rawMessage);
    case "rat_poison_access":
      return extractRatPoisonAccess(rawMessage);
    case "toxin_exposure":
      return extractToxinExposure(rawMessage);
    case "trauma_mobility":
      return extractTraumaMobility(rawMessage);
    case "pain_on_touch":
      return extractPainOnTouch(rawMessage);
    case "worse_after_rest":
      return extractWorseAfterRest(rawMessage);
    case "swelling_present":
      return extractSwellingPresence(rawMessage);
    case "warmth_present":
      return extractWarmthPresence(rawMessage);
    case "prior_limping":
      return extractPriorLimping(rawMessage);
    case "face_swelling":
      return extractFaceSwelling(rawMessage);
    case "hives_with_breathing":
      return extractHivesWithBreathing(rawMessage);
    case "unproductive_retching":
    case "retching_present":
      return extractUnproductiveRetching(rawMessage);
    case "restlessness":
      return extractRestlessness(rawMessage);
    case "onset_during_exercise":
      return extractOnsetDuringExercise(rawMessage);
    default:
      return null;
  }
}

function getDeterministicCandidateQuestionIds(session: TriageSession): string[] {
  const questionIds = new Set<string>(getMissingQuestions(session));
  for (const questionId of [
    "trauma_mobility",
    "face_swelling",
    "hives_with_breathing",
    "unproductive_retching",
    "retching_present",
    "restlessness",
    "onset_during_exercise",
  ]) {
    questionIds.add(questionId);
  }

  for (const symptom of session.known_symptoms) {
    for (const questionId of SYMPTOM_MAP[symptom]?.follow_up_questions || []) {
      questionIds.add(questionId);
    }
  }

  if (
    session.last_question_asked &&
    !session.answered_questions.includes(session.last_question_asked)
  ) {
    questionIds.add(session.last_question_asked);
  }

  return [...questionIds];
}

function shouldSkipDeterministicQuestion(
  session: TriageSession,
  questionId: string,
  rawMessage: string
): boolean {
  if (
    !Object.prototype.hasOwnProperty.call(session.extracted_answers, questionId)
  ) {
    return false;
  }

  return !shouldRefreshDeterministicAnswer(session, questionId, rawMessage);
}

function shouldRefreshDeterministicAnswer(
  session: TriageSession,
  questionId: string,
  rawMessage: string
): boolean {
  if (!isRefreshableDeterministicQuestion(questionId)) {
    return false;
  }

  const refreshedAnswer = sanitizeAnswerForQuestion(
    questionId,
    deriveDeterministicAnswerForQuestion(questionId, rawMessage)
  );
  if (refreshedAnswer === null) {
    return false;
  }

  const currentAnswer = sanitizeAnswerForQuestion(
    questionId,
    session.extracted_answers[questionId]
  );

  return !areEquivalentAnswers(currentAnswer, refreshedAnswer);
}

function isRefreshableDeterministicQuestion(questionId: string): boolean {
  return [
    "which_leg",
    "wound_location",
    "limping_onset",
    "breathing_onset",
    "abdomen_onset",
    "limping_progression",
    "weight_bearing",
    "trauma_history",
    "appetite_status",
    "stool_consistency",
    "gum_color",
    "water_intake",
    "consciousness_level",
    "blood_color",
    "blood_amount",
    "vomit_blood",
    "rat_poison_access",
    "toxin_exposure",
    "trauma_mobility",
    "pain_on_touch",
    "worse_after_rest",
    "swelling_present",
    "warmth_present",
    "prior_limping",
    "face_swelling",
    "hives_with_breathing",
    "unproductive_retching",
    "retching_present",
    "restlessness",
    "onset_during_exercise",
  ].includes(questionId);
}

function areEquivalentAnswers(
  left: string | boolean | number | null,
  right: string | boolean | number | null
): boolean {
  if (left === right) {
    return true;
  }

  if (
    typeof left === "string" &&
    typeof right === "string" &&
    left.trim().toLowerCase() === right.trim().toLowerCase()
  ) {
    return true;
  }

  return false;
}

export function mergeTurnAnswers(
  _session: TriageSession,
  deterministicAnswers: Record<string, string | boolean | number>,
  modelAnswers: Record<string, string | boolean | number>
): Record<string, string | boolean | number> {
  const merged: Record<string, string | boolean | number> = {};
  const questionIds = new Set([
    ...Object.keys(deterministicAnswers),
    ...Object.keys(modelAnswers),
  ]);

  for (const questionId of questionIds) {
    const deterministicValue = sanitizeAnswerForQuestion(
      questionId,
      deterministicAnswers[questionId]
    );
    const modelValue = sanitizeAnswerForQuestion(
      questionId,
      modelAnswers[questionId]
    );

    const preferredValue = shouldPreferDeterministicAnswer(questionId)
      ? deterministicValue ?? modelValue
      : modelValue ?? deterministicValue;

    if (
      preferredValue !== null &&
      !(
        typeof preferredValue === "string" &&
        preferredValue.trim().toLowerCase() === "unknown" &&
        shouldEscalateForUnknown(questionId)
      )
    ) {
      merged[questionId] = preferredValue;
    }
  }

  return merged;
}

function shouldPreferDeterministicAnswer(questionId: string): boolean {
  return [
    "which_leg",
    "wound_location",
    "limping_onset",
    "breathing_onset",
    "abdomen_onset",
    "limping_progression",
    "weight_bearing",
    "trauma_history",
    "appetite_status",
    "stool_consistency",
    "gum_color",
    "water_intake",
    "consciousness_level",
    "blood_color",
    "blood_amount",
    "vomit_blood",
    "rat_poison_access",
    "toxin_exposure",
    "trauma_mobility",
    "swelling_present",
    "warmth_present",
    "pain_on_touch",
    "worse_after_rest",
    "prior_limping",
    "face_swelling",
    "hives_with_breathing",
    "unproductive_retching",
    "retching_present",
    "restlessness",
    "onset_during_exercise",
  ].includes(questionId);
}

export function sanitizeAnswerForQuestion(
  questionId: string,
  value: string | boolean | number | null | undefined
): string | boolean | number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  switch (questionId) {
    case "which_leg":
      return extractLegLocation(trimmed);
    case "wound_location":
      return extractBodyLocation(trimmed);
    case "limping_onset":
      return extractLimpingOnset(trimmed) ? trimmed : null;
    case "limping_progression":
      return extractLimpingProgression(trimmed);
    case "weight_bearing":
      return (
        extractWeightBearingStatus(trimmed) ??
        coerceAnswerForQuestion(questionId, trimmed)
      );
    case "trauma_history":
      return (
        extractTraumaHistory(trimmed) ??
        coerceAnswerForQuestion(questionId, trimmed)
      );
    default:
      return coerceAnswerForQuestion(questionId, trimmed);
  }
}

function extractLegLocation(rawMessage: string): string | null {
  const lower = rawMessage.toLowerCase();
  const side = /\bleft\b/.test(lower)
    ? "left"
    : /\bright\b/.test(lower)
      ? "right"
      : "";
  const position = /\b(back|hind|rear)\b/.test(lower)
    ? "back"
    : /\b(front|fore)\b/.test(lower)
      ? "front"
      : "";

  if (!side) {
    return null;
  }

  const parts = [side, position, "leg"].filter(Boolean);
  return parts.join(" ").trim() || null;
}

function extractBodyLocation(rawMessage: string): string | null {
  const explicitLegLocation = extractLegLocation(rawMessage);
  if (explicitLegLocation) {
    return explicitLegLocation;
  }

  const lower = rawMessage.toLowerCase();
  const bodyAreaMatch = lower.match(
    /\b(head|face|eye|ear|neck|shoulder|chest|back|spine|belly|abdomen|stomach|flank|hip|tail|paw|foot|toe|leg|arm|elbow|knee|thigh)\b/
  );
  if (!bodyAreaMatch) {
    return null;
  }

  const side = /\bleft\b/.test(lower)
    ? "left "
    : /\bright\b/.test(lower)
      ? "right "
      : "";
  return `${side}${bodyAreaMatch[1]}`.trim();
}

function extractLimpingOnset(rawMessage: string): string | null {
  return extractOnsetPattern(rawMessage);
}

function extractBreathingOnset(rawMessage: string): string | null {
  return extractOnsetPattern(rawMessage);
}

function extractAbdomenOnset(rawMessage: string): string | null {
  return extractOnsetPattern(rawMessage);
}

function extractLimpingProgression(rawMessage: string): string | null {
  const lower = rawMessage.toLowerCase();

  if (/\b(getting worse|worsening|worse)\b/.test(lower)) return "worse";
  if (/\b(getting better|improving|better)\b/.test(lower)) return "better";
  if (
    /\b(staying the same|about the same|same|unchanged|stable)\b/.test(lower)
  ) {
    return "same";
  }

  return null;
}

function extractOnsetPattern(rawMessage: string): string | null {
  const lower = rawMessage.toLowerCase();

  if (
    /\b(gradual|gradually|over time|slowly|progressively|for weeks|for months)\b/.test(
      lower
    )
  ) {
    return "gradual";
  }

  if (
    /\b(sudden|suddenly|all of a sudden|just started|started today|started this morning|since this morning|since yesterday|today|this morning|last night|yesterday|within hours|a few hours ago|after eating|after a meal|after dinner)\b/.test(
      lower
    )
  ) {
    return "sudden";
  }

  return null;
}

function extractGumColor(rawMessage: string): string | null {
  const lower = rawMessage.toLowerCase();

  if (/\b(blue|bluish|gray|grey|purple)\b/.test(lower)) return "blue";
  if (/\b(pale|white|whitish)\b/.test(lower)) return "pale_white";
  if (/\b(bright red|very red|red gums)\b/.test(lower)) return "bright_red";
  if (/\b(yellow|jaundice|jaundiced)\b/.test(lower)) return "yellow";
  if (/\b(pink|normal)\b/.test(lower)) return "pink_normal";

  return null;
}

function extractWaterIntake(rawMessage: string): string | null {
  return coerceChoiceAnswerFromIntent("water_intake", rawMessage);
}

function extractAppetiteStatus(rawMessage: string): string | null {
  return coerceChoiceAnswerFromIntent("appetite_status", rawMessage);
}

function extractStoolConsistency(rawMessage: string): string | null {
  return coerceChoiceAnswerFromIntent("stool_consistency", rawMessage);
}

function extractConsciousnessLevel(rawMessage: string): string | null {
  const lower = rawMessage.toLowerCase();

  if (
    /\b(unresponsive|passed out|collapsed|not waking up|won't wake|wont wake)\b/.test(
      lower
    )
  ) {
    return "unresponsive";
  }
  if (
    /\b(dull|out of it|very weak|barely responsive|not acting alert)\b/.test(
      lower
    )
  ) {
    return "dull";
  }
  if (/\b(alert|responsive|acting normal)\b/.test(lower)) {
    return "alert";
  }

  return null;
}

function extractBloodColor(rawMessage: string): string | null {
  const unknownCoercion = coerceChoiceAnswerFromIntent("blood_color", rawMessage);
  if (unknownCoercion === "unknown") return unknownCoercion;

  const lower = rawMessage.toLowerCase();

  if (/\b(bright red|fresh red)\b/.test(lower)) return "bright_red";
  if (/\b(dark|tarry|black)\b/.test(lower)) return "dark_tarry";

  return null;
}

function extractBloodAmount(rawMessage: string): string | null {
  const unknownCoercion = coerceChoiceAnswerFromIntent(
    "blood_amount",
    rawMessage
  );
  if (unknownCoercion === "unknown") return unknownCoercion;

  const lower = rawMessage.toLowerCase();

  if (
    /\b(mostly blood|all blood|pool of blood|a lot of blood|heavy bleeding)\b/.test(
      lower
    )
  ) {
    return "mostly_blood";
  }
  if (/\b(mixed in|throughout|mixed with stool)\b/.test(lower)) {
    return "mixed_in";
  }
  if (/\b(streaks|streaking|on the surface|small amount)\b/.test(lower)) {
    return "streaks";
  }

  return null;
}

function extractVomitBlood(rawMessage: string): boolean | null {
  const lower = rawMessage.toLowerCase();

  if (
    /\b(no blood in (the )?vomit|no blood in what (he|she|they) threw up|not bloody vomit|not vomiting blood|wasn't blood|was not blood)\b/.test(
      lower
    )
  ) {
    return false;
  }

  if (
    /\b(vomit|vomiting|throwing up|threw up|throw up)\b/.test(lower) &&
    /\b(blood|bloody|coffee grounds?|coffee-ground)\b/.test(lower)
  ) {
    return true;
  }

  return null;
}

function extractRatPoisonAccess(rawMessage: string): boolean | null {
  const lower = rawMessage.toLowerCase();

  if (/\b(no rat poison|no rodenticide|did not get into rat poison)\b/.test(lower)) {
    return false;
  }
  if (
    /\b(rat poison|rodenticide|mouse bait|bait station|warfarin|brodifacoum|bromadiolone)\b/.test(
      lower
    )
  ) {
    return true;
  }

  return null;
}

function extractToxinExposure(rawMessage: string): string | null {
  const lower = rawMessage.toLowerCase();
  if (
    /\b(rat poison|rodenticide|mouse bait|bait station|xylitol|chocolate|grapes|raisins|antifreeze|ibuprofen|naproxen|acetaminophen|marijuana|cannabis)\b/.test(
      lower
    )
  ) {
    return rawMessage.trim().slice(0, 160);
  }

  return null;
}

function extractWeightBearingStatus(rawMessage: string): string | null {
  const lower = rawMessage.toLowerCase();

  if (/\bnon[_\s-]?weight[_\s-]?bearing\b/.test(lower)) {
    return "non_weight_bearing";
  }
  if (/\bweight[_\s-]?bearing\b/.test(lower)) {
    return "weight_bearing";
  }

  if (
    /\b(non weight bearing|non-weight-bearing|not putting weight|won't put weight|avoiding it completely|holding it up|won't use it|not using it|hopping)\b/.test(
      lower
    )
  ) {
    return "non_weight_bearing";
  }

  if (
    /\b(partial weight|barely putting weight|toe touching|touching toes|favoring it|limping but walking)\b/.test(
      lower
    )
  ) {
    return "partial";
  }

  if (/\b(putting weight|bearing weight|walking on it|still using it)\b/.test(lower)) {
    return "weight_bearing";
  }

  return null;
}

function extractTraumaHistory(rawMessage: string): string | null {
  const lower = rawMessage.toLowerCase();
  if (
    /\b(don'?t know|not sure|no idea|can'?t tell|hard to tell|wasn'?t home|wasn'?t there|couldn'?t say|unsure|uncertain)\b/.test(
      lower
    ) ||
    /wish i knew|not that i know|no clue|have no clue/i.test(lower)
  ) {
    return "unknown";
  }

  if (
    /\b(no(thing|t really|pe|way|thanks| incident| trauma| fall| jump| injury| hitting)?|never|didn'?t happen|did not happen|no injury|no accident)\b/.test(
      lower
    )
  ) {
    return "no_trauma";
  }

  if (
    /\b(fell|jumped|rough play|collision|hit by|hit by car|slipped|slid|twisted|injured|landed badly|fell off|fell from|jumped off|jumped from|attacked|bitten|car accident|struck by|crushed)\b/.test(
      lower
    )
  ) {
    return "yes_trauma";
  }

  if (/\b(yes|yeah|yea|yup|uh-huh)\b/.test(lower)) {
    return "yes_trauma";
  }

  return null;
}

function extractTraumaMobility(rawMessage: string): string | null {
  const lower = rawMessage.toLowerCase();

  if (
    /\b(can'?t use (his|her|their)? ?back legs|cannot use (his|her|their)? ?back legs|dragging (himself|herself|themself)|dragging (his|her|their) back legs|paraly[sz]ed|can'?t stand|unable to stand|barely stand)\b/.test(
      lower
    )
  ) {
    return "inability_to_stand";
  }

  if (/\blimp|hobble|favoring\b/.test(lower)) {
    return "limping";
  }

  if (/\bwalking|still walking|walking okay\b/.test(lower)) {
    return "walking";
  }

  return null;
}

function extractPainOnTouch(rawMessage: string): boolean | null {
  const lower = rawMessage.toLowerCase();
  if (
    /\b(doesn't react|doesnt react|no pain when touched|not painful)\b/.test(
      lower
    )
  ) {
    return false;
  }
  if (
    /\b(yelp|yelps|pulled away|pulls away|growl|growls|cries out|painful when touched|hurts when touched|tender to touch)\b/.test(
      lower
    )
  ) {
    return true;
  }
  return null;
}

function extractWorseAfterRest(rawMessage: string): boolean | null {
  const lower = rawMessage.toLowerCase();
  if (
    /\b(not worse after rest|same after rest|no stiffness after rest)\b/.test(
      lower
    )
  ) {
    return false;
  }
  if (
    /\b(worse after rest|worse when .*gets up|stiff after rest|stiff when .*gets up|stiff after sleeping)\b/.test(
      lower
    )
  ) {
    return true;
  }
  return null;
}

function extractSwellingPresence(rawMessage: string): boolean | null {
  const lower = rawMessage.toLowerCase();
  if (/\b(no swelling|not swollen)\b/.test(lower)) {
    return false;
  }
  if (/\b(swollen|swelling|puffy|enlarged)\b/.test(lower)) {
    return true;
  }
  return null;
}

function extractWarmthPresence(rawMessage: string): boolean | null {
  const lower = rawMessage.toLowerCase();
  if (/\b(not warm|not hot|cool to touch)\b/.test(lower)) {
    return false;
  }
  if (/\b(warm to touch|hot to touch|feels warm|feels hot)\b/.test(lower)) {
    return true;
  }
  return null;
}

function extractPriorLimping(rawMessage: string): boolean | null {
  const lower = rawMessage.toLowerCase();
  if (/\b(first time|never before|no previous episodes)\b/.test(lower)) {
    return false;
  }
  if (
    /\b(has happened before|previous limp|previous episode|again|recurring|comes and goes|used to limp)\b/.test(
      lower
    )
  ) {
    return true;
  }
  return null;
}

function extractFaceSwelling(rawMessage: string): boolean | null {
  const lower = rawMessage.toLowerCase();

  if (
    /\b(no face swelling|face is not swollen|muzzle is not swollen)\b/.test(
      lower
    )
  ) {
    return false;
  }

  if (
    /\b(face|muzzle|eyelids?)\b.*\b(swollen|swelling|puffy|puffing up|swelled up)\b/.test(
      lower
    )
  ) {
    return true;
  }

  return null;
}

function extractHivesWithBreathing(rawMessage: string): boolean | null {
  const lower = rawMessage.toLowerCase();
  const hasHives = /\b(hives?|welts?|rash)\b/.test(lower);
  const hasBreathingIssue =
    /\b(breathing hard|breathing heavy|breathing fast|trouble breathing|short of breath)\b/.test(
      lower
    );

  if (!hasHives) {
    return null;
  }

  return hasBreathingIssue;
}

function extractUnproductiveRetching(rawMessage: string): boolean | null {
  const lower = rawMessage.toLowerCase();

  if (
    /\b(not retching|no retching|not trying to vomit|isn'?t trying to vomit)\b/.test(
      lower
    )
  ) {
    return false;
  }

  if (
    /\b(dry heav(?:e|ing)|retch(?:ing)?|trying to vomit|tries to vomit|keeps trying to vomit)\b/.test(
      lower
    ) &&
    /\b(nothing (comes|coming) (out|up)|nothing comes up|nothing is coming up|nothing is coming out|nothing comes out|nothing's coming up)\b/.test(
      lower
    )
  ) {
    return true;
  }

  if (/\b(dry heav(?:e|ing)|unproductive retch(?:ing)?)\b/.test(lower)) {
    return true;
  }

  return null;
}

function extractRestlessness(rawMessage: string): boolean | null {
  const lower = rawMessage.toLowerCase();

  if (/\b(not restless|settled normally|comfortable)\b/.test(lower)) {
    return false;
  }

  if (
    /\b(restless|restlessness|pacing|can'?t settle|unable to settle)\b/.test(
      lower
    )
  ) {
    return true;
  }

  return null;
}

function extractOnsetDuringExercise(rawMessage: string): string | null {
  const lower = rawMessage.toLowerCase();

  if (
    /\b(excited|exercise|running|playing|after playing|after exercise|during exercise|during play|after a walk)\b/.test(
      lower
    )
  ) {
    return "during";
  }

  return null;
}
